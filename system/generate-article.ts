/**
 * 毎日 AM 3:00 JST に GitHub Actions から実行される
 * keyword_queue から未使用キーワードを1つ選び、
 * Gemini で記事を生成して articles テーブルに draft で保存する
 */

import { createServiceClient } from '../lib/supabase';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.65, maxOutputTokens: 4096 },
    }),
    signal: AbortSignal.timeout(40000),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function main() {
  const db = createServiceClient();

  const { data: kw } = await db
    .from('keyword_queue')
    .select('*')
    .eq('is_active', true)
    .is('used_at', null)
    .order('priority', { ascending: false })
    .limit(1)
    .single();

  if (!kw) {
    console.log('[GENERATE] No unused keywords available.');
    await db.from('system_logs').insert({
      component: 'CONTENT_ENGINE',
      action: 'generate_article',
      result: 'SKIPPED',
      details: 'No unused keywords',
    });
    return;
  }

  console.log(`[GENERATE] Keyword: "${kw.keyword}"`);

  const prompt = `
あなたは${kw.niche ?? 'IT・ビジネス'}分野の実務経験豊富なライターです。
副業・フリーランス・AI活用に関する実践的な記事を書いてください。

キーワード: 「${kw.keyword}」

以下の JSON 形式のみで返してください（コードブロック・前置き不要）:
{
  "slug": "英語のURL（ハイフン区切り、50文字以内）",
  "title": "記事タイトル（40文字以内、キーワードを含む）",
  "summary": "記事の概要（120文字以内、検索結果に表示される）",
  "meta_title": "SEO用タイトル（60文字以内）",
  "meta_description": "メタディスクリプション（120文字以内）",
  "tags": ["タグ1", "タグ2", "タグ3"],
  "body_free": "## 記事本文\\n\\n読者の課題と背景を800〜1200字で解説。数字・実例・比較を使う。Markdownで書く。",
  "body_paid": "## 実践手順・テンプレート\\n\\n具体的な手順・コピペ可能なテンプレート・チェックリストを2000〜3000字で。クラウドワークス・ランサーズ・ChatGPT等の具体的なツール名を含む。Markdownで書く。"
}
  `.trim();

  let parsed: Record<string, unknown>;
  try {
    const raw = await callGemini(prompt);
    const cleaned = raw.replace(/^```json\s*|^```\s*|```\s*$/gm, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error('[GENERATE] Parse failed:', err);
    await db.from('system_logs').insert({
      component: 'CONTENT_ENGINE',
      action: 'generate_article',
      result: 'FAILURE',
      details: `Parse error: ${String(err)}`,
    });
    process.exit(1);
  }

  const { count } = await db
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('slug', parsed.slug as string);

  if ((count ?? 0) > 0) {
    console.log(`[GENERATE] Slug "${parsed.slug}" already exists. Skipping.`);
    return;
  }

  const { data: article, error: insertError } = await db
    .from('articles')
    .insert({
      slug:             parsed.slug,
      title:            parsed.title,
      summary:          parsed.summary,
      meta_title:       parsed.meta_title,
      meta_description: parsed.meta_description,
      tags:             parsed.tags,
      body_free:        parsed.body_free,
      body_paid:        parsed.body_paid,
      target_keyword:   kw.keyword,
      status:           'published',
      published_at:     new Date().toISOString(),
      human_reviewed:   false,
      generated_by:     'gemini-1.5-flash',
    })
    .select('id')
    .single();

  if (insertError) throw insertError;

  await db
    .from('keyword_queue')
    .update({ used_at: new Date().toISOString(), article_id: article!.id })
    .eq('id', kw.id);

  await db.from('system_logs').insert({
    component: 'CONTENT_ENGINE',
    action: 'generate_article',
    result: 'SUCCESS',
    details: `Generated: "${parsed.title}"`,
    metadata: { slug: parsed.slug, keyword: kw.keyword },
  });

  console.log(`[GENERATE] Article published: "${parsed.title}"`);
}

main().catch(err => {
  console.error('[GENERATE] FATAL:', err);
  process.exit(1);
});
