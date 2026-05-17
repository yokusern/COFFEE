const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

async function callGemini(prompt: string, temperature = 0.7): Promise<string> {
  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: 4000,
      },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

export type GeneratedArticle = {
  title: string;
  meta_title: string;
  meta_description: string;
  summary: string;
  body_free: string;
  body_paid: string;
  slug: string;
  tags: string[];
};

export async function generateArticle(
  keyword: string,
  niche: string
): Promise<GeneratedArticle> {
  const prompt = `
あなたは${niche}の専門家ライターです。
以下のキーワードで、実務家向けの価値ある記事を生成してください。

キーワード: 「${keyword}」

以下のJSON形式のみで返してください（マークダウン不要）:
{
  "title": "記事タイトル（40文字以内、キーワード含む）",
  "meta_title": "SEO用タイトル（60文字以内）",
  "meta_description": "検索結果表示用の説明（120文字以内）",
  "summary": "記事の概要（200文字以内）",
  "slug": "url-friendly-slug-in-english",
  "tags": ["タグ1", "タグ2", "タグ3"],
  "body_free": "## 無料で読める部分\\n\\n具体的な課題提起と、解決策の概要を800〜1200文字で記述。数字・事例・データを含める。読者が『続きを読みたい』と思う場所で終わる。",
  "body_paid": "## ここからは有料会員限定\\n\\n実際の解決策・手順・テンプレート・チェックリストを2000〜3000文字で詳述。コピーアンドペーストで使える具体的な内容にする。"
}

重要:
- 架空のデータは使わない（「〜の場合もある」「〜と言われている」で表現）
- 最新の2026年の文脈で書く
- 実務ですぐ使えるレベルの具体性を持たせる
- JSONのみ返す。余分なテキスト不要。
  `.trim();

  const raw = await callGemini(prompt, 0.6);
  const cleaned = raw.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(cleaned) as GeneratedArticle;
  } catch {
    throw new Error(`JSON parse failed. Raw: ${cleaned.slice(0, 200)}`);
  }
}

export async function analyzeKeywordOpportunity(keyword: string): Promise<{
  estimated_searches: number;
  competition: 'low' | 'medium' | 'high';
  recommended_angle: string;
}> {
  const prompt = `
キーワード「${keyword}」について分析してJSON形式のみで返してください：
{
  "estimated_searches": 月間検索数の推定（整数）,
  "competition": "low" または "medium" または "high",
  "recommended_angle": "このキーワードで差別化するための記事アングル（1文）"
}
  `.trim();

  const raw = await callGemini(prompt, 0.3);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

export async function assessChurnRisk(customer: {
  plan: string;
  articles_read: number;
  days_since_last_login: number;
  mrr: number;
}): Promise<{ risk: 'low' | 'medium' | 'high'; reason: string; action: string }> {
  const prompt = `
以下の顧客データからチャーン（解約）リスクを判定してJSON形式のみで返してください：
${JSON.stringify(customer)}

{
  "risk": "low" または "medium" または "high",
  "reason": "リスクの主な理由（1文）",
  "action": "取るべきアクション（1文、メールで実行できる内容）"
}
  `.trim();

  const raw = await callGemini(prompt, 0.2);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}
