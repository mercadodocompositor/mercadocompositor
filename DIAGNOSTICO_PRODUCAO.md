# Diagnóstico de prontidão para produção — Mercado do Compositor

Data: 30/09/2026. Versão avaliada: árvore de trabalho atual, commit `e1f2e04` (branch `main`).

Como ler este relatório:

- **Confirmado** = li o código de ponta a ponta ou executei. **Suspeita** = inferência que depende do estado real do Supabase, Stripe, Resend ou Hostinger; nesses casos há uma verificação para você fazer.
- Nada foi corrigido. Não editei código, não rodei SQL, não fiz deploy, commit nem push. O único arquivo criado é este relatório. `npm run build` regenerou a pasta `dist/` (ignorada pelo git).
- A árvore de trabalho **não tem alterações pendentes** em arquivos versionados (`git status` mostra só `.claude/`, `output/`, `tmp/` e `ux-compositores-mockups.html` como não rastreados). O item 4 do pedido ("muitos arquivos não commitados") não se aplica mais: tudo foi commitado em `e1f2e04`.
- Acesso a produção: rodei `npm run test:smoke` (somente leitura), conferi cabeçalhos HTTP do site com `curl` e chamei duas RPCs públicas (`get_public_composer`, `get_featured_composers`) com a chave anônima, carregada do `.env.local` sem exibir o valor. Uma sondagem mais ampla de leitura foi bloqueada pelo ambiente e não insisti. Não consultei o banco por SQL.

---

## 1. Veredito

**Não recomendo abrir para pagamentos reais hoje.** O site está no ar com o build atual e os fluxos públicos respondem, mas três pontos impedem o lançamento:

1. O banco de produção não está no estado final que o código espera, e não existe uma ordem de migração confiável para chegar lá (B1).
2. O script consolidado devolve ao compositor permissão para se marcar como verificado e destacado pela API; é preciso confirmar se isso está ativo em produção (B2).
3. Quem entra com o Google não tem aceite dos Termos registrado (B3).

Depois disso, na primeira semana: 2FA que não é exigido no login (A1), sobras da exclusão de conta (A2), abuso do formulário público (A3), virada do Stripe para produção (A4), rotina de expiração de assinaturas (A5), prévia de link dos perfis (A6), monitoramento de erros (A7) e Política de Privacidade (A8).

Contagem dos achados numerados, já com a segunda passada (seção 11): **3 bloqueadores (B1–B3), 10 altos (A1–A10), 22 médios (M1–M22), 19 baixos (L1–L19).** O M10 foi resolvido pela consulta ao banco (seção 10). Observações sem número são notas menores.

---

## 2. Resultado das verificações automáticas

| Verificação | Resultado real |
|---|---|
| `npm run check` | **Falhou** na primeira etapa (testes). Como o script encadeia com `&&`, lint e build não rodaram; executei os dois separadamente. |
| `vitest run src` | 35 arquivos, **393 testes: 391 passaram, 2 falharam** (11,5 s). |
| `tsc --noEmit` | Passou, sem erros. |
| `vite build` | Passou em 18,6 s. Aviso de chunk acima de 500 kB (`vendor-pdf`). |
| `npm run test:e2e` | 10 testes: **8 passaram, 2 pulados** (1,1 min). Os 2 pulados são o teste do painel autenticado, que exige `E2E_EMAIL`/`E2E_PASSWORD`. |
| `npm run test:smoke` | 7 de 7 passaram contra produção. |
| `npm audit --omit=dev` | 0 vulnerabilidades. |
| GitHub Actions (`Quality`) | Últimas 5 execuções com sucesso, inclusive a do commit atual. |

**Os dois testes que falham** (achado M15):

- `src/lib/requestWorkflow.integration.test.ts:28-29` — "requires the reviewed version and audits release issuance atomically".
- `src/lib/songDraftValidation.test.ts:55` — "mantém cópia local imediata até a revisão mais recente sincronizar".

Os dois procuram um trecho de texto com `\n` dentro de arquivos do repositório. Nesta máquina o git está com `core.autocrlf=true`, os arquivos têm fim de linha CRLF e o trecho não casa. No CI (Linux, LF) passam. Não é defeito do produto, mas `npm run check` não fecha no Windows, que é onde o build de produção está sendo feito.

**Tamanho do build** (minificado / gzip):

| Arquivo | Tamanho | Quando carrega |
|---|---|---|
| `index` + `vendor-react` + `vendor-supabase` + `vendor-icons` | 604 kB / 173 kB | Toda página |
| CSS | 196 kB / 24,5 kB | Toda página |
| `LandingPage` | 46 kB / 11,8 kB | Home |
| `vendor-pdf` (jsPDF) | 594 kB / 177 kB | Só ao gerar PDF |
| `ffmpeg-core.wasm` | **32,2 MB / 10,3 MB** | Só ao gerar a prévia de áudio |

A divisão por rota está correta: `dist/index.html` pré-carrega só os quatro primeiros.

---

## 3. Bloqueadores

### B1. O banco de produção não está no estado final esperado e não há ordem de migração confiável

**Onde:** `supabase/` (79 arquivos `.sql`, 707 kB), `README.md:17-28`, `supabase/schema.sql`, `supabase/update_all_migrations.sql`, `supabase/check_production_readiness.sql`, `supabase/verify_workflow_guarantees_2026_09_24.sql`.

**O que acontece.** Cada arquivo redefine funções, policies e permissões com `create or replace`. O resultado depende de qual foi rodado por último, e nada registra o que já foi aplicado. Hoje:

- **Evidência em produção (confirmado):** a RPC pública `get_featured_composers` devolve os campos `id, bio, name, photo, genres, username, cityState, songCount`. A versão de `featured_composers_2026_09_28.sql:120-140` devolve também `isVerified` e `featured`. Ou essa migração nunca foi aplicada, ou foi sobrescrita depois por `schema.sql` (linha 1284) ou `featured_composers_with_songs_2026_09_24.sql`. A seção "compositores em destaque" do último commit depende dela.
- `README.md:17-28` lista 8 passos e não cita `fix_auditoria_2026_09.sql`, as três migrações do Stripe, `release_interpreter_iswc`, `featured_composers`, `notification_delivery`, `self_account_deletion`, `username_history`, `profile_save_and_email`, `welcome_email` nem `admin_safe_deletions`. O passo 2 é "migrations legadas ou de infraestrutura ainda necessárias", sem dizer quais.
- Nenhum dos dois "consolidados" é o estado final. `update_all_migrations.sql` não contém limite de requisições, `create_interest_request`, Stripe, fila de e-mails, entrega do termo, termos de uso, métricas nem exportação LGPD. `schema.sql` não contém `validated_media` nem os gatilhos de músicas.
- Rodar `schema.sql` de novo em produção **regride**: repõe preços e recursos de fábrica nos planos por cima do que o admin editou (`schema.sql:43-54`, `on conflict do update`), instala um `handle_new_user` antigo que ignora o plano escolhido (`:1127-1139`), recria as policies de Storage sem filtro de bucket (`:1362-1363`, o compositor volta a poder apagar PDFs de termos) e o `admin_moderate_song` que desliga todos os gatilhos (`:598-653`).
- Rodar `update_all_migrations.sql` de novo reabre o B2.
- Rodar `fix_auditoria_2026_09.sql` de novo (ele se descreve como "o último script da pilha") tira o `iswc` das colunas graváveis (`:77-91`) e **todo salvamento de música passa a falhar** com "permission denied", porque o app sempre envia `iswc` (`src/pages/dashboard/AddSongTab.tsx:768`, `src/lib/database.ts:228`). Também instala um `enforce_song_write_rules` sem a exceção da autoexclusão (`:287`), o que quebra "Excluir minha conta" para quem tem músicas, e um `create_interest_request` sem consentimento (`:750`).
- `check_production_readiness.sql:36-41` exige a tabela `subscription_payments`, que só existe no gateway antigo (`mercadopago_integration.sql`), e o job `expire-overdue-subscriptions` (`:103-111`). Não verifica nada de Stripe, entrega, fila de e-mails, termos ou permissões de coluna. `verify_workflow_guarantees` cobre só solicitações e liberações.

**Por que é bloqueador.** As garantias de segurança (RLS, permissões de coluna, policies de Storage, validação de mídia) e os fluxos de pagamento dependem de qual versão está instalada, e hoje não é possível afirmar qual é.

**Correção proposta.** (1) Rodar o bloco de verificação da seção 6.3 e me devolver o resultado. (2) Aplicar só o que faltar, na ordem da seção 6.2. (3) Depois do lançamento, congelar o estado com `supabase db dump`, adotar `supabase/migrations/` com carimbo de data e mover os arquivos soltos para uma pasta `legado/`. (4) Reescrever `check_production_readiness.sql` para o estado atual.

**Esforço:** M para verificar e alinhar; G para consolidar. **Exige rodar SQL no Supabase: sim.**

### B2. O script consolidado devolve ao compositor permissão ampla de escrita em `profiles` e `songs`

**Onde:** `supabase/update_all_migrations.sql:1497` e `:1500`.

**O que acontece.** O arquivo restringe as colunas graváveis nas linhas 454-475 e, mil linhas depois, executa `grant select, update on public.profiles to authenticated` e `grant select, insert, update, delete on public.songs to authenticated`. O privilégio de tabela anula a lista de colunas. Como a RLS libera a própria linha, qualquer compositor logado consegue, com uma chamada REST direta (sem usar o site), gravar no próprio perfil `is_verified = true` (selo de verificado), `is_featured = true` (destaque, benefício do Plano Ouro) e `views_count`, e nas próprias músicas `is_featured`, `play_count` e `interested_count`.

**Por que concluí isso.** Leitura do arquivo (confirmado). O próprio `fix_auditoria_2026_09.sql:63-68` descreve esse defeito como vindo de `fix_song_insert_permissions.sql`, mas a mesma concessão continua dentro do consolidado, que foi alterado hoje (30/09).

**Está ativo em produção?** Suspeita. Fica fechado se `fix_auditoria_2026_09.sql` (para `songs`) e `featured_composers_2026_09_28.sql` ou `fix_auditoria` (para `profiles`) rodaram **depois** da última execução do consolidado. Como há indício de que `featured_composers_2026_09_28` não está em vigor (B1), precisa ser conferido: consulta Q1 da seção 6.3.

**Correção proposta.** Remover as linhas 1497 e 1500 do consolidado (deixando só `grant select`). Em produção, se a Q1 devolver linhas: `revoke insert, update on public.songs, public.profiles from anon, authenticated` e regravar as listas de colunas, incluindo `iswc` em `songs`. Depois conferir se alguém já se autoverificou: `select user_id, username from profiles where is_verified or is_featured`.

**Esforço:** P. **Exige rodar SQL no Supabase: sim.**

### B3. Quem entra com o Google não tem aceite dos Termos registrado

**Onde:** `src/pages/LoginPage.tsx:241-254`, `src/context/AppContext.tsx:679-694`, `src/lib/database.ts:1316-1320`, `supabase/terms_acceptance.sql:24-37`.

**O que acontece.** O aceite é gravado por um gatilho que lê `terms_version` dos metadados do cadastro. O cadastro por e-mail envia esse metadado (`AppContext.tsx:739`). O login com Google não envia nada (`signInWithOAuth` sem metadados), então a conta nasce sem linha em `terms_acceptances`. Além disso, o botão "Entrar com o Google" da aba **Entrar** cria a conta sem nem exibir a caixa de aceite (a checagem da linha 243 só vale na aba "Criar conta"). A função `recordTermsAcceptance` existe e nunca é chamada em nenhuma tela.

**Como reproduzir.** Abrir `/login`, clicar em "Entrar com o Google" com uma conta Google nova. A conta é criada. `select * from terms_acceptances where user_id = '<id>'` volta vazio.

**Por que é bloqueador.** Com cobrança real, não há prova de que esses assinantes aceitaram os Termos e a Política. Mesma lacuna quando a versão dos termos mudar: ninguém é chamado a aceitar de novo.

**Correção proposta.** No painel, depois do login, comparar `platformSettings.termsVersion` com os aceites do usuário e, se faltar, exibir um aviso bloqueante com a caixa de aceite que chama `recordTermsAcceptance`. Resolve Google e troca de versão de uma vez.

**Esforço:** P. **Exige rodar SQL no Supabase: não** (desde que `terms_acceptance.sql` esteja aplicado; consulta Q2).

