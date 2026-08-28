-- Correction 1 : bucket Storage `album-photos` privatisé et cloisonné sur le modèle
-- EXACT du bucket `vlogs` (dossier de premier niveau = auth.uid()).
-- État capturé avant migration :
--   * storage.buckets: album-photos public=true (0 objet)
--   * policies bucket-wide permissives to {anon,authenticated}:
--       "album bucket read"   SELECT using (bucket_id='album-photos')
--       "album bucket insert" INSERT with check (bucket_id='album-photos')
--       "album bucket delete" DELETE using (bucket_id='album-photos')
-- Rollback : recréer ces 3 policies + `update storage.buckets set public=true where id='album-photos'`
--            et supprimer les policies "album storage *".

-- 1) Bucket privé (métadonnée de configuration, pas une donnée du couple ; bucket vide)
update storage.buckets set public = false where id = 'album-photos';

-- 2) Retrait des policies permissives bucket-wide
drop policy if exists "album bucket read"   on storage.objects;
drop policy if exists "album bucket insert" on storage.objects;
drop policy if exists "album bucket delete" on storage.objects;

-- 3) Policies scopées (calquées sur "vlogs storage read/insert/delete")
--    Lecture élargie au partenaire via get_partner_id ; écriture/suppression au seul propriétaire.
create policy "album storage read" on storage.objects for select to authenticated
  using (
    bucket_id = 'album-photos'
    and (
      (storage.foldername(name))[1] = (auth.uid())::text
      or (storage.foldername(name))[1] = (get_partner_id(auth.uid()))::text
    )
  );

create policy "album storage insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'album-photos'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy "album storage delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'album-photos'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );
