import { Webhook } from 'npm:standardwebhooks@1.0.0'
import { renderBrandedEmail } from '../_shared/email-template.ts'
import { authTemplateAlias, templatesEnabled, templateVariables } from '../_shared/notification-templates.ts'

type EmailAction = 'signup' | 'recovery' | 'invite' | 'magiclink' | 'email_change' | 'reauthentication'
type HookPayload = {
  user: { email?: string; new_email?: string }
  email_data: {
    token: string
    token_new?: string
    token_hash: string
    token_hash_new?: string
    redirect_to: string
    email_action_type: EmailAction
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
})

const content: Record<EmailAction, { subject: string; title: string; message: string; button: string }> = {
  signup: { subject: 'Confirme sua conta', title: 'Confirme seu cadastro', message: 'Clique no botão para confirmar seu e-mail e ativar sua conta de compositor.', button: 'Confirmar minha conta' },
  recovery: { subject: 'Recuperação de senha', title: 'Crie uma nova senha', message: 'Recebemos uma solicitação para redefinir a senha da sua conta.', button: 'Redefinir minha senha' },
  invite: { subject: 'Você recebeu um convite', title: 'Bem-vindo ao Mercado do Compositor', message: 'Você foi convidado para acessar a plataforma.', button: 'Aceitar convite' },
  magiclink: { subject: 'Seu link de acesso', title: 'Acesse sua conta', message: 'Use o botão abaixo para entrar com segurança.', button: 'Entrar na plataforma' },
  email_change: { subject: 'Confirme seu novo e-mail', title: 'Alteração de e-mail', message: 'Confirme o novo endereço de e-mail da sua conta.', button: 'Confirmar novo e-mail' },
  reauthentication: { subject: 'Código de segurança', title: 'Confirme sua identidade', message: 'Use o código abaixo para confirmar esta operação.', button: 'Confirmar identidade' },
}

const renderEmail = (action: EmailAction, verificationUrl: string, token: string) => {
  const copy = content[action] ?? content.magiclink
  return {
    subject: copy.subject,
    html: renderBrandedEmail({ preheader: copy.subject, eyebrow: 'Acesso seguro', title: copy.title, body: copy.message, actionUrl: verificationUrl, actionLabel: copy.button, code: token, footer: 'Se você não solicitou esta mensagem, ignore este e-mail. Nunca compartilhe seu código de segurança.' }),
  }
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const rawHookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')
  const sender = Deno.env.get('AUTH_EMAIL_FROM')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!resendKey || !rawHookSecret || !sender || !supabaseUrl) return json({ error: 'missing_server_configuration' }, 500)
  const useTemplates = templatesEnabled(Deno.env.get('RESEND_USE_TEMPLATES'))

  try {
    const body = await request.text()
    const secret = rawHookSecret.replace(/^v1,whsec_/, '')
    const payload = new Webhook(secret).verify(body, Object.fromEntries(request.headers)) as HookPayload
    const { user, email_data: email } = payload
    const deliveries: Array<{ recipient: string; token: string; tokenHash: string }> = []
    if (email.email_action_type === 'email_change') {
      // Os nomes dos hashes são invertidos por compatibilidade no payload do Supabase.
      if (user.email && email.token_hash_new) deliveries.push({ recipient: user.email, token: email.token, tokenHash: email.token_hash_new })
      if (user.new_email && email.token_hash) deliveries.push({ recipient: user.new_email, token: email.token_new || email.token, tokenHash: email.token_hash })
    } else if (user.email) deliveries.push({ recipient: user.email, token: email.token, tokenHash: email.token_hash })
    if (!deliveries.length) return json({ error: 'missing_recipient' }, 400)

    for (const delivery of deliveries) {
      const verificationUrl = `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(delivery.tokenHash)}&type=${encodeURIComponent(email.email_action_type)}&redirect_to=${encodeURIComponent(email.redirect_to)}`
      const rendered = renderEmail(email.email_action_type, verificationUrl, delivery.token)
      const payload = useTemplates
        ? { from: sender, to: [delivery.recipient], subject: rendered.subject, template: {
            id: authTemplateAlias(email.email_action_type),
            variables: templateVariables({ TOKEN: delivery.token }, verificationUrl),
          } }
        : { from: sender, to: [delivery.recipient], subject: rendered.subject, html: rendered.html }
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        console.error('Resend error', response.status, await response.text())
        return json({ error: { http_code: response.status, message: 'email_provider_error' } }, 502)
      }
    }
    return json({})
  } catch (error) {
    console.error('Send email hook error', error instanceof Error ? error.message : error)
    return json({ error: { http_code: 401, message: 'invalid_hook_signature' } }, 401)
  }
})
