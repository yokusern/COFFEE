# COFFEE セットアップ手順（1時間で完了）

コードは完成済み。APIキーを入れてデプロイするだけ。

---

## STEP 1 — Supabase キー取得（5分）

1. https://supabase.com/dashboard → プロジェクト「coffee」を開く
2. 左メニュー「Settings」→「API」
3. 以下をコピー:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY`（絶対に外に出さない）

---

## STEP 2 — Gemini API キー取得（3分・無料）

1. https://aistudio.google.com/app/apikey
2. 「Create API Key」→ コピー → `GEMINI_API_KEY` に入れる
3. 無料枠: 1500リクエスト/日

---

## STEP 3 — Stripe 設定（15分）

### アカウント作成 / ログイン
https://dashboard.stripe.com

### テストモードで商品作成
1. 左メニュー「製品カタログ」→「商品を追加」
2. 商品名: `副業ラボ プロプラン`
3. 価格: `¥980 / 月` (定期支払い)
4. 「商品を保存」→ **価格ID** (`price_xxx...`) をコピー → `STRIPE_PRICE_PRO`

### APIキー取得
「開発者」→「APIキー」
- `sk_test_xxx...` → `STRIPE_SECRET_KEY`
- webhookシークレットは STEP 6 でデプロイ後に取得

---

## STEP 4 — .env.local を埋める

```bash
NEXT_PUBLIC_SUPABASE_URL=https://kzbhvjxbtskdxuvwhrhb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...（Step 1 でコピーしたもの）
SUPABASE_SERVICE_ROLE_KEY=eyJ...（Step 1 でコピーしたもの）

GEMINI_API_KEY=AIzaSy...（Step 2 でコピーしたもの）

STRIPE_SECRET_KEY=sk_test_...（Step 3 でコピーしたもの）
STRIPE_WEBHOOK_SECRET=whsec_...（Step 6 でデプロイ後に取得）
STRIPE_PRICE_PRO=price_...（Step 3 でコピーしたもの）

SENDGRID_API_KEY=（後回しでOK・空欄のままでも起動する）
SENDGRID_FROM_EMAIL=
SENDGRID_FROM_NAME=副業ラボ

CRON_SECRET=coffee-cron-2026（何でもいい、ランダムな文字列）

NEXT_PUBLIC_APP_URL=http://localhost:3000（ローカルテスト用）
```

---

## STEP 5 — Supabase マイグレーション実行（5分）

1. Supabase Dashboard → 「SQL Editor」
2. 以下の3ファイルを順番に実行（コピペして「Run」）:
   - `supabase/migrations/001_core_schema.sql`
   - `supabase/migrations/002_articles_and_sales.sql`
   - `supabase/migrations/003_fix_revenue_events.sql`
3. エラーが出なければOK

---

## STEP 6 — Vercel デプロイ（10分）

```bash
# Vercel CLI インストール（初回のみ）
npm i -g vercel

# プロジェクトルートで実行
cd /Users/onoyoukou/Desktop/会社作ろうか/COFFEE
vercel

# 本番デプロイ
vercel --prod
```

デプロイ後のURL（例: `https://coffee-xxx.vercel.app`）をメモ。

### Vercel 環境変数設定
Vercel Dashboard → プロジェクト → Settings → Environment Variables
→ `.env.local` の内容を全部コピー
→ `NEXT_PUBLIC_APP_URL` は本番URLに変更

---

## STEP 7 — Stripe Webhook 設定（5分）

1. Stripe Dashboard → 「開発者」→「Webhook」
2. 「エンドポイントを追加」
3. URL: `https://coffee-xxx.vercel.app/api/stripe/webhook`
4. イベント選択:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `customer.subscription.deleted`
5. 「エンドポイントを追加」→ **署名シークレット** (`whsec_xxx`) をコピー
6. Vercel 環境変数 `STRIPE_WEBHOOK_SECRET` に設定 → 再デプロイ

---

## STEP 8 — GitHub Actions シークレット設定（5分）

GitHub リポジトリ → Settings → Secrets and variables → Actions:

| Secret名 | 値 |
|---|---|
| `GEMINI_API_KEY` | Step 2 のキー |
| `NEXT_PUBLIC_SUPABASE_URL` | Step 1 のURL |
| `SUPABASE_SERVICE_ROLE_KEY` | Step 1 のキー |

設定後、毎日 AM 3:00 JST に自動記事生成が走る。
手動テストは GitHub → Actions → 「Daily Article Generation」→ 「Run workflow」

---

## STEP 9 — 動作確認（10分）

```bash
# ローカルで最終確認
npm run dev
# http://localhost:3000 でLPが表示されるか確認
# /admin で管理画面が開くか確認
```

1. LPの「今すぐ始める」でStripe Checkoutが開くか
2. テスト用カード `4242 4242 4242 4242` で決済
3. `/admin` でMRRが ¥980 になるか
4. GitHub Actions を手動実行 → `/admin` に記事のdraftが出るか
5. 記事を「公開」→ `/articles` に表示されるか

---

## 公開後にやること（月1回・30分）

- Supabase Dashboard → `keyword_queue` テーブルに新キーワードを追加
- Google Search Console でインデックス確認
- `/admin` でdraft記事を承認・公開

---

## 収益シミュレーション

| 会員数 | MRR |
|---|---|
| 10人 | ¥9,800 |
| 50人 | ¥49,000 |
| 100人 | ¥98,000 |
| 300人 | ¥294,000 |

集客方法: SNS（X/Twitter）でターゲットキーワードの投稿 → LPへ誘導
