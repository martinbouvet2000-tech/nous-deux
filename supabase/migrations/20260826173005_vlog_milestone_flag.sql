-- ─── Vlog : étape importante ───────────────────────────────────
-- Fusion de l'onglet « Notre histoire » (timeline_events) dans le Vlog :
-- un seul fil où certains moments peuvent être marqués comme étape importante.
-- Colonne additive et sûre : NOT NULL avec DEFAULT false, aucun backfill requis.
alter table public.vlogs
  add column if not exists is_milestone boolean not null default false;

-- Index partiel : le filtre « Étapes » ne lit que les vlogs marqués.
create index if not exists vlogs_milestone_idx
  on public.vlogs(author_id, taken_at desc)
  where is_milestone;
