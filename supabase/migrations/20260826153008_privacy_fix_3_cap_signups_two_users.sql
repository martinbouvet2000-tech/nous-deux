-- Correction 3 : fermer l'inscription au niveau base (l'app ne vise que 2 personnes déjà créées).
-- Le toggle "Enable signups" du dashboard n'est pas pilotable via MCP ; on pose donc une garde
-- APPLICABLE en base : un trigger BEFORE INSERT sur auth.users qui refuse la création d'un
-- 3e compte. Cap basé sur le COUNT (PII-free) : la suppression d'un compte libère une place.
-- Count vérifié avant migration : 2 utilisateurs.
-- NB : à compléter côté Dashboard Supabase — désactiver "Enable signups" et activer
--      "leaked password protection" (voir advisor sécurité).
-- Rollback : `drop trigger if exists enforce_user_cap on auth.users;`
--            `drop function if exists public.enforce_user_cap();`

create or replace function public.enforce_user_cap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from auth.users) >= 2 then
    raise exception 'Inscription desactivee : le nombre maximum de comptes (2) est atteint.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_user_cap on auth.users;
create trigger enforce_user_cap
  before insert on auth.users
  for each row execute function public.enforce_user_cap();