---

## 4. Diagnóstico por página

### Páginas públicas

**`/` — LandingPage.** Situação: **pronto com ressalvas.** Verificado: carga da vitrine (`getFeaturedComposers`, `getFeaturedSongs`) até as RPCs; e2e passa em desktop e celular sem erro de console e sem rolagem horizontal; produção responde 200.
- A vitrine em produção usa a versão antiga de `get_featured_composers` (B1): o selo e a ordenação por destaque não chegam à tela.
- Baixo: `index.html:7` promete "receba pagamentos diretos via PIX"; a plataforma não processa pagamentos entre compositor e intérprete. O texto não está errado, mas pode ser lido como função do produto.
- O FAQ afirma "zero comissão"; é coerente enquanto `platform_fee_percentage` for 0 (é só um registro contábil, nada é cobrado).

**`/compositores` — ComposersPage.** Situação: **pronto com ressalvas.**
- **M12 (Médio).** `src/pages/ComposersPage.tsx:49` pede no máximo 100 perfis e a RPC limita a 100 (`featured_composers_2026_09_28.sql:114`). Busca, filtros e ordenação rodam no navegador sobre esses 100. A partir do 101º compositor ativo, os demais ficam invisíveis. Não há paginação. Em caso de erro (`:52`), a tela mostra "nenhum compositor" em vez de erro. Correção: paginar na RPC e exibir estado de erro. Esforço M. SQL: sim.
- M16 (SEO): só troca o `<title>`; canonical e descrição continuam os da home.

**`/compositor/:username` — PublicProfilePage.** Situação: **pronto com ressalvas.** Verificado: `get_public_composer` não expõe nome civil, CPF, e-mail, WhatsApp nem caminho do áudio completo; só perfis com assinatura ativa; endereço antigo redireciona por 180 dias; prévia é um arquivo separado de até 85 s (o áudio completo nunca vai para bucket público); links externos recebem `https://` forçado.
- **A6 (Alto)** — prévia de link não funciona em produção (seção 5, Infra).
- L1 (Baixo): `src/components/common/AudioPlayer.tsx:90-91` — quando a prévia termina, o botão vira cadeado e não há como ouvir de novo sem recarregar a página. Correção: botão "Ouvir novamente". Esforço P.
- Desempenho (tratar junto com M12): a RPC devolve todas as músicas publicadas com a letra completa numa resposta só. Para catálogos de 200 músicas ou ilimitados, a página fica pesada em 4G. Sem teste de carga.

**`/compositor/:username/musica/:songRef/interesse` — InterestRequestPage.** Situação: **pronto com ressalvas.** Verificado até o banco: consentimento com versão conferida no servidor e gravado com texto, data e origem; gatilho impede alterar dados e consentimento depois; CPF/CNPJ validado no navegador e por gatilho; duplo clique tratado; rascunho por aba sem CPF; mensagem do servidor exibida; campo-isca contra robôs.
- **A3 (Alto)** — abuso de e-mails (seção 5, E-mails).

**`/validar-documento`, `/validar-documento/:code`, `/validar/:code` — ValidarDocumentoPage.** Situação: **pronto.** Aceita código por rota e por `?codigo=` (usado no PDF). A RPC devolve CPF/CNPJ só com os 4 últimos dígitos. O código tem 12 caracteres hexadecimais aleatórios (48 bits), suficiente contra enumeração. Sem limite de requisições na RPC: aceitável.

**`/entrega/:token` — ReleaseDeliveryPage.** Situação: **pronto.** Verificado: token de 64 caracteres aleatórios, só o SHA-256 no banco, validade de 30 dias, reenvio invalida o anterior; links assinados de 5 min (download) e 30 min (ouvir); áudio e letra congelados na emissão; `noindex` e `no-referrer`; `robots.txt` bloqueia `/entrega/`; cada acesso fica registrado.
- L11 (Baixo): se o monitoramento for ativado, `src/lib/monitoring.ts:40` envia o caminho da página, que contém o token. Correção: mascarar `/entrega/*`.

**`/termos`, `/privacidade` — LegalPage.** Situação: **não pronto** (conteúdo).
- **A8 (Alto).** `src/pages/LegalPage.tsx:282` lista só "Supabase / AWS" como operadores. Faltam Stripe (pagamento, recebe e-mail), Resend (envia e-mails com nome de compositor e intérprete), Google (login e fontes) e Hostinger (hospedagem). Correção: completar a lista. Esforço P.
- **M13 (Médio).** A tela mostra fixo "Versão 1.2 — Atualizado em 21 de setembro de 2026" (`:495-497`). O aceite grava `platform_settings.terms_version` (padrão `1.0`, editável pelo admin). O texto mudou depois de 21/09 (Stripe em 23/09, prévia de 85 s em 25/09). Correção: exibir a versão do banco e atualizar a data. Conferir: `select terms_version from platform_settings`.
- M2 (Médio): a linha 204 diz que estorno e chargeback suspendem o perfil. O webhook não trata esses eventos (seção 5).
- **M14 (Médio, suspeita).** A linha 341 cita guarda de registros de acesso por 6 meses (Marco Civil). O app não grava IP nem horário de acesso; o limite de requisições guarda só um hash. A retenção de logs do Supabase depende do plano (dias, não meses). Verificar com jurídico e com o plano contratado.
- L10 (Baixo): a linha 141 cita "marcação de amostragem" na prévia; o app só corta o áudio, não marca.

**`*` — NotFoundPage.** Situação: **pronto.** Ressalva de SEO: o servidor responde 200 para qualquer rota inexistente (comum em SPA).

### Autenticação

**LoginPage (`/login`, `/autenticacao`, `/cadastro`, `/recuperar-senha`).** Situação: **não pronto** por causa do B3. Verificado: cadastro por e-mail com plano e versão dos termos gravados por gatilho; confirmação de e-mail; mensagem neutra na recuperação (não revela se o e-mail existe) com espera de 60 s; redefinição de senha encerra as outras sessões; nomes de usuário reservados barrados no banco.
- **B3** — aceite no Google.
- **A1 (Alto)** — 2FA não exigido (seção 5).
- L2 (Baixo): no cadastro, "Senha" e "Confirmar senha" recebem o mesmo `id` (`field-new-password`, `LoginPage.tsx:387` e `:399`), o que confunde leitores de tela.
- L7 (Baixo): conta banida ou excluída recebe "User is banned" sem tradução (`src/lib/apiErrors.ts:46-58` não mapeia).
- Baixo: no cadastro com Google o plano escolhido na landing (`?plano=`) se perde; a conta nasce no plano mais barato e o usuário escolhe de novo na aba Assinatura.
- Não verificado: limite de tentativas de login e tamanho mínimo de senha ficam no painel do Supabase Auth (checklist).

**Guardas de rota.** Situação: **pronto.** `ComposerRoute` e `AdminRoute` são só navegação; a proteção real é RLS e RPCs. Sessão expirada volta para `/login` guardando o destino. Conta pendente entra no painel e não publica (gatilho exige assinatura ativa). Conta excluída: banida por 100 anos, identidades e sessões apagadas.

### Painel do compositor

**Carga do painel (vale para todas as abas).**
- **M4 (Médio).** A cada login ou recarga, `loadPrivateData` busca **todas** as músicas, solicitações e liberações do compositor sem paginação (`src/lib/database.ts:250-252`) e pede ao Storage uma URL assinada para cada música com áudio completo (`:275-285`), com validade de 120 s, ou seja, já vencidas quando o usuário for ouvir. Para quem tem 100 ou 200 músicas são 100 a 200 requisições extras na abertura, o que pesa em 4G. As abas já têm consultas paginadas próprias. Correção: carregar só perfil, assinatura e contadores na abertura e assinar a URL quando o usuário tocar a música. Esforço M. SQL: não.

**OverviewTab.** Situação: **pronto com ressalvas.** Métricas por `get_my_dashboard_metrics`. Se `dashboard_metrics.sql` não estiver aplicado, o gráfico fica vazio sem aviso (`database.ts:323`). Conferir Q2.

**AddSongTab.** Situação: **pronto com ressalvas.** Verificado até o banco: upload só para a quarentena; a Edge Function confere o tipo real, tamanho e duração e promove o arquivo; o gatilho exige registro de mídia validada e prévia de até 85 s; limite do plano conferido no servidor com trava contra corrida; rascunho salvo no banco e no navegador; cancelamento limpa os arquivos.
- Depende de B1: se `fix_auditoria` for o último a rodar, salvar falha por causa do `iswc`.
- **M8 (Médio).** `supabase/functions/validate-media-upload/index.ts:102-183` não confere assinatura nem cota. Uma conta recém-criada, sem pagar, pode enviar arquivos de 25 MB sem limite de quantidade. Correção: limitar mídias não vinculadas por usuário. Esforço P.
- Baixo: a música completa tem teto de 25 MB; um WAV de 3 minutos passa disso. A mensagem é clara, mas convém orientar a enviar MP3.
- Desempenho: a prévia baixa 10,3 MB de ffmpeg na primeira vez. Não confirmei se a Hostinger comprime `.wasm` (seção 8).

**MySongsTab.** Situação: **pronto.** Paginação no servidor, exclusão barrada por gatilho quando há solicitações ou termos, limite do plano no servidor.

**RequestsTab.** Situação: **pronto.** Verificado: mudança de status só por RPC com controle de versão (duas abas não se sobrescrevem), transições válidas conferidas no servidor, histórico gravado na mesma transação, valor congelado depois do termo.

**ReleasesTab.** Situação: **pronto com ressalvas.** Verificado: emissão exige pagamento confirmado, valor, nome e CPF do compositor e a música completa; exclusividade com trava contra corrida; intérprete e ISWC congelados; reenvio da entrega com espera de 10 min.
- **M6 (Médio).** O PDF arquivado é gerado no navegador do compositor e enviado por ele (`src/lib/releaseArchive.ts:13-29`); o servidor só confere se é um PDF na pasta certa (`supabase/music_security.sql:333-357`). Um compositor mal-intencionado pode arquivar um PDF com texto diferente do registro, e é esse arquivo que o cliente baixa. A página de validação mostra os dados do banco, então a divergência é detectável, mas o "documento oficial" não é garantido pela plataforma. Correção: gerar o PDF numa Edge Function. Esforço M.
- **M17 (Médio, jurídico).** O termo declara que "a presente Autorização é única, valendo a todos os compositores citados" (`src/lib/pdfGenerator.ts:15`), emitida por uma única conta, com coautores em texto livre. Vale uma revisão jurídica.

**ProfileTab e seções.** Situação: **pronto.** Salvamento atômico por RPC; nome civil e CPF travados depois do primeiro termo; chave Pix validada por tipo; e-mail de avisos é sempre o da conta; endereço público com reserva de 180 dias.
- **M5 (Médio, suspeita).** As policies de `profiles` e `private_profiles` são `for all` (`schema.sql:255-256`) e nenhum arquivo revoga DELETE. Se o projeto tiver as permissões padrão do Supabase, o compositor consegue apagar a própria linha de perfil pela API, fora do fluxo de exclusão: a conta fica quebrada e a assinatura do Stripe continua cobrando. Quando há solicitações ou termos, o gatilho de músicas barra a cascata. Conferir Q1. Correção: `revoke delete`. SQL: sim.

**SubscriptionTab.** Situação: **pronto com ressalvas.** Verificado até o Stripe: checkout com cliente criado antes, bloqueio de segunda assinatura, expiração de checkouts abertos, teste de 7 dias só na primeira assinatura, troca de plano com rateio e limite de músicas conferido, portal, acompanhamento da volta do checkout, recibo em PDF.
- A4, M2 e M3 (seção 5, Pagamentos).

**SettingsTab.** Situação: **não pronto** por causa do A1.
- **A1 (Alto)** — 2FA.
- **A2 (Alto)** — o que sobra depois da exclusão (seção 5, LGPD).
- M18 (Médio): excluir a conta pede só digitar "EXCLUIR"; não pede senha (`self_account_deletion_no_reauth_2026_09_24.sql`). Uma sessão aberta em computador de terceiros basta.
- L4 (Baixo): a exportação revoga a URL do arquivo no mesmo instante (`SettingsTab.tsx:264-270`). O próprio projeto registra em `releaseArchive.ts:69` que isso cancela o download no Safari e no Firefox.
- Baixo: a exportação inclui as solicitações com dados dos intérpretes e não inclui aceites de termos nem eventos de segurança.

