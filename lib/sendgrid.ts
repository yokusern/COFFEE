const SG_API = 'https://api.sendgrid.com/v3/mail/send';
const FROM = {
  email: process.env.SENDGRID_FROM_EMAIL!,
  name: process.env.SENDGRID_FROM_NAME ?? 'Aether Mint',
};

async function send(to: string, subject: string, body: string): Promise<string | null> {
  const res = await fetch(SG_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: FROM,
      subject,
      content: [{ type: 'text/html', value: body }],
      tracking_settings: {
        click_tracking: { enable: true },
        open_tracking: { enable: true },
      },
    }),
  });

  if (!res.ok) {
    console.error(`[SENDGRID] Failed: ${res.status} ${await res.text()}`);
    return null;
  }
  return res.headers.get('X-Message-Id');
}

export async function sendWelcomeEmail(
  to: string,
  name: string,
  plan: string
): Promise<string | null> {
  const subject = `【Aether Mint】ご登録ありがとうございます`;
  const body = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="font-weight:500">${name ?? 'はじめまして'}、ようこそ</h2>
  <p>${plan === 'free' ? '無料プランで' : `${plan}プランで`}ご登録いただきました。</p>
  <p>毎週、業界の最新情報をお届けします。<br>
  ${plan === 'free'
    ? '有料プランにアップグレードすると、全記事を読み放題でご利用いただけます。'
    : '全記事をご自由にお読みいただけます。'
  }</p>
  <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard"
     style="display:inline-block;margin-top:16px;padding:12px 24px;
            background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px">
    ダッシュボードを開く
  </a>
  <p style="margin-top:32px;font-size:12px;color:#666">
    配信停止は <a href="{{unsubscribe}}">こちら</a>
  </p>
</div>
  `.trim();

  return send(to, subject, body);
}

export async function sendWeeklyReport(
  to: string,
  articles: Array<{ title: string; summary: string; slug: string }>
): Promise<string | null> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const articleHtml = articles
    .map(a => `
      <div style="margin-bottom:24px;padding:16px;border:1px solid #eee;border-radius:8px">
        <h3 style="margin:0 0 8px;font-weight:500;font-size:15px">
          <a href="${appUrl}/content/${a.slug}" style="color:#1a1a1a;text-decoration:none">
            ${a.title}
          </a>
        </h3>
        <p style="margin:0;font-size:13px;color:#666">${a.summary}</p>
      </div>
    `).join('');

  const subject = `【週次レポート】今週の注目記事 ${new Date().toLocaleDateString('ja-JP')}`;
  const body = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="font-weight:500">今週の注目コンテンツ</h2>
  ${articleHtml}
  <p style="margin-top:32px;font-size:12px;color:#666">
    配信停止は <a href="{{unsubscribe}}">こちら</a>
  </p>
</div>
  `.trim();

  return send(to, subject, body);
}

export async function sendChurnPreventionEmail(
  to: string,
  reason: string,
  action: string
): Promise<string | null> {
  const subject = `最近いかがでしょうか？`;
  const body = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="font-weight:500">最近のご状況はいかがでしょうか</h2>
  <p>しばらくログインがないことを確認し、ご連絡いたしました。</p>
  <p>${action}</p>
  <a href="${process.env.NEXT_PUBLIC_APP_URL}/content"
     style="display:inline-block;margin-top:16px;padding:12px 24px;
            background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px">
    最新記事を確認する
  </a>
  <p style="margin-top:32px;font-size:12px;color:#666">
    配信停止は <a href="{{unsubscribe}}">こちら</a>
  </p>
</div>
  `.trim();

  return send(to, subject, body);
}
