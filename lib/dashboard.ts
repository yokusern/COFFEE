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
    db.from('articles').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    db.from('articles').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    db.from('article_views').select('*', { count: 'exact', head: true }),
    db.from('article_views').select('*', { count: 'exact', head: true }).eq('hit_paywall', true),
    db.from('article_views').select('*', { count: 'exact', head: true }).eq('converted', true),
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
