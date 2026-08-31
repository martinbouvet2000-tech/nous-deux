-- Awy — tenir la promesse affichée dans l'app : « Parcours conservé 48 h, puis effacé ».
--
-- CE QUI N'ALLAIT PAS. La purge était un déclencheur `after insert ... for each row`
-- qui n'effaçait que les points de `new.user_id`. Autrement dit : les vieux points de
-- quelqu'un ne disparaissaient que si cette même personne enregistrait un nouveau point.
-- Dès qu'on coupe le partage de position — exactement le moment où l'on veut que la
-- trace s'efface — plus rien ne se déclenchait. Mesuré le 31 août : 9 points de plus de
-- 48 h encore en base, le plus ancien vieux de deux jours.
--
-- CE QUI CHANGE. Trois choses :
--   1. La purge devient globale : elle efface tout ce qui a plus de 48 h, quel qu'en
--      soit l'auteur.
--   2. Elle passe en `for each statement` : une fois par insertion groupée au lieu
--      d'une fois par ligne — même effet, beaucoup moins de travail.
--   3. Un `pg_cron` horaire prend le relais quand personne n'enregistre plus rien.
--      C'est lui qui rend la promesse vraie dans le seul cas qui comptait.

-- Fonction appelable directement — c'est elle que le cron déclenchera. Réservée au
-- propriétaire : ni `anon` ni `authenticated` ne peuvent effacer les positions d'autrui.
create or replace function public.purger_positions_perimees()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  supprimees integer;
begin
  delete from public.locations where recorded_at < now() - interval '48 hours';
  get diagnostics supprimees = row_count;
  return supprimees;
end;
$fn$;

revoke execute on function public.purger_positions_perimees() from public, anon, authenticated;

-- Le déclencheur ne fait plus que déléguer, et une seule fois par instruction.
create or replace function public.prune_old_locations()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.purger_positions_perimees();
  return null;
end;
$fn$;

drop trigger if exists locations_prune on public.locations;
create trigger locations_prune
  after insert on public.locations
  for each statement execute function public.prune_old_locations();

-- Le filet horaire. Sans lui, arrêter de partager sa position figeait le parcours.
do $cron$
begin
  perform cron.unschedule('awy_purge_positions');
exception when others then
  null; -- la tâche n'existait pas encore : rien à retirer.
end
$cron$;

select cron.schedule('awy_purge_positions', '17 * * * *', $job$select public.purger_positions_perimees();$job$);