### Painel administrativo

Situação geral: **pronto com ressalvas.** Verificado: papel vem de `user_roles` e é conferido em cada RPC; o "PIN" é a senha redigitada, que gera um token novo, e o banco exige token com menos de 5 minutos para chave Pix, taxa, papel de admin e exclusão de conta; configurações com controle de versão e auditoria; não é possível revogar o próprio acesso nem o último admin; exclusão de plano em uso vira arquivamento.

- **M1 (Médio).** O papel **moderador não funciona.** Na carga (`src/context/AppContext.tsx:309-322`) o painel chama `get_admin_composers`, que recusa quem não é admin ou financeiro (`schema.sql:1435`). O erro derruba a carga inteira e o moderador vê a mensagem "Acesso restrito à gestão financeira" com o painel vazio. Além disso, a policy de `songs` só libera leitura para `admin` (`schema.sql:261`), então o moderador não enxerga as músicas que deveria moderar. Correção: carregar por papel e criar leitura para moderador. Esforço M. SQL: sim.
- **M7 (Médio).** `write_system_audit_log` aceita qualquer usuário logado com categoria, título e descrição livres (`schema.sql:1525-1555`). Um compositor pode gravar na trilha um evento falso, por exemplo "Pagamento aprovado" na categoria financeira. Correção: restringir categorias para não admins ou mover os registros para gatilhos. Esforço P. SQL: sim.
- A1 vale também aqui: não há segundo fator para administradores.
- Desempenho (mesma causa do M4): no login do admin carregam todos os compositores, até 500 músicas, todas as solicitações e todos os termos. Funciona no início e degrada com o crescimento.
- Baixo: L13: `AdminSecurityPinDialog.tsx:59` aplica `trim()` na senha. Admin que entra só com Google não tem senha e não consegue autorizar operações críticas.
- **M10 (Médio, suspeita).** O modo manutenção só troca um aviso na tela (`src/App.tsx:46-51`). O bloqueio real depende de `maintenance_mode_enforcement.sql`, que é opcional. Conferir Q4.
- AdminLogsTab: os logs guardam e-mails e nomes (ver A2).

---

## 5. Diagnóstico por recurso transversal

### Edge Functions

| Função | Situação | Observações |
|---|---|---|
| `stripe-checkout` | Pronto com ressalvas | JWT conferido; plano lido do banco; ver A4. |
| `stripe-change-plan` | Pronto | Confere status e limite de músicas; upgrade só vale se a cobrança passar. |
| `stripe-portal` | Pronto com ressalvas | Não restringe método HTTP (baixo). Ver A4. |
| `stripe-webhook` | Pronto com ressalvas | Assinatura HMAC em tempo constante, tolerância de 5 min, idempotência por `event_id`, sempre relê a assinatura no Stripe (eventos fora de ordem não corrompem), cancela assinatura duplicada. Ver M2 e M3. |
| `validate-media-upload` | Pronto com ressalvas | Tipo real, tamanho, duração. Ver M8. |
| `release-delivery` | Pronto | Descrito na página de entrega. |
| `delete-my-account` | Pronto com ressalvas | Cancela o Stripe antes, não exclui se houver pagamento confirmado sem termo. Ver A2. |
| `send-auth-email` | Pronto | Confere a assinatura do hook. |
| `process-notification-emails` | Pronto | Segredo do cron, até 5 tentativas com espera crescente, registro do erro. |

Todas as funções com CORS `*` exigem JWT ou token próprio; aceitável.

### Pagamentos

- Não encontrei chave secreta no bundle (`dist/` sem `sk_`, `whsec_`, `service_role`, `re_`). Confirmado.
- Limites de plano aplicados no servidor: confirmado (`enforce_song_write_rules`, `stripe-change-plan`).
- **A4 (Alto).** `supabase/functions/.env.example` traz `sk_test`. Os IDs do Stripe (`stripe_customer_id`, `stripe_subscription_id`, `stripe_product_id`, `stripe_price_id`) ficam no banco. Ao trocar para a chave de produção, produto e preço se recriam sozinhos (`_shared/stripe.ts:28-48`), mas **o cliente não**: `stripe-checkout/index.ts:32-49` reutiliza o `stripe_customer_id` gravado e a primeira chamada ao Stripe falha com "No such customer". Toda conta que abriu um checkout em modo teste recebe "Não foi possível iniciar o pagamento" e não consegue assinar. O portal falha igual. Correção: antes da virada, limpar os IDs de teste (Q6) e tratar "cliente inexistente" criando um novo. Esforço P. SQL: sim.
- **A5 (Alto, suspeita).** `expire_overdue_subscriptions` tem 4 versões. A mais recente (`subscription_page_fixes_2026_09_21.sql:37-39`) usa a coluna `auto_renew`, que `remove_payment_integration_2026_09_23.sql:16-19` apaga. Se as duas rodaram nessa ordem, o job diário das 03:15 UTC falha toda noite. Se em vez disso está a versão de `production_readiness_2026_09_18.sql:54-108`, ele coloca como pendente qualquer assinatura com vencimento há mais de 3 dias, inclusive um pagante cujo webhook atrasou. Com o Stripe como fonte da verdade, essa rotina não deveria mais mexer em assinaturas do Stripe. Conferir Q3. Correção: restringir a função a assinaturas sem `stripe_subscription_id` ou desagendar. SQL: sim.
- **M2 (Médio).** O webhook trata 6 eventos (`stripe-webhook/index.ts:126-139`); estorno e contestação não estão entre eles. Os Termos dizem que suspendem o perfil.
- **M3 (Médio).** Não há aviso da plataforma para cobrança recusada, assinatura suspensa, cancelada ou fim do teste. Os modelos de e-mail existem (`compositor-pagamento-recusado` e outros), mas os gatilhos que os geravam eram do gateway antigo. Hoje só a ativação avisa (`stripe_subscription_notifications_2026_09_24.sql`). O perfil some do catálogo sem o compositor ser avisado por nós. Atenuante: ativar os e-mails do próprio Stripe (checklist).
- Restos do Mercado Pago: nenhum no front. No SQL, `essential_notifications_2026_09_22.sql`, `buyer_copy_and_payment_failure_2026_09_22.sql` e `fix_auditoria_2026_09.sql` recriam `process_mercadopago_payment`; se rodarem depois de `remove_payment_integration`, a função volta. `fix_new_accounts_pending_2026_09_21.sql:88-101` usa `auto_renew` e `subscription_payments` e falha inteiro depois da remoção. O plano de teste de R$ 1,00 é removido por `remove_test_plan_initial_2026_09_28.sql` (conferir Q5).
- L8 (Baixo): `PRODUCTION_READINESS.md` diz que "a tela de assinatura é somente leitura", o oposto do README e do código.

### Banco

Detalhes na seção 6. Pontos fora da ordem de migração:
- Todas as 26 tabelas têm `enable row level security` em algum arquivo (confirmado por leitura; conferir em produção com Q1).
- Índices das listagens existem: `songs(composer_id)`, `interest_requests(composer_id, created_at)`, `releases(composer_id, created_at)`, notificações, fila de e-mails. Buscas com `ilike '%termo%'` não usam índice; aceitável no volume inicial.
- L5 (Baixo): `rpc_rate_limits` nunca é limpa; ganha linhas a cada reprodução e visita.
- L6 (Baixo): `check_plan_capacity(p_user_id)` aceita o id de outro usuário e revela plano e quantidade de músicas (`fix_song_triggers_regression_2026_09_24.sql:313-327`).
- L9 (Baixo): a policy de `user_notifications` é `for all` para o dono (`schema.sql:231-235`) e toda notificação vira e-mail. Um usuário pode inserir notificações para si e fazer a plataforma enviar e-mails de conteúdo livre ao próprio endereço, gastando a cota do Resend.

### Storage

Situação: **pronto com ressalvas**, condicionado ao B1.
- Desenho correto: gravação só na quarentena; promoção pela Edge Function; `song-originals` e `release-documents` privados; URLs assinadas de 120 s no painel e 300 s na entrega.
- A policy "media owner delete" tem 6 versões. Só a de `release_delivery_snapshot_2026_09_28.sql:129-139` impede apagar o áudio já entregue a um cliente e o PDF de um termo. As de `schema.sql`, `production_hardening.sql`, `music_security.sql` e `production_readiness_2026_09_18.sql` não. Conferir Q4.
- A limpeza da quarentena só acontece quando o próprio usuário abre a tela de cadastro; arquivos de quem abandona ficam até um admin chamar `cleanup_expired_quarantine`. Não há job agendado.

### E-mails

Situação: **pronto com ressalvas.** Fila transacional com nova tentativa e registro; links montados com `APP_URL`; templates com escape de HTML.
- **A3 (Alto).** Cada solicitação de interesse envia um e-mail ao compositor e um comprovante ao endereço digitado, que não é verificado (`buyer_request_receipt_2026_09_24.sql:26-58`), com o nome informado dentro do texto. Não há CAPTCHA. Os limites são 3 por hora por música, e-mail e documento, e 30 por hora por IP (`request_consent_evidence_2026_09_24.sql:72-75`), mas o IP sai do primeiro valor de `x-forwarded-for` (`fix_auditoria_2026_09.sql:37-56`), cabeçalho que o cliente pode enviar. Se o gateway do Supabase não o sobrescrever (suspeita), o limite por IP é contornável e o site pode ser usado para disparar e-mails a terceiros com o seu domínio, o que derruba a reputação do remetente. Correção: CAPTCHA (Cloudflare Turnstile) validado numa Edge Function e limite por composição de sinais. Esforço M.
- Remetente, SPF, DKIM e DMARC: não verificável daqui (checklist). `RESEND_USE_TEMPLATES` está `false` no exemplo: com isso os e-mails saem no HTML próprio, que funciona.
- M3: eventos de cobrança sem e-mail.

### PDF (`src/lib/pdfGenerator.ts`)

Situação: **pronto com ressalvas.** Gera no navegador, carregado sob demanda. O link de validação usa o domínio da página em que o PDF foi gerado. Ver M6 e M17.

### Áudio

Situação: **pronto.** `audioPreview.ts` recodifica a prévia (não copia quadros do original), remove metadados e carrega o ffmpeg só quando necessário. O servidor mede de novo a duração.
- L12 (Baixo): `scripts/create-mp3-preview.mjs` tem padrão de 60 s e não é usado por nenhum script do `package.json`.

### Monitoramento e erros

- **A7 (Alto).** `src/lib/monitoring.ts:12` só envia erros se `VITE_OBSERVABILITY_ENDPOINT` estiver definido. O `.env.local` desta máquina, de onde sai o build publicado, não tem essa variável nem `VITE_APP_RELEASE`. Em produção, erros de usuários não são registrados em lugar nenhum. Correção: configurar um coletor (Sentry ou endpoint próprio) e incluir o domínio no `connect-src` da CSP. Esforço P.
- **M11 (Médio).** `src/lib/apiErrors.ts:173` mostra ao usuário final: "A estrutura do banco de dados precisa ser atualizada. Execute o script update_all_migrations.sql no Supabase." Além de expor detalhe interno, recomenda justamente o script do B2.
- `GlobalErrorBoundary` exibe a mensagem técnica do erro na tela (baixo).

### Infra

