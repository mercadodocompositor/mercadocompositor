<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/2702b530-9daa-42bc-8ac3-934f3b8ad4a8

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Supabase — produção

1. Abra **Project Settings > API** no seu projeto Supabase.
2. Copie `.env.example` para `.env.local` e configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. Execute [`supabase/schema.sql`](supabase/schema.sql) integralmente no SQL Editor. Ele cria tabelas relacionais, RLS, funções públicas seguras e buckets de Storage.
4. Em **Authentication > URL Configuration**, adicione a URL local (`http://localhost:3000`) e a URL de produção aos Redirect URLs.

Use como **Site URL** o domínio de produção e autorize também os callbacks `/autenticacao` dos ambientes local e publicado. O cadastro suporta confirmação de e-mail e a recuperação redireciona para `/autenticacao?modo=new-password`.

O frontend usa somente a chave pública `anon`/publishable. Nunca coloque a `service_role` em variáveis `VITE_*`.

Para liberar o painel administrativo, crie primeiro a conta do proprietário e execute a instrução comentada no final do schema usando o UUID dessa conta. A chave administrativa nunca fica no frontend.

### E-mails de autenticação via Resend

A Edge Function em `supabase/functions/send-auth-email` implementa o Send Email Auth Hook. Ela mantém a geração e validação dos links no Supabase Auth e usa a API da Resend apenas para entrega.

1. Verifique o domínio remetente na Resend e crie uma API key nova.
2. Crie um **Send Email Hook** HTTPS em Supabase > Authentication > Hooks apontando para `https://SEU-PROJECT-REF.supabase.co/functions/v1/send-auth-email` e gere o segredo do hook.
3. Configure `RESEND_API_KEY`, `SEND_EMAIL_HOOK_SECRET` e `AUTH_EMAIL_FROM` como Edge Function Secrets; nunca como variáveis `VITE_*`.
4. Publique com `supabase functions deploy send-auth-email --no-verify-jwt`.
