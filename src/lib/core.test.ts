import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { getRequestCode } from './identifiers';
import { getSongSaveStatus, getSongToggleStatus } from './songWorkflow';
import { getInterestRequestUrl, getSongUrlKey, slugify } from './urls';

/** O perfil do compositor é dividido em ProfileTab + componentes em dashboard/profile. */
const readProfileFeatureSources = () => {
  const dir = 'src/pages/dashboard/profile';
  return [
    readFileSync('src/pages/dashboard/ProfileTab.tsx', 'utf8'),
    ...readdirSync(dir)
      .filter(name => /\.tsx?$/.test(name) && !name.includes('.test.'))
      .map(name => readFileSync(`${dir}/${name}`, 'utf8'))
  ].join('\n');
};

describe('URLs públicas', () => {
  const song = { id: 'f01b79cf-ac57-470b-87e7-560dcc2c1d92', title: 'Canção do Coração!' };
  it('remove acentos e caracteres inseguros', () => expect(slugify(' Canção do Coração! ')).toBe('cancao-do-coracao'));
  it('gera uma chave amigável e única', () => expect(getSongUrlKey(song)).toBe('cancao-do-coracao-f01b79cf'));
  it('gera a rota de interesse completa', () => expect(getInterestRequestUrl('mercado', song)).toBe('/compositor/mercado/musica/cancao-do-coracao-f01b79cf/interesse'));
});

describe('Código da solicitação', () => {
  it('usa o primeiro bloco do UUID em maiúsculas', () => expect(getRequestCode('bdada5f8-ac57-470b-87e7-560dcc2c1d92')).toBe('BDADA5F8'));
});

describe('Fluxo de moderação', () => {
  it('envia música nova para aprovação', () => expect(getSongSaveStatus('published', undefined, true, false)).toBe('pending_approval'));
  it('publica diretamente sem moderação', () => expect(getSongSaveStatus('published', undefined, false, false)).toBe('published'));
  it('permite publicação direta pelo administrador', () => expect(getSongSaveStatus('published', undefined, true, true)).toBe('published'));
  it('reenvia para aprovação uma obra publicada que foi editada', () => expect(getSongSaveStatus('published', 'published', true, false)).toBe('pending_approval'));
  it('mantém publicada uma obra editada pelo administrador', () => expect(getSongSaveStatus('published', 'published', true, true)).toBe('published'));
  it('cancela uma análise', () => expect(getSongToggleStatus('pending_approval', true, false)).toBe('draft'));
  it('reenvia uma música rejeitada', () => expect(getSongToggleStatus('rejected', true, false)).toBe('pending_approval'));
});

describe('Proteção do áudio original', () => {
  it('a função de catálogo público não projeta campos do original', () => {
    const schema = readFileSync('supabase/schema.sql', 'utf8');
    const publicFunction = schema.split('create or replace function public.get_public_composer')[1]?.split('grant execute on function public.get_public_composer')[0] || '';
    expect(publicFunction).not.toMatch(/original_audio_path|song-originals|'audioUrl'/i);
    expect(publicFunction).toMatch(/previewAudioUrl/);
  });

  it('o bucket de originais é explicitamente privado', () => {
    const securitySql = readFileSync('supabase/music_security.sql', 'utf8');
    expect(securitySql).toMatch(/set public = false[\s\S]*song-originals/i);
    expect(securitySql).toMatch(/song originals owner read/);
  });
});

