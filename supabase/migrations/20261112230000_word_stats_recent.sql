alter table public.word_stats
  add column recent smallint[] not null default '{}';

alter table public.word_stats
  add constraint word_stats_recent_window check (
    cardinality(recent) <= 3
    and recent <@ array[0, 1]::smallint[]
  );

with latest as (
  select
    sa.player_id,
    sa.word_id,
    (case when sa.correct then 0 else 1 end)::smallint as outcome,
    s.created_at,
    s.id as session_id,
    row_number() over (
      partition by sa.player_id, sa.word_id
      order by s.created_at desc, s.id desc
    ) as recency
  from public.session_answers sa
  join public.sessions s on s.id = sa.session_id
)
update public.word_stats ws
set recent = windowed.recent
from (
  select
    player_id,
    word_id,
    array_agg(outcome order by created_at, session_id) as recent
  from latest
  where recency <= 3
  group by player_id, word_id
) windowed
where ws.player_id = windowed.player_id
  and ws.word_id = windowed.word_id;
