import { createServiceClient } from '../lib/supabase';
import { generateArticle } from '../lib/gemini';

export class ContentEngine {
  private get db() { return createServiceClient(); }
  private readonly ARTICLES_PER_DAY = 1;

  public async run(): Promise<{ generated: number; errors: string[] }> {
    const errors: string[] = [];
    let generated = 0;

    for (let i = 0; i < this.ARTICLES_PER_DAY; i++) {
      try {
        const keyword = await this.selectNextKeyword();
        if (!keyword) {
          console.log('[CONTENT] No available keywords.');
          break;
        }

        console.log(`[CONTENT] Generating article for: "${keyword.keyword}"`);
        const article = await generateArticle(keyword.keyword, keyword.niche ?? '');

        const { count } = await this.db
          .from('articles')
          .select('*', { count: 'exact', head: true })
          .eq('slug', article.slug);
        if ((count ?? 0) > 0) {
          console.log(`[CONTENT] Slug already exists: ${article.slug}`);
          continue;
        }

        await this.db.from('articles').insert({
          slug: article.slug,
          title: article.title,
          meta_title: article.meta_title,
          meta_description: article.meta_description,
          summary: article.summary,
          body_free: article.body_free,
          body_paid: article.body_paid,
          target_keyword: keyword.keyword,
          tags: article.tags,
          generated_by: 'gemini-1.5-flash',
          status: 'draft',
          human_reviewed: false,
        });

        await this.db.from('keyword_queue').update({
          used_at: new Date().toISOString(),
        }).eq('id', keyword.id);

        generated++;
        console.log(`[CONTENT] Generated: "${article.title}"`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg);
        console.error('[CONTENT] Error:', msg);
      }
    }

    await this.db.from('system_logs').insert({
      component: 'CONTENT_ENGINE',
      action: 'daily_generation',
      result: errors.length === 0 ? 'SUCCESS' : 'FAILURE',
      details: `Generated: ${generated}, Errors: ${errors.length}`,
      metadata: { generated, errors },
    });

    return { generated, errors };
  }

  private async selectNextKeyword() {
    const { data } = await this.db
      .from('keyword_queue')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .order('used_at', { ascending: true, nullsFirst: true })
      .limit(1)
      .single();
    return data;
  }
}

export const contentEngine = new ContentEngine();
