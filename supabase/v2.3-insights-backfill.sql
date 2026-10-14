-- V2.3 — Backfill OPCIONAL de precisão de horário. Rodar DEPOIS do deploy do
-- app novo (que já grava a precisão em toda escrita). Idempotente: só toca
-- linhas com precisão NULL.
--
-- Regra (proveniência, não "valor do relógio"): os únicos caminhos que gravam
-- só a DATA produzem instantes com fração de segundo exatamente zero
-- (`AAAA-MM-DDT12:00:00`, imports). Um instante com fração de segundo ≠ 0 só
-- pode ter vindo do relógio do servidor no momento do registro (`now()` /
-- `new Date().toISOString()`), portanto é 'datetime' comprovadamente.
-- Tudo o mais (inclusive horários escolhidos pelo usuário antes desta versão,
-- que têm fração zero) continua NULL = desconhecido e fica FORA do gráfico de
-- horário. Nenhuma linha vira 'date'/'datetime' por "parecer" hora redonda.

update public.episodes_progress
  set watched_at_precision = 'datetime'
  where watched_at_precision is null
    and watched_at is not null
    and (extract(microseconds from watched_at)::bigint % 1000000) <> 0;

update public.watch_entries
  set watched_at_precision = 'datetime'
  where watched_at_precision is null
    and watched_at is not null
    and (extract(microseconds from watched_at)::bigint % 1000000) <> 0;

update public.library_items
  set watched_at_precision = 'datetime'
  where watched_at_precision is null
    and watched_at is not null
    and (extract(microseconds from watched_at)::bigint % 1000000) <> 0;