- Confirmado em produção: HTTPS forçado, `www` redireciona, HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `index.html` sem cache, `.env` e `.git` respondem 403. O build publicado é o mesmo do commit atual.
- **A6 (Alto, confirmado em produção).** `https://mercadodocompositor.com.br/compositor/mercado` devolve o título genérico do site. Chamando `compositor.php?u=mercado` direto, o título sai "Mercado | Mercado do Compositor" e um perfil inexistente devolve 404, ou seja, o PHP funciona, mas a regra de `public/.htaccess:15` não está sendo aplicada. A regra da linha 18 também não: `/og-config.php` responde 200 em vez de 403 (corpo vazio, nada vaza). Efeito: todo link de perfil compartilhado no WhatsApp mostra o cartão genérico, e perfis inexistentes respondem 200 para buscadores. Causa não determinada daqui (seção 8). Esforço P a M.
- **M9 (Médio).** A CSP está em modo "Report-Only" (`.htaccess:39`), portanto não bloqueia nada. O hash do script inline não confere: o build feito no Windows gera o script com CRLF (`sha256-GD/3ylYc…`) e o `.htaccess` declara o hash da versão LF (`sha256-J2YIf71y…`). Confirmado no HTML de produção. Se a CSP for ativada assim, o script de tema é bloqueado. Correção: publicar o build gerado pelo CI (Linux) ou fixar `eol=lf` em `.gitattributes`, e só então ativar.
- L3 (Baixo): estão publicados `README.md`, `mockups/` e `audio-previews/` (5,4 MB de MP3 de demonstração). A pasta `mercado-do-compositor-seguranca-musicas/` (um build antigo) está versionada no git.
- **M16 (Médio).** `sitemap.xml` tem 5 URLs fixas, sem perfis. `applyPageMeta` só é usado no perfil; as demais páginas ficam com canonical e descrição da home.
- CI (`.github/workflows/quality.yml`): roda testes, `tsc`, build e e2e a cada push. Não faz deploy; o teste autenticado é sempre pulado.
- O teste de fumaça cobre 7 verificações de leitura. Não cobre cadastro, checkout, webhook, upload, emissão, entrega nem e-mail.
- Backups: não verificável daqui (checklist).

### LGPD

- Consentimento do intérprete com evidência imutável: confirmado.
- Exportação: funciona (ressalva L4).
- **A2 (Alto).** `perform_account_deletion` (`self_account_deletion_2026_09_24.sql:82-119`) apaga dados privados, pseudonimiza o perfil e tira as obras do ar, mas **não remove nenhum arquivo do Storage**, e a Edge Function também não. Ficam a foto de perfil e a capa (bucket público, acessíveis por quem tiver o link), capas e prévias das músicas (públicas) e os áudios completos (privados). Também ficam: o e-mail do titular em `system_logs.actor`, o cliente no Stripe com e-mail, e as linhas de `songs` com letra e nomes dos autores. A tela e o e-mail de despedida dizem que "seus dados pessoais foram eliminados". Termos emitidos e histórico financeiro têm base para retenção; os demais não. Correção: na exclusão, remover pelo service role os arquivos sem vínculo com termo emitido, anonimizar `system_logs.actor` e apagar ou anonimizar o cliente no Stripe. Esforço M. SQL: sim.
- Dados pessoais em logs: `system_logs` recebe nome do intérprete e e-mail do compositor nas descrições (`AppContext.tsx:451-458`, `:643-650`). O `console.error` de `insertSong` imprime o conteúdo inteiro da música no console do navegador (`database.ts:472`).

### Testes

35 arquivos unitários e 1 arquivo e2e.
- **M15 (Médio).** Parte dos testes "de contrato" e "de integração" lê arquivos `.sql` e `.tsx` e procura trechos de texto. Não exercitam o banco nem as telas, quebram com mudança de formatação (as 2 falhas atuais) e podem passar com o banco de produção em outro estado, que é a situação do B1.
- Fluxos críticos sem nenhum teste de ponta a ponta: cadastro e confirmação; login com Google; checkout, webhook e troca de plano; upload e geração de prévia; publicação; solicitação de interesse até o e-mail; confirmação de pagamento e emissão do termo; página de entrega; exclusão de conta; painel admin; isolamento entre dois compositores.
- Mínimo antes do lançamento: (1) e2e autenticado com conta de teste no CI; (2) solicitação de interesse completa; (3) emissão e entrega; (4) um teste de RLS com dois usuários tentando ler e alterar dados um do outro e colunas administrativas (teria pego o B2); (5) webhook do Stripe com eventos simulados pela CLI.

---

## 6. Migrações do Supabase

### 6.1 Conflitos encontrados (qual versão vence)

| Objeto | Definido em | Versão que deve valer | Risco se outra vencer |
|---|---|---|---|
| Permissões de `profiles` e `songs` | `schema`, `update_all` (2 vezes), `fix_auditoria`, `featured_composers_2026_09_28`, `release_interpreter_iswc` | Lista de colunas, mais `iswc` | B2, ou salvar música falha |
| `handle_new_user` | 6 arquivos | `fix_auditoria` | Plano escolhido ignorado; nomes reservados |
| `enforce_song_write_rules` | 6 arquivos | `fix_song_triggers_regression_2026_09_24` | Autoexclusão falha; plano desativado trava rascunho |
| `enforce_song_media_separation` | 5 arquivos | `fix_song_triggers_regression_2026_09_24` | Rascunho apaga mídia; limite de 60 s |
| `create_interest_request` | `schema`, `fix_auditoria`, `request_consent_evidence` | `request_consent_evidence_2026_09_24` | Sem consentimento (o verificador detecta) |
| `issue_release` | 11 definições, 4 assinaturas | 7 parâmetros, `request_workflow_hardening` | `music_security.sql:295-307` devolve acesso às assinaturas antigas, sem controle de versão nem histórico |
| `update_interest_request` | 5 arquivos | `fix_request_history_2026_09_24` | Histórico vazio |
| `notify_release_issued` | 4 arquivos | `release_delivery_2026_09_24` | Cliente não recebe o link (o verificador detecta) |
| `get_public_composer` | 5 arquivos | `username_history_2026_09_28` | Endereço antigo não redireciona |
| `get_featured_composers`, `get_public_composers` | 3 e 2 arquivos | `featured_composers_2026_09_28` | Sem destaque (**situação atual em produção**) |
| `expire_overdue_subscriptions` | 4 arquivos | Nenhuma serve ao Stripe | A5 |
| Policy "media owner delete" | 6 arquivos | `release_delivery_snapshot_2026_09_28` | Compositor apaga áudio entregue ou PDF de termo |
| Policy "media owner update" | 5 arquivos | `production_readiness_2026_09_18` (só quarentena) | Arquivo sai da quarentena sem validação |
| `admin_moderate_song` | `schema`, `admin_moderate_song`, `fix_auditoria` | `fix_auditoria` | Moderação desliga gatilhos |
| `admin_assign_user_role` | 6 definições | `profile_save_and_email_2026_09_28` | Busca por e-mail não verificado |
| `queue_notification_email` | 3 arquivos | `fix_composer_request_email_delivery_2026_09_29` | E-mail para endereço desatualizado |
| `process_mercadopago_payment` | 4 arquivos | Nenhuma (removida) | Volta se os arquivos de 22/09 forem rodados depois |

### 6.2 Ordem correta de aplicação

**Não rodar em produção** (superados, embutidos no consolidado ou do gateway antigo): `schema.sql`, `update_all_migrations.sql`, `fix_song_insert_permissions.sql`, `production_hardening.sql`, `approval_workflow.sql`, `media_validation.sql`, `music_security.sql`, `pagination.sql`, `song_drafts.sql`, `crud_enhancements.sql`, `admin_composers_management.sql`, `admin_financial_audit.sql`, `admin_settings_governance.sql`, `admin_moderate_song.sql`, `request_workflow_hardening.sql`, `production_fixes.sql`, `update_handle_new_user_plan.sql`, `fix_publish_draft_media_validation.sql`, `fix_new_accounts_pending_2026_09_21.sql`, `mercadopago_integration.sql`, `recurring_subscriptions_2026_09_21.sql`, `free_trial_2026_09_21.sql`, `subscription_page_fixes_2026_09_21.sql`, `public_profile_verified_badge_2026_09_22.sql`, `get_public_composers.sql`, `featured_composers_with_songs_2026_09_24.sql`, `username_availability_2026_09_28.sql`, `unify_subscription_plan_features_2026_09_28.sql`, `sanitize_production_profiles.sql`.

**Ordem que leva ao estado final** (para um banco que já passou pelos consolidados). Cada arquivo só precisa rodar se a seção 6.3 mostrar que falta; se rodar um, rode também os seguintes que redefinem os mesmos objetos.

1. `fix_auditoria_2026_09.sql` — só se a Q1 mostrar permissão ampla ou se `get_featured_songs`/`rpc_client_identity` faltarem. Depois dele, os itens 12, 14, 19, 20 e 21 são obrigatórios.
2. `production_readiness_2026_09_18.sql`
3. `fix_user_roles_created_at.sql` (se a coluna faltar)
4. `dashboard_metrics.sql`, `release_metrics.sql`, `terms_acceptance.sql`, `export_personal_data_lgpd_2026_09_22.sql`, `account_security_metadata_2026_09_22.sql`
5. `profile_privacy_lgpd_2026_09_22.sql`
6. `notification_delivery_2026_09_22.sql` (antes, cadastrar no Vault `notification_dispatch_url` e `notification_cron_secret`)
7. `essential_notifications_2026_09_22.sql`, depois `buyer_copy_and_payment_failure_2026_09_22.sql`
8. `stripe_integration_2026_09_23.sql`, `stripe_plans_and_invoices_2026_09_23.sql`, `stripe_cancel_at_2026_09_23.sql`
9. `remove_payment_integration_2026_09_23.sql` (sempre depois do item 7 e do item 1)
10. `stripe_subscription_notifications_2026_09_24.sql`, `account_deletion_notifications_2026_09_24.sql`
11. `self_account_deletion_2026_09_24.sql`, `self_account_deletion_no_reauth_2026_09_24.sql`, `fix_banned_until_infinity_2026_09_24.sql`, `fix_deleted_account_identities_2026_09_24.sql`, `fix_self_deletion_identity_guard_2026_09_24.sql`
12. `fix_song_triggers_regression_2026_09_24.sql`, `remove_song_moderation_2026_09_24.sql`, `fix_validated_media_fk_deferred_2026_09_24.sql`
13. `fix_request_history_2026_09_24.sql`, `request_status_groups_2026_09_24.sql`
14. `request_consent_evidence_2026_09_24.sql`, `cpf_cnpj_validation_2026_09_24.sql`
15. `buyer_request_receipt_2026_09_24.sql`
16. `release_delivery_2026_09_24.sql`
17. `release_interpreter_iswc_2026_09_25.sql`, `split_music_genres_2026_09_25.sql`, `preview_85_seconds_2026_09_25.sql`
18. `release_delivery_snapshot_2026_09_28.sql`
19. `featured_composers_2026_09_28.sql`
20. `admin_safe_deletions_2026_09_28.sql`, `username_history_2026_09_28.sql`, `profile_save_and_email_2026_09_28.sql`, `welcome_email_2026_09_28.sql`
21. `plan_features_8_items_2026_09_28.sql`, `remove_test_plan_initial_2026_09_28.sql`
22. `fix_composer_request_email_delivery_2026_09_29.sql`, `fix_preview_validation_85_seconds_2026_09_29.sql`
23. `maintenance_mode_enforcement.sql` (opcional, recomendado)
24. `verify_workflow_guarantees_2026_09_24.sql` — deve devolver `workflow_guarantees_ok`
25. `check_production_readiness.sql` — hoje vai acusar `subscription_payments` ausente se o gateway antigo nunca foi instalado; ignore essa linha até o script ser reescrito.

Duas observações: os itens 2 e 18 mexem na mesma policy de Storage, por isso o 18 vem depois. E nenhum arquivo do repositório corrige a A5; ela precisa de uma migração nova.

### 6.3 O que rodar antes do lançamento

**Primeiro, só leitura.** Rode no SQL Editor e me envie o resultado. Com ele eu reduzo a lista acima ao mínimo necessário.

