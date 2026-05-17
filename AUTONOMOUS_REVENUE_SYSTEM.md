# 自律収益化システム — 完全構築指示書
# Claude Code への指示文

---

## このシステムが目指すもの

業界を問わず「人間が何も触らなくても収益が積み上がる」構造を構築する。
具体的には以下のサイクルが無人で回り続ける状態を作る：

```
キーワード監視 → AI記事生成 → 自動デプロイ → 検索流入
→ ペイウォール → Stripe課金 → 顧客維持メール → データ蓄積
→ 次のコンテンツ改善 → （繰り返し）
```

人間がやることは週1〜2時間のダッシュボード確認と、
次週のコンテンツテーマを1行で指示することだけ。

---

## 技術スタック

```
フロントエンド : Next.js 16 + TypeScript + Tailwind CSS
ホスティング  : Vercel（無料枠 → 収益後にPro）
データベース  : Supabase（PostgreSQL + Auth + Realtime）
AI生成       : Google Gemini 1.5 Flash API（低コスト）
課金         : Stripe（Checkout + Webhooks + Subscriptions）
メール配信   : SendGrid（トランザクション + マーケティング）
自動実行     : GitHub Actions（毎日 AM 3:00 JST）
分析         : Supabase の生ログ（外部ツール不要）
```

---

## ディレクトリ構成（完成形）

```
/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # ランディングページ（無料コンテンツ）
│   │   ├── dashboard/page.tsx          # オペレーター用ダッシュボード
│   │   ├── content/[slug]/page.tsx     # 記事ページ（ペイウォール付き）
│   │   ├── pricing/page.tsx            # 料金ページ
│   │   ├── api/
│   │   │   ├── stripe/webhook/route.ts # Stripe Webhook受信
│   │   │   ├── sendgrid/webhook/route.ts # 開封・クリック追跡
│   │   │   ├── content/generate/route.ts # 手動生成トリガー
│   │   │   └── cron/daily/route.ts     # Vercel Cron（代替）
│   ├── lib/
│   │   ├── supabase.ts                 # クライアント + 型定義
│   │   ├── stripe.ts                   # 課金ロジック
│   │   ├── gemini.ts                   # AI生成ロジック
│   │   ├── sendgrid.ts                 # メール配信
│   │   └── dashboard.ts               # ダッシュボードデータ
│   └── system/
│       ├── content-engine.ts           # コンテンツ生成エンジン
│       ├── keyword-monitor.ts          # キーワード監視
│       ├── engagement-engine.ts        # 顧客維持自動化
│       └── run-cycle.ts               # 日次サイクルのエントリーポイント
├── supabase/
│   └── migrations/
│       └── 001_core_schema.sql
├── .github/
│   └── workflows/
│       └── daily-cycle.yml
├── .env.local.example
└── README.md
```

---

## PHASE 0：作業開始前の確認

```bash
# 現在の構造を把握
find src -type f | sort
npm run build 2>&1 | tail -30
cat .env.local 2>/dev/null || echo "→ .env.local なし"
```

既存コードがある場合：
- `src/_archive/` を作成し、既存のエージェントファイルを全て移動
- `console.log('[SIMULATED]')` を含む行を全て検索・削除

```bash
grep -rn "SIMULATED\|Simulated\|simulation\|selfModify\|bypassFriction" src/
```

上記が出てきたファイルは `_archive/` に退避。

---

## PHASE 1：データベース設計

### `supabase/migrations/001_core_schema.sql` を作成

