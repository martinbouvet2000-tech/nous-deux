-- ─── Plus de choix d'humeurs (mascotte hamster) ───────────────────────
-- Assouplit la contrainte CHECK sur moods.state pour accueillir les 5 nouvelles
-- humeurs (love, excited, sick, angry, bored) en plus des 7 existantes.
-- La contrainte inline posée en 20260819120000 a été auto-nommée moods_state_check.
alter table public.moods drop constraint if exists moods_state_check;
alter table public.moods add constraint moods_state_check
  check (state in (
    'joyful','proud','excited','love','peaceful','focused',
    'tired','bored','sick','stressed','angry','down'
  ));
