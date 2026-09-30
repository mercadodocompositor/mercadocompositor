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

   **Banco já em uso: não execute `supabase/schema.sql` nem `supabase/update_all_migrations.sql`.** Os dois são baseline de projeto novo e reinstalam versões antigas de funções, policies e permissões. Arquivos que não aparecem na lista abaixo estão superados ou pertencem ao gateway antigo.

   1. `fix_auditoria_2026_09.sql` e `production_readiness_2026_09_18.sql` (somente logo após o baseline);
   2. `fix_user_roles_created_at.sql`, `dashboard_metrics.sql`, `release_metrics.sql`, `terms_acceptance.sql`, `export_personal_data_lgpd_2026_09_22.sql`, `account_security_metadata_2026_09_22.sql`, `profile_privacy_lgpd_2026_09_22.sql`;
   3. `notification_delivery_2026_09_22.sql`, `essential_notifications_2026_09_22.sql`, `buyer_copy_and_payment_failure_2026_09_22.sql`;
   4. `stripe_integration_2026_09_23.sql`, `stripe_plans_and_invoices_2026_09_23.sql`, `stripe_cancel_at_2026_09_23.sql`, `remove_payment_integration_2026_09_23.sql`;
   5. `stripe_subscription_notifications_2026_09_24.sql`, `account_deletion_notifications_2026_09_24.sql`, `self_account_deletion_2026_09_24.sql`, `self_account_deletion_no_reauth_2026_09_24.sql`, `fix_banned_until_infinity_2026_09_24.sql`, `fix_deleted_account_identities_2026_09_24.sql`, `fix_self_deletion_identity_guard_2026_09_24.sql`;
   6. `fix_song_triggers_regression_2026_09_24.sql`, `remove_song_moderation_2026_09_24.sql`, `fix_validated_media_fk_deferred_2026_09_24.sql`, `fix_request_history_2026_09_24.sql`, `request_status_groups_2026_09_24.sql`;
   7. [`supabase/request_consent_evidence_2026_09_24.sql`](supabase/request_consent_evidence_2026_09_24.sql), [`supabase/cpf_cnpj_validation_2026_09_24.sql`](supabase/cpf_cnpj_validation_2026_09_24.sql), [`supabase/buyer_request_receipt_2026_09_24.sql`](supabase/buyer_request_receipt_2026_09_24.sql), [`supabase/release_delivery_2026_09_24.sql`](supabase/release_delivery_2026_09_24.sql);
   8. `release_interpreter_iswc_2026_09_25.sql`, `split_music_genres_2026_09_25.sql`, `preview_85_seconds_2026_09_25.sql`;
   9. [`supabase/release_delivery_snapshot_2026_09_28.sql`](supabase/release_delivery_snapshot_2026_09_28.sql), `featured_composers_2026_09_28.sql`, `admin_safe_deletions_2026_09_28.sql`, `username_history_2026_09_28.sql`, `profile_save_and_email_2026_09_28.sql`, `welcome_email_2026_09_28.sql`, `plan_features_8_items_2026_09_28.sql`, `remove_test_plan_initial_2026_09_28.sql`;
   10. `fix_composer_request_email_delivery_2026_09_29.sql`, `fix_preview_validation_85_seconds_2026_09_29.sql`, `maintenance_mode_enforcement.sql`;
   11. [`supabase/fix_bloqueadores_2026_09_30.sql`](supabase/fix_bloqueadores_2026_09_30.sql), `admin_suspension_2026_09_30.sql`, `public_abuse_and_telemetry_2026_09_30.sql`, `medios_2026_09_30.sql`, `baixos_2026_09_30.sql`;
   12. [`supabase/verify_workflow_guarantees_2026_09_24.sql`](supabase/verify_workflow_guarantees_2026_09_24.sql), obrigatoriamente por último.

   O último script falha explicitamente se consentimento, validação de CPF/CNPJ, entrega automática, sincronização do outbox ou as permissões de coluna de `songs` e `profiles` tiverem sido sobrescritos. A análise completa dos conflitos está em `DIAGNOSTICO_PRODUCAO.md`, seção 6.
2. Configure os secrets listados em [`supabase/functions/.env.example`](supabase/functions/.env.example), inclusive `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`.
   Para usar o template HTML de entrega do termo no Resend, siga [`supabase/resend/README.md`](supabase/resend/README.md) antes de configurar `RESEND_RELEASE_DELIVERY_TEMPLATE_ID`.
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
   npx supabase functions deploy release-delivery
   npx supabase functions deploy client-telemetry --no-verify-jwt
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
