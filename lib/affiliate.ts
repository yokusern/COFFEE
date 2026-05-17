/**
 * Japanese affiliate link registry for 副業ラボ (COFFEE).
 *
 * 登録先:
 * - A8.net (a8.net) — クラウドワークス, ランサーズ, freee, マネーフォワード, Udemy Japan
 * - もしもアフィリエイト (moshimo) — Amazon JP
 *
 * 登録後: YOUR_A8_ID, YOUR_MOSHIMO_ID を実際のIDに置き換える
 */

export type AffiliateLink = {
  name: string;
  url: string;
  description: string;
  commission: string;
  category: string;
};

export const AFFILIATE_LINKS: Record<string, AffiliateLink> = {
  crowdworks: {
    name: 'クラウドワークス',
    url: 'https://crowdworks.jp/redirect?ref=YOUR_A8_ID',   // A8.net経由
    description: '日本最大級の副業・フリーランス案件サイト',
    commission: '会員登録で報酬',
    category: 'フリーランス',
  },
  lancers: {
    name: 'ランサーズ',
    url: 'https://www.lancers.jp/?ref=YOUR_A8_ID',           // A8.net経由
    description: '副業・フリーランス案件プラットフォーム',
    commission: '会員登録で報酬',
    category: 'フリーランス',
  },
  freee: {
    name: 'freee会計',
    url: 'https://www.freee.co.jp/?ref=YOUR_A8_ID',          // A8.net経由
    description: 'フリーランス・副業の確定申告・帳簿管理',
    commission: '有料プラン登録で報酬',
    category: '節税・会計',
  },
  moneyforward: {
    name: 'マネーフォワード クラウド',
    url: 'https://biz.moneyforward.com/?ref=YOUR_A8_ID',     // A8.net経由
    description: '自動で帳簿・確定申告書を作成',
    commission: '有料プラン登録で報酬',
    category: '節税・会計',
  },
  udemy: {
    name: 'Udemy Japan',
    url: 'https://www.udemy.com/ja/?ref=YOUR_A8_ID',         // A8.net経由
    description: 'AIスキル・プログラミング・副業スキルを学ぶ',
    commission: '購入額の最大10%',
    category: 'スキルアップ',
  },
  coconala: {
    name: 'ココナラ',
    url: 'https://coconala.com/?ref=YOUR_A8_ID',             // A8.net経由
    description: 'スキルを売って副収入を得る',
    commission: '会員登録で報酬',
    category: 'AI副業',
  },
  note: {
    name: 'note',
    url: 'https://note.com/?ref=YOUR_A8_ID',
    description: '記事・テンプレートを販売して副収入',
    commission: '登録報酬',
    category: 'AI副業',
  },
  chatgpt: {
    name: 'ChatGPT Plus',
    url: 'https://openai.com/chatgpt',
    description: 'GPT-4でAI副業・ライティングを効率化',
    commission: '紹介なし（情報提供のみ）',
    category: 'AIツール',
  },
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  フリーランス:   ['フリーランス', 'クラウドソーシング', '案件', '副業', '在宅'],
  '節税・会計':   ['節税', '確定申告', '会計', '帳簿', '経費', '税金'],
  スキルアップ:   ['スキル', '学習', '勉強', 'Python', 'AI', '資格'],
  AI副業:        ['AI', 'ChatGPT', 'コンテンツ', 'ライティング', 'ブログ'],
  AIツール:      ['AIツール', 'ChatGPT', 'Gemini', 'Claude', '自動化'],
};

export function getRelevantLinks(tags: string[]): AffiliateLink[] {
  const tagStr = tags.join(' ');
  const scored: Array<[AffiliateLink, number]> = Object.values(AFFILIATE_LINKS).map(link => {
    let score = 1;
    const keywords = CATEGORY_KEYWORDS[link.category] ?? [];
    for (const kw of keywords) {
      if (tagStr.includes(kw)) score += 2;
    }
    return [link, score];
  });
  return scored
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([link]) => link);
}
