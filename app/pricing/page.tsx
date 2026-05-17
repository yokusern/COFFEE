import { PaywallForm } from '@/components/PaywallForm';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '料金プラン',
  description: '月額980円で全記事が読み放題。いつでも解約可能。',
};

const FEATURES = [
  '全記事を全文閲覧',
  '新着記事への即時アクセス',
  'テンプレート・チェックリストのダウンロード',
  'いつでもキャンセル可能',
];

export default function PricingPage() {
  return (
    <main className="max-w-xl mx-auto px-4 py-16 text-center font-sans">
      <h1 className="text-3xl font-semibold mb-2">シンプルな料金体系</h1>
      <p className="text-gray-500 mb-12">全記事が読み放題。いつでもキャンセルできます。</p>

      <div className="p-10 border-2 border-gray-900 rounded-2xl bg-white mb-8">
        <p className="text-sm text-gray-500 mb-2">月額プラン</p>
        <p className="text-6xl font-bold mb-1">¥980</p>
        <p className="text-sm text-gray-400 mb-8">/ 月（税込）</p>

        <ul className="text-left list-none p-0 mb-8 space-y-0">
          {FEATURES.map(item => (
            <li key={item} className="py-3 border-b border-gray-100 text-base">
              ✓ {item}
            </li>
          ))}
        </ul>

        <PaywallForm />
      </div>

      <p className="text-xs text-gray-400">Stripeによる安全な決済 · SSL暗号化通信</p>
    </main>
  );
}