describe('Proteção de campos administrativos', () => {
  const schema = readFileSync('supabase/schema.sql', 'utf8');

  it('não concede aos autenticados update dos campos administrativos', () => {
    expect(schema).toContain('revoke update on table public.profiles from anon, authenticated');
    expect(schema).toContain('revoke insert, update on table public.songs from anon, authenticated');
    const profileGrant = schema.match(/grant update \(([\s\S]*?)\) on table public\.profiles to authenticated/)?.[1] || '';
    const songGrant = schema.match(/grant update \(([\s\S]*?)\) on table public\.songs to authenticated/)?.[1] || '';
    expect(profileGrant).not.toMatch(/\b(is_verified|views_count)\b/);
    expect(profileGrant).toMatch(/\bsociety\b/);
    expect(profileGrant).toMatch(/\bspotify\b/);
    expect(songGrant).not.toMatch(/\b(is_featured|play_count|interested_count)\b/);
  });

  it('exige privilégio administrativo nas RPCs de campos protegidos', () => {
    const verifiedRpc = schema.split('create or replace function public.admin_set_profile_verified')[1]?.split('create or replace function public.admin_set_song_featured')[0] || '';
    const featuredRpc = schema.split('create or replace function public.admin_set_song_featured')[1]?.split('create or replace function public.handle_new_user')[0] || '';
    expect(verifiedRpc).toContain('if not public.is_admin()');
    expect(featuredRpc).toContain('if not public.is_admin()');
  });
});

describe('Emissão oficial de liberações', () => {
  const schema = readFileSync('supabase/schema.sql', 'utf8');

  it('bloqueia escrita direta e exige a RPC transacional', () => {
    expect(schema).toContain('revoke insert, update, delete on table public.releases from anon, authenticated');
    const rpc = schema.split('create or replace function public.issue_release')[1]?.split('create or replace function public.handle_new_user')[0] || '';
    expect(rpc).toContain("request_row.status <> 'pagamento_confirmado'");
    expect(rpc).toContain("set status = 'liberacao_enviada'");
    expect(schema).toContain('public.issue_release(uuid, text, text, text, boolean)');
    expect(schema).toContain('revoke execute on function public.issue_release(uuid, text, text, text, boolean) from public, anon');
    expect(rpc).toContain('for update');
  });

  it('gera identidade e dados oficiais no banco', () => {
    const rpc = schema.split('create or replace function public.issue_release')[1]?.split('create or replace function public.handle_new_user')[0] || '';
    expect(rpc).toContain('release_id uuid := gen_random_uuid()');
    expect(rpc).toContain("extract(year from current_date)");
    expect(rpc).toContain('request_row.agreed_value');
    expect(rpc).toContain('private_row.cpf');
  });

  it('protege a exclusividade entre solicitações diferentes da mesma obra', () => {
    expect(schema).toContain('function public.is_exclusive_release');
    expect(schema).toContain('Esta obra já possui uma liberação com cláusula de exclusividade emitida para outro interessado.');
    expect(schema).toContain('Não é possível conceder exclusividade para uma obra que já possui outras liberações emitidas.');
  });
});

describe('Validador público de documentos', () => {
  const schema = readFileSync('supabase/schema.sql', 'utf8');
  const rpc = schema.split('create or replace function public.validate_release_document')[1]?.split('create or replace function public.handle_new_user')[0] || '';

  it('permite consulta anônima somente pelo código oficial', () => {
    expect(schema).toContain('grant execute on function public.validate_release_document(text) to anon, authenticated');
    expect(rpc).toContain("normalized_code !~ '^LIB-[0-9]{4}-[A-Z0-9]+$'");
    expect(rpc).toContain('where document_code = normalized_code');
  });

  it('não expõe documentos pessoais completos', () => {
    expect(rpc).toContain("'composerDocumentLast4'");
    expect(rpc).toContain("'buyerDocumentLast4'");
    expect(rpc).not.toContain("'composerCpf'");
    expect(rpc).not.toContain("'buyerDocument'");
  });
});

