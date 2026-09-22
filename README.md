# Mercado do Compositor

Plataforma para compositores publicarem obras autorais, receberem pedidos de intérpretes e emitirem termos de liberação em PDF. Produção: https://mercadodocompositor.com.br

Stack: Vite + React + TypeScript no frontend (build estático hospedado na Hostinger) e Supabase (Auth, Postgres com RLS, Storage e Edge Functions) no backend. Pagamentos via Mercado Pago Checkout Pro.

## Rodar localmente

**Pré-requisito:** Node.js 20+

1. `npm install`
2. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. `npm run dev` (abre em http://localhost:3000)

## Deploy em produção (ordem exata)

1. **SQL no Supabase** (SQL Editor, cada arquivo inteiro, nesta ordem; todos são idempotentes):
   1. [`supabase/update_all_migrations.sql`](supabase/update_all_migrations.sql)
   2. Módulos que o consolidado não inclui: [`dashboard_metrics.sql`](supabase/dashboard_metrics.sql), [`release_metrics.sql`](supabase/release_metrics.sql), [`terms_acceptance.sql`](supabase/terms_acceptance.sql), [`get_public_composers.sql`](supabase/get_public_composers.sql), [`maintenance_mode_enforcement.sql`](supabase/maintenance_mode_enforcement.sql)
   3. [`supabase/fix_auditoria_2026_09.sql`](supabase/fix_auditoria_2026_09.sql)
   4. [`supabase/production_readiness_2026_09_18.sql`](supabase/production_readiness_2026_09_18.sql) — expiração diária de assinaturas vencidas (pg_cron), default de `system_logs.id` e correções de storage. Se ele avisar que o pg_cron está indisponível, ative em **Integrations > Cron** e rode de novo.
   5. [`supabase/recurring_subscriptions_2026_09_21.sql`](supabase/recurring_subscriptions_2026_09_21.sql) — renovação automática (Assinaturas do Mercado Pago): vínculo do preapproval em `subscriptions` e carência de 7 dias para quem renova no cartão.
   6. [`supabase/free_trial_2026_09_21.sql`](supabase/free_trial_2026_09_21.sql) — teste grátis de 7 dias na primeira assinatura.
   7. [`supabase/fix_new_accounts_pending_2026_09_21.sql`](supabase/fix_new_accounts_pending_2026_09_21.sql) — contas novas nascem com assinatura pendente.
   8. [`supabase/subscription_page_fixes_2026_09_21.sql`](supabase/subscription_page_fixes_2026_09_21.sql) — carência do teste com renovação ativa e faturas estornadas no histórico.
   9. [`supabase/notification_delivery_2026_09_22.sql`](supabase/notification_delivery_2026_09_22.sql) — fila de e-mails das notificações e agendamento (pg_cron) da função `process-notification-emails`. **Antes de rodar**, cadastre no Vault (Supabase > Project Settings > Vault) os segredos `notification_dispatch_url` (`https://SEU-PROJECT-REF.supabase.co/functions/v1/process-notification-emails`) e `notification_cron_secret` (mesmo valor do secret `NOTIFICATION_CRON_SECRET`). Sem eles a fila enche e nenhum e-mail sai.
   10. [`supabase/essential_notifications_2026_09_22.sql`](supabase/essential_notifications_2026_09_22.sql) — comunicações essenciais: comprovante de quitação, link da cópia do termo emitido e aviso de renovação paga.
   11. [`supabase/buyer_copy_and_payment_failure_2026_09_22.sql`](supabase/buyer_copy_and_payment_failure_2026_09_22.sql) — cópia do termo enviada ao e-mail do intérprete e aviso imediato de cobrança recusada.
   12. [`supabase/check_production_readiness.sql`](supabase/check_production_readiness.sql) — somente leitura; resultado vazio significa banco pronto.

   `get_public_composer`, `get_featured_composers` e `validate_release_document` ainda só existem no `schema.sql` antigo. Bancos que já estão no ar costumam tê-las; se a verificação acusar a falta, extraia essas funções do `schema.sql` em vez de rodá-lo inteiro (ele sobrescreveria correções posteriores).
   Não execute `fix_song_insert_permissions.sql` (neutralizado; reverte proteções de coluna).
2. **Secrets das Edge Functions** (`npx supabase secrets set NOME=valor` ou Supabase > Edge Functions > Secrets). Lista completa em [`supabase/functions/.env.example`](supabase/functions/.env.example):
   `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `APP_URL`, `RESEND_API_KEY`, `SEND_EMAIL_HOOK_SECRET`, `AUTH_EMAIL_FROM`, `NOTIFICATION_EMAIL_FROM`, `NOTIFICATION_CRON_SECRET`.
3. **Deploy das Edge Functions** (o `supabase/config.toml` já define `verify_jwt` de cada uma):
   ```
   npx supabase functions deploy validate-media-upload
   npx supabase functions deploy mercadopago-checkout
   npx supabase functions deploy mercadopago-webhook
   npx supabase functions deploy send-auth-email
   npx supabase functions deploy process-notification-emails
   ```
   Confira no painel que `mercadopago-webhook`, `send-auth-email` e `process-notification-emails` estão com **Verify JWT desligado**.
4. **Build do frontend** com o `.env` de produção (`VITE_APP_URL=https://mercadodocompositor.com.br`, `VITE_APP_RELEASE` com a versão): `npm run check`.
5. **Upload para a Hostinger:** envie o conteúdo de `dist/` (incluindo o `.htaccess` oculto) para `public_html`. O `compositor.php` e o `og-config.php` (gerado pelo build) montam a prévia dos perfis no WhatsApp/redes; confira colando um link `/compositor/<username>` no [Sharing Debugger](https://developers.facebook.com/tools/debug/) do Facebook.
6. **Mercado Pago:** em Suas integrações > Webhooks, URL `https://SEU-PROJECT-REF.supabase.co/functions/v1/mercadopago-webhook`, eventos **Order (Mercado Pago)** (pagamento de 1 mês), **Planos e assinaturas** (renovação automática) e **Pagamentos** (estornos das cobranças automáticas). A assinatura secreta gerada é o `MERCADOPAGO_WEBHOOK_SECRET`.
7. **Verificação:** `npm run test:smoke` e um pagamento real de valor baixo de ponta a ponta.

## Supabase — produção

1. Abra **Project Settings > API** no seu projeto Supabase.
2. Copie `.env.example` para `.env.local` e configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. Rode os scripts SQL na ordem descrita em **Deploy em produção**.
4. Em **Authentication > URL Configuration**, adicione a URL local (`http://localhost:3000`) e a URL de produção aos Redirect URLs.

### Prévia protegida

O cadastro recebe somente uma prévia pública de até 60 segundos. Publique a função de validação antes do frontend:

`supabase functions deploy validate-media-upload`

O arquivo enviado é validado em quarentena e promovido para `song-previews`. A tela de nova música não oferece envio do áudio completo.

Use como **Site URL** o domínio de produção e autorize também os callbacks `/autenticacao` dos ambientes local e publicado. O cadastro suporta confirmação de e-mail e a recuperação redireciona para `/autenticacao?modo=new-password`.

O frontend usa somente a chave pública `anon`/publishable. Nunca coloque a `service_role` em variáveis `VITE_*`.

## Qualidade e observabilidade

- `npm run check`: testes unitários, TypeScript e build de produção.
- `npm run test:e2e`: cenários públicos e responsivos no Chrome com Playwright. Defina `E2E_EMAIL` e `E2E_PASSWORD` apenas no ambiente de CI para habilitar também o cenário autenticado.
- `npm run test:smoke`: verifica site e RPCs críticas já publicadas.
- `VITE_OBSERVABILITY_ENDPOINT`: endpoint opcional que recebe erros e Web Vitals sanitizados. Nenhum CPF, documento, e-mail, token ou WhatsApp é enviado.
- `VITE_APP_RELEASE`: identificador do deploy usado para correlacionar falhas com uma versão.

Para liberar o painel administrativo, crie primeiro a conta do proprietário e execute a instrução comentada no final do schema usando o UUID dessa conta. A chave administrativa nunca fica no frontend.

### E-mails de autenticação via Resend

A Edge Function em `supabase/functions/send-auth-email` implementa o Send Email Auth Hook. Ela mantém a geração e validação dos links no Supabase Auth e usa a API da Resend apenas para entrega.

1. Verifique o domínio remetente na Resend e crie uma API key nova.
2. Crie um **Send Email Hook** HTTPS em Supabase > Authentication > Hooks apontando para `https://SEU-PROJECT-REF.supabase.co/functions/v1/send-auth-email` e gere o segredo do hook.
3. Configure `RESEND_API_KEY`, `SEND_EMAIL_HOOK_SECRET` e `AUTH_EMAIL_FROM` como Edge Function Secrets; nunca como variáveis `VITE_*`.
4. Publique com `supabase functions deploy send-auth-email --no-verify-jwt`.
