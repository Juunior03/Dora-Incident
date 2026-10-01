-- Vérification après déploiement (SQL Editor, à exécuter tel quel).
-- Chaque ligne doit afficher ok = true ; les lignes « info » sont à lire.

with
tables_publiques as (
  select c.oid, c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
fonctions_definer as (
  select p.oid, p.proname, p.proconfig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
)
select * from (values
  ('Tables du registre (ri_*) présentes',
     (select count(*) from tables_publiques where relname like 'ri\_%')::text, '14',
     (select count(*) from tables_publiques where relname like 'ri\_%') = 14),
  ('Tables publiques sans RLS',
     coalesce((select string_agg(relname, ', ') from tables_publiques where not relrowsecurity), 'aucune'), 'aucune',
     not exists (select 1 from tables_publiques where not relrowsecurity)),
  ('Droits du rôle anon sur les tables publiques',
     coalesce((select string_agg(distinct table_name, ', ') from information_schema.role_table_grants
               where grantee = 'anon' and table_schema = 'public'), 'aucun'), 'aucun',
     not exists (select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public')),
  ('Fonctions privilégiées exécutables par anon',
     coalesce((select string_agg(proname, ', ') from fonctions_definer where has_function_privilege('anon', oid, 'execute')), 'aucune'), 'aucune',
     not exists (select 1 from fonctions_definer where has_function_privilege('anon', oid, 'execute'))),
  ('Fonctions privilégiées sans search_path fixé',
     coalesce((select string_agg(proname, ', ') from fonctions_definer
               where not exists (select 1 from unnest(coalesce(proconfig, '{}')) x where x like 'search_path=%')), 'aucune'), 'aucune',
     not exists (select 1 from fonctions_definer
                 where not exists (select 1 from unnest(coalesce(proconfig, '{}')) x where x like 'search_path=%'))),
  ('Règles permettant de modifier public.users (rôles)',
     coalesce((select string_agg(policyname, ', ') from pg_policies
               where schemaname = 'public' and tablename = 'users' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')), 'aucune'), 'aucune',
     not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'users' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL'))),
  ('Rapport d''anomalies exécutable',
     (select count(*) from public.ri_anomalies())::text || ' anomalie(s)', 'fonction appelable', true),
  ('Contrôle du domaine @actionlogement.fr (déclencheurs)',
     (select string_agg(t.tgname, ', ') from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal and p.proname = 'check_email_domain'), 'création et modification',
     (select count(*) from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal and p.proname = 'check_email_domain') >= 2),
  ('Création des comptes (déclencheur handle_new_user)',
     coalesce((select string_agg(t.tgname, ', ') from pg_trigger t join pg_proc p on p.oid = t.tgfoid
               where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal and p.proname = 'handle_new_user'), 'ABSENT'), 'présent',
     exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
             where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal and p.proname = 'handle_new_user')),
  ('Rôle attribué aux nouveaux comptes',
     case when (select prosrc from pg_proc where proname = 'handle_new_user' and pronamespace = 'public'::regnamespace) like '%''auditeur''%'
          then 'auditeur' else 'autre' end, 'auditeur',
     (select prosrc from pg_proc where proname = 'handle_new_user' and pronamespace = 'public'::regnamespace) like '%''auditeur''%'),
  ('info : comptes hors domaine @actionlogement.fr',
     coalesce((select string_agg(email, ', ') from public.users where lower(email) !~ '@actionlogement\.fr$'), 'aucun'), 'aucun (sinon à supprimer)',
     true),
  ('info : comptes par rôle',
     (select string_agg(role || ' : ' || n, ', ' order by role) from (select role, count(*) n from public.users group by role) r), '-',
     true)
) as v(controle, resultat, attendu, ok);
