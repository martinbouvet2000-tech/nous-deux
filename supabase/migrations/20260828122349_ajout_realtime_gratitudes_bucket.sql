-- ═══════════════════════════════════════════════════════════════════════════
-- Point 11 de l'audit — deux tables oubliées de la synchronisation temps réel.
--
-- `gratitudes` (GratitudeWidget) et `bucket_items` (page Activités) sont déjà
-- écoutées côté client via `postgres_changes`, mais elles n'ont jamais été
-- ajoutées à la publication `supabase_realtime` : l'abonnement se connecte sans
-- erreur et ne reçoit simplement jamais rien. Résultat, la gratitude de l'autre
-- ou un rêve ajouté n'apparaissaient qu'au rechargement de la page.
--
-- Migration idempotente : rejouable sans rien casser (rien n'est supprimé, tout
-- est conditionné). Aucune donnée n'est touchée.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
  oid_t oid;
begin
  foreach t in array array['gratitudes', 'bucket_items']
  loop
    oid_t := to_regclass(format('public.%I', t));

    -- Environnement partiel (table absente) : on passe, le rejeu reste sûr.
    if oid_t is null then
      raise notice 'Table public.% absente — étape ignorée', t;
      continue;
    end if;

    -- 1. Ajout à la publication realtime, seulement si elle n'y est pas déjà.
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;

    -- 2. REPLICA IDENTITY FULL : sans elle, un DELETE ne publie que la clé
    --    primaire, et les filtres côté client (`user_id=eq.…`) ne matchent plus.
    --    Les deux tables sont supprimables (réinitialisation du compte, retrait
    --    d'un rêve), donc les deux en ont besoin. 'f' = full.
    if (select relreplident from pg_class where oid = oid_t) <> 'f' then
      execute format('alter table public.%I replica identity full', t);
    end if;
  end loop;
end $$;
