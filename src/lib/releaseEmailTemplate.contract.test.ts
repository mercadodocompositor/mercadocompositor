import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { releaseTemplateVariables } from '../../supabase/functions/_shared/release-email'

const html = readFileSync('supabase/resend/termo-liberacao-entrega.html', 'utf8')
const worker = readFileSync('supabase/functions/process-notification-emails/index.ts', 'utf8')

describe('template de entrega do termo', () => {
  it('fornece todas as variáveis usadas pelo HTML e formata o valor em reais', () => {
    const variables = releaseTemplateVariables({
      buyer_name: ' Ana ', composer_name: 'João', song_title: 'Canção',
      document_code: 'LIB-2026-123', agreed_value: 500,
    }, 'https://example.com/entrega/token')
    const placeholders = [...html.matchAll(/{{{([A-Z_]+)}}}/g)].map(match => match[1])
    expect(new Set(placeholders)).toEqual(new Set(Object.keys(variables)))
    expect(variables.AGREED_VALUE).toBe('R$ 500,00')
    expect(variables.DELIVERY_URL).toBe('https://example.com/entrega/token')
    expect(variables.BUYER_NAME).toBe('Ana')
  })

  it('seleciona o template apenas para o link de entrega', () => {
    expect(worker).toContain("job.delivery_id && job.action_url?.startsWith('/entrega/')")
    expect(worker).toContain('releaseTemplateVariables(release, actionUrl)')
  })
})
