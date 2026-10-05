import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import {
  authTemplateAlias, resolveNotificationTemplate, templateVariables,
} from '../../supabase/functions/_shared/notification-templates'

const dir = 'supabase/resend/templates'
const placeholders = (alias: string) =>
  new Set([...readFileSync(`${dir}/${alias}.html`, 'utf8').matchAll(/{{{([A-Z_]+)}}}/g)].map(m => m[1]))

// Textos no formato exato gravado pelas funções SQL.
const samples: Array<[string, string, string]> = [
  ['compositor-boas-vindas', 'Boas-vindas ao Mercado do Compositor', 'Sua conta está ativa.'],
  ['compositor-exclusao-recebida', 'Recebemos seu pedido de exclusão de conta', 'Seu pedido de exclusão foi registrado.'],
  ['compositor-nova-solicitacao', 'Nova solicitação de interesse', 'Ana Souza demonstrou interesse na obra "Céu de "Maio"".'],
  ['compositor-termo-emitido', 'Termo de liberação emitido',
    'O termo LIB-2026-001 da obra "Canção" foi emitido. O link de entrega com o termo, a música completa e a letra foi colocado na fila de e-mail e vale por 30 dias.'],
  ['compositor-entrega-link-expirado', 'Cliente pediu um novo link de entrega',
    'Ana tentou abrir a entrega do termo LIB-1 ("Canção"), mas o link expirou. Reenvie a entrega pelo painel de Liberações.'],
  ['compositor-entrega-falha-download', 'Cliente não conseguiu baixar a música',
    'Ana abriu a entrega do termo LIB-1 ("Canção"), mas a música completa não está disponível. Confira o arquivo da obra e reenvie a entrega.'],
  ['compositor-musica-aprovada', 'Música aprovada', 'A obra "Canção" foi aprovada e já está no catálogo público.'],
  ['compositor-musica-rejeitada', 'Música rejeitada', 'A obra "Canção" foi rejeitada pela moderação. Motivo: áudio incompleto'],
  ['compositor-musica-retirada', 'Música retirada do catálogo', 'A obra "Canção" foi retirada do catálogo pela moderação. Motivo: plágio'],
  ['compositor-musica-em-analise', 'Música em análise', 'A obra "Canção" voltou para a fila de análise.'],
  ['compositor-assinatura-ativada', 'Assinatura ativada',
    'Seu Plano Prata está ativo em período de teste até 08/10/2026. O catálogo e os recursos do plano já estão liberados; a primeira cobrança de R$ 34,90 será feita no cartão ao fim do teste.'],
  ['compositor-assinatura-ativada', 'Assinatura ativada',
    'Sua assinatura do Plano Ouro (R$ 49,90 por mês) foi confirmada. O catálogo e os recursos do plano já estão liberados; a próxima cobrança será em 10/11/2026.'],
  ['compositor-assinatura-ativada', 'Assinatura ativada',
    'Seu pagamento de R$ 49,90 do Plano Ouro foi aprovado (fatura #123). O catálogo e os recursos do plano já estão liberados até 10/11/2026.'],
  ['compositor-pagamento-confirmado', 'Pagamento confirmado',
    'Recebemos o pagamento de R$ 49,90 do Plano Ouro (fatura #123). Seu plano está garantido até 10/11/2026.'],
  ['compositor-pagamento-recusado', 'Pagamento recusado',
    'Não conseguimos cobrar R$ 49,90 da renovação do seu Plano Ouro no cartão. O Mercado Pago tentará novamente nos próximos dias.'],
  ['compositor-pagamento-recusado', 'Pagamento recusado',
    'Seu pagamento de R$ 49,90 do Plano Ouro não foi aprovado pelo Mercado Pago e nada foi cobrado.'],
  ['compositor-assinatura-suspensa', 'Assinatura suspensa',
    'O pagamento #123 foi estornado. Seu perfil público e suas obras ficaram ocultos até a regularização.'],
  ['compositor-assinatura-vence-em-breve', 'Sua assinatura vence em breve',
    'Seu Plano Ouro vence em 10/11/2026. Assine com renovação automática pela tela de assinatura para manter seu catálogo público.'],
  ['compositor-assinatura-vencida', 'Assinatura vencida',
    'Seu Plano Ouro venceu em 10/11/2026. Seu perfil e suas obras saíram do catálogo público até a renovação.'],
  ['compositor-assinatura-vencida', 'Assinatura vencida',
    'Não conseguimos cobrar a renovação do seu Plano Ouro (vencido em 10/11/2026). Atualize o cartão no Mercado Pago.'],
  ['compositor-teste-encerrado', 'Teste grátis encerrado', 'Seu teste grátis do Plano Ouro terminou. Assine para voltar ao catálogo público.'],
  ['admin-nova-assinatura', 'Nova assinatura', 'João assinou o Plano Ouro (R$ 49,90 por mês), em período de teste.'],
  ['admin-solicitacao-exclusao', 'Solicitação de exclusão de conta',
    'João (joao@exemplo.com) pediu a exclusão da conta em 10/11/2026 às 14:30. O titular foi informado de que receberá retorno.'],
  ['admin-conta-excluida', 'Conta excluída pelo titular',
    'Um compositor excluiu a própria conta (marca a1b2c3d4e5). Os dados pessoais foram eliminados, as obras saíram do ar e 2 pedido(s) em aberto foram encerrados com aviso aos intérpretes.'],
  ['interprete-pedido-recebido', 'Recebemos seu pedido de liberação da obra "Canção"',
    'Olá, Ana. Seu pedido de liberação da obra "Canção" foi entregue a João. Código da solicitação: 1A2B3C4D. O compositor vai entrar em contato.'],
  ['interprete-pedido-encerrado', 'Pedido de liberação da obra "Canção" encerrado',
    'Olá, Ana. O compositor da obra "Canção" encerrou a conta no Mercado do Compositor, e por isso seu pedido foi encerrado.'],
]

