import { createClient } from 'npm:@supabase/supabase-js@2'

// Recebe os erros que src/lib/monitoring.ts envia do navegador e grava em
// client_error_events. É pública (o navegador usa sendBeacon, sem cabeçalhos de
// autenticação), por isso limita tamanho e volume por origem e nunca devolve dados.
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}
const done = (status = 204) => new Response(null, { status, headers: cors })

const MAX_BODY_BYTES = 16 * 1024
const MAX_EVENTS_PER_HOUR = 60

const text = (value: unknown, max: number) => (typeof value === 'string' ? value : '').slice(0, max)

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return done()
  if (request.method !== 'POST') return done(405)
  const url = Deno.env.get('SUPABASE_URL'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !service) return done(500)

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return done(413)
  let event: Record<string, unknown>
  try { event = JSON.parse(raw) } catch { return done(400) }
  // Métricas de desempenho ('info') não são guardadas: só erros e avisos.
  if (!event || (event.level !== 'error' && event.level !== 'warning')) return done()
  const message = text(event.message, 500)
  if (!message) return done(400)

  const origin = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || 'unknown'
  const admin = createClient(url, service)
  const { data: allowed, error: limitError } = await admin.rpc('consume_rpc_rate_limit', {
    p_scope: 'client-telemetry', p_identity: origin, p_max_requests: MAX_EVENTS_PER_HOUR, p_window_seconds: 3600,
  })
  if (limitError) { console.error('[client-telemetry] limite', limitError); return done(500) }
  if (!allowed) return done(429)

  const context = event.context && typeof event.context === 'object' ? event.context : {}
  const { error } = await admin.from('client_error_events').insert({
    level: event.level,
    message,
    path: text(event.path, 300),
    release: text(event.release, 80),
    context: JSON.stringify(context).length > 8000 ? { truncated: true } : context,
    user_agent: text(request.headers.get('user-agent'), 300),
  })
  if (error) { console.error('[client-telemetry] gravação', error); return done(500) }
  return done()
})
