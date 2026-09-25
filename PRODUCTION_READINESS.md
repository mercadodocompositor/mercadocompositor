# Verificação de produção

O fluxo de pagamento integrado foi descomissionado. A tela de assinatura é somente leitura e as alterações de plano são tratadas pelo suporte.

Antes do próximo deploy:

- cancele no antigo provedor todas as cobranças recorrentes ainda ativas;
- aplique `supabase/remove_payment_integration_2026_09_23.sql`;
- remova do projeto Supabase as antigas funções publicadas de checkout e webhook;
- exclua os secrets e o webhook do gateway anterior;
- execute `supabase/check_production_readiness.sql` e confirme que o resultado está vazio;
- execute `supabase/verify_workflow_guarantees_2026_09_24.sql` por último e confirme o resultado `workflow_guarantees_ok`;
- execute `npm run lint`, `npm run test` e `npm run build`.

O histórico financeiro existente é preservado para consulta e emissão de recibos.
