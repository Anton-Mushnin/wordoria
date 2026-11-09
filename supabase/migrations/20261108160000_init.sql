create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  iv integer not null default 0 check (iv >= 0),
  money integer not null default 0 check (money >= 0),
  xp integer not null default 0 check (xp >= 0),
  subscription_until timestamptz,
  equipped_skin_id text,
  created_at timestamptz not null default now()
);

create unique index profiles_name_lower_idx on public.profiles (lower(name));

create table public.profile_directory (
  id uuid primary key references public.profiles (id) on delete cascade,
  name text not null
);

create unique index profile_directory_name_lower_idx on public.profile_directory (lower(name));

create table public.ledger (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  currency text not null check (currency in ('iv', 'money', 'xp')),
  amount integer not null,
  balance_after integer not null,
  ref_id uuid,
  created_at timestamptz not null default now()
);

create index ledger_player_idx on public.ledger (player_id, created_at desc);

create table public.words (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  translation text not null,
  pair_key text generated always as (lower(btrim(term)) || '::' || lower(btrim(translation))) stored,
  unique (pair_key)
);

create table public.word_lists (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source text not null check (source in ('server', 'upload')),
  owner_id uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (source = 'server' and owner_id is null)
    or (source = 'upload' and owner_id is not null)
  )
);

create table public.list_words (
  list_id uuid not null references public.word_lists (id) on delete cascade,
  word_id uuid not null references public.words (id),
  position integer not null,
  primary key (list_id, word_id),
  unique (list_id, position)
);

create table public.word_stats (
  player_id uuid not null references public.profiles (id) on delete cascade,
  word_id uuid not null references public.words (id) on delete cascade,
  times_seen integer not null default 0 check (times_seen >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  primary key (player_id, word_id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('solo', 'multi')),
  game_id text not null,
  list_id uuid not null references public.word_lists (id),
  host_id uuid not null references public.profiles (id),
  word_ids uuid[] not null,
  status text not null default 'active' check (status in ('active', 'finished')),
  created_at timestamptz not null default now()
);

create table public.session_players (
  session_id uuid not null references public.sessions (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  charged_iv integer not null default 0,
  base_points integer,
  points integer,
  multiplier double precision,
  iv_gain integer,
  xp_gain integer,
  errors integer,
  total_time_ms integer,
  place integer,
  finished boolean not null default false,
  primary key (session_id, player_id)
);

create table public.session_snapshots (
  session_id uuid not null,
  player_id uuid not null,
  stats jsonb not null,
  primary key (session_id, player_id),
  foreign key (session_id, player_id) references public.session_players (session_id, player_id) on delete cascade
);

create table public.session_answers (
  session_id uuid not null,
  player_id uuid not null,
  word_id uuid not null references public.words (id),
  correct boolean not null,
  time_ms integer not null,
  primary key (session_id, player_id, word_id),
  foreign key (session_id, player_id) references public.session_players (session_id, player_id) on delete cascade
);

create table public.lootboxes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'sealed' check (status in ('sealed', 'opened')),
  challenge jsonb,
  reward jsonb,
  created_at timestamptz not null default now()
);

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('skin', 'subscription_gift')),
  skin_id text,
  days integer,
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null references public.profiles (id),
  list_id uuid not null references public.word_lists (id),
  game_id text not null,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'done')),
  session_id uuid references public.sessions (id),
  created_at timestamptz not null default now()
);

create table public.room_players (
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, player_id)
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text;
begin
  clean := btrim(coalesce(new.raw_user_meta_data ->> 'name', ''));
  if char_length(clean) < 2 then
    raise exception 'Нужно имя';
  end if;
  if exists (select 1 from public.profiles where lower(name) = lower(clean)) then
    raise exception 'Такое имя уже занято';
  end if;
  insert into public.profiles (id, name) values (new.id, clean);
  insert into public.profile_directory (id, name) values (new.id, clean);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.profile_directory enable row level security;
alter table public.ledger enable row level security;
alter table public.words enable row level security;
alter table public.word_lists enable row level security;
alter table public.list_words enable row level security;
alter table public.word_stats enable row level security;
alter table public.sessions enable row level security;
alter table public.session_players enable row level security;
alter table public.session_snapshots enable row level security;
alter table public.session_answers enable row level security;
alter table public.lootboxes enable row level security;
alter table public.inventory enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.profile_directory from anon, authenticated;
revoke all on table public.ledger from anon, authenticated;
revoke all on table public.words from anon, authenticated;
revoke all on table public.word_lists from anon, authenticated;
revoke all on table public.list_words from anon, authenticated;
revoke all on table public.word_stats from anon, authenticated;
revoke all on table public.sessions from anon, authenticated;
revoke all on table public.session_players from anon, authenticated;
revoke all on table public.session_snapshots from anon, authenticated;
revoke all on table public.session_answers from anon, authenticated;
revoke all on table public.lootboxes from anon, authenticated;
revoke all on table public.inventory from anon, authenticated;
revoke all on table public.rooms from anon, authenticated;
revoke all on table public.room_players from anon, authenticated;

