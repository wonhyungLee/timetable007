-- Shared timetable state table
create table if not exists public.timetable_state (
  id text primary key,
  payload jsonb not null,
  updated_by text,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_timetable_state_set_updated_at on public.timetable_state;
create trigger trg_timetable_state_set_updated_at
before update on public.timetable_state
for each row
execute function public.set_updated_at();

alter table public.timetable_state enable row level security;

drop policy if exists timetable_state_read on public.timetable_state;
create policy timetable_state_read
on public.timetable_state
for select
to anon, authenticated
using (true);

drop policy if exists timetable_state_insert on public.timetable_state;
create policy timetable_state_insert
on public.timetable_state
for insert
to anon, authenticated
with check (true);

drop policy if exists timetable_state_update on public.timetable_state;
create policy timetable_state_update
on public.timetable_state
for update
to anon, authenticated
using (true)
with check (true);

insert into public.timetable_state (id, payload, updated_by)
values ('main', '{}'::jsonb, null)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'timetable_state'
  ) then
    alter publication supabase_realtime add table public.timetable_state;
  end if;
end $$;