```sql
-- =========================================
-- 自律収益化システム コアスキーマ
-- =========================================

-- 1. コンテンツテーブル
--    AIが生成した記事を管理する
create table if not exists content_articles (
  id uuid primary key default gen_random_uuid(),

  -- 記事情報
  slug text unique not null,           -- URLスラグ（例: ses-market-2026-q2）
  title text not null,
  body_free text,                      -- 無料で読める部分
  body_paid text,                      -- ペイウォール後（有料会員のみ）
  summary text,                        -- OGP・一覧表示用
  target_keyword text,                 -- 狙ったキーワード
  tags text[] default '{}',

  -- SEO
  meta_title text,
  meta_description text,
  estimated_monthly_searches integer default 0,

  -- 生成情報
  generated_by text default 'gemini-1.5-flash',
  generation_prompt text,
  human_reviewed boolean default false,  -- 人間が確認済みか

  -- 状態
  status text default 'draft',
  -- draft: 生成済み・未公開
  -- published: 公開中
  -- archived: 非公開

  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. キーワードテーブル
--    監視するキーワードと実績を管理
create table if not exists keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text unique not null,
  niche text,                          -- ニッチ領域（例: 'SES採用', 'DXツール'）
  priority integer default 5,          -- 1-10（高いほど優先）
  monthly_searches integer default 0,
  competition text default 'medium',   -- 'low' | 'medium' | 'high'
  last_used_at timestamptz,
  article_count integer default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- 3. 顧客テーブル
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,

  -- Stripe
  stripe_customer_id text unique,
  stripe_subscription_id text unique,

  -- プラン
  plan text default 'free',            -- 'free' | 'pro' | 'enterprise'
  mrr integer default 0,               -- 月次経常収益（円）
  status text default 'active',        -- 'active' | 'cancelled' | 'paused'

  -- エンゲージメント
  last_login_at timestamptz,
  articles_read integer default 0,
  churn_risk text default 'low',       -- 'low' | 'medium' | 'high'

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. 収益イベント
create table if not exists revenue_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  amount integer not null,
  currency text default 'jpy',
  event_type text not null,
  -- 'subscription_created' | 'subscription_renewed'
  -- 'subscription_cancelled' | 'refund'
  stripe_event_id text unique,
  description text,
  created_at timestamptz default now()
);

-- 5. コンテンツ閲覧ログ
create table if not exists content_views (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references content_articles(id),
  customer_id uuid references customers(id),  -- nullなら匿名
  session_id text,
  hit_paywall boolean default false,   -- ペイウォールに到達したか
  converted boolean default false,     -- そのセッションで課金したか
  referrer text,
  created_at timestamptz default now()
);

-- 6. メール送信ログ
create table if not exists email_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  email_type text not null,
  -- 'welcome' | 'weekly_report' | 'churn_prevention' | 'upgrade_nudge'
  subject text,
  sendgrid_message_id text,
  is_opened boolean default false,
  is_clicked boolean default false,
  sent_at timestamptz default now()
);

-- 7. システム実行ログ
create table if not exists system_logs (
  id uuid primary key default gen_random_uuid(),
  component text not null,
  -- 'CONTENT_ENGINE' | 'KEYWORD_MONITOR' | 'ENGAGEMENT' | 'CYCLE'
  action text not null,
  result text not null,                -- 'SUCCESS' | 'FAILURE' | 'SKIPPED'
  details text,
  metadata jsonb,
  created_at timestamptz default now()
);

-- =========================================
-- インデックス
-- =========================================
create index if not exists idx_articles_status on content_articles(status);
create index if not exists idx_articles_keyword on content_articles(target_keyword);
create index if not exists idx_articles_published on content_articles(published_at desc);
create index if not exists idx_customers_plan on customers(plan);
create index if not exists idx_customers_churn on customers(churn_risk);
create index if not exists idx_views_article on content_views(article_id);
create index if not exists idx_views_paywall on content_views(hit_paywall);
create index if not exists idx_revenue_created on revenue_events(created_at desc);
create index if not exists idx_system_logs_created on system_logs(created_at desc);

-- =========================================
-- Row Level Security
-- =========================================
alter table content_articles enable row level security;
alter table customers enable row level security;
alter table revenue_events enable row level security;
alter table content_views enable row level security;

-- 公開記事は誰でも読める
create policy "public_articles" on content_articles
  for select using (status = 'published');

-- サービスロールは全アクセス
create policy "service_all_articles" on content_articles for all using (true);
create policy "service_all_customers" on customers for all using (true);
create policy "service_all_revenue" on revenue_events for all using (true);
create policy "service_all_views" on content_views for all using (true);

-- =========================================
-- 初期キーワードデータ
-- （ニッチは自分のドメインに合わせて変更）
-- =========================================
insert into keywords (keyword, niche, priority, monthly_searches, competition) values
  ('SES 営業 効率化', 'SES業界', 9, 1200, 'low'),
  ('エンジニア 採用 コスト 相場', 'SES業界', 8, 2400, 'medium'),
  ('IT 受託開発 単価 2026', 'SES業界', 7, 800, 'low'),
  ('フリーランス エンジニア 案件 探し方', 'フリーランス', 9, 5400, 'high'),
  ('DX ツール 比較 中小企業', 'DX推進', 8, 3200, 'medium'),
  ('業務効率化 AI ツール 導入', 'DX推進', 7, 2800, 'medium'),
  ('請求書 自動化 ツール', 'バックオフィス', 8, 4100, 'medium'),
  ('採用 市場 トレンド 2026', 'HR', 7, 1900, 'low')
on conflict (keyword) do nothing;
```

---

## PHASE 2：コアライブラリの実装

### `src/lib/supabase.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// =========================================
// 型定義
// =========================================

export type ContentArticle = {
  id: string;
  slug: string;
  title: string;
  body_free: string | null;
  body_paid: string | null;
  summary: string | null;
  target_keyword: string | null;
  tags: string[];
  meta_title: string | null;
  meta_description: string | null;
  human_reviewed: boolean;
  status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  created_at: string;
};

export type Customer = {
  id: string;
  email: string;
  name: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: 'free' | 'pro' | 'enterprise';
  mrr: number;
  status: 'active' | 'cancelled' | 'paused';
  churn_risk: 'low' | 'medium' | 'high';
  articles_read: number;
  created_at: string;
};

export type Keyword = {
  id: string;
  keyword: string;
  niche: string | null;
  priority: number;
  monthly_searches: number;
  competition: string;
  last_used_at: string | null;
  article_count: number;
  is_active: boolean;
};
```

---

### `src/lib/gemini.ts`

```typescript
/**
 * Gemini API ラッパー
 * コンテンツ生成・キーワード分析・要約に使用
 */

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

async function callGemini(prompt: string, temperature = 0.7): Promise<string> {
  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: 4000,
      },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// =========================================
// 記事生成
// =========================================

export type GeneratedArticle = {
  title: string;
  meta_title: string;
  meta_description: string;
  summary: string;
  body_free: string;   // 無料部分（全体の約40%）
  body_paid: string;   // 有料部分（残り60%）
  slug: string;
  tags: string[];
};

