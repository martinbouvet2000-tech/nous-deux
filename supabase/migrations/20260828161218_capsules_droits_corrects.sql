-- ─────────────────────────────────────────────────────────────────────────────
-- Capsules : remettre les droits au bon niveau
--
-- Contexte. Le correctif de confidentialité du 26 août (privacy_fix_4) a
-- révoqué des droits de table sur `capsules` pour « sceller » le contenu. En
-- réalité le sceau est assuré par la règle RLS de lecture :
--
--     sender_id = auth.uid()
--     OR (receiver_id = auth.uid() AND reveal_date <= CURRENT_DATE)
--
-- Le/la destinataire ne peut donc pas lire la ligne — contenu compris — avant
-- la date d'ouverture. La révocation du SELECT n'ajoutait rien à ce sceau,
-- mais elle cassait deux fonctions légitimes : l'export de données
-- (SettingsPage) et la suppression d'une capsule non ouverte, qui a besoin de
-- lire `id` dans son WHERE.
--
-- Effet de bord réel et non désiré : le droit UPDATE avait lui aussi disparu,
-- alors que la règle « Receiver can open capsule » existe toujours. Résultat,
-- ouvrir une capsule échouait au niveau privilège, avant même d'atteindre la
-- règle. La table étant vide, la panne était invisible.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Rendre l'ouverture possible — au minimum strict.
--    Seules les deux colonnes que le client écrit en ouvrant sont concédées ;
--    `content`, `reveal_date`, `sender_id` et `receiver_id` restent en lecture
--    seule pour tout le monde. Les LIGNES concernées restent bornées par la
--    règle « Receiver can open capsule » (destinataire + date atteinte).
grant update (is_opened, opened_at) on public.capsules to authenticated;

-- 2. Retirer à `anon` des droits qui n'ont aucune raison d'être.
--    Aucune règle RLS ne les laissait aboutir (INSERT exige
--    sender_id = auth.uid(), NULL pour un visiteur anonyme ; aucune règle
--    DELETE ne vise `anon`), mais un droit inutile est un droit à retirer.
revoke all on public.capsules from anon;

-- 3. Ce qui reste volontairement ouvert pour `authenticated`, borné par RLS :
--      SELECT  — export de données, et lecture par l'expéditeur ; le sceau
--                côté destinataire est tenu par la règle de lecture.
--      INSERT  — création, bornée à sender_id = soi et receiver_id = partenaire.
--      DELETE  — suppression par l'expéditeur d'une capsule non encore ouverte.
--    `get_capsules()` (SECURITY DEFINER) reste la voie de lecture de l'app :
--    elle masque `content` tant que la date n'est pas atteinte.
grant select, insert, delete on public.capsules to authenticated;
