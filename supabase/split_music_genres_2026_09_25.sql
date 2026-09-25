-- ==============================================================================
-- Separação dos gêneros musicais agrupados ("Forró / Piseiro" -> "Forró", "Piseiro")
-- Pode ser executado a qualquer momento. É idempotente.
--
-- O app já converte os nomes antigos ao carregar (src/config/musicGenres.ts);
-- esta migração grava os nomes novos para que busca, vitrine e relatórios
-- fiquem consistentes.
--
-- Músicas: o gênero antigo vira a parte à qual o subgênero pertence; sem essa
-- pista, vira a primeira parte (ex.: "Samba / Pagode" -> "Samba").
-- Perfis: cada gênero agrupado vira suas partes, sem repetir, mantendo a ordem
-- (os 3 primeiros são os destaques da vitrine) e no máximo 5, o limite do perfil.
--
-- Os gatilhos de songs ficam desligados só durante a troca: é uma renomeação,
-- e enforce_song_write_rules recusaria atualizar músicas publicadas de contas
-- sem assinatura ativa. Tudo roda em um único bloco: se algo falhar, nada é
-- alterado e os gatilhos continuam ligados.
-- ==============================================================================

do $$
declare
  genre_split jsonb := jsonb_build_object(
    'Forró / Piseiro', jsonb_build_array('Forró', 'Piseiro'),
    'Arrocha / Brega', jsonb_build_array('Arrocha', 'Brega'),
    'Samba / Pagode', jsonb_build_array('Samba', 'Pagode'),
    'Gospel / Cristão', jsonb_build_array('Gospel', 'Cristão'),
    'Trap / Rap / Hip-Hop', jsonb_build_array('Trap', 'Rap', 'Hip-Hop'),
    'Rock / Reggae', jsonb_build_array('Rock', 'Reggae'),
    'Música Regional / Gaúcha', jsonb_build_array('Música Regional', 'Gaúcha'),
    'Romântico / Seresta', jsonb_build_array('Romântico', 'Seresta'),
    'Axé / Pagodão', jsonb_build_array('Axé', 'Pagodão')
  );
  -- Subgêneros que apontam para a segunda (ou terceira) parte do gênero antigo.
  genre_by_subgenre jsonb := jsonb_build_object(
    'Piseiro', 'Piseiro', 'Pisadinha', 'Piseiro',
    'Brega Funk', 'Brega', 'Brega Romântico / Saudade', 'Brega', 'Tecnobrega', 'Brega',
    'Pagode Romântico', 'Pagode', 'Pagode Moderno', 'Pagode',
    'Worship / Adoração', 'Cristão', 'Louvor Congregacional', 'Cristão',
    'Boom Bap', 'Rap', 'Rap Acústico', 'Rap', 'R&B Nacional', 'Hip-Hop',
    'Reggae Nacional', 'Reggae', 'Reggae Roots', 'Reggae',
    'Vanera Tradicional', 'Gaúcha', 'Milonga', 'Gaúcha', 'Chimarrita', 'Gaúcha', 'Bugio', 'Gaúcha',
    'Seresta / Seresta de Teclado', 'Seresta',
    'Pagodão Baiano', 'Pagodão'
  );
  old_names text[] := array(select jsonb_object_keys(genre_split));
begin
  alter table public.songs disable trigger user;

  update public.songs s
  set genre = case
    when (genre_split -> s.genre) ? coalesce(genre_by_subgenre ->> s.subgenre, '')
      then genre_by_subgenre ->> s.subgenre
    else genre_split -> s.genre ->> 0
  end
  where s.genre = any(old_names);

  alter table public.songs enable trigger user;

  update public.profiles p
  set genres = normalized.genres
  from (
    -- Limite de 5 gêneros do perfil (o formulário não salva acima disso).
    select ranked.user_id, (array_agg(ranked.genre order by ranked.position))[1:5] as genres
    from (
      select expanded.user_id, expanded.genre, min(expanded.position) as position
      from (
        select p2.user_id, part.genre, src.i * 10 + part.j as position
        from public.profiles p2
        cross join lateral unnest(p2.genres) with ordinality as src(name, i)
        cross join lateral jsonb_array_elements_text(
          coalesce(genre_split -> src.name, jsonb_build_array(src.name))
        ) with ordinality as part(genre, j)
        where p2.genres && old_names
      ) expanded
      group by expanded.user_id, expanded.genre
    ) ranked
    group by ranked.user_id
  ) normalized
  where p.user_id = normalized.user_id;
end $$;