```sql
-- Q1. Permissões amplas que não deveriam existir (esperado: nenhuma linha)
select table_name, grantee, privilege_type
from information_schema.table_privileges
where table_schema = 'public' and grantee in ('anon','authenticated')
  and ((table_name in ('profiles','songs') and privilege_type in ('INSERT','UPDATE'))
    or (table_name in ('profiles','private_profiles','subscriptions','releases','interest_requests') and privilege_type = 'DELETE'));

-- Colunas graváveis em songs (esperado: inclui iswc; não inclui is_featured, play_count, interested_count)
select privilege_type, string_agg(column_name, ', ' order by column_name)
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'songs' and grantee = 'authenticated'
  and privilege_type in ('INSERT','UPDATE') group by 1;

-- Tabelas sem RLS (esperado: nenhuma linha)
select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- Q2. Versão instalada das funções críticas
select p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  position('featured' in pg_get_functiondef(p.oid)) > 0           as tem_featured,
  position('auto_renew' in pg_get_functiondef(p.oid)) > 0         as usa_auto_renew,
  position('app.account_deletion' in pg_get_functiondef(p.oid)) > 0 as excecao_exclusao,
  position('consent_statement' in pg_get_functiondef(p.oid)) > 0  as grava_consentimento,
  position('rpc_client_identity' in pg_get_functiondef(p.oid)) > 0 as identidade_estavel,
  position('session_replication_role' in pg_get_functiondef(p.oid)) > 0 as desliga_gatilhos,
  position('duration_seconds <= 85' in pg_get_functiondef(p.oid)) > 0 as previa_85,
  position('selected_plan' in pg_get_functiondef(p.oid)) > 0      as usa_plano_escolhido,
  position('username_history' in pg_get_functiondef(p.oid)) > 0   as usa_historico
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'get_featured_composers','get_public_composers','get_public_composer','expire_overdue_subscriptions',
  'enforce_song_write_rules','enforce_song_media_separation','create_interest_request','admin_moderate_song',
  'handle_new_user','issue_release','perform_account_deletion','record_terms_acceptance','get_my_dashboard_metrics',
  'get_featured_songs','upsert_subscription_invoice','queue_notification_email','process_mercadopago_payment',
  'export_my_personal_data','save_my_profile','admin_remove_subscription_plan','resend_release_delivery')
order by 1, 2;

-- Quem pode chamar as assinaturas antigas de issue_release (esperado: só a de 7 parâmetros para authenticated)
select p.oid::regprocedure, has_function_privilege('authenticated', p.oid, 'execute') as authenticated_pode
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'issue_release';

-- Q3. Jobs agendados e últimas execuções
select jobname, schedule, active from cron.job;
select j.jobname, d.status, d.return_message, d.start_time
from cron.job_run_details d join cron.job j using (jobid)
order by d.start_time desc limit 20;

-- Q4. Policies de Storage e gatilhos
select policyname, cmd, qual, with_check from pg_policies
where schemaname = 'storage' and tablename = 'objects' order by 1;
select c.relname as tabela, t.tgname as gatilho, t.tgenabled
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname = 'users'))
order by 1, 2;

-- Q5. Colunas e planos
select table_name, column_name from information_schema.columns
where table_schema = 'public' and (
  (table_name = 'subscriptions' and column_name in ('stripe_customer_id','stripe_subscription_id','stripe_subscription_status','stripe_cancel_at','trial_started_at','trial_ends_at','auto_renew'))
  or (table_name = 'subscription_plans' and column_name in ('stripe_product_id','stripe_price_id','includes_featured','archived_at'))
  or (table_name = 'profiles' and column_name in ('is_featured','featured_at'))
  or (table_name = 'songs' and column_name in ('iswc','preview_media_id','original_media_id'))
  or (table_name = 'release_deliveries' and column_name in ('audio_path','document_downloads')))
order by 1, 2;
select name, monthly_price, max_songs, is_active, includes_featured, archived_at, stripe_product_id, stripe_price_id
from subscription_plans order by sort_order;
select terms_version, maintenance_mode, require_approval_for_new_songs, platform_fee_percentage from platform_settings;

-- Q6. Restos do modo de teste do Stripe (os IDs de cliente, produto e preço não distinguem o modo; confira no painel do Stripe)
select count(*) filter (where stripe_customer_id is not null) as com_cliente,
       count(*) filter (where stripe_subscription_id is not null) as com_assinatura,
       count(*) filter (where status = 'active') as ativas,
       count(*) filter (where status = 'active' and stripe_subscription_id is null) as ativas_sem_stripe
from subscriptions;

-- Q7. Saúde da fila de e-mails e contas
select status, count(*), max(updated_at) from notification_email_outbox group by 1;
select role, count(*) from user_roles group by 1;
select count(*) as contas_sem_aceite from auth.users u
where not exists (select 1 from terms_acceptances t where t.user_id = u.id) and u.email not like 'removido-%';
select user_id, username, is_verified, is_featured from profiles where is_verified or is_featured;
```

**Depois**, no mínimo (pelo que já está confirmado):

1. `featured_composers_2026_09_28.sql` — a vitrine de produção não está nessa versão.
2. O que a Q2 mostrar ausente ou em versão antiga, na ordem da seção 6.2.
3. A correção do B2, se a Q1 devolver linhas.
4. `verify_workflow_guarantees_2026_09_24.sql` por último.

---

## 7. Checklist de lançamento (fora do código)

**Stripe**
- [ ] Trocar `STRIPE_SECRET_KEY` para `sk_live_…` nos secrets das Edge Functions.
- [ ] Criar o endpoint de webhook em modo de produção (`https://<projeto>.supabase.co/functions/v1/stripe-webhook`) com os 6 eventos do README e gravar o `STRIPE_WEBHOOK_SECRET` novo.
- [ ] Antes da virada, zerar no banco os IDs criados em modo teste (A4): `stripe_customer_id`, `stripe_subscription_id`, `stripe_subscription_status` e `stripe_cancel_at` em `subscriptions`; `stripe_product_id` e `stripe_price_id` em `subscription_plans`. Voltar para `pending` as assinaturas ativadas por teste.
- [ ] Ativar o Portal do Cliente em produção (cartão, faturas, cancelamento).
- [ ] Ativar os e-mails do Stripe: falha de cobrança, fim do teste, recibos (cobre o M3 enquanto não houver aviso próprio).
- [ ] Definir as novas tentativas de cobrança e o que acontece depois da última falha.
- [ ] Conferir nome na fatura do cartão, dados fiscais e a conta bancária de repasse.
- [ ] Fazer uma assinatura real de ponta a ponta e estornar.

