import { createServiceClient } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';

type Props = { params: Promise<{ slug: string }> };

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const db = createServiceClient();

  const { data: article } = await db
    .from('content_articles')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (!article) notFound();

  const cookieStore = await cookies();
  const customerPlan = cookieStore.get('customer_plan')?.value ?? 'free';
  const isPaid = customerPlan === 'pro' || customerPlan === 'enterprise';

  void db.from('content_views').insert({
    article_id: article.id,
    hit_paywall: !isPaid,
  });

  return (
    <article style={{ maxWidth: '720px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontWeight: 500, fontSize: '28px', lineHeight: 1.4 }}>{article.title}</h1>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '2rem' }}>
        {new Date(article.published_at).toLocaleDateString('ja-JP')}
      </p>

      <div dangerouslySetInnerHTML={{ __html: article.body_free ?? '' }} />

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
