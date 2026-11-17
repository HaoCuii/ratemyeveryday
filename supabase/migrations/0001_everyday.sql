-- Everyday: rate-your-day app. Everything lives in its own `everyday` schema;
-- nothing in public, smashspeed or training is touched.

create schema if not exists everyday;

-- People. Created by the app on first sign-in (no trigger on auth.users, so other apps' sign-ups are unaffected).
create table everyday.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  handle      text not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  name        text not null default '' check (char_length(name) <= 60),
  avatar_url  text check (avatar_url is null or char_length(avatar_url) <= 500),
  created_at  timestamptz not null default now()
);

-- One row per person per day.
create table everyday.days (
  user_id     uuid not null references auth.users(id) on delete cascade,
  day         date not null,
  rating      smallint not null check (rating between 1 and 10),
  note        text check (note is null or char_length(note) <= 140),
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

-- Friend requests. Pending until the other person accepts; either side can delete (decline / unfriend).
create table everyday.friendships (
  requester   uuid not null references auth.users(id) on delete cascade,
  addressee   uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at  timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index on everyday.friendships (addressee);

-- True when a and b are accepted friends (either direction).
create function everyday.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from everyday.friendships f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  );
$$;
revoke all on function everyday.are_friends(uuid, uuid) from public, anon;
grant execute on function everyday.are_friends(uuid, uuid) to authenticated;

-- Row-level security ----------------------------------------------------------
alter table everyday.profiles    enable row level security;
alter table everyday.days        enable row level security;
alter table everyday.friendships enable row level security;

-- Profiles: any signed-in person can see handles/names (needed to find friends); you edit only your own.
create policy "signed-in read profiles" on everyday.profiles for select to authenticated using (true);
create policy "create own profile"      on everyday.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "update own profile"      on everyday.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Days: you see your own and accepted friends'; you write only your own.
create policy "read own or friends days" on everyday.days for select to authenticated
  using (user_id = (select auth.uid()) or everyday.are_friends((select auth.uid()), user_id));
create policy "insert own days" on everyday.days for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own days" on everyday.days for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own days" on everyday.days for delete to authenticated using (user_id = (select auth.uid()));

-- Friendships: you see requests you're part of; you can only send as yourself (pending),
-- only the recipient can accept, and either side can remove.
create policy "read own friendships" on everyday.friendships for select to authenticated
  using ((select auth.uid()) in (requester, addressee));
create policy "send request" on everyday.friendships for insert to authenticated
  with check (requester = (select auth.uid()) and status = 'pending');
create policy "accept request" on everyday.friendships for update to authenticated
  using (addressee = (select auth.uid())) with check (addressee = (select auth.uid()) and status = 'accepted');
create policy "remove friendship" on everyday.friendships for delete to authenticated
  using ((select auth.uid()) in (requester, addressee));

-- Grants: signed-in users only; the anonymous key gets nothing.
grant usage on schema everyday to authenticated;
grant select, insert, update          on everyday.profiles    to authenticated;
grant select, insert, update, delete  on everyday.days        to authenticated;
grant select, insert, update, delete  on everyday.friendships to authenticated;