export async function generateArticle(
  keyword: string,
  niche: string
): Promise<GeneratedArticle> {
  const prompt = `
あなたは${niche}の専門家ライターです。
以下のキーワードで、実務家向けの価値ある記事を生成してください。

キーワード: 「${keyword}」

以下のJSON形式のみで返してください（マークダウン不要）:
{
  "title": "記事タイトル（40文字以内、キーワード含む）",
  "meta_title": "SEO用タイトル（60文字以内）",
  "meta_description": "検索結果表示用の説明（120文字以内）",
  "summary": "記事の概要（200文字以内）",
  "slug": "url-friendly-slug-in-english",
  "tags": ["タグ1", "タグ2", "タグ3"],
  "body_free": "## 無料で読める部分\n\n具体的な課題提起と、解決策の概要を800〜1200文字で記述。数字・事例・データを含める。読者が『続きを読みたい』と思う場所で終わる。",
  "body_paid": "## ここからは有料会員限定\n\n実際の解決策・手順・テンプレート・チェックリストを2000〜3000文字で詳述。コピーアンドペーストで使える具体的な内容にする。"
}

重要:
- 架空のデータは使わない（「〜の場合もある」「〜と言われている」で表現）
- 最新の2026年の文脈で書く
- 実務ですぐ使えるレベルの具体性を持たせる
- JSONのみ返す。余分なテキスト不要。
  `.trim();

  const raw = await callGemini(prompt, 0.6);
  const cleaned = raw.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(cleaned) as GeneratedArticle;
  } catch {
    throw new Error(`JSON parse failed. Raw: ${cleaned.slice(0, 200)}`);
  }
}

// =========================================
// キーワード分析
// =========================================

export async function analyzeKeywordOpportunity(keyword: string): Promise<{
  estimated_searches: number;
  competition: 'low' | 'medium' | 'high';
  recommended_angle: string;
}> {
  const prompt = `
キーワード「${keyword}」について分析してJSON形式のみで返してください：
{
  "estimated_searches": 月間検索数の推定（整数）,
  "competition": "low" または "medium" または "high",
  "recommended_angle": "このキーワードで差別化するための記事アングル（1文）"
}
  `.trim();

  const raw = await callGemini(prompt, 0.3);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

// =========================================
// チャーンリスク判定
// =========================================

export async function assessChurnRisk(customer: {
  plan: string;
  articles_read: number;
  days_since_last_login: number;
  mrr: number;
}): Promise<{ risk: 'low' | 'medium' | 'high'; reason: string; action: string }> {
  const prompt = `
以下の顧客データからチャーン（解約）リスクを判定してJSON形式のみで返してください：
${JSON.stringify(customer)}

{
  "risk": "low" または "medium" または "high",
  "reason": "リスクの主な理由（1文）",
  "action": "取るべきアクション（1文、メールで実行できる内容）"
}
  `.trim();

  const raw = await callGemini(prompt, 0.2);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}
```

---

### `src/lib/stripe.ts`

```typescript
import Stripe from 'stripe';
import { createServiceClient } from './supabase';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
});

