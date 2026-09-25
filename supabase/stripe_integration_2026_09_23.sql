begin;

alter table public.subscriptions
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_subscription_status text;

create unique index if not exists subscriptions_stripe_customer_uidx
  on public.subscriptions(stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists subscriptions_stripe_subscription_uidx
  on public.subscriptions(stripe_subscription_id) where stripe_subscription_id is not null;

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;

commit;