describe('Limites dos planos', () => {
  const schema = readFileSync('supabase/schema.sql', 'utf8');
  const hardening = readFileSync('supabase/production_hardening.sql', 'utf8');
  const approval = readFileSync('supabase/approval_workflow.sql', 'utf8');

  it('mantém Bronze, Prata e Ouro alinhados com o catálogo', () => {
    expect(schema).toMatch(/'Plano Bronze',24\.90,100/);
    expect(schema).toMatch(/'Plano Prata',34\.90,200/);
    expect(schema).toMatch(/'Plano Ouro',54\.90,null/);
  });

  it('aplica o limite da assinatura e interpreta null como ilimitado', () => {
    for (const sql of [hardening, approval]) {
      expect(sql).toContain('join public.subscription_plans sp on sp.name = sub.plan_name');
      expect(sql).toContain('max_songs is not null and current_song_count >= max_songs');
    }
  });

  it('recusa troca de plano sem confirmação financeira', () => {
    const rpc = schema.split('create or replace function public.update_my_subscription')[1]?.split('revoke execute on function public.update_my_subscription')[0] || '';
    expect(rpc).toContain('Alterações de assinatura exigem confirmação do provedor de pagamento');
  });
});

describe('Autoridade financeira', () => {
  const schema = readFileSync('supabase/schema.sql', 'utf8');

  it('inicia novas contas como pendentes e preserva as existentes', () => {
    expect(schema).toContain("status text not null default 'pending'");
    expect(schema).toContain("alter column status set default 'pending'");
    expect(schema).not.toMatch(/update public\.subscriptions\s+set status = 'active'/);
  });

  it('não permite que o cliente altere dados financeiros', () => {
    expect(schema).toContain('revoke execute on function public.update_my_subscription(text,text,text,text) from authenticated');
    expect(schema).not.toContain('grant execute on function public.update_my_subscription(text,text,text,text) to authenticated');
  });
});

describe('Reaprovação de músicas publicadas', () => {
  const approval = readFileSync('supabase/approval_workflow.sql', 'utf8');

  it('bloqueia alterações materiais que tentem permanecer publicadas', () => {
    expect(approval).toContain("old.status = 'published'");
    expect(approval).toContain("new.status = 'published'");
    expect(approval).toContain('is distinct from');
    expect(approval).toContain('exigem nova aprovação');
    expect(approval).toContain('pending_approval');
  });
});

describe('Imutabilidade das solicitações de interesse', () => {
  const schema = readFileSync('supabase/schema.sql', 'utf8');

  it('obriga a criação pela RPC e limita as colunas atualizáveis', () => {
    expect(schema).toContain('revoke insert, update on table public.interest_requests from anon, authenticated');
    expect(schema).toContain('grant update (status, agreed_value, notes, payment_received_at)');
    expect(schema).not.toContain('create policy "requests public create"');
  });

  it('preserva identidade, contato e declarações originais', () => {
    const trigger = schema.split('create or replace function public.preserve_interest_request_identity')[1]?.split('drop trigger if exists preserve_interest_request_identity')[0] || '';
    for (const field of ['buyer_name','cpf_cnpj','buyer_email','buyer_whatsapp','purpose','message']) {
      expect(trigger).toContain(`new.${field}`);
      expect(trigger).toContain(`old.${field}`);
    }
    expect(trigger).toContain('is distinct from');
  });
});

describe('Proteção das RPCs públicas contra abuso', () => {
  const schema = readFileSync('supabase/schema.sql', 'utf8');

  it('valida e limita solicitações por interessado e origem', () => {
    const rpc = schema.split('create or replace function public.create_interest_request')[1]?.split('grant execute on function public.create_interest_request')[0] || '';
    expect(rpc).toContain("'interest-person-'||p_song_id");
    expect(rpc).toContain("'interest-origin'");
    expect(rpc).toContain('length(document_digits) not in (11,14)');
    expect(rpc).toContain("length(btrim(coalesce(p_data->>'message',''))) not between 20 and 3000");
  });

  it('deduplica reproduções por música durante trinta minutos', () => {
    const rpc = schema.split('create or replace function public.increment_song_play(p_song_id uuid,p_visitor_id text)')[1]?.split('revoke execute on function public.increment_song_play(uuid,text)')[0] || '';
    expect(rpc).toContain("'song-play-'||p_song_id");
    expect(rpc).toContain(',1,1800');
    expect(schema).toContain('revoke execute on function public.increment_song_play(uuid) from public,anon,authenticated');
  });
});