**Supabase**
- [ ] Secrets das Edge Functions: `RESEND_API_KEY`, `SEND_EMAIL_HOOK_SECRET`, `AUTH_EMAIL_FROM`, `NOTIFICATION_EMAIL_FROM`, `NOTIFICATION_CRON_SECRET`, `APP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, e os opcionais `RESEND_RELEASE_DELIVERY_TEMPLATE_ID` e `RESEND_USE_TEMPLATES`.
- [ ] Publicar as 9 funções; `stripe-webhook`, `send-auth-email`, `process-notification-emails` e `release-delivery` com verificação de JWT desligada, as demais ligada (`supabase/config.toml`).
- [ ] Auth > URL Configuration: Site URL e as 4 URLs de redirecionamento de produção do `config.toml`. Remover as de `localhost`.
- [ ] Auth > Hooks: "Send Email" apontando para `send-auth-email` com o mesmo segredo.
- [ ] Auth: confirmação de e-mail ligada; senha mínima de 8 caracteres (o padrão do Supabase é 6; o front exige 8, o servidor não); proteção contra senhas vazadas; limites de tentativas; CAPTCHA no login e cadastro, se disponível no plano.
- [ ] Google OAuth: credenciais de produção, tela de consentimento publicada, URI de retorno correta.
- [ ] Vault: `notification_dispatch_url` e `notification_cron_secret`; confirmar o job `process-notification-emails` (Q3).
- [ ] Realtime ligado para `user_notifications`.
- [ ] Backups: confirmar o plano (backup diário exige plano pago; recuperação pontual é adicional) e testar uma restauração. O Storage não entra no backup do banco.
- [ ] Rotacionar chaves que tenham circulado em arquivos `.zip` de entrega (há 17 na raiz do projeto).
- [ ] Remover `GEMINI_API_KEY` e `APP_URL` do `.env.local`: não são usados pelo app.

**Resend**
- [ ] Domínio verificado com SPF e DKIM; DMARC publicado, começando em `p=none` com relatório.
- [ ] Remetentes `AUTH_EMAIL_FROM` e `NOTIFICATION_EMAIL_FROM` no domínio verificado.
- [ ] Se for usar templates: publicar os 28 de `supabase/resend/templates/` e o de entrega, e só então ligar `RESEND_USE_TEMPLATES`.
- [ ] Conferir o limite do plano e criar alerta de devolução e reclamação.

**Hostinger**
- [ ] SSL ativo e renovação automática (hoje responde em HTTPS).
- [ ] Publicar a pasta `dist/` **incluindo `.htaccess`** (arquivo oculto), `compositor.php` e `og-config.php`.
- [ ] Resolver a A6 e testar com o depurador de compartilhamento do Facebook.
- [ ] Confirmar a versão do PHP e a extensão cURL.
- [ ] Confirmar compressão e tipo `application/wasm` para o `.wasm`.
- [ ] Remover `README.md`, `mockups/` e `audio-previews/` do servidor.

**Operação**
- [ ] Definir `VITE_OBSERVABILITY_ENDPOINT` e `VITE_APP_RELEASE` no build (A7).
- [ ] Fazer o build de produção no CI, não na máquina Windows (M9).
- [ ] Promover o primeiro administrador e confirmar que ele tem senha (o PIN usa a senha).
- [ ] Revisar Termos e Política com jurídico (A8, M2, M13, M14, M17) e atualizar versão e data.
- [ ] Definir o canal e o prazo de resposta do encarregado de dados.

---

## 8. Não verificado

| O que | Por quê | Verificação que você deve fazer |
|---|---|---|
| Estado real do banco | Sem acesso por SQL | Rodar Q1 a Q7 da seção 6.3 |
| Se o B2 está ativo | Depende da ordem em que os scripts rodaram | Q1. Teste prático: logado como compositor, enviar `PATCH /rest/v1/profiles?user_id=eq.<seu id>` com `{"is_verified":true}`; o esperado é erro 42501 |
| Causa da A6 | Não vejo os arquivos nem a configuração do servidor | No gerenciador de arquivos da Hostinger, abrir o `.htaccess` da raiz do site e conferir as linhas 15 e 18; ver se há outro `.htaccess` acima; conferir se o CDN da Hostinger aplica regras próprias antes do servidor |
| Modo do Stripe em produção | Secrets não são legíveis | Painel do Supabase > Edge Functions > Secrets; painel do Stripe > Desenvolvedores > Webhooks |
| Entrega real de e-mails | Depende do Resend e do DNS | Cadastrar uma conta nova, enviar uma solicitação e emitir um termo; conferir a caixa de entrada e a Q7 |
| `x-forwarded-for` (A3) | Depende do gateway do Supabase | Enviar 31 solicitações em uma hora variando o cabeçalho `X-Forwarded-For`; se a 31ª passar, o limite é contornável |
| Permissões padrão de DELETE (M5) | Configuração do projeto | Q1 |
| Compressão do `.wasm` | Não localizei o nome do arquivo no bundle publicado | No navegador, aba Rede, ao gerar uma prévia: conferir `content-encoding` e o tamanho transferido (esperado perto de 10 MB) |
| Layout em 360 px | O e2e usa Pixel 7 (412 px) e só abre a home | Percorrer cadastro, nova música, solicitações e assinatura em 360 px |
| Teclado, foco em modais, contraste | Exigem teste manual; o código tem `useModalFocus`, `aria-*` e `role` de forma consistente | Rodar Lighthouse/axe nas páginas principais, nos dois temas |
| Uso em 4G | Não medi | Lighthouse com limitação de rede na home, no perfil e em "nova música" |
| Painel autenticado no e2e | Sem credenciais | Definir `E2E_EMAIL` e `E2E_PASSWORD` como secrets do repositório |
| Segundo fator realmente ignorado (A1) | Conclusão por leitura do código | Ativar o 2FA numa conta de teste, sair e entrar só com a senha |
| Limites e senha mínima do Auth | Configuração do painel | Auth > Settings |

---

## 9. Plano de correção sugerido

**Etapa 0 — Saber onde estamos (meio dia).** Rodar Q1 a Q7 e me enviar. Tudo abaixo depende disso.

**Etapa 1 — Fechar os bloqueadores.**
1. B2: remover as concessões amplas do consolidado e, se a Q1 acusar, revogar em produção.
2. B1: aplicar o que faltar na ordem da seção 6.2, começando por `featured_composers_2026_09_28.sql`; terminar com o verificador.
3. B3: tela de aceite dos termos no primeiro acesso ao painel.
4. A5: neutralizar `expire_overdue_subscriptions` para assinaturas do Stripe (entra aqui porque mexe no mesmo banco e pode suspender pagantes).

**Etapa 2 — Virada para pagamentos reais.** Depende da etapa 1.
5. A4: tratar cliente inexistente no checkout e no portal; limpar os IDs de teste.
6. Checklist do Stripe e uma assinatura real de teste.
7. A7: ligar o monitoramento antes de receber os primeiros usuários.

**Etapa 3 — Primeira semana.**
8. A1: exigir o segundo fator no login de quem o ativou (ou retirar a opção até estar pronto) e torná-lo obrigatório para administradores.
9. A8, M13, M2: corrigir Termos e Política; o item 3 faz todos aceitarem a nova versão.
10. A2: completar a exclusão de conta.
11. A3: CAPTCHA no formulário de interesse.
12. A6 e M9: prévia de link e CSP, junto com a mudança do build para o CI.

**Etapa 4 — Primeiro mês.**
13. M1 (moderador), M7 (auditoria), M8 (cota de upload), M5 (DELETE em perfis), M10 (manutenção no banco).
14. M3 (avisos de cobrança), M6 (PDF no servidor), M18 (senha na exclusão).
15. M12 e M4: paginação no servidor e carga inicial enxuta do painel.
16. M11, M16 e os itens baixos.
17. Consolidar as migrações em `supabase/migrations/` e reescrever `check_production_readiness.sql`.
18. M15: trocar os testes por comparação de texto por testes contra um banco local (`supabase start`) e ampliar o e2e.

Dependências: o item 2 precisa do resultado da etapa 0. Os itens 5 e 6 só fazem sentido depois do 2 e do 4. O item 9 depende do 3 para registrar o novo aceite. O 12 depende de tirar o build do Windows.

---

## 10. Resultado das consultas Q1 a Q7 em produção (30/09/2026)

Rodadas por `supabase db query --linked`, somente leitura. Nada foi alterado.

### O que mudou de "suspeita" para "confirmado"

| Achado | Resultado |
|---|---|
| **B2** | **Confirmado e ativo.** `authenticated` tem UPDATE de tabela em `profiles` e INSERT/UPDATE de tabela em `songs`. As colunas graváveis incluem `is_verified`, `is_featured`, `featured_at`, `views_count`, `play_count`, `interested_count`. Não há sinal de abuso: 0 perfis verificados e 2 destacados (`jo-zwirtes`, `mercado`), com 2 registros de auditoria de destaque feitos pelo admin. |
| **B1** | **Confirmado.** O `schema.sql` foi rodado depois de migrações mais novas e o consolidado depois dele. Regressões instaladas: `get_featured_composers` antigo (sem destaque nem selo); `admin_moderate_song` na versão que desliga todos os gatilhos; `create_interest_request`, `increment_song_play` e `increment_profile_view` usando o JSON inteiro de cabeçalhos como identidade; policy "media owner delete" sem a proteção do áudio já entregue. |
| **B3** | **Confirmado e mais amplo.** 5 contas ativas, **5 sem aceite registrado** (3 delas do Google). Existe 1 aceite no banco, de conta já removida. |
| **A3** | **Confirmado e pior.** Com a versão instalada, basta mudar qualquer cabeçalho (o User-Agent, por exemplo) para zerar o limite por origem do formulário de interesse e dos contadores de reprodução e visita. |
| **A5** | **Confirmado.** O job `expire-overdue-subscriptions` falhou nas 7 últimas noites com `column "auto_renew" does not exist`. Nenhuma assinatura vencida é expirada. |
| **M5** | **Confirmado.** `authenticated` (e `anon`) têm DELETE em `profiles` e `private_profiles`, e a policy é `for all`: o compositor consegue apagar a própria linha pela API. |
| **M13** | **Confirmado.** `terms_version` no banco é `1.0`; a tela mostra 1.2. |
| **M10** | **Resolvido.** O gatilho `trg_maintenance_guard` está instalado em `songs`, `song_drafts`, `interest_requests` e `releases`. |

### O que está em ordem

- RLS ligada em todas as tabelas de `public`.
- `handle_new_user` na versão correta (plano escolhido e nomes reservados).
- `enforce_song_write_rules` e `enforce_song_media_separation` nas versões finais (85 s, exceção da autoexclusão).
- `issue_release`: só a assinatura de 7 parâmetros é chamável; `update_interest_request` grava histórico.
- `notify_release_issued`, `issue_release_delivery_token` e `resend_release_delivery` nas versões de entrega com áudio congelado.
- `get_public_composer` e `get_public_composers` nas versões finais.
- `perform_account_deletion` remove identidades e sessões.
- Policy "media owner update" restrita à quarentena.
- Colunas do Stripe, do teste grátis, de destaque, `iswc` e da entrega existem.
- Fila de e-mails: 26 enviados, nenhum pendente ou com falha; o job roda a cada minuto com sucesso.
- Todas as funções e tabelas que o app chama existem, inclusive métricas, exportação LGPD, termos e exclusões seguras.

### Outros dados

- 7 assinaturas: 3 ativas (1 em teste pelo Stripe, **2 ativas sem assinatura no Stripe**, provavelmente cortesia pelo admin), 2 pendentes, 1 cancelada, 1 suspensa. 18 eventos de webhook processados, o último em 29/09.
- Só o Plano Bronze tem produto e preço criados no Stripe. O modo (teste ou produção) não aparece no banco: confira no painel do Stripe.
- 1 administrador, nenhum moderador ou financeiro (o M1 não afeta ninguém hoje).
- A tabela `subscription_payments` do gateway antigo existe, vazia. Há uma tabela `user_data` com RLS que nenhum arquivo do repositório cria: parece resto de outra fase; vale conferir o conteúdo e remover.
- Plano Ouro com `includes_featured = true`.

### Lista enxuta do que rodar (substitui a seção 6.3 "Depois")

Três arquivos do repositório podem ser rodados como estão, nesta ordem:

1. `request_consent_evidence_2026_09_24.sql` — repõe `create_interest_request` com identidade estável. Depende de `rpc_client_identity`, que já existe.
2. `release_delivery_snapshot_2026_09_28.sql` — repõe a policy que impede apagar o áudio entregue.
3. `featured_composers_2026_09_28.sql` — repõe a vitrine com destaque e **revoga o UPDATE amplo em `profiles`** (metade do B2).

O restante não pode vir de um arquivo inteiro sem regredir outra coisa (`fix_auditoria_2026_09.sql` derrubaria o `iswc` e a exceção da autoexclusão). Precisa de uma migração nova e curta, que ainda não existe, com:

4. `songs`: revogar INSERT/UPDATE de tabela e regravar a lista de colunas, com `iswc`, `original_media_id` e `preview_media_id` (outra metade do B2).
5. `admin_moderate_song`, `increment_song_play` e `increment_profile_view`: as versões de `fix_auditoria_2026_09.sql` (seções 6 e 7), copiadas sem o resto do arquivo.
6. `expire_overdue_subscriptions`: versão sem `auto_renew`, que ignore assinaturas com `stripe_subscription_id` (A5).
7. `revoke delete on public.profiles, public.private_profiles from anon, authenticated` (M5).

Por último, `verify_workflow_guarantees_2026_09_24.sql`.

Enquanto o `schema.sql` e o `update_all_migrations.sql` não forem corrigidos ou aposentados, rodar qualquer um dos dois de novo desfaz tudo isso.

---

## 11. Segunda passada: painel do compositor e painel administrativo (leitura completa)

Na primeira passada li de ponta a ponta o banco, as Edge Functions, as páginas públicas e a autenticação; nas abas do painel eu tinha lido os fluxos principais e varrido o resto por busca. Aqui está a leitura completa de `AddSongTab`, `MySongsTab`, `MusicPlayer`, `RequestsTab`, `ReleasesTab`, `ProfileTab` e das ações das abas administrativas. Os achados abaixo são novos; os das seções 4 e 5 continuam valendo.

### O que está correto (confirmado)

- **AddSongTab:** trava contra envio duplo (`submissionLockRef`), aviso ao sair com arquivos pendentes, rascunho gravado no navegador e no banco com controle de revisão, rascunho antigo não sobrescreve a obra na edição (pergunta antes), cancelamento e falha removem os arquivos já enviados, erro rola até o aviso, música inexistente ou de outro usuário mostra "não encontrada".
- **MySongsTab:** paginação e filtros no servidor, ações em lote com relatório de falhas por música, exclusão com diálogo acessível (foco preso, Esc), bloqueio de exclusão quando há histórico.
- **RequestsTab:** uma única mutação por vez, conflito entre abas tratado com aviso e recarga, valor não pode mudar depois do pagamento confirmado, revisão obrigatória antes de emitir, falha no arquivamento do PDF não perde a emissão e pode ser repetida, filtros sincronizados com a URL (voltar do navegador funciona), dados do intérprete mascarados até o clique.
- **ReleasesTab:** exportação CSV com documento mascarado e proteção contra fórmulas, download confere o hash do PDF.
- **ProfileTab:** confirmação ao trocar o endereço público, recorte de imagem, reversão dos uploads se o salvamento falhar, limpeza das imagens substituídas, aviso de alterações não salvas.
- **Admin:** toda ação chama uma RPC ou uma tabela protegida por papel; o PIN é uma camada a mais na tela.

### Novos achados

**A9 (Alto, confirmado, ativo em produção). Trocar o áudio de uma música apaga o arquivo já entregue a um cliente.**
Onde: `src/context/AppContext.tsx:469-479`, `src/pages/dashboard/AddSongTab.tsx:786-792`, `src/components/dashboard/MusicPlayer.tsx:342-352`.
Quando o compositor envia uma nova versão do áudio, o app apaga o arquivo anterior do Storage. A entrega ao cliente aponta para o caminho congelado na emissão (`release_deliveries.audio_path`). A policy que impediria essa exclusão é a de `release_delivery_snapshot_2026_09_28.sql`, que **não está instalada em produção** (seção 10). Resultado hoje: o compositor regrava a música e o cliente que já pagou abre o link e vê "a música completa não está disponível". Correção: o item 2 da lista enxuta da seção 10 resolve; convém também o app não tentar apagar arquivo vinculado a uma entrega. Esforço P. SQL: sim.

**A10 (Alto, confirmado). Suspender um compositor pelo admin não para a cobrança e é desfeito na renovação.**
Onde: `src/lib/database.ts:985`, `supabase/functions/stripe-webhook/index.ts:113`.
"Suspender" e "Cancelar" no painel só alteram `subscriptions.status`. A assinatura no Stripe continua ativa e cobrando. No próximo evento do Stripe (a fatura mensal), o webhook regrava o status a partir do Stripe e a conta volta a "ativa" sozinha. Ou seja: o admin suspende alguém por abuso, a pessoa segue pagando com o perfil fora do ar e, em até um mês, o perfil volta sem ninguém perceber. O inverso também vale: ativar pelo admin uma conta cancelada no Stripe dura até o próximo evento. Correção: suspensão administrativa em coluna própria (por exemplo `admin_suspended_at`), respeitada pelas RPCs públicas e pelo webhook, e cancelamento real no Stripe quando for o caso. Esforço M. SQL: sim.

**M19 (Médio, confirmado). Endereços reservados só são barrados na tela ao editar o perfil.**
Onde: `src/pages/dashboard/profile/profileFormUtils.ts:149`, `supabase/schema.sql:2080-2120` (`save_my_profile`).
A lista de reservados é aplicada pelo banco só no cadastro (`handle_new_user`). Ao editar, `save_my_profile` grava o que vier, sem conferir formato nem lista. Por uma chamada direta, um compositor pode ficar com `/compositor/suporte`, `/compositor/oficial` ou `/compositor/admin` e se passar pela plataforma. Correção: validar formato e reservados dentro da função. Esforço P. SQL: sim.

**M20 (Médio, confirmado). Exportações CSV do admin truncam no primeiro `#` e uma não protege contra fórmulas.**
Onde: `src/pages/admin/AdminComposersTab.tsx:368-369`, `AdminSongsTab.tsx:394-407`, `AdminTransactionsTab.tsx:270-271`.
As três montam o arquivo como `data:` URI com `encodeURI`, que não codifica `#`. Uma música chamada "Tema #1" corta o relatório nesse ponto, sem aviso. Em `AdminSongsTab` o título e os autores, escritos pelos compositores, vão para o CSV sem a proteção contra fórmulas que as outras exportações têm: um título começando com `=` é executado pelo Excel no computador do admin. Correção: usar `Blob` como em `ReleasesTab.tsx:349` e a mesma função `csvCell`. Esforço P.

