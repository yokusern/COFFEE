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
              承認待ち {d.draftArticles}件
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
