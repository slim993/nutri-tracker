-- Nutri-Tracker sync schema. Run once in the Supabase SQL editor.
--
-- One generic table holds every synced record: the app keeps its IndexedDB
-- stores as the source of truth for structure and only mirrors rows here.

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  store text not null check (
    store in ('foods', 'meals', 'logEntries', 'weightEntries', 'settings', 'workouts')
  ),
  id text not null,
  data jsonb,
  -- Deletions stay as tombstones so other devices learn about them.
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, store, id)
);

create index if not exists records_user_updated_idx on public.records (user_id, updated_at);

-- The server clock stamps every write: devices pull "rows changed since X".
create or replace function public.records_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch
  before insert or update on public.records
  for each row execute function public.records_touch();

-- Each user can only read and write their own rows.
alter table public.records enable row level security;

drop policy if exists "records are private to their owner" on public.records;
create policy "records are private to their owner" on public.records
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
