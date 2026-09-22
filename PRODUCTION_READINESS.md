# Auditoria de produção — Mercado do Compositor (2026-09-18)

## 1. Resumo executivo

**O código está pronto para produção depois de aplicar as correções abaixo.** Nenhuma delas foi publicada: falta rodar o SQL, fazer o deploy das Edge Functions e subir o build. Nenhum commit foi feito.

Bloqueios de lançamento que foram corrigidos:

- **Assinaturas nunca expiravam.** O Checkout Pro é um pagamento avulso. Quem pagava uma vez ficava ativo para sempre.
- **Pagamentos aprovados podiam falhar ao ser registrados.** Isso acontece em bancos criados pelo script consolidado, onde `system_logs.id` não tem default.
- **O compositor podia apagar os PDFs de termos de liberação já emitidos.**

O que ainda precisa ser confirmado antes de lançar:

- Rodar [supabase/check_production_readiness.sql](supabase/check_production_readiness.sql) no banco real. O resultado precisa vir vazio.
- Revisar os dados e textos listados na seção 6, que dependem do proprietário.

Estado final: 288 testes passando, `tsc` sem erros, build OK e `npm audit` sem vulnerabilidades.

## 2. Problemas encontrados

| # | Severidade | Onde | Problema | Status |
|---|---|---|---|---|
| 1 | Crítico | SQL: `subscriptions` | O webhook grava `next_billing_date = hoje + 30`, mas nenhuma rotina suspendia a conta depois dessa data. Um único pagamento dava acesso vitalício. | Corrigido: a nova função `expire_overdue_subscriptions()` roda todo dia via pg_cron. Ela devolve a assinatura para `pending` 3 dias após o vencimento e avisa o compositor 3 dias antes. |
| 2 | Crítico | SQL: `system_logs.id` | No consolidado, a coluna era `text primary key` sem default. `process_mercadopago_payment` insere log sem `id`, então o insert falhava e desfazia toda a transação do pagamento aprovado. | Corrigido: default `gen_random_uuid()::text`, no script novo e no consolidado. |
| 3 | Alto | SQL: policy de storage `media owner delete` | Não filtrava bucket, então o compositor podia apagar `release-documents/<uid>/...`, que são documentos imutáveis. Era uma regressão: o `music_security.sql` já protegia esse bucket. | Corrigido: o bucket `release-documents` ficou fora da policy. |
| 4 | Alto | SQL: policy de storage `media owner update` | Não filtrava bucket, então um arquivo da quarentena podia ser movido direto para um bucket público sem passar pela validação. | Corrigido: a policy agora vale só para `media-quarantine` (o app não usa update em outro bucket). |
| 5 | Alto | [mercadopago-checkout](supabase/functions/mercadopago-checkout/index.ts) | Um nome de plano desconhecido caía no preço de fallback de R$ 24,90, e o webhook renovava o plano atual. Assim, um assinante Ouro podia renovar pagando o preço do Bronze. | Corrigido: só aceita plano do catálogo, ativo ou igual ao plano atual (renovação), e sem preço de fallback. |
| 6 | Alto | [mercadopago-webhook](supabase/functions/mercadopago-webhook/index.ts) | Não conferia o valor pago antes de ativar a assinatura. | Corrigido: pagamento aprovado abaixo do preço do plano, ou em outra moeda, é registrado como `under_review` e não ativa nada. |
| 7 | Médio | mercadopago-webhook | Um aviso `merchant_order` (IPN antigo) seguia até a checagem de assinatura e recebia 401, e o Mercado Pago ficava reenviando sem parar. | Corrigido: eventos que não são de pagamento recebem 200 e são ignorados antes da checagem. |
| 8 | Médio | [LandingPage](src/pages/LandingPage.tsx), [LegalPage](src/pages/LegalPage.tsx) | Os preços exibidos vinham do `appConfig` fixo e o checkout cobra o valor do banco. Se o admin mudasse o preço, o site anunciaria um valor e cobraria outro (problema de CDC). | Corrigido: as duas páginas leem o catálogo `subscription_plans`. |
| 9 | Médio | [vite.config.ts](vite.config.ts) | O helper de preload do Vite ficava dentro do chunk `vendor-pdf`, e o jsPDF inteiro (177 kB gzip) era pré-carregado em toda página. | Corrigido: o carregamento inicial caiu de cerca de 365 kB para cerca de 188 kB (gzip). |
| 10 | Médio | [public/.htaccess](public/.htaccess) | Faltavam redirect para HTTPS e para o domínio sem `www`. O `index.html` podia ficar em cache e quebrar o site após um deploy. Não havia HSTS, Permissions-Policy nem CSP. | Corrigido. A CSP está em modo **Report-Only** (ver a seção 5). |
| 11 | Médio | mercadopago-checkout | Devolvia ao navegador a resposta crua do Mercado Pago e as mensagens de exceção internas. | Corrigido: esses detalhes agora vão só para o log do servidor. |
| 12 | Médio | [README.md](README.md) | O README era do AI Studio e do Gemini e mandava rodar só o `schema.sql`. Além disso, o `update_all_migrations.sql` **não é completo**: faltam cinco módulos e três RPCs. | Corrigido: o README agora tem a ordem real dos scripts. Pendente: as três RPCs listadas no item 13. |
| 13 | Médio | SQL | `get_public_composer`, `get_featured_composers` e `validate_release_document` só existem no `schema.sql` e no `music_security.sql`. Um banco novo montado pelos scripts atuais não as teria. | **Pendente.** Rodar a verificação; se acusar a falta, extrair só essas funções do `schema.sql`. |
| 14 | Baixo | [public/sitemap.xml](public/sitemap.xml) | Faltava a página `/compositores`. | Corrigido. |
| 15 | Baixo | SQL: `cleanup_expired_quarantine` | Faz DELETE direto em `storage.objects`, o que o Supabase bloqueia. A função não é usada: o app limpa pela Edge Function. | Pendente (inofensivo). |
| 16 | Baixo | Quarentena | Os arquivos abandonados só são limpos quando o próprio usuário volta a enviar algo. | Pendente: se precisar, criar um job que chame a Storage API. |
| 17 | Baixo | Raiz do repositório | Há 16 `.zip` e 3 pastas `mercado-do-compositor-*` de builds antigos. A pasta `mercado-do-compositor-seguranca-musicas/.htaccess` está rastreada no git apesar do `.gitignore`. | Pendente: candidatos a limpeza. Não apaguei nada. |
| 18 | Baixo | Edge Functions | O Deno não está instalado aqui, então as funções não passaram por checagem de tipos, só de sintaxe. | Pendente: rodar `deno check` ou testar após o deploy. |
| 19 | Info | Testes E2E | `npm run test:e2e` não foi executado: precisa de navegador e das credenciais `E2E_*`. | Pendente. |

