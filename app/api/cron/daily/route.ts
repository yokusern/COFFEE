import { NextRequest, NextResponse } from 'next/server';
import { contentEngine } from '@/system/content-engine';
import { engagementEngine } from '@/system/engagement-engine';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const summary: Record<string, unknown> = {};

  try {
    summary.content = await contentEngine.run();
  } catch (err) {
    summary.content = { error: String(err) };
  }

  try {
    summary.churn = await engagementEngine.runChurnPrevention();
  } catch (err) {
    summary.churn = { error: String(err) };
  }

  if (new Date().getDay() === 1) {
    try {
      summary.weekly = await engagementEngine.sendWeeklyReports();
    } catch (err) {
      summary.weekly = { error: String(err) };
    }
  }

  return NextResponse.json(summary);
}
