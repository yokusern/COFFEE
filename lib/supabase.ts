import { createClient } from '@supabase/supabase-js';

export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// =============================================
// Phase 2 型定義
// =============================================

export type Article = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body_free: string | null;
  body_paid: string | null;
  target_keyword: string | null;
  meta_title: string | null;
  meta_description: string | null;
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  human_reviewed: boolean;
  created_at: string;
  updated_at: string;
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

// Phase 1 互換エイリアス
export type ContentArticle = Article;

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

export type KeywordQueue = {
  id: string;
  keyword: string;
  niche: string | null;
  priority: number;
  monthly_searches: number;
  used_at: string | null;
  article_id: string | null;
  is_active: boolean;
  created_at: string;
};
