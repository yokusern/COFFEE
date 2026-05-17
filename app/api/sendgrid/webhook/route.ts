import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

type SendGridEvent = {
  event: string;
  sg_message_id?: string;
};

export async function POST(req: NextRequest) {
  const events: SendGridEvent[] = await req.json();
  const db = createServiceClient();

  for (const event of events) {
    if (!event.sg_message_id) continue;
    const msgId = event.sg_message_id.split('.')[0];

    if (event.event === 'open') {
      await db.from('email_logs').update({ is_opened: true }).eq('sendgrid_message_id', msgId);
    } else if (event.event === 'click') {
      await db.from('email_logs').update({ is_clicked: true }).eq('sendgrid_message_id', msgId);
    }
  }

  return NextResponse.json({ received: true });
}
