-- Suppression des comptes utilisateurs depuis le Studio
--
-- Les paramètres de l'entité déclarante (public.submitting_entity_settings) référencent
-- auth.users sans règle de suppression : la suppression d'un compte ayant enregistré ses
-- paramètres était refusée (« Failed to delete selected users »). Ces paramètres sont
-- personnels : ils sont désormais supprimés avec le compte.
-- La ligne de rôle (public.users) est aussi supprimée avec le compte, sauf si la personne est
-- l'auteur de déclarations d'incident ou de commentaires : elle est alors conservée pour la
-- traçabilité (l'adresse ne peut pas être réutilisée pour un nouveau compte dans ce cas).
-- Sans cela, recréer un compte avec la même adresse échouait (adresse déjà présente).
-- Retour arrière : supabase/rollback/20261007000000_suppression_comptes_rollback.sql

begin;

alter table public.submitting_entity_settings
  drop constraint if exists submitting_entity_settings_user_id_fkey;
alter table public.submitting_entity_settings
  add constraint submitting_entity_settings_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

create or replace function public.supprimer_profil_utilisateur()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.users u
  where u.id = old.id
    and not exists (select 1 from public.reports r where r.created_by = u.id)
    and not exists (select 1 from public.comments c where c.created_by = u.id);
  return old;
end;
$$;

revoke all on function public.supprimer_profil_utilisateur() from public, anon, authenticated;

drop trigger if exists supprimer_profil_utilisateur on auth.users;
create trigger supprimer_profil_utilisateur
  after delete on auth.users
  for each row execute function public.supprimer_profil_utilisateur();

commit;
