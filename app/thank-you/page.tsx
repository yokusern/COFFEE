import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'ご購入ありがとうございます' };

export default function ThankYouPage() {
  return (
    <main className="max-w-xl mx-auto px-4 py-16 text-center font-sans">
      <p className="text-5xl mb-4">🎉</p>
      <h1 className="text-2xl font-semibold mb-4">ご購入ありがとうございます</h1>
      <p className="text-gray-500 mb-8 leading-loose">
        登録したメールアドレスにログイン情報をお送りしました。<br />
        全記事をお楽しみください。
      </p>
      <a
        href="/articles"
        className="inline-block px-8 py-3 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-700 transition-colors no-underline"
      >
        記事一覧へ
      </a>
    </main>
  );
}
