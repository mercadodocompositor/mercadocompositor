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
// Para ouvir na página o link precisa durar a faixa inteira, inclusive avanços.
const STREAM_URL_SECONDS = 1800

const ACTIONS = ['info', 'audio', 'stream', 'lyrics', 'document', 'notify_composer'] as const
type Action = typeof ACTIONS[number]

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return json({})
  if (req.method !== 'POST') return json({ message: 'Método não permitido.' }, 405)
  const url = Deno.env.get('SUPABASE_URL'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !service) return json({ message: 'Serviço não configurado.' }, 500)

  const body = await req.json().catch(() => ({})) as { token?: unknown; action?: unknown }
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const action: Action = ACTIONS.includes(body.action as Action) ? body.action as Action : 'info'
  const notFound = { message: 'Este link de entrega não é mais válido.', reason: 'not_found' }
  if (!/^[a-f0-9]{64}$/.test(token)) return json(notFound, 404)

  const admin = createClient(url, service)
  const { data: delivery, error } = await admin
    .from('release_deliveries')
    .select('id, lyrics, audio_path, expires_at, release_id, releases(document_code, song_title, authors, iswc, interpreter_name, composer_name, buyer_name, issue_date, release_type, authorized_purpose, agreed_value, songs(original_audio_path))')
    .eq('token_hash', await sha256Hex(token))
    .maybeSingle()
  if (error) {
    console.error('[release-delivery] consulta', error)
    return json({ message: 'Não foi possível abrir a entrega. Tente novamente.' }, 500)
  }
  if (!delivery) return json(notFound, 404)

  // deno-lint-ignore no-explicit-any
  const release = (delivery as any).releases
  const composerName = release?.composer_name || 'o compositor'
  // O áudio congelado na emissão prevalece; entregas antigas caem no atual da obra.
  const audioPath: string | null = delivery.audio_path || release?.songs?.original_audio_path || null

  // O aviso ao compositor é justamente a saída para link expirado ou sem áudio.
  if (action === 'notify_composer') {
    const expired = new Date(delivery.expires_at).getTime() < Date.now()
    if (!expired && audioPath) return json({ message: 'A entrega está disponível; não há o que avisar.' }, 409)
    const { data: notified, error: notifyError } = await admin.rpc('notify_composer_about_delivery', {
      p_delivery_id: delivery.id, p_reason: expired ? 'expired' : 'audio_missing',
    })
    if (notifyError) {
      console.error('[release-delivery] aviso ao compositor', notifyError)
      return json({ message: 'Não foi possível avisar o compositor. Tente novamente.' }, 500)
    }
    return json({ notified: Boolean(notified), composerName })
  }

  if (new Date(delivery.expires_at).getTime() < Date.now()) {
    return json({
      message: `Este link de entrega expirou em ${new Date(delivery.expires_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`,
      expired: true,
      reason: 'expired',
      composerName,
    }, 410)
  }

  if (action === 'audio' || action === 'stream') {
    if (!audioPath) return json({ message: 'A música completa não está disponível.', reason: 'audio_missing' }, 409)
    const extension = audioPath.split('.').pop()?.toLowerCase() || 'mp3'
    const { data: signed, error: signError } = await admin.storage
      .from('song-originals')
      .createSignedUrl(
        audioPath,
        action === 'audio' ? SIGNED_URL_SECONDS : STREAM_URL_SECONDS,
        action === 'audio' ? { download: `${fileSlug(release.song_title)}.${extension}` } : undefined,
      )
    if (signError || !signed?.signedUrl) {
      console.error('[release-delivery] link assinado', signError)
      return json({ message: 'Não foi possível preparar a música. Tente novamente.' }, 500)
    }
    // Ouvir na página não conta como download.
    if (action === 'audio') await admin.rpc('register_release_delivery_access', { p_delivery_id: delivery.id, p_kind: 'audio' })
    return json({ url: signed.signedUrl })
  }

  // O cliente é parte do termo: recebe a via completa (documentos por extenso,
  // valor e condições), não a cópia mascarada da validação pública.
  if (action === 'document') {
    const { data: term, error: termError } = await admin
      .from('releases')
      .select('id, song_title, authors, iswc, interpreter_name, composer_name, composer_cpf, composer_city_state, buyer_name, buyer_document, buyer_city_state, agreed_value, authorized_purpose, release_type, issue_date, expires_at, additional_conditions, digital_signature, document_code, document_path, document_hash')
      .eq('id', delivery.release_id)
      .maybeSingle()
    if (termError || !term) {
      console.error('[release-delivery] termo', termError)
      return json({ message: 'Não foi possível preparar o termo. Tente novamente.' }, 500)
    }
    await admin.rpc('register_release_delivery_access', { p_delivery_id: delivery.id, p_kind: 'document' })
    // Preferência pela via arquivada na emissão: é o mesmo arquivo (e hash) do compositor.
    if (term.document_path) {
      const { data: signed, error: signError } = await admin.storage
        .from('release-documents')
        .createSignedUrl(term.document_path, SIGNED_URL_SECONDS)
      if (!signError && signed?.signedUrl) {
        return json({ kind: 'archived', url: signed.signedUrl, hash: term.document_hash || null, documentCode: term.document_code })
      }
      console.error('[release-delivery] termo arquivado', signError)
    }
    const { document_path: _path, document_hash: _hash, ...releaseData } = term
    return json({ kind: 'generated', release: releaseData })
  }

  await admin.rpc('register_release_delivery_access', { p_delivery_id: delivery.id, p_kind: action === 'lyrics' ? 'lyrics' : 'view' })
  if (action === 'lyrics') return json({ ok: true })

  let audio: { format: string; sizeBytes: number | null; durationSeconds: number | null } | null = null
  if (audioPath) {
    const { data: media } = await admin
      .from('validated_media')
      .select('size_bytes, duration_seconds')
      .eq('bucket_id', 'song-originals')
      .eq('object_path', audioPath)
      .maybeSingle()
    audio = {
      format: (audioPath.split('.').pop() || 'mp3').toUpperCase(),
      sizeBytes: media?.size_bytes ? Number(media.size_bytes) : null,
      durationSeconds: media?.duration_seconds ? Number(media.duration_seconds) : null,
    }
  }

  return json({
    songTitle: release.song_title,
    authors: release.authors,
    iswc: release.iswc || '',
    interpreterName: release.interpreter_name || '',
    composerName: release.composer_name,
    buyerName: release.buyer_name,
    documentCode: release.document_code,
    issueDate: release.issue_date,
    releaseType: release.release_type,
    authorizedPurpose: release.authorized_purpose || '',
    agreedValue: release.agreed_value === null ? null : Number(release.agreed_value),
    lyrics: delivery.lyrics,
    hasAudio: Boolean(audioPath),
    audio,
    expiresAt: delivery.expires_at,
  })
})
