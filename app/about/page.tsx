import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '副業ラボについて',
  description: '副業ラボは、副業・フリーランス・AI活用・節税に関する実践情報を毎日無料で発信するメディアです。',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="font-bold text-lg tracking-tight">副業ラボ</Link>
          <Link href="/articles" className="text-sm text-gray-500 hover:text-gray-900">記事一覧</Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-8">副業ラボについて</h1>

        <div className="space-y-6 text-gray-700 leading-relaxed">
          <p>
            <strong>副業ラボ</strong>は、副業・フリーランス・AI活用・節税をテーマにした無料メディアです。
            実際に使えるノウハウ・テンプレート・手順を毎日更新しています。
          </p>
          <p>
            会員登録不要、料金不要。すべての記事が無料で読めます。
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-10">扱うテーマ</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>AI副業（ChatGPT・Claude・Geminiを使った副業）</li>
            <li>クラウドソーシング・フリーランスの案件獲得</li>
            <li>確定申告・節税・経費管理</li>
            <li>スキルアップ・資格・学習方法</li>
            <li>在宅・リモートワークの仕事術</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-10">アフィリエイトについて</h2>
          <p>
            本サイトはアフィリエイトプログラムに参加しています。
            記事内のリンクからサービスに登録・購入いただいた場合、当サイトに報酬が発生することがあります。
            読者の方の負担は一切ありません。紹介するサービスは実際に有用だと判断したものに限っています。
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-10">お問い合わせ</h2>
          <p>
            ご質問・ご意見は{' '}
            <a href="mailto:rokuharatandai810@gmail.com" className="text-amber-600 hover:underline">
              rokuharatandai810@gmail.com
            </a>{' '}
            までお気軽にどうぞ。
          </p>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-100">
          <Link href="/" className="text-sm text-amber-600 hover:underline">← トップへ戻る</Link>
        </div>
      </main>
    </div>
  );
}
