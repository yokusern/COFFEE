import type { MetadataRoute } from 'next';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  let articleUrls: MetadataRoute.Sitemap = [];

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { createServiceClient } = await import('@/lib/supabase');
      const db = createServiceClient();
      const { data: articles } = await db
        .from('articles')
        .select('slug, published_at, updated_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false });

      articleUrls = (articles ?? []).map(a => ({
        url: `${appUrl}/articles/${a.slug}`,
        lastModified: new Date(a.updated_at ?? a.published_at ?? Date.now()),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }));
    } catch {
      // Supabase not available at build time
    }
  }

  return [
    { url: appUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${appUrl}/articles`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    ...articleUrls,
  ];
}
