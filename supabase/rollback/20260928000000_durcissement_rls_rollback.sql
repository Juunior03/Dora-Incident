-- Retour arrière de la migration 20260928000000_durcissement_rls.sql
-- Restaure exactement les policies et les droits d'avant la migration.
-- ATTENTION : cela rétablit aussi les failles d'accès décrites dans la migration.

begin;

-- ---------------------------------------------------------------------------
-- Suppression de ce que la migration a ajouté
-- ---------------------------------------------------------------------------
drop trigger if exists protect_report_update on public.reports;
drop function if exists public.protect_report_update();

drop policy if exists "saisisseurs_insert_own_draft_reports" on public.reports;
drop policy if exists "saisisseurs_update_own_draft_reports" on public.reports;
drop policy if exists "validateurs_validate_draft_reports" on public.reports;
drop policy if exists "validateurs_insert_comments" on public.comments;
drop policy if exists "read_comments_owner_author_validators" on public.comments;

drop function if exists public.current_user_role();

-- ---------------------------------------------------------------------------
-- Policies d'origine
-- ---------------------------------------------------------------------------
drop policy if exists "Enable delete for all users" on public.reports;
create policy "Enable delete for all users" on public.reports
  for delete to authenticated using (true);

drop policy if exists "Enable insert for all users" on public.reports;
create policy "Enable insert for all users" on public.reports
  for insert to authenticated with check (true);

drop policy if exists "Enable read for all users" on public.reports;
create policy "Enable read for all users" on public.reports
  for select to authenticated using (true);

drop policy if exists "Enable update for all users" on public.reports;
create policy "Enable update for all users" on public.reports
  for update to authenticated using (true);

drop policy if exists "auditeurs_cannot_modify_reports" on public.reports;
create policy "auditeurs_cannot_modify_reports" on public.reports
  using ((select users.role from public.users where users.id = auth.uid()) <> 'auditeur');

drop policy if exists "Saisisseurs can create new reports" on public.reports;
create policy "Saisisseurs can create new reports" on public.reports
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "saisisseurs_can_update_their_own_draft_reports" on public.reports;
create policy "saisisseurs_can_update_their_own_draft_reports" on public.reports
  for update to authenticated using (created_by = auth.uid() and status = 'draft');

drop policy if exists "validateurs_can_update_reports_to_validated" on public.reports;
create policy "validateurs_can_update_reports_to_validated" on public.reports
  for update to authenticated
  using (auth.uid() in (select users.id from public.users where users.role = 'validateur')
         and status = 'draft')
  with check (status = 'validated');

drop policy if exists "Allow validators to add comments" on public.comments;
create policy "Allow validators to add comments" on public.comments
  for insert with check ((select users.role from public.users where users.id = auth.uid()) = 'validateur');

drop policy if exists "Allow reading comments for report owners and validators" on public.comments;
create policy "Allow reading comments for report owners and validators" on public.comments
  for select using (auth.uid() = created_by
                    or auth.uid() in (select reports.created_by from public.reports
                                      where reports.id = comments.report_id));

drop policy if exists "Allow inserts for trigger" on public.users;
create policy "Allow inserts for trigger" on public.users
  for insert to authenticated with check (true);

drop policy if exists "Allow select for authenticated users" on public.users;
create policy "Allow select for authenticated users" on public.users
  for select using (auth.uid() = id);

drop policy if exists "Allow users to manage their own settings" on public.submitting_entity_settings;
create policy "Allow users to manage their own settings" on public.submitting_entity_settings
  using (auth.uid() = user_id);

drop policy if exists "Enable read/write access to submitting_entity_settings for auth" on public.submitting_entity_settings;
create policy "Enable read/write access to submitting_entity_settings for auth" on public.submitting_entity_settings
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Droits d'origine
-- ---------------------------------------------------------------------------
grant all on table public.comments, public.reports,
                   public.submitting_entity_settings, public.users
  to anon, authenticated;

grant all on function public.handle_new_user() to anon, authenticated;
grant all on function public.check_email_domain() to anon, authenticated;

alter default privileges for role postgres in schema public
  grant all on tables to anon;
alter default privileges for role postgres in schema public
  grant all on functions to anon;

commit;