describe('Consistência das mutações no cliente', () => {
  const context = readFileSync('src/context/AppContext.tsx', 'utf8');

  it('persiste perfil e configurações antes de alterar o estado', () => {
    expect(context).toMatch(/await saveProfile\(userId,next\);\s*setProfile\(next\)/);
    expect(context).toMatch(/saved=await savePlatformSettings\(next,newPixKey\);[\s\S]*?setPlatformSettings\(saved\)/);
  });

  it('persiste verificação e destaque antes de atualizar listas locais', () => {
    expect(context).toMatch(/await adminSetVerified\(composerId,!target\.isVerified\);[\s\S]*?setAdminComposers/);
    expect(context).toMatch(/await adminFeatureSong\(songId,nextValue\);[\s\S]*?setFeaturedSongIds/);
  });
});

describe('Ocultação de perfis sem assinatura ativa', () => {
  const schema = readFileSync('supabase/schema.sql', 'utf8');

  it('não retorna o perfil público de uma assinatura inativa', () => {
    const rpc=schema.split('create or replace function public.get_public_composer')[1]?.split('grant execute on function public.get_public_composer')[0]||'';
    expect(rpc).toContain("p.username=p_username and sub.status='active'");
  });

  it('bloqueia interesse e plays quando a assinatura não está ativa', () => {
    const interest=schema.split('create or replace function public.create_interest_request')[1]?.split('grant execute on function public.create_interest_request')[0]||'';
    const play=schema.split('create or replace function public.increment_song_play(p_song_id uuid,p_visitor_id text)')[1]?.split('revoke execute on function public.increment_song_play(uuid,text)')[0]||'';
    expect(interest).toContain("sub.status='active'");
    expect(play).toContain("sub.status='active'");
  });
});

describe('Visualizações de perfis públicos', () => {
  const schema = readFileSync('supabase/schema.sql', 'utf8');
  const database = readFileSync('src/lib/database.ts', 'utf8');
  const page = readFileSync('src/pages/PublicProfilePage.tsx', 'utf8');

  it('incrementa no banco apenas perfis ativos e aplica deduplicação', () => {
    const rpc=schema.split('create or replace function public.increment_profile_view')[1]?.split('revoke execute on function public.increment_profile_view')[0]||'';
    expect(rpc).toContain("sub.status='active'");
    expect(rpc).toContain("'profile-view-'||profile_id");
    expect(rpc).toContain('views_count=views_count+1');
  });

  it('registra a visualização somente na página pública após encontrar o perfil', () => {
    expect(database).toContain("supabase.rpc('increment_profile_view'");
    expect(page).toContain('if (data)');
    expect(page).toContain('await incrementProfileView(requestedUsername)');
  });
});

describe('Rascunhos privados de músicas', () => {
  const schema = readFileSync('supabase/schema.sql', 'utf8');
  const database = readFileSync('src/lib/database.ts', 'utf8');

  it('isola cada rascunho pelo usuário autenticado com RLS', () => {
    expect(schema).toContain('alter table public.song_drafts enable row level security');
    expect(schema).toContain('using(auth.uid()=user_id)');
    expect(schema).toContain('with check(auth.uid()=user_id)');
    expect(schema).toContain('revoke all on table public.song_drafts from anon');
  });

  it('oferece persistência completa do rascunho sincronizado', () => {
    expect(database).toContain("from('song_drafts').select('payload')");
    expect(database).toContain("from('song_drafts').upsert");
    expect(database).toContain("from('song_drafts').delete()");
  });
});