// =========================================
// 料金プラン定義
// ※Stripeダッシュボードで作成した価格IDを env に設定
// =========================================
export const PLANS = {
  free: {
    name: 'Free',
    priceJpy: 0,
    features: [
      '各記事の前半（約40%）を無料で閲覧',
      '週1回のニュースレター',
    ],
  },
  pro: {
    name: 'Pro',
    priceJpy: 4980,
    stripePriceId: process.env.STRIPE_PRICE_PRO!,
    features: [
      '全記事を全文閲覧',
      '週次詳細レポート',
      'チャットサポート',
      '過去記事アーカイブ',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    priceJpy: 19800,
    stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE!,
    features: [
      'Proの全機能',
      '月次1on1コンサルティング30分',
      'カスタムレポート',
      'API アクセス',
    ],
  },
} as const;

export async function createCheckoutSession(
  email: string,
  planKey: 'pro' | 'enterprise',
  appUrl: string
): Promise<string> {
  const plan = PLANS[planKey];
  const session = await stripe.checkout.sessions.create({
    customer_email: email,
    mode: 'subscription',
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard?subscribed=1`,
    cancel_url: `${appUrl}/pricing?cancelled=1`,
    locale: 'ja',
    allow_promotion_codes: true,
  });
  return session.url!;
}

export async function handleStripeWebhook(
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
      const customerId = session.customer as string;
      const subId = session.subscription as string;

      // サブスクリプション情報を取得してプランを判定
      const sub = await stripe.subscriptions.retrieve(subId);
      const priceId = sub.items.data[0].price.id;
      const plan = priceId === PLANS.pro.stripePriceId ? 'pro' : 'enterprise';
      const mrr = PLANS[plan].priceJpy;

      await db.from('customers').upsert({
        email,
        stripe_customer_id: customerId,
        stripe_subscription_id: subId,
        plan,
        mrr,
        status: 'active',
      }, { onConflict: 'email' });

      await db.from('revenue_events').insert({
        amount: mrr,
        event_type: 'subscription_created',
        stripe_event_id: event.id,
        description: `${plan}プラン 新規契約`,
      });
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const { data: customer } = await db
        .from('customers')
        .select('id, plan')
        .eq('stripe_customer_id', invoice.customer as string)
        .single();

      if (customer) {
        const mrr = PLANS[customer.plan as 'pro' | 'enterprise']?.priceJpy ?? 0;
        await db.from('revenue_events').insert({
          customer_id: customer.id,
          amount: mrr,
          event_type: 'subscription_renewed',
          stripe_event_id: event.id,
        });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await db.from('customers').update({ status: 'cancelled', mrr: 0, plan: 'free' })
        .eq('stripe_subscription_id', sub.id);
      break;
    }
  }
}
```

---

### `src/lib/sendgrid.ts`

```typescript
/**
 * SendGrid メール配信
 * ウェルカム・週次レポート・チャーン防止の3種類を管理
 */

const SG_API = 'https://api.sendgrid.com/v3/mail/send';
const FROM = {
  email: process.env.SENDGRID_FROM_EMAIL!,
  name: process.env.SENDGRID_FROM_NAME ?? 'Aether Mint',
};

async function send(to: string, subject: string, body: string): Promise<string | null> {
  const res = await fetch(SG_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: FROM,
      subject,
      content: [{ type: 'text/html', value: body }],
      tracking_settings: {
        click_tracking: { enable: true },
        open_tracking: { enable: true },
      },
    }),
  });

  if (!res.ok) {
    console.error(`[SENDGRID] Failed: ${res.status} ${await res.text()}`);
    return null;
  }
  return res.headers.get('X-Message-Id');
}

// =========================================
// メールテンプレート
// =========================================

export async function sendWelcomeEmail(
  to: string,
  name: string,
  plan: string
): Promise<string | null> {
  const subject = `【Aether Mint】ご登録ありがとうございます`;
  const body = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="font-weight:500">${name ?? 'はじめまして'}、ようこそ</h2>
  <p>${plan === 'free' ? '無料プランで' : `${plan}プランで`}ご登録いただきました。</p>
  <p>毎週、業界の最新情報をお届けします。<br>
  ${plan === 'free'
    ? '有料プランにアップグレードすると、全記事を読み放題でご利用いただけます。'
    : '全記事をご自由にお読みいただけます。'
  }</p>
  <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard"
     style="display:inline-block;margin-top:16px;padding:12px 24px;
            background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px">
    ダッシュボードを開く
  </a>
  <p style="margin-top:32px;font-size:12px;color:#666">
    配信停止は <a href="{{unsubscribe}}">こちら</a>
  </p>
</div>
  `.trim();

  return send(to, subject, body);
}

export async function sendWeeklyReport(
  to: string,
  articles: Array<{ title: string; summary: string; slug: string }>
): Promise<string | null> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const articleHtml = articles
    .map(a => `
      <div style="margin-bottom:24px;padding:16px;border:1px solid #eee;border-radius:8px">
        <h3 style="margin:0 0 8px;font-weight:500;font-size:15px">
          <a href="${appUrl}/content/${a.slug}" style="color:#1a1a1a;text-decoration:none">
            ${a.title}
          </a>
        </h3>
        <p style="margin:0;font-size:13px;color:#666">${a.summary}</p>
      </div>
    `).join('');

  const subject = `【週次レポート】今週の注目記事 ${new Date().toLocaleDateString('ja-JP')}`;
  const body = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="font-weight:500">今週の注目コンテンツ</h2>
  ${articleHtml}
  <p style="margin-top:32px;font-size:12px;color:#666">
    配信停止は <a href="{{unsubscribe}}">こちら</a>
  </p>
</div>
  `.trim();

  return send(to, subject, body);
}

export async function sendChurnPreventionEmail(
  to: string,
  reason: string,
  action: string
): Promise<string | null> {
  const subject = `最近いかがでしょうか？`;
  const body = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="font-weight:500">最近のご状況はいかがでしょうか</h2>
  <p>しばらくログインがないことを確認し、ご連絡いたしました。</p>
  <p>${action}</p>
  <a href="${process.env.NEXT_PUBLIC_APP_URL}/content"
     style="display:inline-block;margin-top:16px;padding:12px 24px;
            background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px">
    最新記事を確認する
  </a>
  <p style="margin-top:32px;font-size:12px;color:#666">
    配信停止は <a href="{{unsubscribe}}">こちら</a>
  </p>
</div>
  `.trim();

  return send(to, subject, body);
}
```

---

## PHASE 3：コアエンジンの実装

### `src/system/content-engine.ts`

```typescript
/**
 * コンテンツ生成エンジン
 * 毎日 AM 3:00 に GitHub Actions から呼ばれる
 * 優先度の高いキーワードを1つ選び、記事を生成してSupabaseに保存する
 */

import { createServiceClient } from '../lib/supabase';
import { generateArticle } from '../lib/gemini';

export class ContentEngine {
  private db = createServiceClient();
  private readonly ARTICLES_PER_DAY = 1; // 1日1記事（品質重視）

  public async run(): Promise<{ generated: number; errors: string[] }> {
    const errors: string[] = [];
    let generated = 0;

    for (let i = 0; i < this.ARTICLES_PER_DAY; i++) {
      try {
        // 優先度が高く、まだ使っていないキーワードを選択
        const keyword = await this.selectNextKeyword();
        if (!keyword) {
          console.log('[CONTENT] No available keywords.');
          break;
        }

        console.log(`[CONTENT] Generating article for: "${keyword.keyword}"`);
        const article = await generateArticle(keyword.keyword, keyword.niche ?? '');

        // 重複チェック
        const { count } = await this.db
          .from('content_articles')
          .select('*', { count: 'exact', head: true })
          .eq('slug', article.slug);
        if ((count ?? 0) > 0) {
          console.log(`[CONTENT] Slug already exists: ${article.slug}`);
          continue;
        }

        // 保存
        await this.db.from('content_articles').insert({
          slug: article.slug,
          title: article.title,
          meta_title: article.meta_title,
          meta_description: article.meta_description,
          summary: article.summary,
          body_free: article.body_free,
          body_paid: article.body_paid,
          target_keyword: keyword.keyword,
          tags: article.tags,
          generated_by: 'gemini-1.5-flash',
          status: 'draft',  // 人間が確認してから published に変更
          human_reviewed: false,
        });

        // キーワードの使用記録を更新
        await this.db.from('keywords').update({
          last_used_at: new Date().toISOString(),
          article_count: keyword.article_count + 1,
        }).eq('id', keyword.id);

        generated++;
        console.log(`[CONTENT] Generated: "${article.title}"`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg);
        console.error('[CONTENT] Error:', msg);
      }
    }

    await this.db.from('system_logs').insert({
      component: 'CONTENT_ENGINE',
      action: 'daily_generation',
      result: errors.length === 0 ? 'SUCCESS' : 'FAILURE',
      details: `Generated: ${generated}, Errors: ${errors.length}`,
      metadata: { generated, errors },
    });

    return { generated, errors };
  }

  private async selectNextKeyword() {
    const { data } = await this.db
      .from('keywords')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .order('last_used_at', { ascending: true, nullsFirst: true })
      .limit(1)
      .single();
    return data;
  }
}

export const contentEngine = new ContentEngine();
```

---

### `src/system/engagement-engine.ts`

```typescript
/**
 * エンゲージメントエンジン
 * 顧客の行動データを元に自動でメールを送る
 * - 新規登録 → ウェルカムメール（即時）
 * - 週1回 → 週次レポート（全有料顧客）
 * - 14日以上ログインなし → チャーン防止メール
 */

import { createServiceClient } from '../lib/supabase';
import { assessChurnRisk } from '../lib/gemini';
import {
  sendWelcomeEmail,
  sendWeeklyReport,
  sendChurnPreventionEmail,
} from '../lib/sendgrid';

export class EngagementEngine {
  private db = createServiceClient();

  // =========================================
  // 週次レポート配信
  // =========================================
  public async sendWeeklyReports(): Promise<{ sent: number; failed: number }> {
    // 今週公開された記事（直近7日）
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: articles } = await this.db
      .from('content_articles')
      .select('title, summary, slug')
      .eq('status', 'published')
      .gte('published_at', weekAgo.toISOString())
      .order('published_at', { ascending: false })
      .limit(3);

    if (!articles || articles.length === 0) {
      console.log('[ENGAGEMENT] No new articles this week. Skipping weekly report.');
      return { sent: 0, failed: 0 };
    }

    // アクティブな有料顧客全員に送信
    const { data: customers } = await this.db
      .from('customers')
      .select('email, name')
      .eq('status', 'active')
      .in('plan', ['pro', 'enterprise']);

    let sent = 0;
    let failed = 0;

    for (const customer of customers ?? []) {
      try {
        const msgId = await sendWeeklyReport(customer.email, articles);
        if (msgId) {
          await this.db.from('email_logs').insert({
            email_type: 'weekly_report',
            subject: '今週の注目記事',
            sendgrid_message_id: msgId,
          });
          sent++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    return { sent, failed };
  }

  // =========================================
  // チャーンリスク評価と自動フォロー
  // =========================================
  public async runChurnPrevention(): Promise<{ assessed: number; emailed: number }> {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const { data: atRisk } = await this.db
      .from('customers')
      .select('*')
      .eq('status', 'active')
      .in('plan', ['pro', 'enterprise'])
      .or(`last_login_at.is.null,last_login_at.lt.${fourteenDaysAgo.toISOString()}`);

    let assessed = 0;
    let emailed = 0;

    for (const customer of atRisk ?? []) {
      try {
        const daysSinceLogin = customer.last_login_at
          ? Math.floor((Date.now() - new Date(customer.last_login_at).getTime()) / 86400000)
          : 30;

        const risk = await assessChurnRisk({
          plan: customer.plan,
          articles_read: customer.articles_read,
          days_since_last_login: daysSinceLogin,
          mrr: customer.mrr,
        });

        // DBのチャーンリスクを更新
        await this.db.from('customers')
          .update({ churn_risk: risk.risk })
          .eq('id', customer.id);

        assessed++;

        // 高リスクなら即メール
        if (risk.risk === 'high') {
          await sendChurnPreventionEmail(customer.email, risk.reason, risk.action);
          emailed++;
        }
      } catch (err) {
        console.error(`[ENGAGEMENT] Churn assessment failed for ${customer.email}:`, err);
      }
    }

    return { assessed, emailed };
  }
}

export const engagementEngine = new EngagementEngine();
```

---

### `src/system/run-cycle.ts`

```typescript
/**
 * 日次サイクルのエントリーポイント
 * GitHub Actions から毎日 AM 3:00 JST に実行される
 *
 * 実行順序:
 * 1. コンテンツ生成（新記事1本をdraftで保存）
 * 2. チャーン防止評価・メール
 * 3. 週次レポート配信（月曜のみ）
 * 4. サマリーをログに記録
 */

import { contentEngine } from './content-engine';
import { engagementEngine } from './engagement-engine';
import { createServiceClient } from '../lib/supabase';

async function runCycle() {
  const startAt = Date.now();
  console.log('=== AUTONOMOUS REVENUE SYSTEM — DAILY CYCLE START ===');
  console.log(`Time: ${new Date().toISOString()}`);

  const db = createServiceClient();
  const summary: Record<string, unknown> = {};

  // ---- Step 1: コンテンツ生成 ----
  console.log('\n[STEP 1] Content generation...');
  try {
    summary.content = await contentEngine.run();
  } catch (err) {
    summary.content = { error: String(err) };
    console.error('[STEP 1] Failed:', err);
  }

  // ---- Step 2: チャーン防止 ----
  console.log('\n[STEP 2] Churn prevention...');
  try {
    summary.churn = await engagementEngine.runChurnPrevention();
  } catch (err) {
    summary.churn = { error: String(err) };
  }

  // ---- Step 3: 週次レポート（月曜のみ） ----
  const isMonday = new Date().getDay() === 1;
  if (isMonday) {
    console.log('\n[STEP 3] Sending weekly reports...');
    try {
      summary.weekly = await engagementEngine.sendWeeklyReports();
    } catch (err) {
      summary.weekly = { error: String(err) };
    }
  } else {
    summary.weekly = 'skipped (not Monday)';
  }

  // ---- サマリー ----
  const elapsed = ((Date.now() - startAt) / 1000).toFixed(1);

  // 今月の収益
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { data: revenue } = await db
    .from('revenue_events')
    .select('amount')
    .gte('created_at', monthStart.toISOString());
  const mrr = (revenue ?? []).reduce((s, r) => s + r.amount, 0);

  // 下書き記事数（承認待ち）
  const { count: draftCount } = await db
    .from('content_articles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'draft')
    .eq('human_reviewed', false);

  await db.from('system_logs').insert({
    component: 'CYCLE',
    action: 'daily_cycle_complete',
    result: 'SUCCESS',
    details: `Elapsed: ${elapsed}s | MRR: ¥${mrr} | Drafts pending: ${draftCount}`,
    metadata: { ...summary, elapsed_seconds: elapsed, mrr, draft_count: draftCount },
  });

  console.log('\n=== CYCLE SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\n📄 承認待ち下書き: ${draftCount}件`);
  console.log(`💰 今月の収益: ¥${mrr.toLocaleString()}`);
  console.log(`⏱  実行時間: ${elapsed}秒`);
  console.log('\n=== DAILY CYCLE END ===');
}

runCycle().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
```

---

## PHASE 4：フロントエンドの実装

### `src/lib/dashboard.ts`

```typescript
import { createServiceClient } from './supabase';

export type DashboardData = {
  mrr: number;
  revenueThisMonth: number;
  totalCustomers: number;
  proCustomers: number;
  draftArticles: number;
  publishedArticles: number;
  totalViews: number;
  paywallHits: number;
  conversionRate: number;
  churnHighCount: number;
  lastCycleAt: string | null;
};

export async function getDashboardData(): Promise<DashboardData> {
  const db = createServiceClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    mrrRes, revenueRes, totalCustRes, proCustRes,
    draftRes, publishedRes, viewsRes, paywallRes,
    convertRes, churnRes, cycleRes,
  ] = await Promise.all([
    db.from('customers').select('mrr').eq('status', 'active'),
    db.from('revenue_events').select('amount').gte('created_at', monthStart.toISOString()),
    db.from('customers').select('*', { count: 'exact', head: true }),
    db.from('customers').select('*', { count: 'exact', head: true }).in('plan', ['pro', 'enterprise']),
    db.from('content_articles').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    db.from('content_articles').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    db.from('content_views').select('*', { count: 'exact', head: true }),
    db.from('content_views').select('*', { count: 'exact', head: true }).eq('hit_paywall', true),
    db.from('content_views').select('*', { count: 'exact', head: true }).eq('converted', true),
    db.from('customers').select('*', { count: 'exact', head: true }).eq('churn_risk', 'high'),
    db.from('system_logs').select('created_at').eq('component', 'CYCLE').eq('result', 'SUCCESS')
      .order('created_at', { ascending: false }).limit(1),
  ]);

  const mrr = (mrrRes.data ?? []).reduce((s, c) => s + (c.mrr ?? 0), 0);
  const revenueThisMonth = (revenueRes.data ?? []).reduce((s, r) => s + r.amount, 0);
  const paywallHits = paywallRes.count ?? 0;
  const converts = convertRes.count ?? 0;
  const conversionRate = paywallHits > 0
    ? Math.round((converts / paywallHits) * 1000) / 10
    : 0;

  return {
    mrr,
    revenueThisMonth,
    totalCustomers: totalCustRes.count ?? 0,
    proCustomers: proCustRes.count ?? 0,
    draftArticles: draftRes.count ?? 0,
    publishedArticles: publishedRes.count ?? 0,
    totalViews: viewsRes.count ?? 0,
    paywallHits,
    conversionRate,
    churnHighCount: churnRes.count ?? 0,
    lastCycleAt: cycleRes.data?.[0]?.created_at ?? null,
  };
}
```

---

### `src/app/dashboard/page.tsx`

```typescript
import { getDashboardData } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Dashboard() {
  const d = await getDashboardData();

  return (
    <main style={{ padding: '2rem', maxWidth: '900px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontWeight: 500, fontSize: '22px', marginBottom: '4px' }}>
        自律収益ダッシュボード
      </h1>
      <p style={{ fontSize: '13px', color: '#888', marginBottom: '2rem' }}>
        最終サイクル: {d.lastCycleAt
          ? new Date(d.lastCycleAt).toLocaleString('ja-JP')
          : '未実行'}
      </p>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontWeight: 500, fontSize: '15px', marginBottom: '1rem' }}>収益</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <Card label="MRR" value={`¥${d.mrr.toLocaleString()}`} />
          <Card label="今月の収益" value={`¥${d.revenueThisMonth.toLocaleString()}`} />
          <Card label="有料顧客" value={`${d.proCustomers}人`} />
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontWeight: 500, fontSize: '15px', marginBottom: '1rem' }}>
          コンテンツ
          {d.draftArticles > 0 && (
            <a href="/dashboard/articles" style={{ marginLeft: '12px', fontSize: '13px', color: '#d97706' }}>
              ⚠ 承認待ち {d.draftArticles}件
            </a>
          )}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <Card label="公開記事" value={`${d.publishedArticles}件`} />
          <Card label="総閲覧数" value={`${d.totalViews.toLocaleString()}`} />
          <Card label="ペイウォール到達" value={`${d.paywallHits}`} />
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontWeight: 500, fontSize: '15px', marginBottom: '1rem' }}>健全性</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <Card label="コンバージョン率" value={`${d.conversionRate}%`} />
          <Card label="全顧客数" value={`${d.totalCustomers}人`} />
          <Card
            label="チャーン高リスク"
            value={`${d.churnHighCount}人`}
            alert={d.churnHighCount > 0}
          />
        </div>
      </section>

      <section>
        <h2 style={{ fontWeight: 500, fontSize: '15px', marginBottom: '1rem' }}>アクション</h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <ActionLink href="/dashboard/articles" label="記事を確認・承認する" />
          <ActionLink href="/dashboard/customers" label="顧客一覧を見る" />
          <ActionLink href="/dashboard/logs" label="実行ログを確認する" />
        </div>
      </section>
    </main>
  );
}

function Card({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div style={{
      padding: '16px', border: `1px solid ${alert ? '#fbbf24' : '#e5e7eb'}`,
      borderRadius: '8px', background: alert ? '#fffbeb' : '#fff',
    }}>
      <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: '24px', fontWeight: 500, margin: 0 }}>{value}</p>
    </div>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} style={{
      padding: '10px 16px', border: '1px solid #e5e7eb', borderRadius: '6px',
      fontSize: '13px', color: '#1a1a1a', textDecoration: 'none',
      background: '#fff',
    }}>
      {label} →
    </a>
  );
}
```

---

### `src/app/content/[slug]/page.tsx`（ペイウォール付き記事ページ）

```typescript
import { createServiceClient } from '@/lib/supabase';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';

