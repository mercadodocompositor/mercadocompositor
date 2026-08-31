import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getRequestCode } from './identifiers';
import { getSongSaveStatus, getSongToggleStatus } from './songWorkflow';
import { getInterestRequestUrl, getSongUrlKey, slugify } from './urls';

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
    expect(rpc).toContain('for update');
  });

  it('gera identidade e dados oficiais no banco', () => {
    const rpc = schema.split('create or replace function public.issue_release')[1]?.split('create or replace function public.handle_new_user')[0] || '';
    expect(rpc).toContain('release_id uuid := gen_random_uuid()');
    expect(rpc).toContain("extract(year from current_date)");
    expect(rpc).toContain('request_row.agreed_value');
    expect(rpc).toContain('private_row.cpf');
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
    expect(context).toMatch(/await savePlatformSettings\(next\);[\s\S]*?setPlatformSettings\(next\)/);
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
