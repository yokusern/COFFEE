# PHASE 2 — 検索流入 × 情報商材販売 完全実装指示書
# Claude Code への追加指示文
#
# 前提: Next.js 16 のベースが既に構築済み
# この指示書でやること:
#   1. Supabase DB 接続
#   2. Stripe 決済
#   3. SEO基盤（sitemap / OGP / 構造化データ）
#   4. ペイウォール実装
#   5. Vercel デプロイ設定
#   6. GitHub Actions による毎日の記事自動生成

---

## 現状の確認（最初に実行）

```bash
# 既存構造を把握する
find src -type f -name "*.ts" -o -name "*.tsx" | sort
cat package.json | grep '"version"'
ls -la .env.local 2>/dev/null && echo "exists" || echo "missing"
```

---

## STEP 1: パッケージ追加

```bash
npm install @supabase/supabase-js stripe
npm install -D @types/node
```

---

## STEP 2: 環境変数ファイルの作成

`.env.local` を新規作成（値は後で入力）:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO=price_...

# Gemini
GEMINI_API_KEY=AIzaSy...

# アプリ
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_SITE_NAME=サイト名
NEXT_PUBLIC_SITE_DESCRIPTION=サイトの説明文（OGP用）
```

`.gitignore` に `.env.local` が含まれていることを確認:

```bash
grep ".env.local" .gitignore || echo ".env.local" >> .gitignore
```

---

## STEP 3: Supabase スキーマ

`supabase/migrations/001_articles_and_sales.sql` を新規作成:

```sql
-- =============================================
-- 情報商材販売サイト コアスキーマ
-- =============================================

