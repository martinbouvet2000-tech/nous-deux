-- Awy — `jour_du_creneau()` était la seule des 28 fonctions du schéma `public` à ne pas
-- fixer son `search_path`. Elle ne lit aucune table et tourne avec les droits de
-- l'appelant, donc le risque réel était faible — mais le linter Supabase la signalait et
-- elle rompait une convention tenue partout ailleurs. Introduite le 31 août dans la
-- migration des dates : correction de la même main.
create or replace function public.jour_du_creneau()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  -- Une date précise impose son jour de la semaine ; sans date, `weekday` reste tel quel.
  if new.slot_date is not null then
    new.weekday := extract(isodow from new.slot_date)::smallint;
  end if;
  return new;
end;
$fn$;
