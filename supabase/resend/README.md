# Template de entrega do termo no Resend

1. No painel do Resend, crie um template chamado `termo-liberacao-entrega` e importe o HTML de `termo-liberacao-entrega.html`.
2. Configure o remetente com o mesmo endereço de `NOTIFICATION_EMAIL_FROM` e o assunto `Termo de liberação da obra "{{{SONG_TITLE}}}"`.
3. Cadastre as variáveis de tipo **string**: `BUYER_NAME`, `COMPOSER_NAME`, `SONG_TITLE`, `DOCUMENT_CODE`, `AGREED_VALUE`, `DELIVERY_URL` e `YEAR`. Não use valores de fallback para os campos da entrega.
4. Envie um teste pelo painel com dados fictícios e confira o visual no computador e no celular. Publique o template.
5. Configure `RESEND_RELEASE_DELIVERY_TEMPLATE_ID` nos secrets do Supabase com o ID ou alias do template publicado. Faça o deploy de `process-notification-emails`.
6. Em ambiente de teste, emita um termo e confira o e-mail recebido e o link. Teste também o reenvio pelo compositor.

A Edge Function usa esse template apenas para entregas com link `/entrega/`. Sem o secret, continua usando o HTML atual; os demais avisos mantêm seu fluxo existente. O ID fica fora do código para permitir templates distintos em homologação e produção.

O template pode ser editado e publicado no Resend sem novo deploy. Os campos dinâmicos continuam vindo do registro do termo e do link de entrega criado pelo app.
