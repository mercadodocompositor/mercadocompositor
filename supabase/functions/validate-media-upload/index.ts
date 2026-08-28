import { createClient } from 'npm:@supabase/supabase-js@2'
import { fileTypeFromBuffer } from 'npm:file-type@19.6.0'
import { parseBuffer } from 'npm:music-metadata@10.9.1'

type TargetBucket = 'profile-media' | 'song-covers' | 'song-previews' | 'song-originals' | 'release-documents'

const rules: Record<TargetBucket, { maxBytes: number; kinds: string[]; maxDuration?: number }> = {
  'profile-media': { maxBytes: 5 * 1024 * 1024, kinds: ['jpg', 'png', 'webp'] },
  'song-covers': { maxBytes: 5 * 1024 * 1024, kinds: ['jpg', 'png', 'webp'] },
  'song-previews': { maxBytes: 10 * 1024 * 1024, kinds: ['mp3', 'm4a', 'aac', 'ogg'], maxDuration: 60.5 },
  'song-originals': { maxBytes: 25 * 1024 * 1024, kinds: ['mp3', 'wav', 'm4a', 'aac', 'ogg'] },
  'release-documents': { maxBytes: 10 * 1024 * 1024, kinds: ['pdf'] },
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
})

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('authorization')
  if (!supabaseUrl || !anonKey || !serviceKey || !authorization) return json({ error: 'unauthorized' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'invalid_session' }, 401)

  const admin = createClient(supabaseUrl, serviceKey)
  let path = ''
  try {
    const payload = await request.json() as { path?: string; targetBucket?: string }
    path = payload.path?.replace(/^\/+/, '') || ''
    const targetBucket = payload.targetBucket as TargetBucket
    const rule = rules[targetBucket]

    if (!rule || !path || path.split('/')[0] !== userData.user.id) {
      return json({ error: 'invalid_upload_target' }, 400)
    }

    const { data: file, error: downloadError } = await admin.storage.from('media-quarantine').download(path)
    if (downloadError || !file) return json({ error: 'quarantine_file_not_found' }, 404)
    if (file.size < 1 || file.size > rule.maxBytes) throw new Error('invalid_file_size')

    const bytes = new Uint8Array(await file.arrayBuffer())
    const detected = await fileTypeFromBuffer(bytes)
    if (!detected || !rule.kinds.includes(detected.ext)) throw new Error('invalid_file_content')

    let duration: number | undefined
    if (rule.maxDuration) {
      const metadata = await parseBuffer(bytes, { mimeType: detected.mime, size: bytes.byteLength }, { duration: true, skipCovers: true })
      duration = metadata.format.duration
      if (!duration || !Number.isFinite(duration) || duration > rule.maxDuration) throw new Error('invalid_preview_duration')
    }

    const finalExtension = detected.ext === 'jpg' ? 'jpg' : detected.ext
    const basePath = path.replace(/\.[^/.]+$/, '')
    const finalPath = `${basePath}.${finalExtension}`
    const { error: uploadError } = await admin.storage.from(targetBucket).upload(finalPath, bytes, {
      contentType: detected.mime,
      cacheControl: targetBucket === 'song-originals' || targetBucket === 'release-documents' ? '0' : '3600',
      upsert: false,
    })
    if (uploadError) throw new Error('validated_upload_failed')

    await admin.storage.from('media-quarantine').remove([path])

    const value = targetBucket === 'song-originals' || targetBucket === 'release-documents'
      ? finalPath
      : admin.storage.from(targetBucket).getPublicUrl(finalPath).data.publicUrl

    return json({ value, detectedType: detected.mime, size: bytes.byteLength, duration })
  } catch (error) {
    if (path) await admin.storage.from('media-quarantine').remove([path])
    const code = error instanceof Error ? error.message : 'validation_failed'
    const messages: Record<string, string> = {
      invalid_file_size: 'O arquivo excede o tamanho permitido.',
      invalid_file_content: 'O conteúdo real do arquivo não corresponde a um formato permitido.',
      invalid_preview_duration: 'A prévia deve ter duração máxima de 60 segundos.',
      validated_upload_failed: 'Não foi possível concluir o armazenamento do arquivo validado.',
    }
    console.error('Media validation error', code)
    return json({ error: code, message: messages[code] || 'Não foi possível validar o arquivo.' }, 422)
  }
})

