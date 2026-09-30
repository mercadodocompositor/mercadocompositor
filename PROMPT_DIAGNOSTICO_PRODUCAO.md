# Diagnóstico de prontidão para produção — Mercado do Compositor

## Contexto
Este repositório é o Mercado do Compositor: um app em que compositores cadastram
músicas, publicam um perfil público, recebem pedidos de interesse de intérpretes
e compradores, e emitem um termo de liberação da obra (PDF com código de
validação e entrega por link). Há planos pagos por assinatura e um painel
administrativo.

Stack: React 19 + Vite 6 + TypeScript + Tailwind 4, React Router 7, Supabase
(Auth, Postgres com RLS, Storage, Edge Functions), Stripe para assinaturas,
Resend para e-mails, jsPDF para o termo, ffmpeg.wasm para a prévia de áudio.
A hospedagem é estática na Hostinger (veja `public/.htaccess` e
`public/compositor.php`).

O objetivo é colocar o app em produção com usuários e pagamentos reais. Preciso
saber, página por página e recurso por recurso, o que impede o lançamento, o que
é arriscado e o que pode esperar.

## O que eu quero de você
Faça um diagnóstico completo e entregue um relatório. **Não corrija nada nesta
etapa**: não edite código, não rode SQL no Supabase, não faça deploy, commit nem
push. Se encontrar algo que dê vontade de consertar, registre como achado com a
correção proposta. Quero decidir a ordem das correções depois de ver o quadro
inteiro.

Responda sempre em português do Brasil.

## Como trabalhar
1. Comece lendo `README.md`, `PRODUCTION_READINESS.md`, `package.json`,
   `.env.example`, `vite.config.ts`, `src/App.tsx`, `src/context/AppContext.tsx`
   e `src/lib/database.ts` para entender a arquitetura antes de julgar qualquer
   página.
2. Rode `npm run check` (testes, `tsc --noEmit` e build) e `npm run test:e2e`.
   Registre a saída real: o que passou, o que falhou e o que não pôde ser
   executado. Um teste que falha é um achado; não o pule nem o ajuste.
3. Percorra cada item do inventário abaixo lendo o código de ponta a ponta: o
   componente, as funções de `src/lib` que ele chama, e a RPC, policy, trigger
   ou Edge Function que atende no Supabase. Um fluxo só está verificado quando
   você seguiu o caminho até o banco.
4. Há muitos arquivos com alterações não commitadas. Trate a árvore de trabalho
   atual como a versão a ser avaliada e aponte se alguma alteração pendente
   parecer incompleta.
5. Diferencie sempre o que você **confirmou** (leu o código ou executou) do que
   é **suspeita** (inferência que precisa de teste manual ou acesso ao ambiente).
   Você não tem acesso ao banco de produção: quando a resposta depender do
   estado real do Supabase, do Stripe ou do Resend, diga exatamente qual
   consulta ou verificação eu devo fazer no painel.
6. Não leia nem exiba valores de `.env.local`. Pode verificar quais variáveis
   existem comparando os nomes com `.env.example`.

## Inventário a diagnosticar

### Páginas públicas
- `/` — LandingPage (inclui a seção de compositores em destaque e o FAQ)
- `/compositores` — ComposersPage (listagem, busca, filtros, paginação)
- `/compositor/:username` — PublicProfilePage (perfil, músicas, player com
  prévia de 85 segundos, selo de verificado)
- `/compositor/:username/musica/:songRef/interesse` — InterestRequestPage
  (formulário do interessado, consentimento, validação de CPF/CNPJ)
- `/validar-documento`, `/validar-documento/:code`, `/validar/:code` —
  ValidarDocumentoPage
- `/entrega/:token` — ReleaseDeliveryPage (entrega do termo e do áudio completo)
- `/termos`, `/privacidade` — LegalPage
- `*` — NotFoundPage

### Autenticação
- `/login`, `/autenticacao`, `/cadastro`, `/recuperar-senha` — LoginPage:
  cadastro, confirmação de e-mail, login, recuperação e redefinição de senha,
  aceite dos termos, disponibilidade de nome de usuário
- Guardas de rota `ComposerRoute` e `AdminRoute`, sessão expirada, conta
  pendente, conta banida, conta excluída

### Painel do compositor (`/dashboard/*`)
- OverviewTab (métricas e histórico)
- AddSongTab (rascunho, upload, validação de mídia, geração da prévia, exigência
  da música completa)