**M21 (Médio, confirmado). Os números financeiros do admin são estimativas.**
Onde: `src/pages/admin/AdminOverviewTab.tsx:54-55`, `:112-131`.
O MRR soma o valor do plano de toda conta "ativa", inclusive teste grátis e cortesias sem Stripe (hoje 2 das 3 ativas). O histórico mensal é reconstruído pela data de cadastro, não por cobranças reais. Serve como indicador, não como conciliação. Correção: calcular a partir das faturas pagas (`subscriptions.invoices`) ou rotular como estimativa. Esforço M.

**M22 (Médio, confirmado). O aviso de "alterações não salvas" das solicitações usa uma API interna do React Router.**
Onde: `src/pages/dashboard/RequestsTab.tsx:45`, `:322-350`.
O componente substitui `push` e `replace` do navegador interno (`UNSAFE_NavigationContext`). Funciona na versão atual, mas pode quebrar a navegação do painel numa atualização do `react-router-dom` (o `package.json` aceita qualquer 7.x). Correção: fixar a versão ou trocar por `useBlocker` com `createBrowserRouter`. Esforço M.

**L14 (Baixo).** Música nova nasce com "valor sugerido" marcado e R$ 3.500,00 preenchido (`AddSongTab.tsx:90-91`). Quem não reparar publica esse preço.

**L15 (Baixo).** "Limpar rascunho" não limpa o ISWC (`AddSongTab.tsx:580-607`).

**L16 (Baixo).** No Player Studio: a tela aceita `.flac`, que o servidor recusa depois do envio (`MusicPlayer.tsx:245`); erros aparecem em `alert()`; música criada por ali recebe a letra "Letra em fase de edição pelo compositor." (`:325`), que conta como letra preenchida e permite publicar assim.

**L17 (Baixo).** O formulário de nova música só aceita MP3 (`AddSongTab.tsx:508-509`), enquanto o servidor e o Player Studio aceitam WAV, M4A, AAC e OGG. É coerente, mas convém dizer isso no campo.

**L18 (Baixo).** Se o rascunho não chegou a sincronizar, a cópia local com a letra fica no navegador depois do logout (`AppContext.tsx:252-255` só limpa os filtros e o `sessionStorage`).

**L19 (Baixo).** `save_my_profile` não limita o tamanho de bio, links e demais campos; o limite só existe na tela.

### Itens fora do inventário

- Rotas duplicadas de cadastro de música: `/dashboard/adicionar-musica` e `/dashboard/musicas/adicionar` além de `/dashboard/musicas/nova` (`DashboardLayout.tsx:529-532`).
- Tabela `user_data` em produção, sem origem no repositório.
- Tabela `subscription_payments` e gatilho `sync_invoice_status_on_reversal` do gateway antigo ainda em produção.
- Pastas e arquivos de entrega na raiz: `mercado-do-compositor-*` (uma delas versionada), 17 arquivos `.zip`, `metadata.json`, `bun.lock` ao lado de `package-lock.json`.
- `ThemeContext` e `ThemeToggle` (tema claro/escuro) não estavam listados; têm teste unitário e não encontrei problemas.

### Ainda não verificado nesta passada

Leitura de código não substitui uso real. Continuam sem verificação: layout em 360 px das abas do painel, navegação por teclado nos modais do admin, contraste nos dois temas e o comportamento com rede lenta durante upload. Exigem teste manual ou um e2e autenticado (seção 8).

### Ajuste no plano de correção (seção 9)

- A9 entra na etapa 1 (é resolvido pelo mesmo SQL do B1).
- A10 entra na etapa 3.
- M19 entra na migração nova da etapa 1, por ser uma função a mais no mesmo arquivo.
- M20, M21, M22 e os baixos ficam na etapa 4.

---

## 12. Correção dos bloqueadores (30/09/2026)

### Aplicado no banco de produção

Com aprovação, rodei nesta ordem: `request_consent_evidence_2026_09_24.sql`, `release_delivery_snapshot_2026_09_28.sql`, `featured_composers_2026_09_28.sql`, o novo `fix_bloqueadores_2026_09_30.sql` e, por último, `verify_workflow_guarantees_2026_09_24.sql`, que devolveu `workflow_guarantees_ok`. Nenhum dado foi alterado; só funções, permissões e policies.

Conferido depois, por consulta:

| Item | Antes | Depois |
|---|---|---|
| B2: escrita em `profiles` e `songs` | Tabela inteira, incluindo `is_verified`, `is_featured` e contadores | Só as colunas do formulário (com `iswc`) |
| M5: DELETE em `profiles` e `private_profiles` | Concedido | Revogado |
| Vitrine (`get_featured_composers`) | Versão antiga | Devolve `featured` e `isVerified` |
| A9: policy "media owner delete" | Sem proteção | Protege o áudio já entregue |
| A3 (parte): limite de requisições | Identidade pelo JSON de cabeçalhos | Identidade estável no formulário e nos contadores |
| `admin_moderate_song` | Desligava os gatilhos | Versão sem `session_replication_role` |
| A5: `expire_overdue_subscriptions` | Falhava toda noite (`auto_renew`) | Executa sem erro e ignora assinaturas do Stripe |

O teste de fumaça passou 7 de 7 depois da aplicação.

### Alterado no código (ainda não publicado nem commitado)

- **B3:** `src/components/common/TermsAcceptanceGate.tsx` (novo), ligado em `src/App.tsx` dentro de `ComposerRoute`, e `loadMyTermsAcceptances` em `src/lib/database.ts`. Ao entrar no painel, quem não tem aceite da versão vigente vê uma janela obrigatória com a caixa de aceite; o registro é gravado por `record_terms_acceptance`. Vale para contas do Google, contas antigas e para toda troca de versão. Se a conferência falhar por rede, o painel não é bloqueado.
- **B2 na origem:** `update_all_migrations.sql` não concede mais UPDATE/INSERT de tabela em `profiles` e `songs`; a lista de colunas dele e a de `fix_auditoria_2026_09.sql` passaram a incluir `iswc`.
- **B1 na origem:** aviso no topo de `schema.sql` e `update_all_migrations.sql` para não rodar em banco em uso; `README.md` com a ordem completa; `verify_workflow_guarantees_2026_09_24.sql` agora também falha se houver escrita ampla em `songs`/`profiles`, vitrine antiga, moderação que desliga gatilhos ou policy de Storage sem a proteção da entrega.

Verificações: `tsc` sem erros, build ok, 391 de 393 testes (as mesmas 2 falhas de fim de linha do Windows, anteriores às mudanças).

### O que ainda falta para os bloqueadores ficarem fechados

1. **Publicar o front** (build e envio para a Hostinger). Sem isso a janela de aceite dos Termos não existe em produção. As 5 contas atuais verão a janela no próximo acesso ao painel.
2. **Versão dos Termos:** o banco está em `1.0` e a página mostra "Versão 1.2". O aceite grava `1.0`. Alinhe o número em Admin > Configurações ou no texto da página (achado M13).
3. **`schema.sql` continua com versões antigas por dentro.** Ficou o aviso e o verificador pega a regressão, mas o arquivo não foi reescrito. A solução definitiva é a consolidação em `supabase/migrations/` (etapa 4 do plano).
4. A janela de aceite não foi testada num navegador com conta real; o e2e autenticado continua sem credenciais.

---

## 13. Correção dos altos (30/09/2026)

### Resolvido no código (ainda não publicado nem commitado)

| Achado | O que mudou |
|---|---|
| A1 — 2FA não exigido | `MfaChallengeGate.tsx` (novo), nas rotas do painel e do admin: quem ativou o 2FA precisa digitar o código do aplicativo depois do login. Em Configurações, dá para desativar o 2FA, e uma configuração abandonada no meio não trava mais a próxima. Limite: a exigência é da aplicação; o banco ainda aceita uma sessão só com senha em chamadas diretas à API (exigiria mudar o PIN do admin). |
| A2 — sobras da exclusão de conta | `delete-my-account` apaga, depois da rotina do banco, os arquivos do titular no Storage (exceto o áudio já entregue a quem licenciou), as obras sem pedido nem termo, os registros de mídia, o e-mail do titular na trilha de auditoria e o cliente no Stripe. A conclusão pelo admin passa pela mesma função (antes era só o SQL e a assinatura do Stripe tinha de ser cancelada à mão). |
| A3 — abuso do formulário público | `public_abuse_and_telemetry_2026_09_30.sql`: identidade por `cf-connecting-ip` (que o cliente não controla) e dois tetos que não dependem do IP: 5 comprovantes por dia para um mesmo e-mail e 20 pedidos por hora por obra. CAPTCHA continua recomendado, mas exige criar as chaves do Cloudflare Turnstile. |
| A4 — virada teste → produção do Stripe | `stripe-checkout` detecta cliente de outro modo ou apagado, limpa os IDs e cria um novo; `stripe-portal` e `stripe-change-plan` devolvem mensagem clara em vez de erro genérico. |
| A7 — monitoramento desligado | Nova Edge Function `client-telemetry` e tabela `client_error_events` (30 dias de retenção, limite de 60 eventos por hora por origem, leitura só para admin). O app envia os erros para ela em produção sem precisar configurar variável; o token de `/entrega/` é mascarado. |
| A8 — Política de Privacidade | Stripe, Resend, Google e Hostinger incluídos como operadores, com o que cada um recebe. |
| A10 — suspensão do admin desfeita pelo Stripe | `admin_suspension_2026_09_30.sql`: a suspensão feita no painel fica marcada e nenhum evento do Stripe reativa a conta enquanto a marca existir. O aviso no painel diz que a cobrança continua no Stripe. |

A5 e A9 já tinham sido resolvidos no banco na etapa dos bloqueadores (seção 12).

`tsc` sem erros, build ok, testes 391 de 393 (as mesmas 2 falhas de fim de linha do Windows).

### Aplicado em produção

Depois do novo login da CLI:

- `admin_suspension_2026_09_30.sql` e `public_abuse_and_telemetry_2026_09_30.sql` aplicados; `verify_workflow_guarantees_2026_09_24.sql` devolveu `workflow_guarantees_ok`. Conferido: gatilho de suspensão instalado, identidade por `cf-connecting-ip`, teto por e-mail no formulário, job `purge-operational-logs` agendado.
- Publicadas `stripe-checkout`, `stripe-portal`, `stripe-change-plan`, `delete-my-account` e `client-telemetry` (esta sem verificação de JWT). As quatro primeiras respondem 401 sem sessão; `client-telemetry` responde ao navegador e descarta eventos que não são erro.
- Teste de fumaça: 7 de 7.

Falta publicar o front na Hostinger: é ele que passa a enviar os erros para `client-telemetry`, a pedir o código de 2FA e o aceite dos Termos, e a usar a exclusão pelo admin via Edge Function.

### Ainda em aberto

- **A6 — prévia de link dos perfis:** não resolvido. O `compositor.php` funciona quando chamado direto; as regras de reescrita do `.htaccess` publicado não estão sendo aplicadas (também a que bloqueia `og-config.php`). A consulta pela API da Hostinger ficou sem resposta por 30 minutos. Confira no gerenciador de arquivos se o `.htaccess` da raiz tem as linhas `RewriteRule ^compositor/...` e `RewriteRule ^og-config\.php$ - [F,L]`; se não tiver, o envio está deixando o arquivo oculto de fora.
- **A3:** CAPTCHA depende de você criar o site no Cloudflare Turnstile.
- **A1:** exigência no banco (RLS por nível de autenticação) fica para depois.

### Conferência depois do deploy do front (30/09/2026)

- O site publicado usa o mesmo build local (`index-BbtmaMr2.js`), que contém a janela de 2FA, a de aceite dos Termos e o envio para `client-telemetry`.
- Teste de fumaça: 7 de 7.
- **A6 continua aberto:** `/compositor/mercado` ainda devolve o título genérico, perfil inexistente responde 200 e `/og-config.php` responde 200. As regras de reescrita do `.htaccess` seguem sem efeito no servidor.
- Não consegui ler a tabela `client_error_events`: a CLI voltou a responder 403 (outra conta logada).

### A6 — causa provável e correção (30/09/2026)