describe('templates de notificação do Resend', () => {
  it.each(samples)('%s cobre as variáveis do HTML publicado', (alias, subject, body) => {
    const resolved = resolveNotificationTemplate(subject, body)
    expect(resolved?.alias).toBe(alias)
    const variables = templateVariables(resolved!.variables, 'https://app/x')
    expect(new Set(Object.keys(variables))).toEqual(placeholders(alias))
  })

  it('todo template gerado tem um aviso que o usa', () => {
    const used = new Set([...samples.map(s => s[0]), ...['signup', 'recovery', 'invite', 'magiclink', 'email_change', 'reauthentication'].map(authTemplateAlias)])
    const files = readdirSync(dir).map(f => f.replace(/\.html$/, ''))
    expect(new Set(files)).toEqual(used)
  })

  it('extrai valores e formata o dinheiro', () => {
    expect(resolveNotificationTemplate('Assinatura ativada',
      'Seu Plano Prata está ativo em período de teste até 08/10/2026. O catálogo e os recursos do plano já estão liberados; a primeira cobrança de R$ 34,90 será feita no cartão ao fim do teste.')?.variables)
      .toEqual({ PLAN_NAME: 'Plano Prata', AMOUNT: 'R$ 34,90', NEXT_BILLING_DATE: '08/10/2026' })
    expect(resolveNotificationTemplate('Pagamento confirmado',
      'Recebemos o pagamento de R$ 49,90 do Plano Ouro (fatura #123). Seu plano está garantido até 10/11/2026.')?.variables)
      .toEqual({ AMOUNT: 'R$ 49,90', PLAN_NAME: 'Plano Ouro', INVOICE_ID: '123', NEXT_BILLING_DATE: '10/11/2026' })
  })

  it('escapa HTML vindo de usuários', () => {
    const { variables } = resolveNotificationTemplate('Nova solicitação de interesse',
      '<a href="x">Ana</a> demonstrou interesse na obra "Canção".')!
    expect(templateVariables(variables, 'https://app/x').BUYER_NAME).toBe('&lt;a href=&quot;x&quot;&gt;Ana&lt;/a&gt;')
  })

  it('volta ao HTML próprio quando o texto não casa com o template', () => {
    expect(resolveNotificationTemplate('Música rejeitada', 'A obra "Canção" foi rejeitada pela moderação.')).toBeNull()
    expect(resolveNotificationTemplate('Termo de liberação emitido',
      'O termo LIB-1 da obra "Canção" foi emitido. O e-mail do intérprete é inválido: corrija o contato.')).toBeNull()
    expect(resolveNotificationTemplate('Aviso desconhecido', 'Qualquer coisa')).toBeNull()
  })

  it('usa o template de acesso de cada tipo de e-mail de autenticação', () => {
    expect(authTemplateAlias('recovery')).toBe('auth-recuperar-senha')
    expect(authTemplateAlias('desconhecido')).toBe('auth-link-acesso')
    expect(new Set(Object.keys(templateVariables({ TOKEN: '123456' }, 'https://x')))).toEqual(placeholders('auth-recuperar-senha'))
  })
})
