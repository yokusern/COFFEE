import { createServiceClient } from '../lib/supabase';
import { assessChurnRisk } from '../lib/gemini';
import {
  sendWeeklyReport,
  sendChurnPreventionEmail,
} from '../lib/sendgrid';

export class EngagementEngine {
  private get db() { return createServiceClient(); }

  public async sendWeeklyReports(): Promise<{ sent: number; failed: number }> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: articles } = await this.db
      .from('content_articles')
      .select('title, summary, slug')
      .eq('status', 'published')
      .gte('published_at', weekAgo.toISOString())
      .order('published_at', { ascending: false })
      .limit(3);

    if (!articles || articles.length === 0) {
      console.log('[ENGAGEMENT] No new articles this week. Skipping weekly report.');
      return { sent: 0, failed: 0 };
    }

    const { data: customers } = await this.db
      .from('customers')
      .select('email, name')
      .eq('status', 'active')
      .in('plan', ['pro', 'enterprise']);

    let sent = 0;
    let failed = 0;

    for (const customer of customers ?? []) {
      try {
        const msgId = await sendWeeklyReport(customer.email, articles);
        if (msgId) {
          await this.db.from('email_logs').insert({
            email_type: 'weekly_report',
            subject: '今週の注目記事',
            sendgrid_message_id: msgId,
          });
          sent++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    return { sent, failed };
  }

  public async runChurnPrevention(): Promise<{ assessed: number; emailed: number }> {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const { data: atRisk } = await this.db
      .from('customers')
      .select('*')
      .eq('status', 'active')
      .in('plan', ['pro', 'enterprise'])
      .or(`last_login_at.is.null,last_login_at.lt.${fourteenDaysAgo.toISOString()}`);

    let assessed = 0;
    let emailed = 0;

    for (const customer of atRisk ?? []) {
      try {
        const daysSinceLogin = customer.last_login_at
          ? Math.floor((Date.now() - new Date(customer.last_login_at).getTime()) / 86400000)
          : 30;

        const risk = await assessChurnRisk({
          plan: customer.plan,
          articles_read: customer.articles_read,
          days_since_last_login: daysSinceLogin,
          mrr: customer.mrr,
        });

        await this.db.from('customers')
          .update({ churn_risk: risk.risk })
          .eq('id', customer.id);

        assessed++;

        if (risk.risk === 'high') {
          await sendChurnPreventionEmail(customer.email, risk.reason, risk.action);
          emailed++;
        }
      } catch (err) {
        console.error(`[ENGAGEMENT] Churn assessment failed for ${customer.email}:`, err);
      }
    }

    return { assessed, emailed };
  }
}

export const engagementEngine = new EngagementEngine();