Pontos verificados e **sem problema**:

- RLS habilitado em todas as tabelas.
- Grants por coluna em `profiles` e `songs`.
- Escrita em `system_logs` só via RPC.
- Assinatura HMAC do webhook e idempotência do pagamento.
- Estorno e chargeback suspendem a conta.
- Validação de upload por bytes reais, tamanho e duração.
- Hook de e-mail com assinatura.
- Nenhum segredo no histórico do git.
- Nenhum `dangerouslySetInnerHTML` nem `console.log` no frontend.
- Rotas com lazy loading.

## 3. Arquivos alterados

- [supabase/production_readiness_2026_09_18.sql](supabase/production_readiness_2026_09_18.sql) (novo): expiração de assinaturas com pg_cron, default de `system_logs.id` e policies de storage.
- [supabase/check_production_readiness.sql](supabase/check_production_readiness.sql) (novo): verificação somente leitura de funções, tabelas, RLS, planos, admin e policies.
- [supabase/update_all_migrations.sql](supabase/update_all_migrations.sql): default de `system_logs.id` e policies de storage corrigidas, para que rodar o consolidado de novo não traga a regressão de volta.
- [supabase/functions/mercadopago-checkout/index.ts](supabase/functions/mercadopago-checkout/index.ts): validação de plano pelo catálogo, sem preço de fallback e sem vazamento de erros internos.
- [supabase/functions/mercadopago-webhook/index.ts](supabase/functions/mercadopago-webhook/index.ts): filtro de tipo de evento antes da assinatura e conferência de valor e moeda.
- [supabase/functions/.env.example](supabase/functions/.env.example): inclui `APP_URL`.
- [src/pages/LandingPage.tsx](src/pages/LandingPage.tsx) e [src/pages/LegalPage.tsx](src/pages/LegalPage.tsx): preços vindos do catálogo real.
- [src/lib/mercadopago.ts](src/lib/mercadopago.ts): tipo de status inclui `charged_back` e `under_review`.
- [vite.config.ts](vite.config.ts): tira o helper de preload do chunk de PDF.
- [public/.htaccess](public/.htaccess): HTTPS, domínio sem `www`, HSTS, Permissions-Policy, CSP Report-Only e `index.html` sem cache.
- [public/sitemap.xml](public/sitemap.xml): inclui `/compositores`.
- [README.md](README.md): instruções reais de execução e de deploy.

## 4. ⚠️ EXIGE RODAR SQL NO SUPABASE

Rode no SQL Editor, nesta ordem:

1. **[supabase/production_readiness_2026_09_18.sql](supabase/production_readiness_2026_09_18.sql)**: rode depois de `update_all_migrations.sql`, dos módulos e do `fix_auditoria_2026_09.sql`, se já tiverem sido aplicados. É idempotente. Ele:
   - dá default a `system_logs.id`;
   - restringe as policies `media owner update` e `media owner delete`;
   - cria `expire_overdue_subscriptions()` e agenda essa função no pg_cron para 00:15 (horário de Brasília).

   Se ele avisar que o pg_cron está indisponível, ative em **Integrations > Cron** e rode de novo.
