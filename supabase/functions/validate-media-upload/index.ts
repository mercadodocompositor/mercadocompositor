import { createClient } from 'npm:@supabase/supabase-js@2'
import { fileTypeFromBuffer } from 'npm:file-type@19.6.0'
import { parseBuffer } from 'npm:music-metadata@10.9.1'

type TargetBucket = 'profile-media' | 'song-covers' | 'song-previews' | 'song-originals' | 'release-documents'

const rules: Record<TargetBucket, { maxBytes: number; kinds: string[]; maxDuration?: number }> = {
  'profile-media': { maxBytes: 5 * 1024 * 1024, kinds: ['jpg', 'png', 'webp'] },
  'song-covers': { maxBytes: 5 * 1024 * 1024, kinds: ['jpg', 'png', 'webp'] },
  // O navegador recodifica a prévia com FFmpeg; o servidor mede novamente e
  // rejeita qualquer saída que ultrapasse 60 segundos.
  'song-previews': { maxBytes: 25 * 1024 * 1024, kinds: ['mp3'], maxDuration: 60 },
  'song-originals': { maxBytes: 25 * 1024 * 1024, kinds: ['mp3', 'wav', 'm4a', 'aac', 'ogg'] },
  'release-documents': { maxBytes: 10 * 1024 * 1024, kinds: ['pdf'] },
}

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
})

