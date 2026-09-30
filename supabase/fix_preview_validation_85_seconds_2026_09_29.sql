-- Corrige instalações em que as triggers de música ainda validam a
-- duração antiga de 60 segundos. O frontend e validate-media-upload usam 85s.
-- A substituição preserva as demais regras de segurança das funções.

do $$
declare
  target_function regprocedure;
  definition text;
  patched text;
begin
  target_function := to_regprocedure('public.enforce_song_media_separation()');
  if target_function is null then
    raise exception 'A função obrigatória public.enforce_song_media_separation() não existe';
  end if;

  select pg_get_functiondef(target_function) into definition;

  patched := replace(definition, 'duration_seconds <= 60', 'duration_seconds <= 85');
  patched := replace(patched, 'prévia pública de até 60 segundos', 'prévia pública de até 85 segundos');

  if patched = definition and position('duration_seconds <= 85' in definition) = 0 then
    raise exception 'enforce_song_media_separation não possui um limite de prévia reconhecido';
  end if;

  execute patched;
end;
$$;

do $$
declare
  target_function regprocedure;
  definition text;
  patched text;
begin
  target_function := to_regprocedure('public.enforce_song_write_rules()');

  -- Algumas instalações validam todos os campos na função de separação
  -- de mídia e, portanto, nunca tiveram esta função complementar.
  if target_function is null then
    return;
  end if;

  select pg_get_functiondef(target_function) into definition;

  patched := replace(definition, 'prévia pública de até 60 segundos', 'prévia pública de até 85 segundos');

  execute patched;
end;
$$;
