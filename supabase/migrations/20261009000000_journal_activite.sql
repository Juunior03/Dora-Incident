-- Journal d'activité des déclarations d'incident et du registre d'information
--
-- Chaque action est enregistrée par la base elle-même (déclencheurs), quelle que soit la façon dont
-- elle est faite (application, API, Studio) : création, modification, validation, reclassement et
-- commentaire d'une déclaration ; ajout, modification et suppression de lignes du registre (une
-- entrée par opération et par table, avec le nombre de lignes : un import de 300 lignes ne donne
-- pas 300 entrées).
-- Le journal est en lecture seule : aucun utilisateur ne peut y écrire, le modifier ou le vider.
-- Chacun n'y voit que ce à quoi il a déjà accès : les entrées d'une déclaration suivent les droits
-- de lecture de cette déclaration, celles du registre sont réservées aux comptes ayant un rôle sur
-- le registre.
-- L'historique commence à l'application de cette migration.
-- Retour arrière : supabase/rollback/20261009000000_journal_activite_rollback.sql

begin;

set local client_min_messages = warning;

create table if not exists public.journal_activite (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  utilisateur uuid,
  email text,
  partie text not null check (partie in ('declarations', 'registre')),
  action text not null check (action in ('creation', 'modification', 'validation', 'reclassement',
                                         'commentaire', 'ajout', 'suppression')),
  objet text not null,          -- table concernée
  objet_id text,                -- identifiant de la déclaration (partie « declarations »)
  incident text,                -- code de l'incident (2.1)
  type_rapport text,            -- type de déclaration (incidentSubmission)
  nb_lignes integer,            -- registre : nombre de lignes concernées
  nb_champs integer,            -- modification d'une déclaration : nombre de champs modifiés
  detail text
);

create index if not exists journal_activite_cree_le on public.journal_activite (cree_le desc);
create index if not exists journal_activite_objet_id on public.journal_activite (objet_id);

comment on table public.journal_activite is
  'Journal d''activité (déclarations d''incident et registre), alimenté par déclencheurs, en lecture seule';

-- Auteur de l'action : compte connecté, ou « administrateur (SQL) » hors application
create or replace function public.journal_auteur(out id uuid, out email text)
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid(),
         coalesce((select u.email from public.users u where u.id = auth.uid()),
                  case when auth.uid() is null then 'administrateur (SQL)' end)
$$;

-- Nombre de valeurs différentes entre deux documents JSON (comparaison des feuilles)
create or replace function public.journal_nb_differences(a jsonb, b jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer := 0;
  cle text;
begin
  if a is null and b is null then return 0; end if;
  if jsonb_typeof(a) is distinct from 'object' or jsonb_typeof(b) is distinct from 'object' then
    return case when a is distinct from b then 1 else 0 end;
  end if;
  for cle in select k from jsonb_object_keys(a) k union select k from jsonb_object_keys(b) k loop
    n := n + public.journal_nb_differences(a -> cle, b -> cle);
  end loop;
  return n;
end;
$$;

-- Déclarations d'incident
create or replace function public.journaliser_rapport()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auteur record;
  type_r text := new.report_data ->> 'incidentSubmission';
  act text;
  nb integer;
begin
  select * into auteur from public.journal_auteur();
  if tg_op = 'INSERT' then
    act := case when type_r = 'major_incident_reclassified_as_non-major' then 'reclassement' else 'creation' end;
  elsif new.status = 'validated' and old.status is distinct from 'validated' then
    act := 'validation';
  elsif new.report_data is distinct from old.report_data then
    act := 'modification';
    -- Champs techniques de l'application exclus du décompte
    nb := public.journal_nb_differences(old.report_data - 'savedAt', new.report_data - 'savedAt');
  else
    return null;
  end if;
  insert into public.journal_activite (utilisateur, email, partie, action, objet, objet_id, incident,
                                       type_rapport, nb_champs)
  values (auteur.id, auteur.email, 'declarations', act, 'reports', new.id::text,
          new.report_data #>> '{incident,financialEntityCode}', type_r, nb);
  return null;
end;
$$;

drop trigger if exists journaliser_rapport on public.reports;
create trigger journaliser_rapport
  after insert or update on public.reports
  for each row execute function public.journaliser_rapport();

create or replace function public.journaliser_commentaire()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auteur record;
  r record;
begin
  select * into auteur from public.journal_auteur();
  select report_data into r from public.reports where id = new.report_id;
  insert into public.journal_activite (utilisateur, email, partie, action, objet, objet_id, incident,
                                       type_rapport, detail)
  values (auteur.id, auteur.email, 'declarations', 'commentaire', 'comments', new.report_id::text,
          r.report_data #>> '{incident,financialEntityCode}', r.report_data ->> 'incidentSubmission',
          left(new.comment, 200));
  return null;
end;
$$;

drop trigger if exists journaliser_commentaire on public.comments;
create trigger journaliser_commentaire
  after insert on public.comments
  for each row execute function public.journaliser_commentaire();

-- Registre d'information : une entrée par opération (instruction) et par table
create or replace function public.journaliser_registre()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auteur record;
  nb integer;
  act text := case tg_op when 'INSERT' then 'ajout' when 'UPDATE' then 'modification' else 'suppression' end;
begin
  if tg_op = 'DELETE' then
    select count(*) into nb from anciennes;
  else
    select count(*) into nb from nouvelles;
  end if;
  if nb = 0 then return null; end if;
  select * into auteur from public.journal_auteur();
  insert into public.journal_activite (utilisateur, email, partie, action, objet, nb_lignes)
  values (auteur.id, auteur.email, 'registre', act, tg_table_name, nb);
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['ri_teneur_registre', 'ri_entites', 'ri_succursales', 'ri_prestataires',
                           'ri_fonctions', 'ri_contrats', 'ri_contrats_services', 'ri_accords_intragroupe',
                           'ri_signataires_reception', 'ri_signataires_fourniture', 'ri_sous_traitance',
                           'ri_evaluations', 'ri_definitions', 'ri_import_rejets'] loop
    execute format('drop trigger if exists journal_ajout on public.%I', t);
    execute format('drop trigger if exists journal_modification on public.%I', t);
    execute format('drop trigger if exists journal_suppression on public.%I', t);
    execute format('create trigger journal_ajout after insert on public.%I referencing new table as nouvelles '
                   'for each statement execute function public.journaliser_registre()', t);
    execute format('create trigger journal_modification after update on public.%I referencing old table as anciennes '
                   'new table as nouvelles for each statement execute function public.journaliser_registre()', t);
    execute format('create trigger journal_suppression after delete on public.%I referencing old table as anciennes '
                   'for each statement execute function public.journaliser_registre()', t);
  end loop;
end;
$$;

-- Droits : lecture seule, selon les droits existants
alter table public.journal_activite enable row level security;

revoke all on public.journal_activite from public, anon, authenticated;
grant select on public.journal_activite to authenticated;

drop policy if exists "journal_lecture" on public.journal_activite;
create policy "journal_lecture"
  on public.journal_activite for select to authenticated
  using (
    (partie = 'declarations'
      and exists (select 1 from public.reports r where r.id::text = journal_activite.objet_id))
    or (partie = 'registre' and public.current_registre_role() is not null)
  );

revoke all on function public.journal_auteur() from public, anon, authenticated;
revoke all on function public.journal_nb_differences(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.journaliser_rapport() from public, anon, authenticated;
revoke all on function public.journaliser_commentaire() from public, anon, authenticated;
revoke all on function public.journaliser_registre() from public, anon, authenticated;

commit;
