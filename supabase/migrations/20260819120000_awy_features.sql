-- Awy v3 : vlog, humeur hamster, drapeau d'appel, carte, emploi du temps, type d'événement
-- Toutes les tables suivent le même principe : visible par moi et mon/ma partenaire, écriture par l'auteur·ice.

-- ─── Vlog ────────────────────────────────────────────────────────────────
create table if not exists public.vlogs (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  media_path text not null,
  media_type text not null check (media_type in ('image','video')),
  caption text check (char_length(caption) <= 500),
  taken_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists vlogs_author_taken_idx on public.vlogs(author_id, taken_at desc);
alter table public.vlogs enable row level security;
drop policy if exists "vlogs select partners" on public.vlogs;
create policy "vlogs select partners" on public.vlogs for select to authenticated
  using (author_id = auth.uid() or author_id = public.get_partner_id(auth.uid()));
drop policy if exists "vlogs insert own" on public.vlogs;
create policy "vlogs insert own" on public.vlogs for insert to authenticated
  with check (author_id = auth.uid());
drop policy if exists "vlogs update own" on public.vlogs;
create policy "vlogs update own" on public.vlogs for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists "vlogs delete own" on public.vlogs;
create policy "vlogs delete own" on public.vlogs for delete to authenticated
  using (author_id = auth.uid());

-- Bucket privé : chemin {author_id}/{uuid}.{ext}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vlogs', 'vlogs', false, 52428800, array['image/jpeg','image/png','image/webp','image/heic','image/gif','video/mp4','video/quicktime','video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "vlogs storage read" on storage.objects;
create policy "vlogs storage read" on storage.objects for select to authenticated
  using (bucket_id = 'vlogs' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (storage.foldername(name))[1] = public.get_partner_id(auth.uid())::text));
drop policy if exists "vlogs storage insert" on storage.objects;
create policy "vlogs storage insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'vlogs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "vlogs storage delete" on storage.objects;
create policy "vlogs storage delete" on storage.objects for delete to authenticated
  using (bucket_id = 'vlogs' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─── Humeur (hamster) : un état parmi 7 ──────────────────────────────────
alter table public.moods add column if not exists state text
  check (state in ('joyful','proud','peaceful','tired','stressed','focused','down'));

-- ─── Disponibilité pour un appel ("call flag") ───────────────────────────
create table if not exists public.availability (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null check (status in ('free','soon','with_people','busy_activity','on_call','unavailable')),
  note text check (char_length(note) <= 80),
  updated_at timestamptz not null default now()
);
alter table public.availability enable row level security;
drop policy if exists "availability select partners" on public.availability;
create policy "availability select partners" on public.availability for select to authenticated
  using (user_id = auth.uid() or user_id = public.get_partner_id(auth.uid()));
drop policy if exists "availability upsert own" on public.availability;
create policy "availability upsert own" on public.availability for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "availability update own" on public.availability;
create policy "availability update own" on public.availability for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── Position & parcours ─────────────────────────────────────────────────
alter table public.profiles add column if not exists share_location boolean not null default false;

create table if not exists public.locations (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy real,
  recorded_at timestamptz not null default now()
);
create index if not exists locations_user_time_idx on public.locations(user_id, recorded_at desc);
alter table public.locations enable row level security;
drop policy if exists "locations select partners" on public.locations;
create policy "locations select partners" on public.locations for select to authenticated
  using (user_id = auth.uid() or (user_id = public.get_partner_id(auth.uid())
         and exists (select 1 from public.profiles p where p.id = user_id and p.share_location)));
drop policy if exists "locations insert own" on public.locations;
create policy "locations insert own" on public.locations for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "locations delete own" on public.locations;
create policy "locations delete own" on public.locations for delete to authenticated
  using (user_id = auth.uid());

-- On ne garde que 48 h de parcours (vie privée + table légère)
create or replace function public.prune_old_locations()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.locations where user_id = new.user_id and recorded_at < now() - interval '48 hours';
  return new;
end $$;
drop trigger if exists locations_prune on public.locations;
create trigger locations_prune after insert on public.locations
  for each row execute function public.prune_old_locations();
revoke execute on function public.prune_old_locations() from public, anon, authenticated;

-- ─── Agenda : type d'événement obligatoire ───────────────────────────────
alter table public.calendar_events add column if not exists kind text not null default 'together'
  check (kind in ('together','solo'));
update public.calendar_events set kind = case when is_shared then 'together' else 'solo' end where kind = 'together' and is_shared = false;

-- ─── Emploi du temps hebdomadaire ────────────────────────────────────────
create table if not exists public.schedule_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- 1 = lundi
  start_time time not null,
  end_time time not null,
  title text not null check (char_length(title) between 1 and 60),
  location text check (char_length(location) <= 60),
  color text not null default '#D4A574',
  created_at timestamptz not null default now(),
  constraint schedule_end_after_start check (end_time > start_time)
);
create index if not exists schedule_user_day_idx on public.schedule_slots(user_id, weekday, start_time);
alter table public.schedule_slots enable row level security;
drop policy if exists "schedule select partners" on public.schedule_slots;
create policy "schedule select partners" on public.schedule_slots for select to authenticated
  using (user_id = auth.uid() or user_id = public.get_partner_id(auth.uid()));
drop policy if exists "schedule insert own" on public.schedule_slots;
create policy "schedule insert own" on public.schedule_slots for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "schedule update own" on public.schedule_slots;
create policy "schedule update own" on public.schedule_slots for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "schedule delete own" on public.schedule_slots;
create policy "schedule delete own" on public.schedule_slots for delete to authenticated
  using (user_id = auth.uid());

-- ─── Realtime ────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['vlogs','availability','locations','schedule_slots','moods','calendar_events']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Les suppressions doivent exposer l'ancienne ligne pour le realtime (filtrage côté client)
alter table public.vlogs replica identity full;
alter table public.schedule_slots replica identity full;
alter table public.availability replica identity full;

-- Pas d'accès anonyme
revoke all on public.vlogs, public.availability, public.locations, public.schedule_slots from anon;

-- Tables déjà écoutées côté client mais absentes de la publication realtime (bug latent)
do $$
declare t text;
begin
  foreach t in array array['capsules','countdowns','love_notes','question_answers','taps','timeline_events','todo_items','todo_lists','watch_items']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