describe('Upload de mídia da composição', () => {
  const database = readFileSync('src/lib/database.ts', 'utf8');
  const page = readFileSync('src/pages/dashboard/AddSongTab.tsx', 'utf8');
  const validator = readFileSync('supabase/functions/validate-media-upload/index.ts', 'utf8');
  const processor = readFileSync('src/lib/audioPreview.ts', 'utf8');
  const migration = readFileSync('supabase/update_all_migrations.sql', 'utf8');

  it('informa as etapas de envio e validação do arquivo', () => {
    expect(database).toContain("onStage?.('uploading')");
    expect(database).toContain("onStage?.('validating')");
    expect(database).toContain("onStage?.('complete')");
  });

  it('envia mídias em paralelo e aguarda todas antes do rollback', () => {
    expect(page).toContain('Promise.allSettled(pendingUploads)');
    expect(page).toContain('removeCurrentUserStorageFiles(newUploads)');
    expect(page).toContain('cancelUploads');
  });

  it('aceita a faixa completa, armazena somente os primeiros sessenta segundos e descarta o restante', () => {
    expect(validator).toContain("'song-previews':");
    expect(validator).toContain("kinds: ['mp3'], maxDuration: 60");
    expect(validator).not.toContain('createFirst60SecondsMp3');
    expect(processor).toContain("'-codec:a', 'libmp3lame'");
    expect(processor).toContain("'-map_metadata', '-1'");
    expect(processor).toContain("'-t', String(MAX_PREVIEW_SECONDS)");
    expect(page).toContain('createAudioPreview(file)');
    expect(page).not.toContain("uploadOriginalWithPreview");
    expect(page).not.toContain("uploadMedia('original'");
    expect(page).toContain('a música na íntegra');
    expect(page).toContain('uma prévia já pronta de até 60 segundos');
    expect(page).toContain('todo o restante será descartado');
  });

  it('aceita o preflight CORS exigido pelo cliente web', () => {
    expect(validator).toContain("request.method === 'OPTIONS'");
    expect(validator).toContain("'access-control-allow-origin': '*'");
    expect(validator).toContain('authorization, x-client-info, apikey, content-type');
  });

  it('registra e consome uma validação de uso único ao vincular mídia à música', () => {
    expect(validator).toContain("admin.from('validated_media').insert(validationRows)");
    expect(validator).toContain('mediaId');
    expect(database).toContain('preview_media_id');
    expect(page).toContain('previewMediaId: storedPreviewMediaId');
    expect(migration).toContain('create table if not exists public.validated_media');
    expect(migration).toContain('consumed_by_song_id = new.id');
    expect(migration).toContain("bucket_id = 'song-previews'");
  });
});

describe('Edição direta de composição', () => {
  const database = readFileSync('src/lib/database.ts', 'utf8');
  const page = readFileSync('src/pages/dashboard/AddSongTab.tsx', 'utf8');

  it('busca a música pelo ID e pelo compositor quando ela não está no estado paginado', () => {
    expect(database).toContain('function loadSongById');
    expect(database).toContain(".eq('id', songId)");
    expect(database).toContain(".eq('composer_id', userId)");
    expect(page).toContain('loadSongById(currentUserId, songId)');
    expect(page).toContain('Carregando música...');
    expect(page).toContain('Música não encontrada ou sem permissão de acesso.');
    expect(page).not.toContain('<Navigate to="/dashboard/musicas" replace />');
  });
});

describe('Inicialização resiliente da sessão', () => {
  const context = readFileSync('src/context/AppContext.tsx', 'utf8');

  it('não derruba os dados principais quando métricas auxiliares falham', () => {
    expect(context).toContain('loadDashboardMetrics(30).catch(() => [])');
  });
});

