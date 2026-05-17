import Stripe from 'stripe';
import { createServiceClient } from './supabase';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-04-22.dahlia',
  });
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const PRO_PRICE_JPY = 980;

export async function createCheckoutSession(
  email: string,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const session = await getStripe().checkout.sessions.create({
    customer_email: email,
    mode: 'subscription',
    line_items: [{
      price: process.env.STRIPE_PRICE_PRO!,
      quantity: 1,
    }],
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    locale: 'ja',
    allow_promotion_codes: true,
    payment_method_types: ['card'],
  });
  return session.url!;
}

export async function handleWebhook(
  payload: string,
  signature: string
): Promise<void> {
  const event = getStripe().webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );

  const db = createServiceClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as {
        customer_email: string;
        customer: string;
        subscription: string;
      };
      const email = session.customer_email!;
      const stripeCustomerId = session.customer;
      const subscriptionId = session.subscription;

      await db.from('customers').upsert({
        email,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: subscriptionId,
        plan: 'pro',
        mrr: PRO_PRICE_JPY,
        status: 'active',
      }, { onConflict: 'email' });

      await db.from('revenue_events').insert({
        amount: PRO_PRICE_JPY,
        event_type: 'subscription_created',
        stripe_event_id: event.id,
      });
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as unknown as { customer: string; payment_intent: string };
      const { data: customer } = await db
        .from('customers')
        .select('id')
        .eq('stripe_customer_id', invoice.customer)
        .single();

      if (customer) {
        await db.from('revenue_events').insert({
          customer_id: customer.id,
          amount: PRO_PRICE_JPY,
          event_type: 'subscription_renewed',
          stripe_event_id: event.id,
          stripe_payment_intent_id: invoice.payment_intent,
        });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as { id: string };
      await db
        .from('customers')
        .update({ plan: 'free', mrr: 0, status: 'cancelled' })
        .eq('stripe_subscription_id', sub.id);
      break;
    }
  }
}
