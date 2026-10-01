-- Retour arrière de la migration 20261007000000_suppression_comptes.sql
-- (la suppression d'un compte ayant des paramètres est de nouveau refusée)

begin;

drop trigger if exists supprimer_profil_utilisateur on auth.users;
drop function if exists public.supprimer_profil_utilisateur();

alter table public.submitting_entity_settings
  drop constraint if exists submitting_entity_settings_user_id_fkey;
alter table public.submitting_entity_settings
  add constraint submitting_entity_settings_user_id_fkey
  foreign key (user_id) references auth.users (id);

commit;
