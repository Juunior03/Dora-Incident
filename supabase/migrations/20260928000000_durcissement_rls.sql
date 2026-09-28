-- Durcissement des règles d'accès (RLS)
--
-- Contexte : les policies PostgreSQL « permissives » s'additionnent (OU logique).
-- Les policies « Enable ... for all users » (USING true) donnaient donc à tout
-- utilisateur connecté le droit de lire, modifier, valider et supprimer
-- n'importe quel rapport, quelles que soient les autres policies.
-- « auditeurs_cannot_modify_reports » était elle aussi permissive : au lieu de
-- restreindre les auditeurs, elle donnait TOUS les droits aux autres rôles.

begin;

-- ---------------------------------------------------------------------------
-- Rôle de l'utilisateur courant
-- ---------------------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.users where id = auth.uid()
$$;

revoke all on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated;

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
drop policy if exists "Enable delete for all users" on public.reports;
drop policy if exists "Enable insert for all users" on public.reports;
drop policy if exists "Enable read for all users" on public.reports;
drop policy if exists "Enable update for all users" on public.reports;
drop policy if exists "auditeurs_cannot_modify_reports" on public.reports;
drop policy if exists "Saisisseurs can create new reports" on public.reports;
drop policy if exists "saisisseurs_can_update_their_own_draft_reports" on public.reports;
drop policy if exists "validateurs_can_update_reports_to_validated" on public.reports;

-- Lecture : inchangée (policies existantes conservées)
--   saisisseurs_can_read_their_own_draft_reports
--   "Saisisseurs can read their own validated reports"
--   validateurs_can_read_all_reports
--   auditeurs_can_read_validated_reports

-- Création : un saisisseur crée uniquement ses propres rapports, en brouillon
drop policy if exists "saisisseurs_insert_own_draft_reports" on public.reports;
create policy "saisisseurs_insert_own_draft_reports"
  on public.reports for insert to authenticated
  with check (
    public.current_user_role() = 'saisisseur'
    and created_by = auth.uid()
    and status = 'draft'
  );

-- Modification : un saisisseur modifie ses brouillons, qui restent des brouillons
drop policy if exists "saisisseurs_update_own_draft_reports" on public.reports;
create policy "saisisseurs_update_own_draft_reports"
  on public.reports for update to authenticated
  using (
    public.current_user_role() = 'saisisseur'
    and created_by = auth.uid()
    and status = 'draft'
  )
  with check (
    public.current_user_role() = 'saisisseur'
    and created_by = auth.uid()
    and status = 'draft'
  );

-- Validation : un validateur passe un brouillon à « validated »
-- (le rôle est aussi vérifié dans WITH CHECK : pour un UPDATE, PostgreSQL
-- accepte la nouvelle ligne si elle satisfait le WITH CHECK de N'IMPORTE
-- QUELLE policy, pas seulement de celle dont le USING a laissé passer la ligne)
drop policy if exists "validateurs_validate_draft_reports" on public.reports;
create policy "validateurs_validate_draft_reports"
  on public.reports for update to authenticated
  using (
    public.current_user_role() = 'validateur'
    and status = 'draft'
  )
  with check (
    public.current_user_role() = 'validateur'
    and status = 'validated'
  );

-- Suppression : aucune policy => personne ne peut supprimer via l'API

-- Un validateur ne peut changer que le statut et le type du rapport suivant ;
-- personne ne peut réattribuer un rapport ou changer sa date de création.
create or replace function public.protect_report_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Le créateur et la date de création d''un rapport ne sont pas modifiables';
  end if;

  if public.current_user_role() = 'validateur'
     and (new.report_data is distinct from old.report_data
          or new.incident_id is distinct from old.incident_id) then
    raise exception 'Un validateur ne peut modifier que le statut d''un rapport';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_report_update() from public, anon, authenticated;

drop trigger if exists protect_report_update on public.reports;
create trigger protect_report_update
  before update on public.reports
  for each row execute function public.protect_report_update();

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------
drop policy if exists "Allow validators to add comments" on public.comments;
drop policy if exists "Allow reading comments for report owners and validators" on public.comments;

-- Un validateur commente en son nom, uniquement sur un brouillon
drop policy if exists "validateurs_insert_comments" on public.comments;
create policy "validateurs_insert_comments"
  on public.comments for insert to authenticated
  with check (
    public.current_user_role() = 'validateur'
    and created_by = auth.uid()
    and exists (
      select 1 from public.reports r
      where r.id = report_id and r.status = 'draft'
    )
  );

-- Lecture : l'auteur du rapport, l'auteur du commentaire et les validateurs
drop policy if exists "read_comments_owner_author_validators" on public.comments;
create policy "read_comments_owner_author_validators"
  on public.comments for select to authenticated
  using (
    created_by = auth.uid()
    or public.current_user_role() = 'validateur'
    or exists (
      select 1 from public.reports r
      where r.id = report_id and r.created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
-- handle_new_user() est SECURITY DEFINER : il n'a pas besoin de cette policy,
-- qui permettait à tout utilisateur connecté d'insérer des lignes (et donc
-- des rôles) dans public.users.
drop policy if exists "Allow inserts for trigger" on public.users;
-- Doublon de "Users can read their own role"
drop policy if exists "Allow select for authenticated users" on public.users;

-- ---------------------------------------------------------------------------
-- submitting_entity_settings : doublons de policies
-- ---------------------------------------------------------------------------
drop policy if exists "Allow users to manage their own settings" on public.submitting_entity_settings;
drop policy if exists "Enable read/write access to submitting_entity_settings for auth" on public.submitting_entity_settings;

-- ---------------------------------------------------------------------------
-- Droits : l'utilisateur anonyme n'a besoin d'aucune table
-- (connexion et mot de passe oublié passent par l'API Auth)
-- ---------------------------------------------------------------------------
revoke all on table public.comments, public.reports,
                    public.submitting_entity_settings, public.users
  from anon;

-- TRUNCATE n'est pas soumis à la RLS
revoke truncate, references, trigger on table public.comments, public.reports,
                    public.submitting_entity_settings, public.users
  from authenticated;

-- Les fonctions de trigger n'ont pas à être appelables directement
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.check_email_domain() from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on functions from anon;

commit;
