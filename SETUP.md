# 副業ラボ — セットアップ手順（初回のみ）

## 必要なもの

- [ ] Supabaseアカウント（無料）
- [ ] Stripeアカウント（無料）
- [ ] Gemini APIキー（無料）
- [ ] Vercelアカウント（無料）
- [ ] GitHubリポジトリ（GitHubにpush済みであること）

---

## Step 1: Supabase設定（15分）

### 1-1. プロジェクト作成

1. [supabase.com](https://supabase.com) → 「New Project」
2. プロジェクト名：`fukugyo-lab`
3. パスワードをメモしておく
4. Region：`Northeast Asia (Tokyo)` を選択

### 1-2. マイグレーション実行

SQL Editor（左メニュー）を開いて、以下の順番に実行：

```
supabase/migrations/001_core_schema.sql
supabase/migrations/002_articles_and_sales.sql
supabase/migrations/003_fix_revenue_events.sql
supabase/migrations/004_seed_articles.sql
```

### 1-3. APIキーを取得

Settings → API → 以下をコピー：
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 2: Stripe設定（10分）

### 2-1. 商品と価格を作成

1. [dashboard.stripe.com/products](https://dashboard.stripe.com/products) → 「商品を追加」
2. 名前：`副業ラボ プロプラン`
3. 価格：`¥980/月（定期）`
4. 作成後に表示される「価格ID」（`price_XXXXX`）をコピー → `STRIPE_PRICE_PRO`

### 2-2. APIキーを取得

Developers → API keys：
- `Publishable key` → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `Secret key` → `STRIPE_SECRET_KEY`

### 2-3. Webhook設定（Vercelデプロイ後）

1. Developers → Webhooks → 「エンドポイントを追加」
2. URL：`https://[あなたのドメイン]/api/stripe/webhook`
3. イベント：`checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`
4. Webhook signing secret → `STRIPE_WEBHOOK_SECRET`

---

## Step 3: Gemini APIキー取得（5分）

1. [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. 「Create API key」 → `GEMINI_API_KEY`

---

## Step 4: Vercelデプロイ（10分）

```bash
# Vercel CLIでデプロイ
npx vercel --prod --scope [あなたのスコープ]
```

環境変数は `.env.local.example` を参考にVercelダッシュボードで設定。

---

## Step 5: GitHub Actions設定（5分）

リポジトリ → Settings → Secrets and variables → Actions → 「New repository secret」

以下を追加：
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

---

## Step 6: 動作確認

```bash
# ローカルで起動
cp .env.local.example .env.local
# .env.local に各APIキーを入力
npm run dev
```

- `http://localhost:3000` → 記事一覧が表示される（シードデータ10本）
- `http://localhost:3000/pricing` → 料金ページ（Stripeが動く）
- `http://localhost:3000/admin` → ダッシュボード（MRR・記事数・閲覧数）

---

## 収益化が始まる流れ

```
GitHub Actions（毎朝3時）
  → Gemini で記事生成 → Supabase に draft 保存
  → あなたが /admin で確認 → published に変更
  → 記事が公開 → SEOで流入
  → ペイウォールに当たった人が /pricing へ
  → Stripe で月額¥980 で決済
  → 収益！
```
