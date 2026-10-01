-- Rôles séparés pour le registre d'information
--
-- Chaque compte a désormais deux rôles indépendants :
--   - public.users.role          : déclarations d'incident (saisisseur, validateur, auditeur), inchangé
--   - public.users.role_registre : registre d'information
--       'gestionnaire' : consulte et modifie (saisie, import, lignes en attente)
--       'lecteur'      : consulte (rapport d'anomalies, export)
--       vide (null)    : aucun accès, l'onglet Registre n'apparaît pas
-- Reprise des comptes existants (une seule fois, à l'ajout de la colonne) : saisisseur ->
-- gestionnaire, validateur et auditeur -> lecteur. Les nouveaux comptes n'ont aucun accès au
-- registre tant qu'un administrateur ne l'a pas ouvert :
--   update public.users set role_registre = 'gestionnaire' where email = 'prenom.nom@actionlogement.fr';
-- Les règles d'accès des 14 tables du registre s'appuient sur ce rôle.
-- Dépend des migrations 20260928000000 à 20261005000000.
-- Retour arrière : supabase/rollback/20261006000000_roles_registre_rollback.sql

begin;

set local client_min_messages = warning;

-- Colonne et reprise des droits actuels, uniquement à la création de la colonne (un nouveau
-- passage du script ne rouvre pas un accès retiré entre-temps)
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'users' and column_name = 'role_registre') then
    alter table public.users add column role_registre text
      constraint users_role_registre_check check (role_registre in ('gestionnaire', 'lecteur'));
    update public.users
       set role_registre = case role when 'saisisseur' then 'gestionnaire' else 'lecteur' end;
  end if;
end;
$$;

comment on column public.users.role_registre is
  'Rôle sur le registre d''information : gestionnaire (modifie), lecteur (consulte), null (aucun accès)';

create or replace function public.current_registre_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role_registre from public.users where id = auth.uid()
$$;

revoke all on function public.current_registre_role() from public, anon;
grant execute on function public.current_registre_role() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ri_teneur_registre', 'ri_entites', 'ri_succursales', 'ri_prestataires',
    'ri_fonctions', 'ri_contrats', 'ri_contrats_services', 'ri_accords_intragroupe',
    'ri_signataires_reception', 'ri_signataires_fourniture', 'ri_sous_traitance',
    'ri_evaluations', 'ri_definitions', 'ri_import_rejets'
  ] loop
    execute format('drop policy if exists ri_lecture on public.%I', t);
    execute format('create policy ri_lecture on public.%I for select to authenticated
                    using (public.current_registre_role() in (''gestionnaire'', ''lecteur''))', t);
    execute format('drop policy if exists ri_creation on public.%I', t);
    execute format('create policy ri_creation on public.%I for insert to authenticated
                    with check (public.current_registre_role() = ''gestionnaire'')', t);
    execute format('drop policy if exists ri_modification on public.%I', t);
    execute format('create policy ri_modification on public.%I for update to authenticated
                    using (public.current_registre_role() = ''gestionnaire'')
                    with check (public.current_registre_role() = ''gestionnaire'')', t);
    execute format('drop policy if exists ri_suppression on public.%I', t);
    execute format('create policy ri_suppression on public.%I for delete to authenticated
                    using (public.current_registre_role() = ''gestionnaire'')', t);
  end loop;
end;
$$;

create or replace function public.ri_anomalies()
returns table (
  gravite       text,
  modele        text,
  colonne       text,
  section       text,
  reference     text,
  message       text,
  rejet_id      uuid,
  rejet_donnees jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from (
    select 'bloquant', r.modele, null::text, r.section, r.reference,
           'Ligne du fichier Excel'
             || coalesce(' (onglet ' || r.onglet || coalesce(', ligne ' || r.ligne, '') || ')', '')
             || ' non reprise dans le registre : ' || rtrim(r.motif, '. ')
             || '. Cliquez sur « Compléter la ligne » pour la corriger.',
           r.id, r.donnees
    from public.ri_import_rejets r
    union all
    select a.gravite, a.modele, a.colonne, a.section, a.reference, a.message, null::uuid, null::jsonb
    from public.ri_anomalies_registre() a
  ) x(gravite, modele, colonne, section, reference, message, rejet_id, rejet_donnees)
  -- Sans accès au registre : aucun résultat (les tables vides produiraient de fausses anomalies)
  where public.current_registre_role() is not null
  order by case x.gravite when 'bloquant' then 1 when 'avertissement' then 2 else 3 end,
           x.rejet_id is null, x.modele, x.reference nulls first, x.colonne
$$;

commit;
