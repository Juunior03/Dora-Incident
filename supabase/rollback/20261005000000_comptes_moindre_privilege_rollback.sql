-- Retour arrière de la migration 20261005000000_comptes_moindre_privilege.sql
-- Les nouveaux comptes redeviennent « saisisseur ». Le contrôle du domaine @actionlogement.fr
-- est conservé (seuls les déclencheurs ajoutés par la migration sont retirés s'ils existent ;
-- un déclencheur de création préexistant reste en place).

begin;

drop trigger if exists verifier_domaine_email_modification on auth.users;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, role)
  values (new.id, new.email, 'saisisseur')
  on conflict (id) do nothing;
  return new;
end;
$$;

commit;