- MySongsTab (edição, exclusão, limite do plano)
- RequestsTab (pedidos de interesse, mudanças de status, histórico)
- ReleasesTab (termo de liberação, intérprete, ISWC, PDF, arquivo)
- ProfileTab e suas seções (identidade, apresentação, redes sociais, dados
  legais, visibilidade, força do perfil)
- SubscriptionTab (planos, checkout, troca de plano, portal, cancelamento,
  faturas, período de teste)
- SettingsTab (segurança da conta, exportação de dados LGPD, exclusão da conta)

### Painel administrativo (`/admin/*`)
- AdminOverviewTab, AdminComposersTab, AdminSongsTab, AdminTransactionsTab,
  AdminLogsTab, AdminSettingsTab
- PIN de segurança do admin, ações em massa, exclusões seguras, compositores em
  destaque, modo manutenção, auditoria financeira

### Recursos transversais
- **Edge Functions**: `stripe-checkout`, `stripe-change-plan`, `stripe-portal`,
  `stripe-webhook`, `validate-media-upload`, `release-delivery`,
  `delete-my-account`, `send-auth-email`, `process-notification-emails`
- **Banco**: `supabase/schema.sql` e todos os demais `.sql` da pasta
- **Storage**: buckets, policies, URLs assinadas, quarentena e limpeza
- **E-mails**: templates em `supabase/resend/` e `supabase/functions/_shared/`
- **PDF**: `src/lib/pdfGenerator.ts`
- **Áudio**: `src/lib/audioPreview.ts`, `scripts/create-mp3-preview.mjs`,
  `AudioPlayer`
- **Monitoramento e erros**: `src/lib/monitoring.ts`, `src/lib/apiErrors.ts`,
  `GlobalErrorBoundary`
- **Infra**: `public/.htaccess`, `public/compositor.php`, `robots.txt`,
  `sitemap.xml`, `.github/workflows/quality.yml`,
  `scripts/smoke-production.mjs`

Se encontrar uma página, rota, função ou recurso que não está nesta lista,
inclua no diagnóstico e avise que estava faltando.

## O que verificar em cada página e recurso
Aplique as dimensões que fizerem sentido para o item. Não force as que não se
aplicam.

**Funcionamento.** O fluxo principal funciona do início ao fim? E os caminhos
negativos: campo vazio, dado inválido, duplo clique no botão de enviar, rede
lenta ou caindo no meio, sessão expirada durante a ação, voltar do navegador,
recarregar a página, link direto sem estado anterior? Existem estados de
carregamento, vazio e erro, com mensagem compreensível em português?

**Segurança e autorização.** Toda regra de permissão é garantida no banco (RLS,
RPC com `security definer` bem delimitada, Edge Function que valida o JWT) ou só
no front-end? Um compositor consegue ler ou alterar dados de outro trocando um
ID? Um visitante anônimo alcança algo que deveria ser privado (áudio completo,
dados legais, CPF/CNPJ, e-mail, telefone)? Há chave secreta no bundle do
cliente? As Edge Functions verificam assinatura de webhook, CORS, origem e
método? Tokens de entrega e códigos de validação são imprevisíveis, expiram e
resistem a enumeração? Há limite de requisições nos formulários públicos e no
login?

**Pagamentos.** O webhook do Stripe é idempotente e verifica a assinatura? O
estado da assinatura no banco continua correto depois de pagamento recusado,
cancelamento, troca de plano, reembolso, fim do período de teste e eventos fora
de ordem? Os limites do plano são aplicados no servidor? Ficou algum resto da
integração antiga do Mercado Pago ou de planos de teste? Aponte tudo que ainda
esteja em modo de teste e precise trocar para chaves e preços de produção.

**Banco e migrações.** Esta é a área de maior risco: a pasta `supabase/` tem
dezenas de arquivos SQL soltos, sem ordem garantida, vários deles "fix" de
outros. Determine qual é a ordem correta de aplicação, se `schema.sql` e
`update_all_migrations.sql` refletem o estado final, quais arquivos se
contradizem ou se sobrescrevem, e quais funções ou policies são redefinidas mais
de uma vez (e qual versão vence). Verifique se toda tabela tem RLS ativa, se há
índices para as consultas de listagem, e se `check_production_readiness.sql` e
`verify_workflow_guarantees_2026_09_24.sql` cobrem o que o código espera. Liste
cada SQL que eu precisaria rodar no Supabase antes do lançamento e em que ordem.