const sha256 = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
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
    const payload = await request.json() as { path?: string; targetBucket?: string; action?: string; mediaIds?: string[] }

    if (payload.action === 'cleanup-expired') {
      const { data: files, error: listError } = await admin.storage
        .from('media-quarantine')
        .list(userData.user.id, { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } })
      if (listError) throw new Error('quarantine_cleanup_failed')

      const expiresBefore = Date.now() - 24 * 60 * 60 * 1000
      const expiredPaths = (files || [])
        .filter(file => {
          const createdAt = file.created_at ? Date.parse(file.created_at) : Number.NaN
          return file.name && file.name !== '.emptyFolderPlaceholder' && Number.isFinite(createdAt) && createdAt < expiresBefore
        })
        .map(file => `${userData.user.id}/${file.name}`)

      if (expiredPaths.length === 0) return json({ removed: 0 })
      const { error: removeError } = await admin.storage.from('media-quarantine').remove(expiredPaths)
      if (removeError) throw new Error('quarantine_cleanup_failed')
      return json({ removed: expiredPaths.length })
    }

    if (payload.action === 'cleanup') {
      const mediaIds = Array.from(new Set((payload.mediaIds || []).filter(id => /^[0-9a-f-]{36}$/i.test(id)))).slice(0, 20)
      if (mediaIds.length === 0) return json({ removed: 0 })

      const { data: mediaRows, error: mediaError } = await admin
        .from('validated_media')
        .select('id, bucket_id, object_path')
        .eq('user_id', userData.user.id)
        .is('consumed_by_song_id', null)
        .in('id', mediaIds)
      if (mediaError) throw new Error('validated_media_cleanup_failed')

      const rows = mediaRows || []
      const byBucket = new Map<string, string[]>()
      for (const row of rows) {
        const paths = byBucket.get(row.bucket_id) || []
        paths.push(row.object_path)
        byBucket.set(row.bucket_id, paths)
      }
      for (const [bucket, paths] of byBucket) {
        const { error: removeError } = await admin.storage.from(bucket).remove(paths)
        if (removeError) throw new Error('validated_media_cleanup_failed')
      }
      if (rows.length > 0) {
        const { error: deleteError } = await admin.from('validated_media').delete().in('id', rows.map(row => row.id))
        if (deleteError) throw new Error('validated_media_cleanup_failed')
      }
      return json({ removed: rows.length })
    }

    path = payload.path?.replace(/^\/+/, '') || ''
    const targetBucket = payload.targetBucket as TargetBucket
    const rule = rules[targetBucket]

    if (!rule || !path || path.split('/')[0] !== userData.user.id) {
      return json({ error: 'invalid_upload_target' }, 400)
    }

    const requestedBasePath = path.replace(/\.[^/.]+$/, '')
    const { data: existingRows } = await admin
      .from('validated_media')
      .select('id, object_path, public_url, mime_type, size_bytes, duration_seconds')
      .eq('user_id', userData.user.id)
      .eq('bucket_id', targetBucket)
      .like('object_path', `${requestedBasePath}.%`)
      .is('consumed_by_song_id', null)
      .limit(1)
    const existing = existingRows?.[0]
    if (existing) {
      const value = targetBucket === 'song-originals' || targetBucket === 'release-documents'
        ? existing.object_path
        : existing.public_url
      return json({ value, mediaId: existing.id, detectedType: existing.mime_type, size: existing.size_bytes, duration: existing.duration_seconds })
    }

    const { data: file, error: downloadError } = await admin.storage.from('media-quarantine').download(path)
    if (downloadError || !file) return json({ error: 'quarantine_file_not_found' }, 404)
    if (file.size < 1) throw new Error('empty_file')
    if (file.size > rule.maxBytes) throw new Error('invalid_file_size')

    const bytes = new Uint8Array(await file.arrayBuffer())
    const detected = await fileTypeFromBuffer(bytes)
    if (!detected || !rule.kinds.includes(detected.ext)) throw new Error('invalid_file_content')

    let duration: number | undefined
    if (targetBucket === 'song-previews' || targetBucket === 'song-originals') {
      const metadata = await parseBuffer(bytes, { mimeType: detected.mime, size: bytes.byteLength }, { duration: true, skipCovers: true })
      duration = metadata.format.duration
      if (!duration || !Number.isFinite(duration)) throw new Error('invalid_audio_duration')
      if (rule.maxDuration && duration > rule.maxDuration) throw new Error('invalid_preview_duration')
    }

    // A prévia já chega recodificada pelo FFmpeg.wasm. Aqui a duração real é
    // verificada novamente antes da promoção; o servidor nunca corta frames.
    const finalBytes = bytes

    const finalExtension = detected.ext === 'jpg' ? 'jpg' : detected.ext
    const basePath = path.replace(/\.[^/.]+$/, '')
    const finalPath = `${basePath}.${finalExtension}`
    const { error: uploadError } = await admin.storage.from(targetBucket).upload(finalPath, finalBytes, {
      contentType: detected.mime,
      cacheControl: targetBucket === 'song-originals' || targetBucket === 'release-documents' ? '0' : '3600',
      upsert: false,
    })
    if (uploadError) {
      throw new Error('validated_upload_failed')
    }

    const value = targetBucket === 'song-originals' || targetBucket === 'release-documents'
      ? finalPath
      : admin.storage.from(targetBucket).getPublicUrl(finalPath).data.publicUrl
    const mediaId = crypto.randomUUID()
    const validationRows = [{
      id: mediaId,
      user_id: userData.user.id,
      bucket_id: targetBucket,
      object_path: finalPath,
      public_url: targetBucket === 'song-originals' || targetBucket === 'release-documents' ? null : value,
      mime_type: detected.mime,
      size_bytes: finalBytes.byteLength,
      duration_seconds: duration || null,
      sha256: await sha256(finalBytes),
    }]
    const { error: registryError } = await admin.from('validated_media').insert(validationRows)
    if (registryError) {
      await admin.storage.from(targetBucket).remove([finalPath])
      throw new Error('validated_media_registry_failed')
    }

    await admin.storage.from('media-quarantine').remove([path])

    return json({ value, mediaId, detectedType: detected.mime, size: finalBytes.byteLength, duration: duration || null })
  } catch (error) {
    if (path) await admin.storage.from('media-quarantine').remove([path])
    const code = error instanceof Error ? error.message : 'validation_failed'
    const messages: Record<string, string> = {
      empty_file: 'O arquivo está vazio. Selecione outro arquivo e tente novamente.',
      invalid_file_size: 'O arquivo ultrapassa o limite permitido para este tipo de mídia. Selecione um arquivo menor.',
      invalid_file_content: 'O formato real do arquivo não é aceito. Verifique o formato e selecione outro arquivo.',
      invalid_preview_duration: 'A prévia ultrapassa 60 segundos. Ajuste o trecho e tente novamente.',
      invalid_audio_duration: 'Não conseguimos identificar a duração do áudio. Verifique o arquivo e tente novamente.',
      validated_upload_failed: 'Não foi possível concluir o envio. Tente novamente em alguns instantes.',
      validated_media_registry_failed: 'O arquivo foi validado, mas não conseguimos concluir o registro. Tente enviá-lo novamente.',
      validated_media_cleanup_failed: 'Não foi possível concluir a limpeza dos arquivos enviados.',
      quarantine_cleanup_failed: 'Não foi possível concluir a limpeza dos arquivos temporários expirados.',
    }
    console.error('Media validation error', code)
    return json({ error: code, message: messages[code] || 'Não foi possível validar o arquivo.' }, 422)
  }
})
