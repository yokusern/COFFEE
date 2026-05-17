'use client';

import { useState } from 'react';

export function PaywallForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError('エラーが発生しました。もう一度お試しください。');
      }
    } catch {
      setError('通信エラーが発生しました。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-sm mx-auto">
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="メールアドレスを入力"
        required
        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-gray-900"
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full py-4 bg-gray-900 text-white rounded-lg text-base font-semibold cursor-pointer disabled:bg-gray-400 disabled:cursor-wait hover:bg-gray-700 transition-colors"
      >
        {loading ? '処理中...' : '月額 ¥980 で全記事を読む'}
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <p className="text-xs text-gray-400 text-center">
        いつでもキャンセル可能 · Stripe で安全に決済
      </p>
    </form>
  );
}
