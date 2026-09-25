# Mercado do Compositor

Plataforma para compositores publicarem obras autorais, receberem pedidos de intérpretes e emitirem termos de liberação em PDF. Produção: https://mercadodocompositor.com.br

Stack: Vite + React + TypeScript no frontend e Supabase (Auth, Postgres com RLS, Storage e Edge Functions) no backend.

## Rodar localmente

Pré-requisito: Node.js 20+.

1. Execute `npm install`.
2. Copie `.env.example` para `.env.local` e configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. Execute `npm run dev`.

## Deploy

1. Aplique os scripts SQL na ordem abaixo. `create or replace function` torna a ordem parte do contrato do deploy: migrations antigas executadas depois das novas podem remover garantias sem conflito de schema.

   1. [`supabase/update_all_migrations.sql`](supabase/update_all_migrations.sql), somente como baseline quando aplicável;
   2. migrations legadas ou de infraestrutura ainda necessárias;
   3. [`supabase/buyer_request_receipt_2026_09_24.sql`](supabase/buyer_request_receipt_2026_09_24.sql);
   4. [`supabase/release_delivery_2026_09_24.sql`](supabase/release_delivery_2026_09_24.sql);
   5. [`supabase/request_consent_evidence_2026_09_24.sql`](supabase/request_consent_evidence_2026_09_24.sql);
   6. [`supabase/cpf_cnpj_validation_2026_09_24.sql`](supabase/cpf_cnpj_validation_2026_09_24.sql);
   7. [`supabase/remove_payment_integration_2026_09_23.sql`](supabase/remove_payment_integration_2026_09_23.sql), para instalações que possuíam o gateway antigo;
   8. [`supabase/verify_workflow_guarantees_2026_09_24.sql`](supabase/verify_workflow_guarantees_2026_09_24.sql), obrigatoriamente por último.

   O último script falha explicitamente se consentimento, validação de CPF/CNPJ, entrega automática ou sincronização do outbox tiverem sido sobrescritos.
2. Configure os secrets listados em [`supabase/functions/.env.example`](supabase/functions/.env.example), inclusive `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`.
3. Publique as Edge Functions em uso:

   ```text
   npx supabase functions deploy validate-media-upload
   npx supabase functions deploy send-auth-email
   npx supabase functions deploy process-notification-emails
   npx supabase functions deploy stripe-checkout
   npx supabase functions deploy stripe-portal
   npx supabase functions deploy stripe-change-plan
   npx supabase functions deploy stripe-webhook --no-verify-jwt
   npx supabase functions deploy delete-my-account
   ```

4. Execute `npm run check` e publique o conteúdo de `dist/` na Hostinger.

## Pagamentos Stripe

1. Aplique, nesta ordem, `supabase/stripe_integration_2026_09_23.sql`, `supabase/stripe_plans_and_invoices_2026_09_23.sql` e `supabase/stripe_cancel_at_2026_09_23.sql`, antes de publicar as funções.
2. Cadastre no Stripe o endpoint `https://SEU-PROJETO.supabase.co/functions/v1/stripe-webhook`.
3. Assine os eventos `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` e `invoice.payment_failed`.
4. Habilite o Portal do Cliente no Stripe Billing (cartão, faturas e cancelamento). A troca de plano é feita pela própria plataforma (`stripe-change-plan`), não pelo portal.
5. Não é preciso criar produtos no Stripe: o `stripe-checkout` cria um Product e um Price por plano na primeira assinatura e grava os IDs em `subscription_plans`. Reajustar o preço no painel gera um Price novo só para novas assinaturas; quem já assina continua no valor contratado.

## Integração anterior

O gateway anterior foi descomissionado e não deve ser reativado.

Antes de remover credenciais ou webhooks do ambiente de produção, cancele no antigo provedor todas as assinaturas recorrentes ainda ativas. Excluir código ou secrets não cancela cobranças já agendadas externamente. Depois:

1. Aplique o script de remoção citado acima.
2. Apague do projeto Supabase as antigas Edge Functions de checkout e webhook, caso ainda estejam publicadas.
3. Remova os secrets antigos do gateway e o webhook no painel do provedor.
4. Faça o deploy do frontend e valide a tela de assinatura.

## Verificação

- `npm run test`
- `npm run lint`
- `npm run build`
- `npm run test:smoke` (com as variáveis de produção)
