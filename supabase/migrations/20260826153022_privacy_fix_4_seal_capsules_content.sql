-- Correction 4 : sceller le CONTENU des capsules jusqu'à reveal_date.
-- Avant : le CONTENU (`content`) était lisible via un SELECT direct sur la table par le
--   destinataire dès la révélation, et la table exposait ses colonnes.
-- Après : on RETIRE le droit SELECT direct sur public.capsules (roles authenticated + anon),
--   et on expose une fonction SECURITY DEFINER `get_capsules()` qui renvoie les capsules du
--   couple en masquant `content` (NULL) tant que
--   `auth.uid() <> sender_id AND reveal_date > current_date`.
--   L'expéditeur voit toujours son propre contenu. Un tiers n'obtient aucune ligne (filtre sur
--   sender_id/receiver_id = auth.uid()).
--   INSERT direct (policy "Users can create capsules"), UPDATE colonnaire (is_opened, opened_at)
--   et DELETE restent régis par les policies/grants existants : ils n'exigent pas SELECT.
-- Table vide au moment de la migration (0 ligne).
-- Rollback :
--   grant select on public.capsules to authenticated, anon;
--   drop function if exists public.get_capsules();

-- 1) Couper la lecture directe de la table
revoke select on public.capsules from authenticated;
revoke select on public.capsules from anon;

-- 2) Fonction d'accès contrôlé, contenu masqué avant révélation pour le destinataire
create or replace function public.get_capsules()
returns table (
  id uuid,
  sender_id uuid,
  receiver_id uuid,
  content text,
  image_url text,
  reveal_date date,
  is_opened boolean,
  opened_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.sender_id,
    c.receiver_id,
    case
      when auth.uid() <> c.sender_id and c.reveal_date > current_date then null
      else c.content
    end as content,
    c.image_url,
    c.reveal_date,
    c.is_opened,
    c.opened_at,
    c.created_at
  from public.capsules c
  where c.sender_id = auth.uid() or c.receiver_id = auth.uid()
  order by c.reveal_date asc;
$$;

revoke all on function public.get_capsules() from public;
grant execute on function public.get_capsules() to authenticated;