- **Causa provável.** O `dist/.htaccess` publicado saía com fim de linha do Windows (CRLF), porque o checkout nesta máquina converte os arquivos (`core.autocrlf=true`). O servidor aplicava os cabeçalhos do arquivo, mas ignorava as regras de reescrita. Por isso o perfil nunca passava pelo `compositor.php` e o `og-config.php` não era bloqueado.
- **Evidência.**
  - O `/compositor/mercado` publicado é o `index.html` estático (mesmo `Etag` da home, sem o `charset` que o PHP envia).
  - Chamado direto, o `compositor.php` funciona.
  - `git ls-files --eol` mostra `w/crlf` para `public/.htaccess`, `public/compositor.php` e `index.html`.
- **Correção.**
  - Plugin `lfDeployFilesPlugin` em `vite.config.ts`: o build grava `.htaccess`, `compositor.php` e `index.html` sempre com LF.
  - `.gitattributes` fixa LF para esses três arquivos em qualquer checkout.
  - Efeito colateral bom: o hash CSP do script inline volta a bater com o do `.htaccess` (`sha256-J2YIf71y…`), o que resolve o M9 para quando a CSP for ativada.
- **Pendente.** Publicar o `dist/` gerado agora, incluindo o `.htaccess`, e conferir `/compositor/mercado` e `/og-config.php`.
- **Confirmado em produção depois do novo deploy:**
  - `/compositor/mercado` devolve o título e o Open Graph do perfil ("Mercado | Mercado do Compositor", `og:url` do perfil);
  - um perfil inexistente responde 404 e `/og-config.php` responde 403;
  - o painel continua abrindo;
  - o script inline está em LF, com o hash igual ao da CSP;
  - teste de fumaça 7 de 7.

  **A6 resolvido.**

### Decisão sobre os pendentes dos altos (30/09/2026)

O responsável decidiu não implementar:
- **CAPTCHA no formulário de interesse (A3).** Ficam valendo as proteções já aplicadas: identidade por `cf-connecting-ip`, 3 pedidos por hora por pessoa e obra, 30 por hora por origem, 5 comprovantes por dia por e-mail, 20 pedidos por hora por obra e o campo-isca.
- **Exigência do 2FA no banco (A1).** O login pelo site pede o código a quem ativou o 2FA; uma chamada direta à API com a senha correta continua aceita. Risco aceito.

Com isso, todos os achados altos estão resolvidos ou com risco aceito.

---

## 14. Correção dos achados médios (30/09/2026)

| Achado | Situação | O que mudou |
|---|---|---|
| M1 moderador | Resolvido (código + SQL) | O admin carrega só o que cada papel pode ler; policy de leitura de obras para moderadores. |
| M2 estornos | Resolvido (texto) | Os Termos dizem que a equipe *pode* suspender em caso de estorno ou chargeback, que é o que o sistema permite hoje. |
| M3 avisos de cobrança | Resolvido (SQL) | Aviso e e-mail quando o cartão é recusado, a assinatura fica sem pagamento, é cancelada ou a equipe suspende a conta. |
| M4 carga do painel | Parcial | Removidas as URLs assinadas por música na abertura (N requisições por login). O painel ainda carrega todas as músicas, pedidos e termos de uma vez: a paginação completa exige reescrever o contexto. |
| M5 DELETE no perfil | Resolvido antes (seção 12) | — |
| M6 PDF do termo | Resolvido (Edge Function) | O cliente recebe o termo gerado a partir do registro do banco, não o PDF enviado pelo navegador do compositor. |
| M7 auditoria forjável | Resolvido (SQL) | Fora da equipe, só eventos da categoria de obras são aceitos. |
| M8 cota de upload | Resolvido (Edge Function) | No máximo 60 arquivos validados por conta a cada 24 horas. |
| M9 CSP | Resolvido (seção 13) | Hash confere; ativar a CSP (tirar o Report-Only) continua a critério do responsável. |
| M10 manutenção | Resolvido (já estava no banco) | — |
| M11 mensagem técnica | Resolvido | O usuário não vê mais "execute update_all_migrations.sql". |
| M12 lista de compositores | Resolvido (código + SQL) | Até 1.000 perfis por consulta e tela de erro com "Tentar novamente". |
| M13 versão dos termos | Resolvido (código + SQL) | A página mostra a versão do banco e a data da revisão; o banco passa a `1.3`, e todos aceitam de novo pela janela do painel. |
| M14 registros de acesso | Não verificado | O Supabase Auth guarda login com IP em `auth.audit_log_entries`; conferir a retenção (a CLI voltou a responder 403). |
| M15 testes | Resolvido | Os testes não dependem mais do fim de linha: 393 de 393 no Windows. O teste de contrato da entrega foi atualizado para o comportamento do M6. |
| M16 SEO | Resolvido | Título, descrição e URL canônica em `/compositores`, `/termos`, `/privacidade` e `/validar-documento`; `/sitemap.xml` passa a ser gerado pelo `sitemap.php` com os perfis ativos. |
| M17 coautores | Resolvido (declaração) | A revisão antes de emitir mostra os autores e exige a declaração de que todos autorizaram. A redação da cláusula do termo continua para revisão jurídica. |
| M18 exclusão sem senha | Resolvido | Contas com senha precisam digitá-la para excluir; contas só com Google confirmam com a palavra EXCLUIR. |
| M19 nomes reservados | Resolvido (SQL) | `save_my_profile` valida formato, nomes reservados e tamanho dos campos; a lista do app é a mesma do banco. |
| M20 CSV do admin | Resolvido | As três exportações usam arquivo (Blob) e proteção contra fórmulas. |
| M21 MRR | Resolvido (rótulo) | Aparece como "MRR estimado", com explicação. |
| M22 React Router | Resolvido | Versão fixada em 7.18.2 no `package.json` e no `package-lock.json`, com aviso no código. |

Verificações locais: `tsc` sem erros, 393 de 393 testes, build ok (`.htaccess`, `compositor.php`, `sitemap.php` e `index.html` em LF).

### Para entrar em produção

1. `npx supabase login` com a conta do Mercado do Compositor (a CLI voltou a responder 403).
2. Aplicar `supabase/medios_2026_09_30.sql` e, por último, `verify_workflow_guarantees_2026_09_24.sql`.
3. Publicar as Edge Functions `release-delivery` e `validate-media-upload`.
4. Publicar o `dist/` (inclui o `.htaccess` com a regra do sitemap e o `sitemap.php`).

### Aplicado em produção (médios)

- `medios_2026_09_30.sql` aplicado. O verificador devolveu `workflow_guarantees_ok`.
- Conferido:
  - versão dos termos `1.3`;
  - policy de leitura para moderadores e gatilho de avisos de cobrança instalados;
  - auditoria restrita por papel e `save_my_profile` com validação de nomes reservados;
  - lista pública de compositores respondendo.
- Publicadas `release-delivery` e `validate-media-upload`. Teste de fumaça: 7 de 7.
- **M14 confirmado como aberto:** `auth.audit_log_entries` está vazia. O Supabase guarda os logins só nos logs da plataforma, com retenção do plano (dias). O app não mantém registro de acesso por 6 meses, como a Política afirma. É preciso decidir entre guardar esses registros (tabela própria alimentada no login) e ajustar o texto com orientação jurídica.
- Falta publicar o `dist/` na Hostinger.

---

## 15. Correção dos achados baixos (30/09/2026)

| Achado | Situação | O que mudou |
|---|---|---|
| L1 prévia não repete | Resolvido | Botão "Ouvir a prévia de novo" depois do fim. |
| L2 ids duplicados no cadastro | Resolvido | "Senha" e "Confirmar senha" com ids próprios. |
| L3 sobras publicadas | Resolvido no build | `README.md`, `mockups/` e `audio-previews/` não vão mais para o `dist/`. Os que já estão no servidor precisam ser apagados à mão na Hostinger. A pasta de build antiga versionada no git continua lá. |
| L4 exportação LGPD | Resolvido | O link do arquivo só é revogado depois do download. |
| L5 limpeza do limite de requisições | Resolvido antes (seção 13) | Job diário `purge-operational-logs`. |
| L6 capacidade de outra conta | Resolvido (SQL) | `check_plan_capacity` só responde sobre a própria conta ou para a equipe. |
| L7 conta banida | Resolvido | Mensagem em português. |
| L8 `PRODUCTION_READINESS.md` | Resolvido | Reescrito com o fluxo atual (Stripe, ordem do README, verificador). |
| L9 notificações para si mesmo | Resolvido (SQL) | Sem insert direto; o dono só lê, marca como lida e apaga. |
| L10 "marcação de amostragem" | Resolvido | Texto descreve a prévia como arquivo separado do fonograma. |
| L11 token nos erros | Resolvido antes (seção 13) | — |
| L12 script da prévia | Resolvido | Padrão de 85 s. |
| L13 PIN com `trim` | Resolvido | A senha é conferida como foi digitada. |
| L14 preço pré-preenchido | Resolvido | Música nova começa sem valor sugerido. |
| L15 ISWC no "Limpar rascunho" | Resolvido | — |
| L16 Player Studio | Resolvido | Recusa FLAC antes do envio, mensagens na tela em vez de `alert()`, sem letra provisória. |
| L17 formatos do campo de áudio | Resolvido | O campo explica que WAV, M4A, AAC e OGG vão pelo Player Studio. |
| L18 rascunho após logout | Resolvido | As cópias locais de rascunho são apagadas no logout. |
| L19 tamanho dos campos do perfil | Resolvido antes (seção 14) | — |

Verificações: `tsc` sem erros, 393 de 393 testes, build ok.

Aplicado em produção:
- `baixos_2026_09_30.sql`, com o verificador devolvendo `workflow_guarantees_ok`;
- conferido que `user_notifications` só aceita leitura, atualização e exclusão pelo dono, sem insert.

Falta publicar o `dist/` na Hostinger.

---

## 16. Conferência final depois do deploy (30/09/2026)

**Confirmado em produção:**
- build publicado igual ao local;
- prévia de link dos perfis funcionando e `/og-config.php` bloqueado (403);
- teste de fumaça 7 de 7;
- `client_error_events` sem erros registrados;
- `sitemap.php` lista os perfis.

**Ajustes e limpeza pendentes:**
- **Sitemap:** `/sitemap.xml` continua sendo o arquivo estático, porque o CDN da Hostinger serve arquivos `.xml` sem passar pela regra do `.htaccess`. O `robots.txt` passou a apontar para `/sitemap.php`; basta publicar esse arquivo.
- **Sobras de deploys antigos** ainda no servidor: `README.md`, `mockups/` e `audio-previews/`. É preciso apagá-las à mão.

**O que o código não resolve** (seção 7 e itens pendentes):
- Stripe em modo produção: chave, webhook e segredo;
- domínio do Resend verificado;
- configurações do Supabase Auth: senha mínima e URLs de retorno;
- backup;
- teste com conta real das janelas de aceite e de 2FA;
- M14: guardar os registros de acesso ou ajustar a Política;
- M4: paginação completa do painel;
- commit das alterações.

### Decisão: itens adiados (30/09/2026)

O responsável decidiu não tratar agora:
- **M4, carga do painel:** o painel continua carregando todas as músicas, pedidos e termos de uma vez. Rever quando algum compositor tiver catálogo grande.
- **M14, registros de acesso:** a Política afirma guarda por 6 meses, e o app não guarda. Risco jurídico aceito por ora.
- **CSP ativa:** continua em "Report-Only".

### Decisão: janela de aceite dos Termos removida (30/09/2026)

A pedido do responsável, a janela obrigatória de aceite dos Termos (B3) foi retirada do painel; o componente `TermsAcceptanceGate` foi apagado. O aceite continua sendo registrado só no cadastro por e-mail e senha, pelo gatilho `handle_new_user_terms`. Contas criadas com o Google e aceites de versões novas (hoje `1.3`) ficam sem registro. **Risco jurídico aceito.**

### Decisão: verificação em duas etapas removida do app (30/09/2026)

A pedido do responsável, a verificação em duas etapas saiu do app:
- `MfaChallengeGate` foi apagado e as rotas do painel e do admin não pedem mais o código;
- a seção de 2FA saiu de Configurações e as funções de cadastro de fator, em `database.ts`, foram removidas;
- `supabase/config.toml` passou a `enroll_enabled = false` e `verify_enabled = false`.

O A1 deixa de existir: não há mais 2FA oferecido. O login é só por senha ou Google. Fatores eventualmente já cadastrados no Supabase Auth ficam sem efeito no app. Para desligar também no projeto, desative o TOTP em Authentication > Multi-Factor no painel do Supabase.