-- 記事テーブル
-- AIが生成し、人間が確認・公開する
create table if not exists articles (
  id uuid primary key default gen_random_uuid(),

  slug          text unique not null,
  title         text not null,
  summary       text,

  -- ペイウォール設計:
  -- body_free  → 全員が読める（記事全体の約40%）
  -- body_paid  → 有料会員のみ（残り60%、具体的な手順・テンプレート等）
  body_free     text,
  body_paid     text,

  -- SEO
  target_keyword        text,
  meta_title            text,
  meta_description      text,
  estimated_searches    integer default 0,
  tags                  text[] default '{}',

  -- 状態管理
  -- draft     : AI生成済み・人間未確認
  -- published : 公開中（検索エンジンにインデックスされる）
  -- archived  : 非公開
  status        text default 'draft',
  published_at  timestamptz,

  -- 生成情報
  generated_by  text default 'gemini-1.5-flash',
  human_reviewed boolean default false,

  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 購入者テーブル
create table if not exists customers (
  id                      uuid primary key default gen_random_uuid(),
  email                   text unique not null,
  name                    text,
  stripe_customer_id      text unique,
  stripe_subscription_id  text unique,

  -- プラン: free / pro
  -- free: body_free のみ閲覧可
  -- pro : body_paid まで閲覧可（月額サブスク）
  plan    text default 'free',
  mrr     integer default 0,      -- 月次収益（円）
  status  text default 'active',  -- active / cancelled

  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 収益イベント（Stripe Webhook から記録）
create table if not exists revenue_events (
  id                        uuid primary key default gen_random_uuid(),
  customer_id               uuid references customers(id),
  amount                    integer not null,
  event_type                text not null,
  stripe_event_id           text unique,  -- 重複処理防止
  stripe_payment_intent_id  text,
  created_at                timestamptz default now()
);

-- 閲覧ログ（ペイウォール到達率・CVR計測用）
create table if not exists article_views (
  id           uuid primary key default gen_random_uuid(),
  article_id   uuid references articles(id) on delete cascade,
  customer_id  uuid references customers(id),  -- null = 未ログイン
  hit_paywall  boolean default false,
  converted    boolean default false,           -- そのセッションで課金したか
  referrer     text,
  created_at   timestamptz default now()
);

-- システムログ（GitHub Actions の実行記録）
create table if not exists system_logs (
  id         uuid primary key default gen_random_uuid(),
  component  text not null,
  action     text not null,
  result     text not null,   -- SUCCESS / FAILURE / SKIPPED
  details    text,
  metadata   jsonb,
  created_at timestamptz default now()
);

-- キーワードキュー（毎日1本ずつ消費）
create table if not exists keyword_queue (
  id                uuid primary key default gen_random_uuid(),
  keyword           text unique not null,
  niche             text,
  priority          integer default 5,   -- 1-10（高いほど先に使う）
  monthly_searches  integer default 0,
  used_at           timestamptz,         -- null = 未使用
  article_id        uuid references articles(id),
  is_active         boolean default true,
  created_at        timestamptz default now()
);

-- =============================================
-- インデックス
-- =============================================
create index if not exists idx_articles_status     on articles(status);
create index if not exists idx_articles_published  on articles(published_at desc);
create index if not exists idx_articles_keyword    on articles(target_keyword);
create index if not exists idx_customers_plan      on customers(plan);
create index if not exists idx_revenue_created     on revenue_events(created_at desc);
create index if not exists idx_views_paywall       on article_views(hit_paywall);
create index if not exists idx_keyword_priority    on keyword_queue(priority desc, used_at asc nulls first);

-- =============================================
-- Row Level Security
-- =============================================
alter table articles      enable row level security;
alter table customers     enable row level security;
alter table revenue_events enable row level security;

-- 公開記事は誰でも読める（body_paid は API 側でフィルタする）
create policy "published articles are public"
  on articles for select
  using (status = 'published');

-- サービスロールは全アクセス（Server Actions / API Routes 用）
create policy "service role full access on articles"      on articles      for all using (true);
create policy "service role full access on customers"     on customers     for all using (true);
create policy "service role full access on revenue"       on revenue_events for all using (true);
create policy "service role full access on views"         on article_views for all using (true);
create policy "service role full access on logs"          on system_logs   for all using (true);
create policy "service role full access on keywords"      on keyword_queue for all using (true);

-- =============================================
-- 更新日時の自動更新
-- =============================================
create or replace function handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger articles_updated_at
  before update on articles
  for each row execute function handle_updated_at();

create trigger customers_updated_at
  before update on customers
  for each row execute function handle_updated_at();

-- =============================================
-- 初期キーワード（ニッチに合わせて変更すること）
-- =============================================
insert into keyword_queue (keyword, niche, priority, monthly_searches) values
  ('フリーランス エンジニア 単価交渉 コツ',     'IT副業',    10, 3200),
  ('副業 プログラミング 初心者 稼ぎ方',          'IT副業',     9, 8400),
  ('SES 営業 メール 例文 テンプレート',           'SES業界',    9, 1800),
  ('エンジニア 転職 30代 未経験',               'キャリア',    8, 5600),
  ('中小企業 DX 助成金 2026 申請',              'DX推進',      8, 2400),
  ('業務効率化 ツール 比較 中小企業',            'DX推進',      7, 4100),
  ('ChatGPT 業務活用 実例 中小企業',            'AI活用',      9, 6200),
  ('請求書 自動化 個人事業主 無料',              'バックオフィス', 8, 3800),
  ('ノーコード ツール 比較 2026',               'ノーコード',   7, 2900),
  ('リモートワーク 副業 会社 バレない 対策',     'IT副業',      6, 4700)
on conflict (keyword) do nothing;
```

---

## STEP 4: Supabase クライアント

`src/lib/supabase.ts` を作成（既存があれば上書き）:

```typescript
import { createClient } from '@supabase/supabase-js';

// ブラウザ・サーバー共用クライアント（閲覧用）
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// サーバーサイド専用（書き込み・管理操作用）
// API Routes と Server Actions でのみ使うこと
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// =============================================
// 型定義
// =============================================

export type Article = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body_free: string | null;
  body_paid: string | null;  // 有料会員のみ。APIで条件付き返却
  target_keyword: string | null;
  meta_title: string | null;
  meta_description: string | null;
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  human_reviewed: boolean;
  created_at: string;
};

export type Customer = {
  id: string;
  email: string;
  name: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: 'free' | 'pro';
  mrr: number;
  status: 'active' | 'cancelled';
  created_at: string;
};
```

---

## STEP 5: Stripe 決済

`src/lib/stripe.ts` を作成:

```typescript
import Stripe from 'stripe';
import { createServiceClient } from './supabase';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
});

// 月額プロ: ¥980 に設定（低価格で試しやすくする）
// Stripeダッシュボードで商品を作成し price_xxx を env に設定
export const PRO_PRICE_JPY = 980;

// Checkout Session を作成してリダイレクトURLを返す
export async function createCheckoutSession(
  email: string,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    customer_email: email,
    mode: 'subscription',
    line_items: [{
      price: process.env.STRIPE_PRICE_PRO!,
      quantity: 1,
    }],
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    locale: 'ja',
    allow_promotion_codes: true,
    payment_method_types: ['card'],
  });
  return session.url!;
}

