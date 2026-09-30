import { escapeHtml } from './email-template.ts'

// Templates publicados no Resend (supabase/resend/templates). O `alias` é o
// nome do template no painel; as variáveis vêm do texto que o banco grava em
// user_notifications / notification_email_outbox. Se o texto mudar e o padrão
// deixar de casar, o worker volta a usar o HTML próprio: nada deixa de ser
// enviado por causa do template.

export type ResolvedTemplate = { alias: string; variables: Record<string, string> }

type Rule = {
  alias: string
  subject: RegExp
  body?: RegExp
  vars?: (subject: RegExpMatchArray, body: RegExpMatchArray | null) => Record<string, string>
}

const brl = (value: string) => `R$ ${value}`

const RULES: Rule[] = [
  { alias: 'compositor-boas-vindas', subject: /^Boas-vindas ao Mercado do Compositor$/ },
  { alias: 'compositor-exclusao-recebida', subject: /^Recebemos seu pedido de exclusão de conta$/ },
  {
    alias: 'compositor-nova-solicitacao', subject: /^Nova solicitação de interesse$/,
    body: /^(.+) demonstrou interesse na obra "(.*)"\.$/s,
    vars: (_, b) => ({ BUYER_NAME: b![1], SONG_TITLE: b![2] }),
  },
  {
    alias: 'compositor-termo-emitido', subject: /^Termo de liberação emitido$/,
    // Só quando a entrega foi para a fila: com e-mail do intérprete inválido o
    // aviso pede correção, e o template diria que o link já foi enviado.
    body: /^O termo (\S+) da obra "(.*)" foi emitido\. O link de entrega .* foi colocado na fila de e-mail/s,
    vars: (_, b) => ({ DOCUMENT_CODE: b![1], SONG_TITLE: b![2] }),
  },
  {
    alias: 'compositor-entrega-link-expirado', subject: /^Cliente pediu um novo link de entrega$/,
    body: /^(.+) tentou abrir a entrega do termo (\S+) \("(.*)"\), mas o link expirou\./s,
    vars: (_, b) => ({ BUYER_NAME: b![1], DOCUMENT_CODE: b![2], SONG_TITLE: b![3] }),
  },
  {
    alias: 'compositor-entrega-falha-download', subject: /^Cliente não conseguiu baixar a música$/,
    body: /^(.+) abriu a entrega do termo (\S+) \("(.*)"\), mas a música completa não está disponível\./s,
    vars: (_, b) => ({ BUYER_NAME: b![1], DOCUMENT_CODE: b![2], SONG_TITLE: b![3] }),
  },
  {
    alias: 'compositor-musica-aprovada', subject: /^Música aprovada$/,
    body: /^A obra "(.*)" foi aprovada e já está no catálogo público\.$/s,
    vars: (_, b) => ({ SONG_TITLE: b![1] }),
  },
  // Rejeição e retirada sem motivo informado não têm o que mostrar em REASON:
  // ficam no HTML próprio, que não exibe a linha "Motivo".
  {
    alias: 'compositor-musica-rejeitada', subject: /^Música rejeitada$/,
    body: /^A obra "(.*)" foi rejeitada pela moderação\. Motivo: (.+)$/s,
    vars: (_, b) => ({ SONG_TITLE: b![1], REASON: b![2] }),
  },
  {
    alias: 'compositor-musica-retirada', subject: /^Música retirada do catálogo$/,
    body: /^A obra "(.*)" foi retirada do catálogo pela moderação\. Motivo: (.+)$/s,
    vars: (_, b) => ({ SONG_TITLE: b![1], REASON: b![2] }),
  },
  {
    alias: 'compositor-musica-em-analise', subject: /^Música em análise$/,
    body: /^A obra "(.*)" voltou para a fila de análise\.$/s,
    vars: (_, b) => ({ SONG_TITLE: b![1] }),
  },
  // Stripe (sem teste grátis e com data de cobrança).
  {
    alias: 'compositor-assinatura-ativada', subject: /^Assinatura ativada$/,
    body: /^Sua assinatura do (.+) \(R\$ ([\d.,]+) por mês\) foi confirmada\..*a próxima cobrança será em (\d{2}\/\d{2}\/\d{4})\.$/s,
    vars: (_, b) => ({ PLAN_NAME: b![1], AMOUNT: brl(b![2]), NEXT_BILLING_DATE: b![3] }),
  },
  // Mercado Pago: primeiro pagamento aprovado.
  {
    alias: 'compositor-assinatura-ativada', subject: /^Assinatura ativada$/,
    body: /^Seu pagamento de R\$ ([\d.,]+) do (.+) foi aprovado \(fatura #[^)]+\)\..* até (\d{2}\/\d{2}\/\d{4})\.$/s,
    vars: (_, b) => ({ AMOUNT: brl(b![1]), PLAN_NAME: b![2], NEXT_BILLING_DATE: b![3] }),
  },
  {
    alias: 'compositor-pagamento-confirmado', subject: /^Pagamento confirmado$/,
    body: /^Recebemos o pagamento de R\$ ([\d.,]+) do (.+) \(fatura #([^)]+)\)\. Seu plano está garantido até (\d{2}\/\d{2}\/\d{4})\.$/s,
    vars: (_, b) => ({ AMOUNT: brl(b![1]), PLAN_NAME: b![2], INVOICE_ID: b![3], NEXT_BILLING_DATE: b![4] }),
  },
  {
    alias: 'compositor-pagamento-recusado', subject: /^Pagamento recusado$/,
    body: /^Não conseguimos cobrar R\$ ([\d.,]+) da renovação do seu (.+?) no cartão\./s,
    vars: (_, b) => ({ AMOUNT: brl(b![1]), PLAN_NAME: b![2] }),
  },
  {
    alias: 'compositor-pagamento-recusado', subject: /^Pagamento recusado$/,
    body: /^Seu pagamento de R\$ ([\d.,]+) do (.+?) não foi aprovado/s,
    vars: (_, b) => ({ AMOUNT: brl(b![1]), PLAN_NAME: b![2] }),
  },
  {
    alias: 'compositor-assinatura-suspensa', subject: /^Assinatura suspensa$/,
    body: /^O pagamento #(\S+) foi (?:estornado|contestado)\./s,
    vars: (_, b) => ({ INVOICE_ID: b![1] }),
  },
  {
    alias: 'compositor-assinatura-vence-em-breve', subject: /^Sua assinatura vence em breve$/,
    body: /^Seu (.+) vence em (\d{2}\/\d{2}\/\d{4})\./s,
    vars: (_, b) => ({ PLAN_NAME: b![1], DUE_DATE: b![2] }),
  },
  {
    alias: 'compositor-assinatura-vencida', subject: /^Assinatura vencida$/,
    body: /^Seu (.+) venceu em (\d{2}\/\d{2}\/\d{4})\./s,
    vars: (_, b) => ({ PLAN_NAME: b![1], DUE_DATE: b![2] }),
  },
  {
    alias: 'compositor-assinatura-vencida', subject: /^Assinatura vencida$/,
    body: /^Não conseguimos cobrar a renovação do seu (.+) \(vencido em (\d{2}\/\d{2}\/\d{4})\)\./s,
    vars: (_, b) => ({ PLAN_NAME: b![1], DUE_DATE: b![2] }),
  },
  {
    alias: 'compositor-teste-encerrado', subject: /^Teste grátis encerrado$/,
    body: /^Seu teste grátis do (.+) terminou\./s,
    vars: (_, b) => ({ PLAN_NAME: b![1] }),
  },
  {
    alias: 'admin-nova-assinatura', subject: /^Nova assinatura$/,
    body: /^(.+) assinou o (.+) \(R\$ ([\d.,]+) por mês\)/s,
    vars: (_, b) => ({ COMPOSER_NAME: b![1], PLAN_NAME: b![2], AMOUNT: brl(b![3]) }),
  },
  {
    alias: 'admin-solicitacao-exclusao', subject: /^Solicitação de exclusão de conta$/,
    body: /^(.+) \((.+?)\) pediu a exclusão da conta em (.+?)\. O titular/s,
    vars: (_, b) => ({ USER_NAME: b![1], USER_EMAIL: b![2], REQUESTED_AT: b![3] }),
  },
  {
    alias: 'admin-conta-excluida', subject: /^Conta excluída pelo titular$/,
    body: /^Um compositor excluiu a própria conta \(marca (\S+)\)\..* e (\d+) pedido\(s\) em aberto/s,
    vars: (_, b) => ({ ACCOUNT_TAG: b![1], CLOSED_REQUESTS: b![2] }),
  },
  {
    alias: 'interprete-pedido-recebido', subject: /^Recebemos seu pedido de liberação da obra "(.*)"$/,
    body: /^Olá, (.+?)\. Seu pedido de liberação da obra "(.*)" foi entregue a (.+?)\. Código da solicitação: (\S+?)\./s,
    vars: (_, b) => ({ BUYER_NAME: b![1], SONG_TITLE: b![2], COMPOSER_NAME: b![3], REQUEST_CODE: b![4] }),
  },
  {
    alias: 'interprete-pedido-encerrado', subject: /^Pedido de liberação da obra "(.*)" encerrado$/,
    body: /^Olá, (.+?)\. O compositor da obra "(.*)" encerrou a conta/s,
    vars: (_, b) => ({ BUYER_NAME: b![1], SONG_TITLE: b![2] }),
  },
]

export const resolveNotificationTemplate = (subject: string, body: string): ResolvedTemplate | null => {
  for (const rule of RULES) {
    const s = subject.match(rule.subject)
    if (!s) continue
    const b = rule.body ? body.match(rule.body) : null
    if (rule.body && !b) continue
    return { alias: rule.alias, variables: rule.vars ? rule.vars(s, b) : {} }
  }
  return null
}

const AUTH_TEMPLATES: Record<string, string> = {
  signup: 'auth-confirmar-conta',
  recovery: 'auth-recuperar-senha',
  invite: 'auth-convite',
  magiclink: 'auth-link-acesso',
  email_change: 'auth-troca-email',
  reauthentication: 'auth-codigo-seguranca',
}

export const authTemplateAlias = (action: string) => AUTH_TEMPLATES[action] ?? AUTH_TEMPLATES.magiclink

// A documentação do Resend não garante escape em {{{VAR}}}: nomes e títulos
// digitados por usuários são escapados aqui para não virarem HTML no e-mail.
export const templateVariables = (variables: Record<string, string>, actionUrl: string) =>
  Object.fromEntries(Object.entries({
    ...variables, ACTION_URL: actionUrl, YEAR: String(new Date().getUTCFullYear()),
  }).map(([key, value]) => [key, escapeHtml(value.trim())]))

export const templatesEnabled = (flag: string | undefined) => flag?.trim().toLowerCase() === 'true'
