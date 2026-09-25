-- Stripe: preços fixos por plano, troca de plano e histórico de faturas atômico.
-- Requer stripe_integration_2026_09_23.sql aplicado antes.

begin;

-- Cada plano passa a ter Product e Price fixos no Stripe (criados sob demanda
-- pelo stripe-checkout). O Product não muda quando o plano é renomeado ou tem
-- o preço reajustado, por isso o webhook identifica o plano por ele.
alter table public.subscription_plans
  add column if not exists stripe_product_id text,
  add column if not exists stripe_price_id text;

create unique index if not exists subscription_plans_stripe_product_uidx
  on public.subscription_plans(stripe_product_id) where stripe_product_id is not null;

-- Inclui ou substitui uma fatura em subscriptions.invoices num único UPDATE.
-- O webhook fazia ler-modificar-gravar e eventos simultâneos perdiam faturas.
create or replace function public.upsert_subscription_invoice(p_user_id uuid, p_invoice jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(p_invoice->>'id', '') = '' then
    raise exception 'invoice_without_id';
  end if;
  update public.subscriptions s
     set invoices = (
       select coalesce(jsonb_agg(item order by item->>'date'), '[]'::jsonb)
         from (
           select item from jsonb_array_elements(s.invoices) item
            where item->>'id' is distinct from p_invoice->>'id'
           union all
           select p_invoice
         ) merged
     ),
     updated_at = now()
   where s.user_id = p_user_id;
  return found;
end;
$$;

revoke execute on function public.upsert_subscription_invoice(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_subscription_invoice(uuid, jsonb) to service_role;

commit;
