import { createServiceClient } from '@/lib/supabase';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '記事一覧',
  description: '最新記事の一覧です。',
};

export const dynamic = 'force-dynamic';

export default async function ArticlesPage() {
  const db = createServiceClient();

  const { data: articles } = await db
    .from('articles')
    .select('slug, title, summary, tags, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-8">記事一覧</h1>

      {(!articles || articles.length === 0) ? (
        <p className="text-gray-500">記事はまだありません。</p>
      ) : (
        <div className="flex flex-col gap-6">
          {articles.map(article => (
            <article
              key={article.slug}
              className="p-5 border border-gray-200 rounded-xl bg-white hover:border-gray-400 transition-colors"
            >
              <a href={`/articles/${article.slug}`} className="no-underline text-inherit">
                <h2 className="text-lg font-semibold mb-2 leading-snug hover:text-gray-600">
                  {article.title}
                </h2>
              </a>
              {article.summary && (
                <p className="text-sm text-gray-500 mb-3 leading-relaxed">{article.summary}</p>
              )}
              <div className="flex gap-3 items-center text-xs text-gray-400 flex-wrap">
                {article.published_at && (
                  <time>{new Date(article.published_at).toLocaleDateString('ja-JP')}</time>
                )}
                {article.tags?.map((tag: string) => (
                  <span key={tag} className="px-2 py-0.5 bg-gray-100 rounded-full text-gray-600">
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
