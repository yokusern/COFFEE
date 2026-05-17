-- stripe_payment_intent_id が webhook コードから書き込まれるが
-- migration 001 に存在しないため追加
alter table revenue_events
  add column if not exists stripe_payment_intent_id text;
