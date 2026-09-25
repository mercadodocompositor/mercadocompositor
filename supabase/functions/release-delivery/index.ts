import { createClient } from 'npm:@supabase/supabase-js@2'

// Página pública de entrega (/entrega/<token>): o cliente não tem conta, então
// o token é a única credencial. No banco fica só o SHA-256 dele.
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
  },
})

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

const fileSlug = (title: string) => title.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 80) || 'musica'

// O link assinado vale pouco: quem receber o endereço do arquivo depois não baixa.
const SIGNED_URL_SECONDS = 300

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return json({})
  if (req.method !== 'POST') return json({ message: 'Método não permitido.' }, 405)
  const url = Deno.env.get('SUPABASE_URL'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !service) return json({ message: 'Serviço não configurado.' }, 500)

  const body = await req.json().catch(() => ({})) as { token?: unknown; action?: unknown }
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const action = body.action === 'audio' || body.action === 'lyrics' ? body.action : 'info'
  if (!/^[a-f0-9]{64}$/.test(token)) return json({ message: 'Link de entrega inválido.' }, 404)

  const admin = createClient(url, service)
  const { data: delivery, error } = await admin
    .from('release_deliveries')
    .select('id, lyrics, expires_at, release_id, releases(document_code, song_id, song_title, authors, composer_name, buyer_name, issue_date, release_type, songs(original_audio_path))')
    .eq('token_hash', await sha256Hex(token))
    .maybeSingle()
  if (error) {
    console.error('[release-delivery] consulta', error)
    return json({ message: 'Não foi possível abrir a entrega. Tente novamente.' }, 500)
  }
  if (!delivery) return json({ message: 'Link de entrega inválido ou substituído por um mais recente.' }, 404)

  // deno-lint-ignore no-explicit-any
  const release = (delivery as any).releases
  if (new Date(delivery.expires_at).getTime() < Date.now()) {
    return json({
      message: `Este link de entrega expirou. Peça um novo a ${release?.composer_name || 'o compositor'}.`,
      expired: true,
    }, 410)
  }

  const audioPath: string | null = release?.songs?.original_audio_path || null

  if (action === 'audio') {
    if (!audioPath) return json({ message: 'A música completa ainda não está disponível. Fale com o compositor.' }, 409)
    const extension = audioPath.split('.').pop()?.toLowerCase() || 'mp3'
    const { data: signed, error: signError } = await admin.storage
      .from('song-originals')
      .createSignedUrl(audioPath, SIGNED_URL_SECONDS, { download: `${fileSlug(release.song_title)}.${extension}` })
    if (signError || !signed?.signedUrl) {
      console.error('[release-delivery] link assinado', signError)
      return json({ message: 'Não foi possível preparar o download. Tente novamente.' }, 500)
    }
    await admin.rpc('register_release_delivery_access', { p_delivery_id: delivery.id, p_kind: 'audio' })
    return json({ url: signed.signedUrl, expiresInSeconds: SIGNED_URL_SECONDS })
  }

  await admin.rpc('register_release_delivery_access', { p_delivery_id: delivery.id, p_kind: action === 'lyrics' ? 'lyrics' : 'view' })
  if (action === 'lyrics') return json({ ok: true })

  return json({
    songTitle: release.song_title,
    authors: release.authors,
    composerName: release.composer_name,
    buyerName: release.buyer_name,
    documentCode: release.document_code,
    issueDate: release.issue_date,
    releaseType: release.release_type,
    lyrics: delivery.lyrics,
    hasAudio: Boolean(audioPath),
    expiresAt: delivery.expires_at,
  })
})