**LGPD e jurídico.** Consentimento registrado com evidência, exportação de dados
pessoais, exclusão de conta e o que sobra depois dela, privacidade do perfil,
textos de Termos e Privacidade coerentes com o que o app realmente faz, dados
pessoais em logs.

**E-mails.** Cada evento que deveria gerar e-mail gera? O que acontece se o
envio falhar: há fila, nova tentativa, registro? Os links apontam para o domínio
de produção? Os templates têm remetente, assunto e conteúdo corretos?

**Desempenho.** Tamanho do bundle e divisão por rota, peso do ffmpeg.wasm e
quando ele é carregado, imagens, consultas repetidas ou sem paginação,
re-renderizações pesadas no `AppContext`, comportamento em celular com rede 4G.

**Experiência e acessibilidade.** Layout em telas de 360px, navegação por
teclado, foco em modais, rótulos de formulário, contraste nos temas claro e
escuro, textos truncados, consistência de termos entre páginas.

**SEO e compartilhamento.** Título e descrição por página (`src/lib/pageMeta.ts`),
Open Graph dos perfis públicos (`compositor.php`), sitemap, robots, URLs
canônicas, páginas privadas fora do índice.

**Operação.** Variáveis de ambiente exigidas e o que acontece se faltarem,
regras de reescrita e cabeçalhos de segurança do `.htaccess` (CSP, HSTS, cache),
modo manutenção, captura de erros em produção, backups, o que o CI realmente
valida, e se o teste de fumaça cobre os fluxos críticos.

**Testes.** Quais fluxos críticos não têm nenhum teste. Hoje há um único arquivo
e2e (`e2e/public-and-auth.spec.ts`); diga o que mais deveria estar coberto antes
do lançamento.

## Classificação dos achados
- **Bloqueador**: impede o lançamento. Perda ou vazamento de dados, falha de
  autorização, cobrança errada, fluxo principal quebrado, risco jurídico.
- **Alto**: pode lançar, mas deve ser corrigido na primeira semana. Afeta muitos
  usuários ou tem alternativa ruim.
- **Médio**: problema real com alcance limitado ou alternativa aceitável.
- **Baixo**: polimento.

Seja criterioso com "Bloqueador". Se tudo for bloqueador, a lista não me ajuda a
priorizar.

## Formato do relatório
Salve o relatório em `DIAGNOSTICO_PRODUCAO.md` na raiz do projeto, com esta
estrutura:

1. **Veredito** — em até dez linhas: o app pode ir para produção hoje? Se não, o
   que falta, em ordem.
2. **Resultado das verificações automáticas** — saída resumida de testes, lint,
   build e e2e, com os números reais.
3. **Bloqueadores** — lista completa, cada um com: onde está (arquivo e linha),
   o que acontece, como reproduzir ou por que você concluiu isso, correção
   proposta, esforço estimado (P/M/G), e se a correção exige rodar SQL no
   Supabase.
4. **Diagnóstico por página** — uma seção para cada item do inventário, na mesma
   ordem, com: situação (pronto / pronto com ressalvas / não pronto), o que foi
   verificado, e os achados classificados. Se uma página estiver em ordem, diga
   isso em uma linha; não invente achados para preencher.
5. **Diagnóstico por recurso transversal** — mesmo formato.
6. **Migrações do Supabase** — ordem de aplicação, conflitos encontrados e a
   lista exata do que rodar antes do lançamento.
7. **Checklist de lançamento** — tudo que precisa ser feito fora do código:
   chaves de produção do Stripe, endpoint e segredo do webhook, domínio e DNS do
   Resend (SPF, DKIM, DMARC), URLs de redirecionamento do Supabase Auth, segredos
   das Edge Functions, SSL e domínio na Hostinger, backups.
8. **Não verificado** — o que você não conseguiu confirmar e a verificação manual
   que eu devo fazer em cada caso.
9. **Plano de correção sugerido** — achados agrupados em etapas na ordem em que
   você os atacaria, com as dependências entre eles.

Cite sempre arquivo e linha. Escreva cada achado de forma que eu entenda sem
abrir o código: o que o usuário vê ou o que o atacante consegue, e não só o nome
da função.

Ao terminar, me dê no chat apenas o veredito e a contagem de achados por
gravidade, e aponte para o arquivo.