grant select on table public.profiles to authenticated;
grant select on table public.profile_directory to authenticated;
grant select on table public.ledger to authenticated;
grant select on table public.words to authenticated;
grant select on table public.word_lists to authenticated;
grant select on table public.list_words to authenticated;
grant select on table public.word_stats to authenticated;
grant select on table public.sessions to authenticated;
grant select on table public.session_players to authenticated;
grant select on table public.session_snapshots to authenticated;
grant select on table public.session_answers to authenticated;
grant select on table public.lootboxes to authenticated;
grant select on table public.inventory to authenticated;
grant select on table public.rooms to authenticated;
grant select on table public.room_players to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated using (id = auth.uid());

create policy directory_select on public.profile_directory
  for select to authenticated using (true);

create policy ledger_select on public.ledger
  for select to authenticated using (player_id = auth.uid());

create policy lists_select on public.word_lists
  for select to authenticated using (
    source = 'server'
    or owner_id = auth.uid()
    or exists (
      select 1 from public.rooms r
      join public.room_players rp on rp.room_id = r.id and rp.player_id = auth.uid()
      where r.list_id = word_lists.id
    )
  );

create policy list_words_select on public.list_words
  for select to authenticated using (
    exists (
      select 1 from public.word_lists wl
      where wl.id = list_words.list_id
        and (wl.source = 'server' or wl.owner_id = auth.uid())
    )
  );

create policy words_select on public.words
  for select to authenticated using (
    exists (
      select 1 from public.list_words lw
      join public.word_lists wl on wl.id = lw.list_id
      where lw.word_id = words.id
        and (wl.source = 'server' or wl.owner_id = auth.uid())
    )
    or exists (
      select 1 from public.sessions s
      join public.session_players sp on sp.session_id = s.id and sp.player_id = auth.uid()
      where words.id = any (s.word_ids)
    )
  );

create policy stats_select on public.word_stats
  for select to authenticated using (player_id = auth.uid());

create function public.is_session_member(target_session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.session_players
    where session_id = target_session and player_id = auth.uid()
  );
$$;

create function public.is_room_member(target_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_players
    where room_id = target_room and player_id = auth.uid()
  );
$$;

revoke all on function public.is_session_member(uuid) from public, anon;
revoke all on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_session_member(uuid) to authenticated;
grant execute on function public.is_room_member(uuid) to authenticated;

create policy sessions_select on public.sessions
  for select to authenticated using (public.is_session_member(id));

create policy session_players_select on public.session_players
  for select to authenticated using (public.is_session_member(session_id));

create policy snapshots_select on public.session_snapshots
  for select to authenticated using (player_id = auth.uid());

create policy answers_select on public.session_answers
  for select to authenticated using (player_id = auth.uid());

create policy lootboxes_select on public.lootboxes
  for select to authenticated using (player_id = auth.uid());

create policy inventory_select on public.inventory
  for select to authenticated using (player_id = auth.uid());

create policy rooms_select on public.rooms
  for select to authenticated using (public.is_room_member(id));

create policy room_players_select on public.room_players
  for select to authenticated using (public.is_room_member(room_id));

alter table public.session_players replica identity full;
alter table public.rooms replica identity full;
alter table public.room_players replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.session_players;
    alter publication supabase_realtime add table public.rooms;
    alter publication supabase_realtime add table public.room_players;
  end if;
end $$;

insert into public.words (term, translation) values
  ('cat', 'кот'),
  ('dog', 'собака'),
  ('bird', 'птица'),
  ('house', 'дом'),
  ('water', 'вода'),
  ('book', 'книга'),
  ('sun', 'солнце'),
  ('friend', 'друг'),
  ('bread', 'хлеб'),
  ('milk', 'молоко'),
  ('apple', 'яблоко'),
  ('cheese', 'сыр'),
  ('soup', 'суп'),
  ('rice', 'рис'),
  ('fish', 'рыба'),
  ('egg', 'яйцо');

insert into public.word_lists (title, source)
values ('Первые слова', 'server'), ('Еда', 'server');

insert into public.list_words (list_id, word_id, position)
select wl.id, w.id, src.position
from (
  values
    ('Первые слова', 'cat', 0),
    ('Первые слова', 'dog', 1),
    ('Первые слова', 'bird', 2),
    ('Первые слова', 'house', 3),
    ('Первые слова', 'water', 4),
    ('Первые слова', 'book', 5),
    ('Первые слова', 'sun', 6),
    ('Первые слова', 'friend', 7),
    ('Еда', 'bread', 0),
    ('Еда', 'milk', 1),
    ('Еда', 'apple', 2),
    ('Еда', 'cheese', 3),
    ('Еда', 'soup', 4),
    ('Еда', 'rice', 5),
    ('Еда', 'fish', 6),
    ('Еда', 'egg', 7)
) as src(title, term, position)
join public.word_lists wl on wl.title = src.title and wl.source = 'server'
join public.words w on w.term = src.term;
