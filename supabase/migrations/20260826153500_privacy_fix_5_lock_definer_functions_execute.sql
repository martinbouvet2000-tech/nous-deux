-- Correction 5 (durcissement complémentaire suite à l'advisor sécurité) :
-- Les default privileges Supabase accordent EXECUTE sur les fonctions du schéma public à
-- anon + authenticated à la création — ce qui expose ces fonctions via /rest/v1/rpc/.
--
--  * public.enforce_user_cap() est une fonction de TRIGGER : elle ne doit être appelable par
--    personne en RPC. Le trigger continue de s'exécuter (il tourne sous le rôle propriétaire,
--    indépendamment des grants EXECUTE), donc ceci ne casse rien.
--  * public.get_capsules() ne doit être appelable que par les utilisateurs connectés
--    (authenticated). On retire l'accès anon (sans effet de données puisque auth.uid() est NULL
--    pour anon → 0 ligne, mais on applique le moindre privilège).
--
-- Rollback :
--   grant execute on function public.enforce_user_cap() to anon, authenticated;
--   grant execute on function public.get_capsules() to anon;

revoke execute on function public.enforce_user_cap() from public;
revoke execute on function public.enforce_user_cap() from anon;
revoke execute on function public.enforce_user_cap() from authenticated;

revoke execute on function public.get_capsules() from anon;
