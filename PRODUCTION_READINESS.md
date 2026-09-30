# Verificação de produção

Pagamentos: Stripe (assinaturas dos planos). O gateway anterior foi descomissionado.

Antes de cada deploy:

- aplique no Supabase as migrações novas na ordem do `README.md` (seção "Deploy"). Não execute `supabase/schema.sql` nem `supabase/update_all_migrations.sql` em um banco já em uso;
- execute `supabase/verify_workflow_guarantees_2026_09_24.sql` por último e confirme o resultado `workflow_guarantees_ok`;
- publique as Edge Functions alteradas (lista no `README.md`);
- execute `npm run check` e `npm run test:smoke`;
- publique a pasta `dist/` inteira na Hostinger, incluindo o arquivo oculto `.htaccess`.

O diagnóstico completo, o histórico das correções e o checklist de lançamento (chaves do Stripe, Resend, Supabase Auth, backups) estão em `DIAGNOSTICO_PRODUCAO.md`.