2. **[supabase/check_production_readiness.sql](supabase/check_production_readiness.sql)**: somente leitura. Cada linha que ele devolve é um problema a resolver.

## 5. Checklist de configuração manual

- [ ] **Secrets do Supabase:** `MERCADOPAGO_ACCESS_TOKEN` (produção, `APP_USR-...`), `MERCADOPAGO_WEBHOOK_SECRET`, `APP_URL`, `RESEND_API_KEY`, `SEND_EMAIL_HOOK_SECRET`, `AUTH_EMAIL_FROM`, `NOTIFICATION_EMAIL_FROM` e `NOTIFICATION_CRON_SECRET`.
- [ ] **Vault do Supabase:** `notification_dispatch_url` e `notification_cron_secret` (mesmo valor de `NOTIFICATION_CRON_SECRET`) cadastrados antes de rodar `notification_delivery_2026_09_22.sql`; depois, `select jobname from cron.job where jobname = 'process-notification-emails';` deve devolver uma linha.
- [ ] **E-mails essenciais:** `essential_notifications_2026_09_22.sql` e `buyer_copy_and_payment_failure_2026_09_22.sql` aplicados e `select status, count(*) from notification_email_outbox group by status;` sem itens presos em `pending`/`retry`/`failed`.
- [ ] **Deploy das Edge Functions** alteradas: `mercadopago-checkout`, `mercadopago-webhook` e `process-notification-emails`.
- [ ] **Verify JWT** desligado em `mercadopago-webhook`, `send-auth-email` e `process-notification-emails`.
- [ ] **Webhook do Mercado Pago:** URL `https://<ref>.supabase.co/functions/v1/mercadopago-webhook`, evento **Pagamentos**.
- [ ] **Build de produção** com `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL` e `VITE_APP_RELEASE`.
- [ ] **Upload de `dist/`** para a Hostinger, incluindo o `.htaccess`, e SSL ativo no domínio.
- [ ] **CSP:** navegar pelo site em produção (home, cadastro, envio de prévia, player, PDF e checkout) com o console aberto. Se não aparecer violação de CSP, trocar `Content-Security-Policy-Report-Only` por `Content-Security-Policy` no `.htaccess`.
- [ ] **Supabase Auth:** Site URL e Redirect URLs de produção (já estão em `config.toml`, mas confira no painel) e provedor Google configurado, se `VITE_GOOGLE_AUTH_ENABLED=true`.
- [ ] **Resend:** domínio remetente verificado e **Send Email Hook** apontando para `send-auth-email`.
- [ ] **Conta admin** criada e presente em `user_roles`.
- [ ] **Teste final:** um pagamento real de valor baixo de ponta a ponta (a assinatura precisa aparecer ativa e a fatura no histórico) e depois `npm run test:smoke`.

## 6. Pendências do proprietário

- ~~WhatsApp de contato~~: trocado para `(51) 99659-7804`. ~~Item "Cartão" do Plano Ouro~~: removido.
- **Benefícios dos planos no banco** (`subscription_plans.features`) diferem do texto do site: o Ouro promete "Selo de compositor verificado" e "Suporte prioritário", e o Prata promete "Prioridade nas buscas". A tela de assinatura do painel exibe esses textos. Alinhar pelo painel admin.
- **Texto dos Termos (seção 6):**
  - Fala em "cobranças recorrentes", mas o pagamento é avulso e mensal: o compositor renova manualmente e a conta sai do catálogo 3 dias após o vencimento. Ajustar o texto jurídico.
  - Confirmar razão social, CNPJ `41.099.784/0001-34` e o e-mail do encarregado (DPO).
- **Carência de 3 dias após o vencimento:** confirmar. Para mudar, altere o default de `p_grace_days` em `expire_overdue_subscriptions`.
- **Cobrança recorrente automática:** decisão de produto para o futuro. Se quiserem débito automático no cartão, é preciso migrar para Assinaturas do Mercado Pago (Preapproval), que é um fluxo diferente do Checkout Pro.
- **Preços:** a fonte de verdade é o catálogo no painel admin (`subscription_plans`). O `appConfig` só serve de reserva quando o banco não responde.

## 7. Resultados

- `npm run check`: 24 arquivos e **288 testes passando**, `tsc` sem erros e build OK.
- `npm audit --omit=dev`: **0 vulnerabilidades**.
- Carregamento inicial (gzip): cerca de **188 kB**, antes cerca de 365 kB. O `vendor-pdf` (177 kB) agora só carrega nas telas de liberação e validação.
- Edge Functions alteradas: sintaxe validada. A checagem de tipos com Deno não foi executada.
