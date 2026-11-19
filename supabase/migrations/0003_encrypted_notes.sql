-- Notes become end-to-end encrypted: the browser encrypts each note with a key derived from the
-- author's notes passphrase (PBKDF2 → AES-256-GCM). The database only ever stores ciphertext, so
-- nobody else can read a note: not friends, and not whoever administers this database.

-- Encrypted notes, one per person per day. Only the author can touch their rows.
create table everyday.notes (
  user_id     uuid not null references auth.users(id) on delete cascade,
  day         date not null,
  ct          text not null check (char_length(ct) <= 2000),  -- base64 ciphertext (note is ≤ 140 chars)
  iv          text not null check (char_length(iv) <= 64),    -- base64 AES-GCM nonce
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

-- Per-person key parameters: the PBKDF2 salt (not secret) and an encrypted check value used to
-- tell a right passphrase from a wrong one. The passphrase and key never leave the browser.
create table everyday.note_keys (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  salt        text not null check (char_length(salt) <= 64),
  check_ct    text not null check (char_length(check_ct) <= 200),
  check_iv    text not null check (char_length(check_iv) <= 64),
  created_at  timestamptz not null default now()
);

alter table everyday.notes     enable row level security;
alter table everyday.note_keys enable row level security;

create policy "own notes only" on everyday.notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own key only" on everyday.note_keys for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on everyday.notes     to authenticated;
grant select, insert, update, delete on everyday.note_keys to authenticated;

-- Friends can read each other's ratings but never the old plaintext note column.
revoke select on everyday.days from authenticated;
grant select (user_id, day, rating, updated_at) on everyday.days to authenticated;

-- Notes written before encryption are still plaintext in days.note. Each author's browser fetches
-- only their own (via this function), encrypts them, saves them to everyday.notes, then clears them.
create function everyday.my_legacy_notes() returns table (day date, note text)
language sql stable security definer set search_path = '' as $$
  select d.day, d.note from everyday.days d where d.user_id = (select auth.uid()) and d.note is not null;
$$;
revoke all on function everyday.my_legacy_notes() from public, anon;
grant execute on function everyday.my_legacy_notes() to authenticated;