// Stripe Webhook の処理
// checkout完了 → customersテーブルを更新
// 課金更新 → revenue_eventsに記録
// 解約 → planをfreeに戻す
export async function handleWebhook(
  payload: string,
  signature: string
): Promise<void> {
  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );

  const db = createServiceClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.CheckoutSession;
      const email = session.customer_email!;
      const stripeCustomerId = session.customer as string;
      const subscriptionId = session.subscription as string;

      await db.from('customers').upsert({
        email,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: subscriptionId,
        plan: 'pro',
        mrr: PRO_PRICE_JPY,
        status: 'active',
      }, { onConflict: 'email' });

      await db.from('revenue_events').insert({
        amount: PRO_PRICE_JPY,
        event_type: 'subscription_created',
        stripe_event_id: event.id,
      });
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const { data: customer } = await db
        .from('customers')
        .select('id')
        .eq('stripe_customer_id', invoice.customer as string)
        .single();

      if (customer) {
        await db.from('revenue_events').insert({
          customer_id: customer.id,
          amount: PRO_PRICE_JPY,
          event_type: 'subscription_renewed',
          stripe_event_id: event.id,
          stripe_payment_intent_id: invoice.payment_intent as string,
        });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await db
        .from('customers')
        .update({ plan: 'free', mrr: 0, status: 'cancelled' })
        .eq('stripe_subscription_id', sub.id);
      break;
    }
  }
}
```

`src/app/api/stripe/webhook/route.ts` を作成:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { handleWebhook } from '@/lib/stripe';

// Stripe は生の body が必要なので bodyParser を無効にする
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const payload   = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';

  try {
    await handleWebhook(payload, signature);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[WEBHOOK]', err);
    return NextResponse.json(
      { error: 'Webhook failed' },
      { status: 400 }
    );
  }
}
```

`src/app/api/checkout/route.ts` を作成:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const url = await createCheckoutSession(
    email,
    `${appUrl}/thank-you`,
    `${appUrl}/pricing`
  );

  return NextResponse.json({ url });
}
```

---

## STEP 6: ペイウォール付き記事ページ

`src/app/articles/[slug]/page.tsx` を作成:

```typescript
import { createServiceClient } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';

type Props = { params: { slug: string } };

// =============================================
// OGP / メタタグ（SEO に必須）
// =============================================
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const db = createServiceClient();
  const { data: article } = await db
    .from('articles')
    .select('title, meta_title, meta_description, summary, published_at')
    .eq('slug', params.slug)
    .eq('status', 'published')
    .single();

  if (!article) return { title: '記事が見つかりません' };

  const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Aether Mint';
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? '';

  return {
    title: article.meta_title ?? article.title,
    description: article.meta_description ?? article.summary ?? '',
    openGraph: {
      title: article.meta_title ?? article.title,
      description: article.meta_description ?? article.summary ?? '',
      url: `${appUrl}/articles/${params.slug}`,
      siteName,
      type: 'article',
      publishedTime: article.published_at ?? undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: article.meta_title ?? article.title,
      description: article.meta_description ?? article.summary ?? '',
    },
  };
}