describe('Workflow de solicitações em produção', () => {
  const security = readFileSync('supabase/music_security.sql', 'utf8');
  const database = readFileSync('src/lib/database.ts', 'utf8');

  it('centraliza transições no RPC e remove atualização direta', () => {
    expect(security).toContain('function public.update_interest_request');
    expect(security).toContain("message='Transição de status não permitida.'");
    expect(security).toContain('revoke update (status, agreed_value, notes, payment_received_at, archive_reason, archived_at)');
    expect(database).toContain("supabase.rpc('update_interest_request'");
  });

  it('fecha a música na mesma transação da liberação', () => {
    expect(security).toContain('p_close_song boolean');
    expect(security).toContain('set is_available_for_release=false');
    expect(database).toContain('p_close_song:closeSong');
  });

  it('valida e grava o mesmo valor acordado sem sobrescrever com null', () => {
    expect(security).toContain('target_agreed_value := coalesce(p_agreed_value, current_request.agreed_value)');
    expect(security).toContain('agreed_value=target_agreed_value');
  });

  it('preserva texto digitado pelo usuário e rascunhos em caso de falha ao salvar', () => {
    const requestsTab = readFileSync('src/pages/dashboard/RequestsTab.tsx', 'utf8');
    expect(requestsTab).toContain('lastLoadedRequestIdRef');
    expect(requestsTab).toContain('req_draft_notes_');
    expect(requestsTab).toContain('texto digitado foi preservado');
    expect(requestsTab).toContain('Alteração não salva (preservada)');
    expect(requestsTab).toContain('Descartar alterações');
  });

  it('recupera corretamente o motivo de arquivamento persistido evitando falso estado pendente', () => {
    const requestsTab = readFileSync('src/pages/dashboard/RequestsTab.tsx', 'utf8');
    expect(requestsTab).toContain("setArchiveReason(activeRequest.archiveReason || '');");
    expect(requestsTab).toContain('if (reason !== null) setArchiveReason(reason);');
    expect(requestsTab).toContain('req_draft_reason_');
    expect(requestsTab).toContain('handleArchiveReasonChange');
  });

  it('sincroniza o formulário depois de confirmar o pagamento', () => {
    const requestsTab = readFileSync('src/pages/dashboard/RequestsTab.tsx', 'utf8');
    const confirmationStart = requestsTab.indexOf('const handleMarkPaymentReceived');
    const confirmationEnd = requestsTab.indexOf('const handleCreateRelease', confirmationStart);
    const confirmationHandler = requestsTab.slice(confirmationStart, confirmationEnd);

    expect(confirmationHandler).toContain("updateRequestStatus(activeRequest.id, 'pagamento_confirmado'");
    expect(confirmationHandler).toContain("setDraftStatus('pagamento_confirmado')");
    expect(confirmationHandler).toContain('setAgreedValueInput(confirmedAgreedValue)');
    expect(confirmationHandler.indexOf("setDraftStatus('pagamento_confirmado')"))
      .toBeGreaterThan(confirmationHandler.indexOf('if (saved)'));
  });

  it('preserva a organização e os rascunhos da página de solicitações', () => {
    const page = readFileSync('src/pages/dashboard/RequestsTab.tsx', 'utf8');
    expect(page).toContain('queryRequests({page,pageSize');
    expect(page).toContain('Carregar versão atual');
    expect(page).toContain('Há alterações não salvas nesta solicitação');
    expect(page).toContain("agreedValue: agreedValueInput === '' ? 0");
    expect(page).not.toContain('disabled={isMutating || hasExclusiveReleaseForSong || activeRequest.status');
  });

  it('distingue emissão e envio efetivo da liberação com rastreamento e ações de envio', () => {
    const requestsTab = readFileSync('src/pages/dashboard/RequestsTab.tsx', 'utf8');
    const requestWorkflow = readFileSync('src/lib/requestWorkflow.ts', 'utf8');
    const mySongsTab = readFileSync('src/pages/dashboard/MySongsTab.tsx', 'utf8');
    const schema = readFileSync('supabase/schema.sql', 'utf8');
    const migrations = readFileSync('supabase/update_all_migrations.sql', 'utf8');

    expect(requestsTab).toContain('REQUEST_STATUS_LABELS');
    expect(requestWorkflow).toContain("liberacao_enviada: 'Liberação emitida'");
    expect(mySongsTab).toContain("liberacao_enviada: 'Liberação emitida'");
    expect(requestsTab).toContain('handleSendReleaseWhatsApp');
    expect(requestsTab).toContain('handleSendReleaseEmail');
    expect(requestsTab).toContain('handleMarkReleaseAsSent');
    expect(requestsTab).toContain('releasePendingSentConfirmation');
    expect(requestsTab).toContain('Confirme somente depois de concluir o envio');
    expect(requestsTab).toContain('Abrir mensagem no WhatsApp');
    expect(requestsTab).toContain('Preparar e-mail');

    const whatsappHandler = requestsTab.slice(
      requestsTab.indexOf('const handleSendReleaseWhatsApp'),
      requestsTab.indexOf('const handleSendReleaseEmail')
    );
    const emailHandler = requestsTab.slice(
      requestsTab.indexOf('const handleSendReleaseEmail'),
      requestsTab.indexOf('const handleCopyReleaseValidationLink')
    );
    expect(whatsappHandler).not.toContain('markReleaseSent(');
    expect(emailHandler).not.toContain('markReleaseSent(');
    expect(schema).toContain('function public.mark_release_sent');
    expect(schema).toContain('sent_to_buyer_at timestamptz');
    expect(migrations).toContain('function public.mark_release_sent');
    expect(migrations).toContain('sent_to_buyer_at timestamptz');
  });
});

