# Déploiement sur le Supabase self-hosted

Procédure de mise en production du registre d'information DORA (octobre 2026).
Durée : environ 30 minutes, sans interruption de service pour les déclarations d'incident.

## 1. Avant de commencer

- Branche fusionnée dans `main`, code à jour dans le poste de build.
- La migration `20260928000000_durcissement_rls.sql` est déjà appliquée sur le self-hosted
  (sinon le script s'arrête avec un message explicite).
- Sauvegarde : la DSI fait un `pg_dump` de la base si possible. À défaut, dans le SQL Editor,
  exporter le résultat de :

  ```sql
  select pg_get_functiondef('public.handle_new_user'::regproc)
  union all
  select pg_get_functiondef('public.check_email_domain'::regproc);
  ```

  Ce sont les deux seuls objets existants remplacés. Tout le reste est nouveau : aucune donnée
  existante (déclarations, commentaires, comptes) n'est modifiée.

## 2. Base de données

1. SQL Editor du Studio, **nouvelle requête**, rien de sélectionné.
2. Coller **tout** le fichier `supabase/deploiement/2026-10_registre_self_hosted.sql`, puis Run.
   Résultat attendu : `Success. No rows returned`.
3. Nouvelle requête : coller `supabase/deploiement/verification.sql`, Run.
   Toutes les lignes doivent afficher `ok = true`. Lire les deux lignes « info » :
   - comptes hors `@actionlogement.fr` : à supprimer s'il en reste (comptes de test) ;
   - comptes par rôle : contrôler que chacun a le bon rôle.

Le script est rejouable : en cas d'erreur (coupure, copier-coller incomplet), corriger puis le
relancer en entier.

Retour arrière : fichiers de `supabase/rollback/`, dans l'ordre inverse
(20261007, 20261006, 20261005, 20261004, 20261003, 20261002, 20261001, 20260930). Le dernier supprime les tables du
registre et leurs données.

## 3. Configuration de l'authentification (DSI, fichier `.env` du self-hosted)

| Paramètre | Valeur | Pourquoi |
|---|---|---|
| `DISABLE_SIGNUP` | `true` | Les comptes sont créés par un administrateur (Studio > Authentication > Add user / Invite). Sans cela, n'importe qui disposant de l'URL et de la clé publique peut appeler l'API d'inscription. |
| `ENABLE_EMAIL_AUTOCONFIRM` | `false` | L'adresse doit être confirmée. |
| `SITE_URL` / `ADDITIONAL_REDIRECT_URLS` | URL de l'application | Liens de réinitialisation du mot de passe. |
| `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `POSTGRES_PASSWORD`, `DASHBOARD_PASSWORD` | valeurs propres à l'installation | Ne jamais garder les valeurs d'exemple de Supabase. |

Le Studio ne doit être accessible que depuis le réseau d'administration.

## 4. Rôles des utilisateurs

Chaque compte a deux rôles indépendants :

| Colonne | Partie | Valeurs |
|---|---|---|
| `role` | Déclarations d'incident | `saisisseur` (crée et modifie ses brouillons), `validateur` (valide), `auditeur` (consulte les déclarations validées) |
| `role_registre` | Registre d'information | `gestionnaire` (consulte et modifie, import compris), `lecteur` (consulte, rapport d'anomalies, export), vide = aucun accès (onglet masqué) |

Au déploiement, les comptes existants reçoivent un rôle registre équivalent à leurs droits actuels
(saisisseur → gestionnaire, validateur et auditeur → lecteur). Les nouveaux comptes sont
`auditeur` pour les incidents et sans accès au registre. Attribuer ensuite les rôles voulus :

```sql
update public.users set role = 'saisisseur' where email = 'prenom.nom@actionlogement.fr';
update public.users set role_registre = 'gestionnaire' where email = 'prenom.nom@actionlogement.fr';
update public.users set role_registre = null where email = 'prenom.nom@actionlogement.fr';  -- retirer l'accès
```

L'utilisateur doit se reconnecter (ou recharger la page) pour que le changement s'applique à
l'écran ; la base l'applique immédiatement.

## 5. Application

```bash
npm ci
npm run build          # avec le .env de production (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
docker build --no-cache -t dora-incident-app .   # copie dist/ : les --build-arg sont sans effet
docker tag / docker push vers le registre interne
```

Après déploiement par la DSI, vérifier les en-têtes de sécurité :

```bash
curl -sI https://<url-de-l-application>/ | grep -iE "content-security|x-frame|x-content-type"
```

Si un reverse proxy est placé devant, il ne doit pas retirer ces en-têtes. La CSP autorise les
appels HTTPS vers Supabase et l'API publique du GLEIF : si Supabase est servi en HTTP simple,
ajouter son URL à `connect-src` dans `nginx.conf`.

## 6. Recette

1. Connexion avec un compte de chaque rôle, dont un compte aux rôles croisés (par exemple
   saisisseur des incidents et lecteur du registre).
2. Déclaration d'incident : création (saisisseur), validation (validateur), lecture (auditeur).
3. Registre : onglet visible, rapport d'anomalies, vérification GLEIF (accès sortant à
   `api.gleif.org` à autoriser par la DSI), import d'un fichier Excel, export ACPR.
4. Un lecteur du registre ne voit ni le bouton d'import ni les boutons de modification ;
   un compte sans rôle registre ne voit pas l'onglet Registre.