// =============================================
// 記事本文
// =============================================
export default async function ArticlePage({ params }: Props) {
  const db = createServiceClient();

  const { data: article } = await db
    .from('articles')
    .select('*')
    .eq('slug', params.slug)
    .eq('status', 'published')
    .single();

  if (!article) notFound();

  // Cookie からプランを判定
  // 本来は Supabase Auth を使うが、
  // まず動かすことを優先してシンプルな実装にする
  const cookieStore = cookies();
  const customerEmail = cookieStore.get('customer_email')?.value;
  let isPro = false;

  if (customerEmail) {
    const { data: customer } = await db
      .from('customers')
      .select('plan, status')
      .eq('email', customerEmail)
      .eq('status', 'active')
      .single();
    isPro = customer?.plan === 'pro';
  }

  // 閲覧ログ（fire-and-forget）
  db.from('article_views').insert({
    article_id: article.id,
    hit_paywall: !isPro,
  }).catch(() => {});

  // JSON-LD 構造化データ（Google の理解を助ける）
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.meta_description ?? article.summary,
    datePublished: article.published_at,
    publisher: {
      '@type': 'Organization',
      name: process.env.NEXT_PUBLIC_SITE_NAME,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: '2rem 1rem',
        fontFamily: 'sans-serif',
        lineHeight: 1.8,
      }}>
        <header style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontWeight: 600, fontSize: '26px', lineHeight: 1.4 }}>
            {article.title}
          </h1>
          {article.published_at && (
            <time style={{ fontSize: '13px', color: '#888' }}>
              {new Date(article.published_at).toLocaleDateString('ja-JP')}
            </time>
          )}
          {article.tags?.length > 0 && (
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {article.tags.map((tag: string) => (
                <span key={tag} style={{
                  padding: '2px 10px',
                  background: '#f3f4f6',
                  borderRadius: '20px',
                  fontSize: '12px',
                  color: '#555',
                }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        {/* 無料部分（全員が読める） */}
        <div
          dangerouslySetInnerHTML={{ __html: article.body_free ?? '' }}
          style={{ marginBottom: '2rem' }}
        />

        {/* ペイウォール分岐 */}
        {isPro ? (
          <div dangerouslySetInnerHTML={{ __html: article.body_paid ?? '' }} />
        ) : (
          <Paywall slug={params.slug} />
        )}
      </article>
    </>
  );
}

// =============================================
// ペイウォールコンポーネント
// =============================================
function Paywall({ slug }: { slug: string }) {
  return (
    <div style={{
      margin: '3rem 0',
      padding: '2.5rem',
      background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, #fafafa 30%)',
      borderRadius: '12px',
      border: '1px solid #e5e7eb',
      textAlign: 'center',
    }}>
      {/* ブラーで隠れているように見せる視覚的ヒント */}
      <div style={{
        height: '80px',
        background: 'linear-gradient(to bottom, transparent, #fafafa)',
        marginBottom: '1.5rem',
        borderRadius: '4px',
      }} />

      <p style={{ fontSize: '20px', fontWeight: 600, margin: '0 0 8px' }}>
        続きを読むには月額プランが必要です
      </p>
      <p style={{ color: '#6b7280', margin: '0 0 8px', fontSize: '14px' }}>
        この記事の残り60%に、具体的な手順・テンプレート・チェックリストが含まれています
      </p>
      <p style={{ color: '#059669', fontWeight: 600, margin: '0 0 2rem', fontSize: '18px' }}>
        月額 ¥980
      </p>

      {/* メールアドレス入力 → Stripe Checkout へ */}
      <form
        action="/api/checkout"
        method="POST"
        onSubmit={async (e) => {
          // クライアント側の処理は next に書く
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '360px', margin: '0 auto' }}
      >
        <input
          type="email"
          name="email"
          placeholder="メールアドレスを入力"
          required
          style={{
            padding: '12px 16px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '16px',
            width: '100%',
            boxSizing: 'border-box',
          }}
        />
        <button
          type="submit"
          style={{
            padding: '14px',
            background: '#1a1a1a',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          月額 ¥980 で全記事を読む
        </button>
      </form>

      <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '16px' }}>
        いつでもキャンセル可能 · Stripe で安全に決済
      </p>
    </div>
  );
}
```

ペイウォールのフォームをクライアントコンポーネントに分離する。
`src/components/PaywallForm.tsx` を作成:

```typescript
'use client';

import { useState } from 'react';

export function PaywallForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError('エラーが発生しました。もう一度お試しください。');
      }
    } catch {
      setError('通信エラーが発生しました。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{
      display: 'flex', flexDirection: 'column',
      gap: '12px', maxWidth: '360px', margin: '0 auto'
    }}>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="メールアドレスを入力"
        required
        style={{
          padding: '12px 16px', border: '1px solid #d1d5db',
          borderRadius: '8px', fontSize: '16px',
          width: '100%', boxSizing: 'border-box',
        }}
      />
      <button
        type="submit"
        disabled={loading}
        style={{
          padding: '14px', background: loading ? '#6b7280' : '#1a1a1a',
          color: '#fff', border: 'none', borderRadius: '8px',
          fontSize: '16px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
        }}
      >
        {loading ? '処理中...' : '月額 ¥980 で全記事を読む'}
      </button>
      {error && (
        <p style={{ color: '#dc2626', fontSize: '13px', margin: 0 }}>{error}</p>
      )}
      <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0, textAlign: 'center' }}>
        いつでもキャンセル可能 · Stripe で安全に決済
      </p>
    </form>
  );
}
```

`src/app/articles/[slug]/page.tsx` の `<Paywall>` コンポーネントを
上記の `<PaywallForm>` に置き換える。

---

## STEP 7: SEO 基盤

### サイトマップ（Google クローラーへの案内）

`src/app/sitemap.ts` を作成:

```typescript
import { createServiceClient } from '@/lib/supabase';
import type { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = createServiceClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  const { data: articles } = await db
    .from('articles')
    .select('slug, published_at, updated_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false });

  const articleUrls = (articles ?? []).map(a => ({
    url: `${appUrl}/articles/${a.slug}`,
    lastModified: new Date(a.updated_at ?? a.published_at ?? Date.now()),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [
    {
      url: appUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${appUrl}/articles`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${appUrl}/pricing`,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    ...articleUrls,
  ];
}
```

### robots.txt

`src/app/robots.ts` を作成:

```typescript
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard/', '/api/', '/admin/'],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
```

### グローバルメタタグ（`src/app/layout.tsx` に追加）

既存の `layout.tsx` の `<head>` に以下を追記するか、
`metadata` エクスポートが無ければ追加する:

```typescript
// src/app/layout.tsx の先頭に追加
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: {
    default: process.env.NEXT_PUBLIC_SITE_NAME ?? 'Aether Mint',
    template: `%s | ${process.env.NEXT_PUBLIC_SITE_NAME ?? 'Aether Mint'}`,
  },
  description: process.env.NEXT_PUBLIC_SITE_DESCRIPTION,
  openGraph: {
    siteName: process.env.NEXT_PUBLIC_SITE_NAME,
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};
```

---

## STEP 8: 記事一覧ページ

`src/app/articles/page.tsx` を作成:

```typescript
import { createServiceClient } from '@/lib/supabase';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '記事一覧',
  description: '最新記事の一覧です。',
};

export const revalidate = 3600; // 1時間キャッシュ

export default async function ArticlesPage() {
  const db = createServiceClient();

  const { data: articles } = await db
    .from('articles')
    .select('slug, title, summary, target_keyword, tags, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50);

  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ fontWeight: 600, fontSize: '24px', marginBottom: '2rem' }}>
        記事一覧
      </h1>

      {(!articles || articles.length === 0) ? (
        <p style={{ color: '#6b7280' }}>記事はまだありません。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {articles.map(article => (
            <article key={article.slug} style={{
              padding: '20px',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              background: '#fff',
            }}>
              <a href={`/articles/${article.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <h2 style={{ fontWeight: 600, fontSize: '18px', margin: '0 0 8px', lineHeight: 1.4 }}>
                  {article.title}
                </h2>
              </a>
              {article.summary && (
                <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 12px', lineHeight: 1.6 }}>
                  {article.summary}
                </p>
              )}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '12px', color: '#9ca3af' }}>
                {article.published_at && (
                  <time>{new Date(article.published_at).toLocaleDateString('ja-JP')}</time>
                )}
                {article.tags?.map((tag: string) => (
                  <span key={tag} style={{
                    padding: '2px 8px', background: '#f3f4f6',
                    borderRadius: '20px', color: '#555',
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
```

---

## STEP 9: 料金ページ

`src/app/pricing/page.tsx` を作成:

```typescript
import { PaywallForm } from '@/components/PaywallForm';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '料金プラン',
  description: '月額980円で全記事が読み放題。いつでも解約可能。',
};

export default function PricingPage() {
  return (
    <main style={{ maxWidth: '600px', margin: '0 auto', padding: '4rem 1rem', textAlign: 'center' }}>
      <h1 style={{ fontWeight: 600, fontSize: '28px', marginBottom: '8px' }}>
        シンプルな料金体系
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '3rem' }}>
        全記事が読み放題。いつでもキャンセルできます。
      </p>

      <div style={{
        padding: '2.5rem', border: '2px solid #1a1a1a',
        borderRadius: '16px', background: '#fff', marginBottom: '2rem',
      }}>
        <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 8px' }}>月額プラン</p>
        <p style={{ fontSize: '48px', fontWeight: 700, margin: '0 0 4px' }}>¥980</p>
        <p style={{ fontSize: '14px', color: '#9ca3af', margin: '0 0 2rem' }}>/ 月（税込）</p>

        <ul style={{ textAlign: 'left', listStyle: 'none', padding: 0, margin: '0 0 2rem' }}>
          {[
            '全記事を全文閲覧',
            '新着記事への即時アクセス',
            'テンプレート・チェックリストのダウンロード',
            'いつでもキャンセル可能',
          ].map(item => (
            <li key={item} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: '15px' }}>
              ✓ {item}
            </li>
          ))}
        </ul>

        <PaywallForm />
      </div>

      <p style={{ fontSize: '13px', color: '#9ca3af' }}>
        Stripeによる安全な決済 · SSL暗号化通信
      </p>
    </main>
  );
}
```

---

## STEP 10: 購入完了ページ

`src/app/thank-you/page.tsx` を作成:

```typescript
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'ご購入ありがとうございます' };

export default function ThankYouPage() {
  return (
    <main style={{ maxWidth: '600px', margin: '0 auto', padding: '4rem 1rem', textAlign: 'center' }}>
      <p style={{ fontSize: '48px', marginBottom: '1rem' }}>🎉</p>
      <h1 style={{ fontWeight: 600, fontSize: '24px', marginBottom: '16px' }}>
        ご購入ありがとうございます
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem', lineHeight: 1.8 }}>
        登録したメールアドレスにログイン情報をお送りしました。<br />
        全記事をお楽しみください。
      </p>
      <a href="/articles" style={{
        padding: '12px 32px', background: '#1a1a1a', color: '#fff',
        textDecoration: 'none', borderRadius: '8px', fontWeight: 600,
      }}>
        記事一覧へ
      </a>
    </main>
  );
}
```

---

## STEP 11: 管理画面（記事の承認・公開）

`src/app/admin/page.tsx` を作成:

```typescript
// このページは /admin にアクセスした人だけが使う
// 本番では IP 制限 or Basic 認証を Vercel で設定すること
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const db = createServiceClient();

  const { data: drafts } = await db
    .from('articles')
    .select('id, slug, title, target_keyword, created_at')
    .eq('status', 'draft')
    .order('created_at', { ascending: false });

  const { data: recentRevenue } = await db
    .from('revenue_events')
    .select('amount, event_type, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  const { data: customers } = await db
    .from('customers')
    .select('mrr')
    .eq('status', 'active');

  const mrr = (customers ?? []).reduce((s, c) => s + c.mrr, 0);

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontWeight: 600, fontSize: '22px', marginBottom: '2rem' }}>管理画面</h1>

      {/* MRR */}
      <section style={{ marginBottom: '2rem', padding: '1.5rem', border: '1px solid #e5e7eb', borderRadius: '10px' }}>
        <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#6b7280' }}>MRR（月次経常収益）</p>
        <p style={{ margin: 0, fontSize: '36px', fontWeight: 700 }}>
          ¥{mrr.toLocaleString()}
        </p>
      </section>

      {/* 承認待ち記事 */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontWeight: 600, fontSize: '16px', marginBottom: '1rem' }}>
          承認待ち記事
          <span style={{ marginLeft: '8px', fontSize: '13px', color: '#f59e0b', fontWeight: 400 }}>
            {drafts?.length ?? 0}件
          </span>
        </h2>

        {drafts?.length === 0 && (
          <p style={{ color: '#6b7280', fontSize: '14px' }}>承認待ちの記事はありません。</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {drafts?.map(article => (
            <div key={article.id} style={{
              padding: '16px', border: '1px solid #e5e7eb',
              borderRadius: '8px', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <p style={{ margin: '0 0 4px', fontWeight: 500 }}>{article.title}</p>
                <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
                  KW: {article.target_keyword} ·{' '}
                  {new Date(article.created_at).toLocaleDateString('ja-JP')}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <a href={`/admin/articles/${article.id}`} style={{
                  padding: '6px 14px', border: '1px solid #d1d5db',
                  borderRadius: '6px', fontSize: '13px', textDecoration: 'none', color: '#1a1a1a',
                }}>
                  確認 →
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 最近の収益 */}
      <section>
        <h2 style={{ fontWeight: 600, fontSize: '16px', marginBottom: '1rem' }}>最近の収益イベント</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {recentRevenue?.map(r => (
            <div key={r.created_at} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '10px 0', borderBottom: '1px solid #f3f4f6',
              fontSize: '14px',
            }}>
              <span style={{ color: '#6b7280' }}>{r.event_type}</span>
              <span style={{ fontWeight: 500 }}>
                ¥{r.amount.toLocaleString()}
              </span>
              <span style={{ color: '#9ca3af', fontSize: '12px' }}>
                {new Date(r.created_at).toLocaleString('ja-JP')}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
```

---

## STEP 12: 記事自動生成エンジン（GitHub Actions 用）

`src/system/generate-article.ts` を作成:

```typescript
/**
 * 毎日 AM 3:00 JST に GitHub Actions から実行される
 * keyword_queue から未使用キーワードを1つ選び、
 * Gemini で記事を生成して articles テーブルに draft で保存する
 */

import { createServiceClient } from '../lib/supabase';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.65, maxOutputTokens: 4096 },
    }),
    signal: AbortSignal.timeout(40000),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function main() {
  const db = createServiceClient();

  // 未使用・優先度の高いキーワードを1つ取得
  const { data: kw } = await db
    .from('keyword_queue')
    .select('*')
    .eq('is_active', true)
    .is('used_at', null)
    .order('priority', { ascending: false })
    .limit(1)
    .single();

  if (!kw) {
    console.log('[GENERATE] No unused keywords available.');
    await db.from('system_logs').insert({
      component: 'CONTENT_ENGINE',
      action: 'generate_article',
      result: 'SKIPPED',
      details: 'No unused keywords',
    });
    return;
  }

  console.log(`[GENERATE] Keyword: "${kw.keyword}"`);

  const prompt = `
あなたは${kw.niche ?? 'IT・ビジネス'}分野の実務経験豊富なライターです。
以下のキーワードで、読者が「続きを読みたい」と感じる記事を生成してください。

キーワード: 「${kw.keyword}」

以下の JSON 形式のみで返してください（コードブロック・前置き不要）:
{
  "slug": "英語のURL（ハイフン区切り、50文字以内）",
  "title": "記事タイトル（40文字以内、キーワードを含む）",
  "summary": "記事の概要（120文字以内、検索結果に表示される）",
  "meta_title": "SEO用タイトル（60文字以内）",
  "meta_description": "メタディスクリプション（120文字以内）",
  "tags": ["タグ1", "タグ2", "タグ3"],
  "body_free": "## ここから本文（無料部分）\\n\\n読者の課題を具体的に提示し、なぜこれが問題なのかを解説する。数字・実例・比較を使い800〜1200字で書く。最後は『実際の解決策・手順は次のセクションで解説します』で終わる。HTMLではなくMarkdownで書く。",
  "body_paid": "## 実際の解決策（有料部分）\\n\\n具体的な手順・テンプレート・チェックリストをMarkdownで2000〜3000字。コピーして即使えるレベルの具体性。"
}
  `.trim();

  let parsed: Record<string, unknown>;
  try {
    const raw = await callGemini(prompt);
    const cleaned = raw.replace(/^```json\s*|^```\s*|```\s*$/gm, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error('[GENERATE] Parse failed:', err);
    await db.from('system_logs').insert({
      component: 'CONTENT_ENGINE',
      action: 'generate_article',
      result: 'FAILURE',
      details: `Parse error: ${String(err)}`,
    });
    process.exit(1);
  }

  // 重複スラグチェック
  const { count } = await db
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('slug', parsed.slug as string);

  if ((count ?? 0) > 0) {
    console.log(`[GENERATE] Slug "${parsed.slug}" already exists. Skipping.`);
    return;
  }

  // articles テーブルに保存（draft / 未確認）
  const { data: article, error: insertError } = await db
    .from('articles')
    .insert({
      slug:             parsed.slug,
      title:            parsed.title,
      summary:          parsed.summary,
      meta_title:       parsed.meta_title,
      meta_description: parsed.meta_description,
      tags:             parsed.tags,
      body_free:        parsed.body_free,
      body_paid:        parsed.body_paid,
      target_keyword:   kw.keyword,
      status:           'draft',
      human_reviewed:   false,
      generated_by:     'gemini-1.5-flash',
    })
    .select('id')
    .single();

  if (insertError) throw insertError;

  // キーワードを使用済みにする
  await db
    .from('keyword_queue')
    .update({ used_at: new Date().toISOString(), article_id: article!.id })
    .eq('id', kw.id);

  // ログ記録
  await db.from('system_logs').insert({
    component: 'CONTENT_ENGINE',
    action: 'generate_article',
    result: 'SUCCESS',
    details: `Generated: "${parsed.title}"`,
    metadata: { slug: parsed.slug, keyword: kw.keyword },
  });

  console.log(`[GENERATE] ✓ Article saved: "${parsed.title}" (draft)`);
  console.log('  → /admin で確認・公開してください');
}

main().catch(err => {
  console.error('[GENERATE] FATAL:', err);
  process.exit(1);
});
```

---

## STEP 13: GitHub Actions ワークフロー

`.github/workflows/generate-article.yml` を作成:

```yaml
name: Daily Article Generation

on:
  schedule:
    - cron: '0 18 * * *'   # 毎日 AM 3:00 JST (UTC 18:00)
  workflow_dispatch:         # 手動実行可（テスト用）

jobs:
  generate:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Generate article
        env:
          GEMINI_API_KEY:             ${{ secrets.GEMINI_API_KEY }}
          NEXT_PUBLIC_SUPABASE_URL:   ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY:  ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: npx ts-node --project tsconfig.json src/system/generate-article.ts
```

---

## STEP 14: Vercel デプロイ設定

`vercel.json` を新規作成:

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "headers": [
    {
      "source": "/api/stripe/webhook",
      "headers": [
        { "key": "Cache-Control", "value": "no-store" }
      ]
    }
  ]
}
```

`next.config.js`（または `next.config.ts`）に以下を確認・追加:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // 画像最適化（外部ドメインを使う場合は追加）
  images: {
    domains: [],
  },
  // 本番ではソースマップを出力しない（セキュリティ）
  productionBrowserSourceMaps: false,
};

module.exports = nextConfig;
```

---

## STEP 15: 動作確認

```bash
# 1. ビルドが通るか
npm run build

# 2. TypeScript エラーがないか
npx tsc --noEmit

# 3. ローカルで記事生成を試す
GEMINI_API_KEY=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npx ts-node src/system/generate-article.ts

# 4. 開発サーバーで動作確認
npm run dev
# → http://localhost:3000/articles で記事一覧
# → http://localhost:3000/pricing で料金ページ
# → http://localhost:3000/admin で管理画面
```

---

## セットアップ手順（人間がやること・一度だけ）

### 1. Supabase
```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

### 2. Stripe
- Stripeダッシュボード → 商品 → 「月額プロプラン ¥980」を作成
- 価格ID（`price_xxx`）を `.env.local` の `STRIPE_PRICE_PRO` に設定
- WebhookエンドポイントをStripeに登録:
  ```
  URL: https://your-domain.com/api/stripe/webhook
  イベント: checkout.session.completed
             invoice.payment_succeeded
             customer.subscription.deleted
  ```
- 発行された `whsec_xxx` を `STRIPE_WEBHOOK_SECRET` に設定

### 3. Vercel デプロイ
```bash
# Vercel CLI で初回デプロイ
npx vercel --prod

# 環境変数を Vercel に設定（.env.local の全項目）
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add GEMINI_API_KEY production
npx vercel env add STRIPE_SECRET_KEY production
npx vercel env add STRIPE_WEBHOOK_SECRET production
npx vercel env add STRIPE_PRICE_PRO production
npx vercel env add NEXT_PUBLIC_APP_URL production
npx vercel env add NEXT_PUBLIC_SITE_NAME production
npx vercel env add NEXT_PUBLIC_SITE_DESCRIPTION production
```

### 4. ドメイン設定
- お名前.com / Cloudflare でドメイン取得（例: `your-niche.jp`）
- Vercel ダッシュボード → Domains → ドメインを追加
- DNS の A レコードを Vercel IP に向ける

### 5. GitHub Secrets
リポジトリ → Settings → Secrets and variables → Actions:
```
GEMINI_API_KEY
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

### 6. Google Search Console への登録
- https://search.google.com/search-console/
- サイトを追加 → DNSまたはHTMLファイルで認証
- サイトマップを送信: `https://your-domain.com/sitemap.xml`

---

## 週次オペレーション（30分/週）

```
毎朝（または毎週月曜）:

1. https://your-domain.com/admin を開く
   → 承認待ち記事を確認
   → 問題なければ Supabase の SQL Editor で公開:
     UPDATE articles SET status = 'published', published_at = NOW()
     WHERE id = 'xxx';
   → 問題あれば内容を編集してから公開

2. MRR を確認

3. 必要に応じてキーワードを追加:
   INSERT INTO keyword_queue (keyword, niche, priority)
   VALUES ('新しいキーワード', 'ニッチ名', 8);
```

---

## 完了チェックリスト

```bash
npm run build          # エラーなし
npx tsc --noEmit       # 型エラーなし

# 以下のURLが動くこと（Vercel デプロイ後）
# /               → トップページ
# /articles       → 記事一覧
# /articles/xxxx  → 記事詳細（ペイウォール表示）
# /pricing        → 料金ページ（Stripe Checkout に繋がる）
# /sitemap.xml    → 記事URLのリストが表示される
# /robots.txt     → robots が返る
# /admin          → 承認待ち記事が見える
```

---

## やらないこと（明示的な除外）

```
❌ 記事の自動公開（生成は自動、公開は人間が確認してから）
❌ 購入者情報のコンソール出力・ログへの記録
❌ Stripe のテストキーのまま本番運用
❌ /admin を認証なしで公開（Vercel の Password Protection を使うこと）
```

---

*この指示書は「AUTONOMOUS_REVENUE_SYSTEM.md」の後続フェーズです。*
*Next.js のベース構築が完了している前提で、決済・DB・SEO・デプロイを追加します。*
*STEP 1 から順番に実行し、各 STEP 後に `npm run build` でエラーがないことを確認してください。*
