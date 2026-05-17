import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const db = createServiceClient();

  const [draftsRes, revenueRes, customersRes] = await Promise.all([
    db.from('articles')
      .select('id, slug, title, target_keyword, created_at')
      .eq('status', 'draft')
      .order('created_at', { ascending: false }),
    db.from('revenue_events')
      .select('amount, event_type, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
    db.from('customers')
      .select('mrr')
      .eq('status', 'active'),
  ]);

  const drafts = draftsRes.data ?? [];
  const recentRevenue = revenueRes.data ?? [];
  const mrr = (customersRes.data ?? []).reduce((s, c) => s + (c.mrr ?? 0), 0);

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 font-sans">
      <h1 className="text-xl font-semibold mb-8">管理画面</h1>

      {/* MRR */}
      <section className="mb-8 p-6 border border-gray-200 rounded-xl">
        <p className="text-sm text-gray-500 mb-1">MRR（月次経常収益）</p>
        <p className="text-4xl font-bold">¥{mrr.toLocaleString()}</p>
      </section>

      {/* 承認待ち記事 */}
      <section className="mb-8">
        <h2 className="text-base font-semibold mb-4">
          承認待ち記事
          <span className="ml-2 text-sm text-amber-500 font-normal">{drafts.length}件</span>
        </h2>

        {drafts.length === 0 && (
          <p className="text-sm text-gray-500">承認待ちの記事はありません。</p>
        )}

        <div className="flex flex-col gap-3">
          {drafts.map(article => (
            <div key={article.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <p className="font-medium mb-1">{article.title}</p>
                <p className="text-xs text-gray-400">
                  KW: {article.target_keyword} · {new Date(article.created_at).toLocaleDateString('ja-JP')}
                </p>
              </div>
              <a
                href={`/admin/articles/${article.id}`}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm no-underline text-gray-800 hover:bg-gray-50"
              >
                確認 →
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* 最近の収益 */}
      <section>
        <h2 className="text-base font-semibold mb-4">最近の収益イベント</h2>
        <div className="flex flex-col gap-0">
          {recentRevenue.map((r, i) => (
            <div key={i} className="flex justify-between py-3 border-b border-gray-100 text-sm">
              <span className="text-gray-500">{r.event_type}</span>
              <span className="font-medium">¥{r.amount.toLocaleString()}</span>
              <span className="text-xs text-gray-400">
                {new Date(r.created_at).toLocaleString('ja-JP')}
              </span>
            </div>
          ))}
          {recentRevenue.length === 0 && (
            <p className="text-sm text-gray-500">収益イベントはまだありません。</p>
          )}
        </div>
      </section>
    </main>
  );
}
