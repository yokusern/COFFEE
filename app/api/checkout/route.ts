import { NextRequest, NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const url = await createCheckoutSession(
    email,
    `${appUrl}/thank-you`,
    `${appUrl}/pricing`
  );

  return NextResponse.json({ url });
}
