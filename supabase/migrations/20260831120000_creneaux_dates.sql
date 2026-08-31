-- ═══════════════════════════════════════════════════════════════════════════
-- EMPLOI DU TEMPS : DES DATES RÉELLES, PAS SEULEMENT UNE SEMAINE TYPE
--
-- Jusqu'ici `schedule_slots` ne connaissait qu'un jour de semaine : l'emploi du
-- temps était une semaine qui se répète à l'infini. Impossible d'y mettre une
-- année scolaire, où les cours changent d'une semaine à l'autre, où il y a des
-- vacances, des semaines de stage, des rattrapages.
--
-- On ajoute donc `slot_date`, facultative :
--   • `slot_date` vide  → le créneau se répète chaque semaine (comportement
--     d'avant, les lignes existantes ne bougent pas d'un iota) ;
--   • `slot_date` remplie → le créneau n'a lieu que ce jour-là.
--
-- `weekday` est conservé et tenu à jour automatiquement à partir de la date :
-- tout ce qui existe déjà (index, règles d'accès, affichage, bannière « en ce
-- moment ») continue de fonctionner sans savoir que les dates existent.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.schedule_slots
  add column if not exists slot_date date;

comment on column public.schedule_slots.slot_date is
  'Date précise du créneau. NULL = créneau hebdomadaire qui se répète.';

-- ─── Cohérence jour ↔ date ────────────────────────────────────────────────
-- `isodow` renvoie 1 pour lundi … 7 pour dimanche : exactement la convention
-- de `weekday`. Le déclencheur garantit qu'on ne peut pas enregistrer un
-- créneau daté d'un mardi en le rangeant dans la colonne du jeudi, quelle que
-- soit la voie d'écriture (app, import, requête à la main).
create or replace function public.jour_du_creneau()
returns trigger
language plpgsql
as $$
begin
  if new.slot_date is not null then
    new.weekday := extract(isodow from new.slot_date)::smallint;
  end if;
  return new;
end;
$$;

drop trigger if exists schedule_slots_jour on public.schedule_slots;
create trigger schedule_slots_jour
  before insert or update of slot_date, weekday on public.schedule_slots
  for each row execute function public.jour_du_creneau();

-- ─── Fenêtre raisonnable ──────────────────────────────────────────────────
-- Une année scolaire, pas un siècle : une date hors de cette fenêtre est une
-- erreur de lecture de fichier, pas une intention.
alter table public.schedule_slots
  drop constraint if exists schedule_slot_date_raisonnable;
alter table public.schedule_slots
  add constraint schedule_slot_date_raisonnable
  check (slot_date is null or (slot_date >= date '2000-01-01' and slot_date <= date '2100-01-01'));

-- ─── Index ────────────────────────────────────────────────────────────────
-- L'écran affiche une semaine à la fois : on lit une plage de dates pour une
-- personne. Index partiel — les créneaux hebdomadaires n'y ont rien à faire.
create index if not exists schedule_user_date_idx
  on public.schedule_slots(user_id, slot_date, start_time)
  where slot_date is not null;