describe('Documentos de liberação em produção', () => {
  const page = readFileSync('src/pages/dashboard/ReleasesTab.tsx', 'utf8');
  const database = readFileSync('src/lib/database.ts', 'utf8');
  const archive = readFileSync('src/lib/releaseArchive.ts', 'utf8');
  const security = readFileSync('supabase/music_security.sql', 'utf8');
  const releaseSql = readFileSync('supabase/release_metrics.sql', 'utf8');

  it('protege o CSV contra fórmulas e mascara documentos pessoais', () => {
    expect(page).toContain("/^[=+\\-@]/");
    expect(page).toContain('maskDocument(r.buyerDocument)');
    expect(page).toContain('URL.createObjectURL(new Blob');
  });

  it('arquiva o PDF com hash, versão e sem sobrescrita', () => {
    expect(archive).toContain("crypto.subtle.digest('SHA-256'");
    expect(archive).toContain("uploadCurrentUserFile('release-documents', file)");
    expect(database).toContain("storage.from('media-quarantine').upload");
    expect(archive).toContain("supabase.rpc('register_release_document'");
    expect(security).toContain('and document_path is null');
    expect(security).toContain("bucket_id in ('profile-media','song-covers','song-previews','song-originals')");
  });

  it('pagina e filtra as liberações antes de carregar os registros', () => {
    expect(database).toContain("supabase.rpc('list_my_releases'");
    expect(releaseSql).toContain('p_page_size not between 1 and 500');
    expect(releaseSql).toContain('n.rn > (p_page::bigint - 1) * p_page_size');
    expect(page).toContain('queryReleases({');
    expect(page).toContain('Página {page} de {totalPages}');
  });

  it('inclui seletor de período, normalização de documento e fallback de WhatsApp', () => {
    expect(page).toContain('aria-label="Filtrar por período"');
    expect(page).toContain('selectedPeriodFilter');
    expect(page).toContain('Preparar mensagem no WhatsApp');
    expect(page).toContain('handleSendToCustomWhatsapp');
    expect(page).toContain('handleCopyWhatsAppMessage');
    expect(releaseSql).toContain("r.buyer_document ilike");
    expect(releaseSql).toContain('digits_search');
  });

  it('sincroniza KPIs com filtros, exibe skeleton loaders e botão Ver Proposta na tabela', () => {
    expect(page).toContain('kpiScope');
    expect(page).toContain('Ver Proposta');
    expect(page).toContain('aria-busy="true"');
    expect(page).toContain('animate-pulse');
  });
});

