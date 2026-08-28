-- Correction 2 : resserrer les RLS de `streaks` et `album_memories`.
-- Avant : USING/WITH CHECK = `auth.uid() IS NOT NULL` (toute personne connectée, y compris
--   un tiers qui vient de créer un compte).
-- Après : `get_partner_id(auth.uid()) IS NOT NULL` — seuls les comptes ayant un partenaire
--   lié (= les 2 membres du couple) passent. Un tiers isolé (partner_id NULL) est bloqué.
--   Aucun changement de schéma, aucun backfill. Tables vides au moment de la migration.
-- Rollback : recréer les policies avec `(auth.uid() IS NOT NULL)`.

-- ===== streaks (SELECT / INSERT / UPDATE) =====
drop policy if exists "streaks authenticated select" on public.streaks;
drop policy if exists "streaks authenticated insert" on public.streaks;
drop policy if exists "streaks authenticated update" on public.streaks;

create policy "streaks authenticated select" on public.streaks for select to authenticated
  using (get_partner_id(auth.uid()) is not null);
create policy "streaks authenticated insert" on public.streaks for insert to authenticated
  with check (get_partner_id(auth.uid()) is not null);
create policy "streaks authenticated update" on public.streaks for update to authenticated
  using (get_partner_id(auth.uid()) is not null)
  with check (get_partner_id(auth.uid()) is not null);

-- ===== album_memories (SELECT / INSERT / UPDATE / DELETE) =====
drop policy if exists "album_memories authenticated select" on public.album_memories;
drop policy if exists "album_memories authenticated insert" on public.album_memories;
drop policy if exists "album_memories authenticated update" on public.album_memories;
drop policy if exists "album_memories authenticated delete" on public.album_memories;

create policy "album_memories authenticated select" on public.album_memories for select to authenticated
  using (get_partner_id(auth.uid()) is not null);
create policy "album_memories authenticated insert" on public.album_memories for insert to authenticated
  with check (get_partner_id(auth.uid()) is not null);
create policy "album_memories authenticated update" on public.album_memories for update to authenticated
  using (get_partner_id(auth.uid()) is not null)
  with check (get_partner_id(auth.uid()) is not null);
create policy "album_memories authenticated delete" on public.album_memories for delete to authenticated
  using (get_partner_id(auth.uid()) is not null);
