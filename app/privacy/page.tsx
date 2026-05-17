import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'プライバシーポリシー — 副業ラボ',
  description: '副業ラボのプライバシーポリシーです。',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="font-bold text-lg tracking-tight">副業ラボ</Link>
          <Link href="/articles" className="text-sm text-gray-500 hover:text-gray-900">記事一覧</Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">プライバシーポリシー</h1>
        <p className="text-sm text-gray-400 mb-10">最終更新：2026年5月</p>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">収集する情報について</h2>
            <p>副業ラボでは、記事を読むためにアカウント登録や個人情報の入力は不要です。サイト改善のため、ページビューや滞在時間などの匿名の利用データを収集する場合があります。</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Cookieについて</h2>
            <p>本サイトでは、ユーザー体験の向上やアクセス解析のためにCookieを使用することがあります。本サイトを利用することで、Cookieの使用に同意いただいたものとみなします。ブラウザの設定からいつでも無効にできます。</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">アフィリエイトリンクについて</h2>
            <p>本サイトはA8.netをはじめとするアフィリエイトプログラムに参加しています。記事内のリンクからサービスへ登録・購入された場合、当サイトに報酬が発生することがあります。読者の方にご負担はありません。</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">外部サービスへのリンク</h2>
            <p>本サイトは外部サイトへのリンクを含む場合があります。リンク先のプライバシーポリシーは各サイトにてご確認ください。</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">免責事項</h2>
            <p>本サイトの情報は正確を期していますが、内容の完全性・正確性を保証するものではありません。情報の利用は自己責任でお願いします。</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">お問い合わせ</h2>
            <p>
              プライバシーポリシーに関するご質問は{' '}
              <a href="mailto:rokuharatandai810@gmail.com" className="text-amber-600 hover:underline">
                rokuharatandai810@gmail.com
              </a>{' '}
              までご連絡ください。
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-100">
          <Link href="/" className="text-sm text-amber-600 hover:underline">← トップへ戻る</Link>
        </div>
      </main>
    </div>
  );
}
