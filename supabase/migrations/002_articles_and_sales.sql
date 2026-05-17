-- =============================================
-- 情報商材販売サイト コアスキーマ (Phase 2)
-- =============================================

-- 記事テーブル
create table if not exists articles (
  id uuid primary key default gen_random_uuid(),

  slug          text unique not null,
  title         text not null,
  summary       text,

  body_free     text,
  body_paid     text,

  target_keyword        text,
  meta_title            text,
  meta_description      text,
  estimated_searches    integer default 0,
  tags                  text[] default '{}',

  status        text default 'draft',
  published_at  timestamptz,

  generated_by  text default 'gemini-1.5-flash',
  human_reviewed boolean default false,

  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 購入者テーブル（Phase 1 の customers と共存可）
-- Phase 2 では plan = free | pro のみ
alter table customers
  add column if not exists stripe_subscription_id_v2 text;

-- 閲覧ログ
create table if not exists article_views (
  id           uuid primary key default gen_random_uuid(),
  article_id   uuid references articles(id) on delete cascade,
  customer_id  uuid references customers(id),
  hit_paywall  boolean default false,
  converted    boolean default false,
  referrer     text,
  created_at   timestamptz default now()
);

-- キーワードキュー
create table if not exists keyword_queue (
  id                uuid primary key default gen_random_uuid(),
  keyword           text unique not null,
  niche             text,
  priority          integer default 5,
  monthly_searches  integer default 0,
  used_at           timestamptz,
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
create index if not exists idx_views_paywall       on article_views(hit_paywall);
create index if not exists idx_keyword_priority    on keyword_queue(priority desc, used_at asc nulls first);

-- =============================================
-- Row Level Security
-- =============================================
alter table articles       enable row level security;
alter table article_views  enable row level security;
alter table keyword_queue  enable row level security;

create policy "published articles are public"
  on articles for select
  using (status = 'published');

create policy "service role full access on articles"
  on articles for all using (true);
create policy "service role full access on views"
  on article_views for all using (true);
create policy "service role full access on keywords"
  on keyword_queue for all using (true);

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

-- =============================================
-- 初期キーワード
-- =============================================
insert into keyword_queue (keyword, niche, priority, monthly_searches) values
  ('フリーランス エンジニア 単価交渉 コツ',     'IT副業',       10, 3200),
  ('副業 プログラミング 初心者 稼ぎ方',         'IT副業',        9, 8400),
  ('SES 営業 メール 例文 テンプレート',          'SES業界',       9, 1800),
  ('エンジニア 転職 30代 未経験',              'キャリア',       8, 5600),
  ('中小企業 DX 助成金 2026 申請',             'DX推進',         8, 2400),
  ('業務効率化 ツール 比較 中小企業',           'DX推進',         7, 4100),
  ('ChatGPT 業務活用 実例 中小企業',           'AI活用',         9, 6200),
  ('請求書 自動化 個人事業主 無料',             'バックオフィス',  8, 3800),
  ('ノーコード ツール 比較 2026',              'ノーコード',      7, 2900),
  ('リモートワーク 副業 会社 バレない 対策',    'IT副業',         6, 4700)
on conflict (keyword) do nothing;
