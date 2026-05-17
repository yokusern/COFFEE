import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase';

export const metadata: Metadata = {
  title: '副業ラボ | 副業・フリーランス・節税の実践メディア',
  description:
    '副業・フリーランス・AI活用・節税で収入を増やしたい人のための無料メディア。毎日更新。すぐ実践できるテンプレート・手順付き。',
};

export const dynamic = 'force-dynamic';

const CATEGORIES = ['AI副業', 'フリーランス', '節税', 'スキルアップ', 'DX推進'];

export default async function HomePage() {
  const db = createServiceClient();
  const { data: articles } = await db
    .from('articles')
    .select('slug, title, summary, tags, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(12);

  const recent = articles ?? [];

  return (
    <div className="font-sans text-gray-900 min-h-screen">

      {/* ナビ */}
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="font-bold text-lg tracking-tight">副業ラボ</Link>
          <nav className="flex items-center gap-6 text-sm text-gray-500">
            <Link href="/articles" className="hover:text-gray-900 transition-colors">記事一覧</Link>
          </nav>
        </div>
      </header>

      {/* ヒーロー */}
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="inline-block text-xs font-semibold tracking-widest text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 mb-6">
          毎日更新 · 完全無料
        </p>
        <h1 className="text-4xl font-bold leading-tight mb-4 tracking-tight">
          副業で収入を増やしたい人の<br />
          <span className="text-amber-500">実践情報</span>が、全部読める。
        </h1>
        <p className="text-gray-500 text-lg leading-loose">
          フリーランス・AI活用・節税まで。すぐ使えるテンプレート付きで毎日更新。
        </p>
      </section>

      {/* カテゴリ */}
      <section className="max-w-4xl mx-auto px-6 mb-8">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(c => (
            <span key={c} className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">
              {c}
            </span>
          ))}
        </div>
      </section>

      {/* 記事一覧 */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        {recent.length === 0 ? (
          <p className="text-gray-400 text-center py-20">記事を準備中です。</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-5">
            {recent.map(article => (
              <Link
                key={article.slug}
                href={`/articles/${article.slug}`}
                className="block p-5 border border-gray-200 rounded-xl hover:border-amber-300 hover:shadow-sm transition-all"
              >
                <div className="flex gap-2 mb-2 flex-wrap">
                  {(article.tags ?? []).slice(0, 2).map((tag: string) => (
                    <span key={tag} className="text-xs font-semibold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                      {tag}
                    </span>
                  ))}
                </div>
                <h2 className="font-semibold leading-snug mb-2 text-gray-900 line-clamp-2">
                  {article.title}
                </h2>
                {article.summary && (
                  <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">{article.summary}</p>
                )}
                {article.published_at && (
                  <time className="block mt-3 text-xs text-gray-400">
                    {new Date(article.published_at).toLocaleDateString('ja-JP')}
                  </time>
                )}
              </Link>
            ))}
          </div>
        )}

        {recent.length > 0 && (
          <div className="text-center mt-10">
            <Link
              href="/articles"
              className="px-6 py-3 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:border-gray-500 transition-colors"
            >
              全記事を見る
            </Link>
          </div>
        )}
      </section>

      {/* フッター */}
      <footer className="border-t border-gray-100 py-8 px-6 text-center text-xs text-gray-400">
        <div className="flex justify-center gap-6 mb-2">
          <Link href="/about" className="hover:text-gray-600">このサイトについて</Link>
          <Link href="/privacy" className="hover:text-gray-600">プライバシーポリシー</Link>
          <Link href="/articles" className="hover:text-gray-600">記事一覧</Link>
        </div>
        <p className="mb-1">本サイトはアフィリエイトプログラムに参加しています。</p>
        <p>© 2026 副業ラボ</p>
      </footer>
    </div>
  );
}
