import { createClient } from 'npm:@supabase/supabase-js@2'
import { escapeHtml, renderBrandedEmail } from '../_shared/email-template.ts'
import { releaseTemplateVariables } from '../_shared/release-email.ts'
import { resolveNotificationTemplate, templatesEnabled, templateVariables } from '../_shared/notification-templates.ts'

const escapeVariables = (variables: Record<string, string>) =>
  Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, escapeHtml(value)]))

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8' },
})
Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const cronSecret = Deno.env.get('NOTIFICATION_CRON_SECRET')
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) return json({ error: 'unauthorized' }, 401)
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY'), sender = Deno.env.get('NOTIFICATION_EMAIL_FROM') || Deno.env.get('AUTH_EMAIL_FROM')
  const appUrl = (Deno.env.get('APP_URL') || 'https://mercadodocompositor.com.br').replace(/\/$/, '')
  const releaseTemplateId = Deno.env.get('RESEND_RELEASE_DELIVERY_TEMPLATE_ID')?.trim()
  const useTemplates = templatesEnabled(Deno.env.get('RESEND_USE_TEMPLATES'))
  if (!url || !key || !resendKey || !sender) return json({ error: 'missing_server_configuration' }, 500)
  const admin = createClient(url, key)
  const { data: jobs, error } = await admin.rpc('claim_notification_email_jobs', { p_limit: 25 })
  if (error) return json({ error: error.message }, 500)
  let sent = 0, failed = 0
  for (const job of jobs || []) {
    try {
      const actionUrl = job.action_url ? `${appUrl}${job.action_url}` : `${appUrl}/dashboard`
      const actionLabel = job.action_url?.startsWith('/entrega/') ? 'Baixar termo, música e letra'
        : job.action_url?.startsWith('/validar/') ? 'Baixar cópia e validar termo'
        : job.audience === 'buyer' ? 'Conhecer outras obras' : 'Acessar painel'
      // O intérprete não tem conta: o rodapé não pode falar em painel ou preferências.
      const footer = job.audience === 'buyer'
        ? 'Você recebeu este e-mail porque solicitou a liberação desta obra pelo Mercado do Compositor.'
        : 'Mensagem transacional da sua conta. Preferências de propostas podem ser alteradas no painel.'
      let email: Record<string, unknown> = { from: sender, to: [job.recipient], subject: job.subject,
        html: renderBrandedEmail({ preheader: job.subject, eyebrow: job.audience === 'buyer' ? 'Sua solicitação' : 'Atualização da sua conta', title: job.subject, body: job.body, actionUrl, actionLabel, footer }) }
      if (releaseTemplateId && job.delivery_id && job.action_url?.startsWith('/entrega/')) {
        const { data: delivery, error: deliveryError } = await admin.from('release_deliveries')
          .select('release_id').eq('id', job.delivery_id).single()
        if (deliveryError || !delivery) throw deliveryError || new Error('Entrega não encontrada')
        const { data: release, error: releaseError } = await admin.from('releases')
          .select('buyer_name,composer_name,song_title,document_code,agreed_value')
          .eq('id', delivery.release_id).single()
        if (releaseError || !release) throw releaseError || new Error('Termo não encontrado')
        email = { from: sender, to: [job.recipient], subject: job.subject, template: {
          id: releaseTemplateId, variables: escapeVariables(releaseTemplateVariables(release, actionUrl)),
        } }
      } else if (useTemplates) {
        const resolved = resolveNotificationTemplate(job.subject, job.body)
        if (resolved) email = { from: sender, to: [job.recipient], subject: job.subject, template: {
          id: resolved.alias, variables: templateVariables(resolved.variables, actionUrl),
        } }
      }
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(email),
      })
      if (!response.ok) throw new Error(`Resend ${response.status}: ${(await response.text()).slice(0,300)}`)
      const provider = await response.json().catch(() => ({}))
      const sentAt = new Date().toISOString()
      const { error: outboxError } = await admin.from('notification_email_outbox').update({ status:'sent',sent_at:sentAt,updated_at:sentAt,provider_message_id:provider.id || null,last_error:null }).eq('id',job.id)
      if (outboxError) throw outboxError
      sent++
    } catch (err) {
      const terminal = job.attempts >= 5
      const failureStatus = terminal ? 'failed' : 'retry'
      const failureMessage = String(err).slice(0,500)
      await admin.from('notification_email_outbox').update({ status:failureStatus,updated_at:new Date().toISOString(),next_attempt_at:new Date(Date.now()+Math.min(3600,60*Math.pow(2,job.attempts))*1000).toISOString(),last_error:failureMessage }).eq('id',job.id)
      failed++
    }
  }
  return json({ claimed:(jobs||[]).length,sent,failed })
})
