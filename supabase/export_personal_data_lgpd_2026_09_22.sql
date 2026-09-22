-- Exportação autenticada dos dados do próprio titular (LGPD).
-- A função consulta o banco no momento da solicitação, sem depender do estado
-- parcial/paginado carregado no navegador.
create or replace function public.export_my_personal_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then
    raise exception using errcode = '42501', message = 'Sessão expirada.';
  end if;

  select jsonb_build_object(
    'plataforma', 'Mercado do Compositor',
    'versao_exportacao', 1,
    'gerado_em', now(),
    'titular', coalesce((select to_jsonb(p) from public.profiles p where p.user_id = uid), '{}'::jsonb)
      || coalesce((select to_jsonb(pp) from public.private_profiles pp where pp.user_id = uid), '{}'::jsonb),
    'assinatura', coalesce((select to_jsonb(s) from public.subscriptions s where s.user_id = uid), '{}'::jsonb),
    'preferencias', coalesce((select to_jsonb(up) from public.user_preferences up where up.user_id = uid), '{}'::jsonb),
    'musicas', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from public.songs s where s.composer_id = uid), '[]'::jsonb),
    'rascunhos', coalesce((select jsonb_agg(to_jsonb(sd) order by sd.updated_at) from public.song_drafts sd where sd.user_id = uid), '[]'::jsonb),
    'solicitacoes', coalesce((select jsonb_agg(to_jsonb(ir) order by ir.created_at) from public.interest_requests ir where ir.composer_id = uid), '[]'::jsonb),
    'liberacoes', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.releases r where r.composer_id = uid), '[]'::jsonb),
    'notificacoes', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.user_notifications n where n.user_id = uid), '[]'::jsonb),
    'solicitacoes_exclusao', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at) from public.account_deletion_requests d where d.user_id = uid), '[]'::jsonb)
  ) into result;

  return result;
end $$;

revoke execute on function public.export_my_personal_data() from public, anon;
grant execute on function public.export_my_personal_data() to authenticated;

notify pgrst, 'reload schema';
