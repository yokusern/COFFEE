-- =========================================
-- 自律収益化システム コアスキーマ
-- =========================================

-- 1. コンテンツテーブル
create table if not exists content_articles (
  id uuid primary key default gen_random_uuid(),

  slug text unique not null,
  title text not null,
  body_free text,
  body_paid text,
  summary text,
  target_keyword text,
  tags text[] default '{}',

  meta_title text,
  meta_description text,
  estimated_monthly_searches integer default 0,

  generated_by text default 'gemini-1.5-flash',
  generation_prompt text,
  human_reviewed boolean default false,

  status text default 'draft',
  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. キーワードテーブル
create table if not exists keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text unique not null,
  niche text,
  priority integer default 5,
  monthly_searches integer default 0,
  competition text default 'medium',
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

  stripe_customer_id text unique,
  stripe_subscription_id text unique,

  plan text default 'free',
  mrr integer default 0,
  status text default 'active',

  last_login_at timestamptz,
  articles_read integer default 0,
  churn_risk text default 'low',

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
  stripe_event_id text unique,
  description text,
  created_at timestamptz default now()
);

-- 5. コンテンツ閲覧ログ
create table if not exists content_views (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references content_articles(id),
  customer_id uuid references customers(id),
  session_id text,
  hit_paywall boolean default false,
  converted boolean default false,
  referrer text,
  created_at timestamptz default now()
);

-- 6. メール送信ログ
create table if not exists email_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  email_type text not null,
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
  action text not null,
  result text not null,
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

create policy "public_articles" on content_articles
  for select using (status = 'published');

create policy "service_all_articles" on content_articles for all using (true);
create policy "service_all_customers" on customers for all using (true);
create policy "service_all_revenue" on revenue_events for all using (true);
create policy "service_all_views" on content_views for all using (true);

-- =========================================
-- 初期キーワードデータ
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