type Props = { params: { slug: string } };

export default async function ArticlePage({ params }: Props) {
  const db = createServiceClient();

  const { data: article } = await db
    .from('content_articles')
    .select('*')
    .eq('slug', params.slug)
    .eq('status', 'published')
    .single();

  if (!article) notFound();

  // セッションから顧客情報を取得（Supabase Auth または独自セッション）
  // ここではシンプルにcookieでplanを判定する例
  const cookieStore = cookies();
  const customerPlan = cookieStore.get('customer_plan')?.value ?? 'free';
  const isPaid = customerPlan === 'pro' || customerPlan === 'enterprise';

  // 閲覧ログを記録（非同期・エラーは無視）
  db.from('content_views').insert({
    article_id: article.id,
    hit_paywall: !isPaid,
  }).then(() => {}).catch(() => {});

  return (
    <article style={{ maxWidth: '720px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontWeight: 500, fontSize: '28px', lineHeight: 1.4 }}>{article.title}</h1>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '2rem' }}>
        {new Date(article.published_at!).toLocaleDateString('ja-JP')}
      </p>

      {/* 無料部分 */}
      <div dangerouslySetInnerHTML={{ __html: article.body_free ?? '' }} />

      {/* ペイウォール */}
      {isPaid ? (
        <div dangerouslySetInnerHTML={{ __html: article.body_paid ?? '' }} />
      ) : (
        <div style={{
          marginTop: '2rem', padding: '2rem', background: '#f9fafb',
          borderRadius: '12px', textAlign: 'center', border: '1px solid #e5e7eb'
        }}>
          <p style={{ fontWeight: 500, fontSize: '18px', margin: '0 0 8px' }}>
            続きを読むには有料プランが必要です
          </p>
          <p style={{ color: '#6b7280', margin: '0 0 24px' }}>
            月額 ¥4,980 で全記事が読み放題になります
          </p>
          <a href="/pricing" style={{
            padding: '12px 32px', background: '#1a1a1a', color: '#fff',
            textDecoration: 'none', borderRadius: '6px', fontWeight: 500
          }}>
            プランを確認する
          </a>
        </div>
      )}
    </article>
  );
}
```

---

## PHASE 5：GitHub Actions の設定

### `.github/workflows/daily-cycle.yml`

```yaml
name: Daily Autonomous Cycle

on:
  schedule:
    - cron: '0 18 * * *'   # 毎日 AM 3:00 JST (= UTC 18:00)
  workflow_dispatch:         # 手動実行も可能

jobs:
  run-cycle:
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run Daily Cycle
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          SENDGRID_API_KEY: ${{ secrets.SENDGRID_API_KEY }}
          SENDGRID_FROM_EMAIL: ${{ secrets.SENDGRID_FROM_EMAIL }}
          NEXT_PUBLIC_APP_URL: ${{ secrets.NEXT_PUBLIC_APP_URL }}
        run: npx ts-node src/system/run-cycle.ts

      # サイクル結果をアーティファクトとして保存（デバッグ用）
      - name: Upload log
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: cycle-log-${{ github.run_number }}
          path: /tmp/cycle.log
          retention-days: 30
```

---

## PHASE 6：環境変数と初期設定

### `.env.local.example`

```bash
# =========================================
# Supabase
# =========================================
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxxx...

# =========================================
# Gemini API
# =========================================
GEMINI_API_KEY=AIzaSyXXXX...

# =========================================
# Stripe
# =========================================
# テスト時は sk_test_、本番では sk_live_ を使う
STRIPE_SECRET_KEY=sk_test_XXXX...
STRIPE_WEBHOOK_SECRET=whsec_XXXX...
# Stripeダッシュボード → 商品 → 料金 で作成した価格ID
STRIPE_PRICE_PRO=price_XXXX...
STRIPE_PRICE_ENTERPRISE=price_XXXX...

# =========================================
# SendGrid
# =========================================
SENDGRID_API_KEY=SG.XXXX...
SENDGRID_FROM_EMAIL=no-reply@your-domain.com
SENDGRID_FROM_NAME=サービス名

# =========================================
# アプリ
# =========================================
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 必要なパッケージのインストール

```bash
npm install stripe @supabase/supabase-js
npm install -D @types/node typescript ts-node
```

---

## セットアップ手順（人間がやること）

以下の手順を一度だけ実施すれば、あとはシステムが自律的に動く。

### 1. Supabase プロジェクト作成
```bash
# Supabase CLIでマイグレーション適用
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

### 2. Stripe 設定
- Stripeダッシュボードで2つの定期課金商品を作成
  - Pro: ¥4,980/月
  - Enterprise: ¥19,800/月
- 価格IDを `.env.local` の `STRIPE_PRICE_PRO` / `STRIPE_PRICE_ENTERPRISE` に設定
- Webhookエンドポイントを登録: `https://your-domain.com/api/stripe/webhook`
  - 受信イベント: `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`

### 3. SendGrid 設定
- 送信ドメインの認証（SPF/DKIM設定）
- APIキーを取得して `.env.local` に設定

### 4. GitHub Secrets の設定
リポジトリの `Settings → Secrets and variables → Actions` で
`.env.local.example` の全項目を登録する

### 5. Vercel デプロイ
```bash
npx vercel --prod
```
環境変数もVercelのダッシュボードで設定する

### 6. 初回動作確認
```bash
# ローカルで1サイクル手動実行
npx ts-node src/system/run-cycle.ts

# → supabase の content_articles テーブルに draft が1件入ればOK
# → GitHub Actionsに行き、workflow_dispatch で手動実行してみる
```

### 7. 最初の記事を承認・公開
```
/dashboard/articles にアクセス
→ 生成された記事を確認
→ 問題なければ status を 'published' に変更
→ 翌朝から検索エンジンにインデックスされ始める
```

---

## 週次オペレーション（人間の作業：週30分）

毎週月曜、以下を確認するだけでいい。

```
1. /dashboard を開く
   → MRR / 有料顧客数 / チャーンリスクを確認

2. /dashboard/articles を開く
   → AIが生成した記事（draft）を確認
   → 品質に問題なければ 'published' に変更
   → 問題あれば内容を編集してから公開

3. /dashboard/logs を開く
   → エラーが出ていないか確認

4. キーワードテーブルを確認
   → 需要がありそうな新キーワードを3〜5件追加
   （Supabase の SQL Editor から直接 INSERT でOK）
```

これだけ。残りは全部システムが動く。

---

## 完了チェックリスト

```bash
# ビルドが通ること
npm run build

# TypeScriptエラーがないこと
npx tsc --noEmit

# シミュレーションコードが残っていないこと
grep -rn "SIMULATED\|Simulated\|console.log.*fake\|hardcoded" src/

# 環境変数が全て設定されていること
node -e "
const keys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'STRIPE_SECRET_KEY',
  'SENDGRID_API_KEY',
];
keys.forEach(k => {
  if (!process.env[k]) console.error('MISSING:', k);
  else console.log('OK:', k);
});
"
```

**動作確認：**
- [ ] `npm run build` がエラーゼロで通る
- [ ] Supabaseのマイグレーションが適用されている（6テーブルが存在する）
- [ ] `npx ts-node src/system/run-cycle.ts` が正常完了する
- [ ] content_articles テーブルに draft が1件生成されている
- [ ] `/dashboard` でダッシュボードが表示される（全て 0 でOK）
- [ ] Stripe Checkout が開く（テストカードで課金できる）
- [ ] GitHub Actions で workflow_dispatch が正常完了する

---

## 実装しないこと（明示的な除外）

```
❌ 自己コード改変（selfModifyCode）
❌ 500件以上の一斉メール送信
❌ スクレイピング対象サイトの利用規約に反する収集
❌ ハードコードされた架空の収益数値の表示
❌ 人間の確認なしのコンテンツ自動公開
   （生成は自動、公開は人間が確認してから）
```

---

*このファイルは「自律収益化システム」の完全構築指示書です。*
*Claude Code を開き、このファイルの内容を丸ごとペーストして実行してください。*
*Phase 0 から順番に進め、各 Phase 完了後に `npm run build` でエラーがないことを確認してから次へ進んでください。*
