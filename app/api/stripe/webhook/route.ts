import { NextRequest, NextResponse } from 'next/server';
import { handleWebhook } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const payload   = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';

  try {
    await handleWebhook(payload, signature);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[WEBHOOK]', err);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 400 });
  }
}
