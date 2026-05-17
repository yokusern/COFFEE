import { contentEngine } from './content-engine';
import { engagementEngine } from './engagement-engine';
import { createServiceClient } from '../lib/supabase';

async function runCycle() {
  const startAt = Date.now();
  console.log('=== AUTONOMOUS REVENUE SYSTEM — DAILY CYCLE START ===');
  console.log(`Time: ${new Date().toISOString()}`);

  const db = createServiceClient();
  const summary: Record<string, unknown> = {};

  console.log('\n[STEP 1] Content generation...');
  try {
    summary.content = await contentEngine.run();
  } catch (err) {
    summary.content = { error: String(err) };
    console.error('[STEP 1] Failed:', err);
  }

  console.log('\n[STEP 2] Churn prevention...');
  try {
    summary.churn = await engagementEngine.runChurnPrevention();
  } catch (err) {
    summary.churn = { error: String(err) };
  }

  const isMonday = new Date().getDay() === 1;
  if (isMonday) {
    console.log('\n[STEP 3] Sending weekly reports...');
    try {
      summary.weekly = await engagementEngine.sendWeeklyReports();
    } catch (err) {
      summary.weekly = { error: String(err) };
    }
  } else {
    summary.weekly = 'skipped (not Monday)';
  }

  const elapsed = ((Date.now() - startAt) / 1000).toFixed(1);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { data: revenue } = await db
    .from('revenue_events')
    .select('amount')
    .gte('created_at', monthStart.toISOString());
  const mrr = (revenue ?? []).reduce((s, r) => s + r.amount, 0);

  const { count: draftCount } = await db
    .from('content_articles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'draft')
    .eq('human_reviewed', false);

  await db.from('system_logs').insert({
    component: 'CYCLE',
    action: 'daily_cycle_complete',
    result: 'SUCCESS',
    details: `Elapsed: ${elapsed}s | MRR: ¥${mrr} | Drafts pending: ${draftCount}`,
    metadata: { ...summary, elapsed_seconds: elapsed, mrr, draft_count: draftCount },
  });

  console.log('\n=== CYCLE SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\n承認待ち下書き: ${draftCount}件`);
  console.log(`今月の収益: ¥${mrr.toLocaleString()}`);
  console.log(`実行時間: ${elapsed}秒`);
  console.log('\n=== DAILY CYCLE END ===');
}

runCycle().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
