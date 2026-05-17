import { createServiceClient } from '@/lib/supabase';
import { getRelevantLinks } from '@/lib/affiliate';
import { notFound } from 'next/navigation';
import { marked } from 'marked';
import type { Metadata } from 'next';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const db = createServiceClient();
  const { data: article } = await db
    .from('articles')
    .select('title, meta_title, meta_description, summary, published_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (!article) return { title: '記事が見つかりません' };

  const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Aether Mint';
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? '';

  return {
    title: article.meta_title ?? article.title,
    description: article.meta_description ?? article.summary ?? '',
    openGraph: {
      title: article.meta_title ?? article.title,
      description: article.meta_description ?? article.summary ?? '',
      url: `${appUrl}/articles/${slug}`,
      siteName,
      type: 'article',
      publishedTime: article.published_at ?? undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: article.meta_title ?? article.title,
      description: article.meta_description ?? article.summary ?? '',
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const db = createServiceClient();

  const { data: article } = await db
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (!article) notFound();

  void db.from('article_views').insert({
    article_id: article.id,
    hit_paywall: false,
  });

  const freeHtml = marked.parse(article.body_free  ?? '') as string;
  const paidHtml = marked.parse(article.body_paid  ?? '') as string;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.meta_description ?? article.summary,
    datePublished: article.published_at,
    publisher: {
      '@type': 'Organization',
      name: process.env.NEXT_PUBLIC_SITE_NAME,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="max-w-2xl mx-auto px-4 py-8 leading-relaxed">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold leading-snug mb-2">{article.title}</h1>
          {article.published_at && (
            <time className="text-sm text-gray-500">
              {new Date(article.published_at).toLocaleDateString('ja-JP')}
            </time>
          )}
          {article.tags?.length > 0 && (
            <div className="mt-2 flex gap-2 flex-wrap">
              {article.tags.map((tag: string) => (
                <span key={tag} className="px-2.5 py-0.5 bg-gray-100 rounded-full text-xs text-gray-600">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        <div
          dangerouslySetInnerHTML={{ __html: freeHtml }}
          className="mb-8 prose prose-neutral max-w-none"
        />

        {paidHtml && (
          <div
            dangerouslySetInnerHTML={{ __html: paidHtml }}
            className="prose prose-neutral max-w-none"
          />
        )}

        {/* アフィリエイト関連リンク */}
        {(() => {
          const links = getRelevantLinks(article.tags ?? []);
          return (
            <div className="mt-12 p-6 bg-amber-50 border border-amber-200 rounded-xl text-sm text-gray-600">
              <p className="font-semibold text-gray-800 mb-1">おすすめサービス</p>
              <p className="text-xs text-gray-400 mb-3">※本記事にはアフィリエイトリンクを含む場合があります</p>
              <ul className="space-y-2">
                {links.map(link => (
                  <li key={link.name} className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">›</span>
                    <div>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="nofollow noopener noreferrer"
                        className="text-amber-700 hover:underline font-medium"
                      >
                        {link.name}
                      </a>
                      <span className="text-gray-500"> — {link.description}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}
      </article>
    </>
  );
}
