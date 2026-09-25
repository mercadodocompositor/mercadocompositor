import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8' },
})
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]!))

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const cronSecret = Deno.env.get('NOTIFICATION_CRON_SECRET')
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) return json({ error: 'unauthorized' }, 401)
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY'), sender = Deno.env.get('NOTIFICATION_EMAIL_FROM') || Deno.env.get('AUTH_EMAIL_FROM')
  const appUrl = (Deno.env.get('APP_URL') || 'https://mercadodocompositor.com.br').replace(/\/$/, '')
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
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: sender, to: [job.recipient], subject: job.subject,
          html: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#060b18;font-family:Arial,sans-serif;color:#e2e8f0"><table width="100%" role="presentation" style="padding:32px 16px"><tr><td align="center"><table width="100%" role="presentation" style="max-width:560px;background:#0a1128;border:1px solid #263147;border-radius:20px"><tr><td style="padding:34px"><p style="color:#fbbf24;font-size:12px;font-weight:bold;letter-spacing:2px">MERCADO DO COMPOSITOR</p><h1 style="color:#fff;font-size:24px">${escapeHtml(job.subject)}</h1><p style="color:#cbd5e1;line-height:1.6">${escapeHtml(job.body)}</p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#f59e0b;color:#111827;text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:12px">${actionLabel}</a><p style="margin-top:26px;color:#64748b;font-size:12px">${footer}</p></td></tr></table></td></tr></table></body></html>` }),
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