describe('Perfil do Compositor', () => {
  const profileTab = readProfileFeatureSources();
  const database = readFileSync('src/lib/database.ts', 'utf8');

  it('salva e carrega society e spotify com fallback em user_preferences', () => {
    expect(database).toContain("society: p.society || ''");
    expect(database).toContain("spotify: p.spotify || ''");
    expect(database).toContain('user_preferences');
  });

  it('valida campos inline e executa scrollIntoView para o primeiro erro', () => {
    expect(profileTab).toContain('fieldErrors');
    expect(profileTab).toContain('isValidCpf');
    expect(profileTab).toContain('scrollIntoView');
    expect(profileTab).toContain('getInputClass');
    expect(profileTab).toContain('FieldError');
    expect(profileTab).toContain("'aria-invalid'");
    expect(profileTab).toContain('noValidate');
  });

  it('inclui termômetro de completude, campo de chave PIX e verificação prévia de slug', () => {
    expect(profileTab).toContain('completionPercentage');
    expect(profileTab).toContain('profileChecks');
    expect(profileTab).toContain('Indicador de Força do Perfil');
    expect(profileTab).toContain('field-pix');
    expect(profileTab).toContain('pixKey');
    expect(profileTab).toContain('pixKeyType');
    expect(profileTab).toContain('Usar CPF');
    expect(profileTab).toContain('usernameStatus');
    expect(profileTab).toContain('checkUsernameAvailability');
    expect(database).toContain('checkUsernameAvailability');
    expect(database).toContain('pix_key');
  });

  it('limpa fotos anteriores órfãs no bucket profile-media e faz rollback de uploads em caso de erro', () => {
    expect(profileTab).toContain('removeCurrentUserStorageFiles(replacedFiles)');
    expect(profileTab).toContain('removeCurrentUserStorageFiles(newUploads)');
    expect(profileTab).toContain("bucket: 'profile-media'");
  });
});

describe('Privacidade do perfil (LGPD)', () => {
  const schema = readFileSync('supabase/schema.sql', 'utf8');
  const profileTab = readProfileFeatureSources();
  const publicPage = readFileSync('src/pages/PublicProfilePage.tsx', 'utf8');

  it('não expõe o nome civil no perfil público e expõe o selo de verificação', () => {
    const rpc = schema.split('create or replace function public.get_public_composer')[1]?.split('grant execute on function public.get_public_composer')[0] || '';
    expect(rpc).not.toContain("'name',p.name");
    expect(rpc).toContain("'isVerified',p.is_verified");
    expect(publicPage).toContain('profile.isVerified &&');
  });

  it('trava nome civil e CPF após termos emitidos e valida a chave PIX no banco', () => {
    expect(schema).toContain('create trigger guard_profile_identity before update of name on public.profiles');
    expect(schema).toContain('create trigger guard_private_profile_identity before update of cpf on public.private_profiles');
    expect(schema).toContain('create trigger validate_private_profile_pix');
    expect(profileTab).toContain('identityLocked');
    expect(profileTab).toContain('validatePixKey');
  });

  it('confirma a troca do endereço público antes de salvar', () => {
    expect(profileTab).toContain('usernameChangeConfirmed');
    expect(profileTab).toContain('Alterar seu endereço público?');
  });
});

describe('Imagens do perfil', () => {
  const profileTab = readProfileFeatureSources();
  const cropDialog = readFileSync('src/components/common/ImageCropDialog.tsx', 'utf8');

  it('não depende de imagens externas como padrão', () => {
    expect(profileTab).not.toMatch(/src=\{[^}]*images\.unsplash\.com/);
    expect(profileTab).not.toContain('DEFAULT_PHOTO');
    expect(profileTab).toContain('getInitials');
  });

  it('recorta e comprime antes de enviar, respeitando o limite de 5 MB do bucket', () => {
    expect(profileTab).toContain('ImageCropDialog');
    expect(profileTab).toContain('MAX_UPLOAD_IMAGE_BYTES = 5 * 1024 * 1024');
    expect(cropDialog).toContain("toBlob('image/webp'");
    expect(cropDialog).toContain("toBlob('image/jpeg'");
  });

  it('permite reescolher o mesmo arquivo, arrastar, remover e sinaliza imagem não salva', () => {
    expect(profileTab).toContain("event.target.value = ''");
    expect(profileTab).toContain('onDrop');
    expect(profileTab).toContain('removeImage');
    expect(profileTab).toContain('Nova imagem, ainda não salva');
  });
});
