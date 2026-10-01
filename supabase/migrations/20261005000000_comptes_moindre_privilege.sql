-- Comptes utilisateurs : domaine autorisé et moindre privilège
--
-- 1. Seules les adresses @actionlogement.fr peuvent créer un compte ou y être rattachées
--    (contrôle à la création et lors d'un changement d'adresse ; les connexions des comptes
--    existants ne sont pas concernées).
-- 2. Un nouveau compte reçoit le rôle « auditeur » (lecture seule) au lieu de « saisisseur » :
--    un administrateur attribue ensuite le rôle voulu, par exemple
--      update public.users set role = 'saisisseur' where email = 'prenom.nom@actionlogement.fr';
--    Sans cela, toute personne parvenant à créer un compte pouvait modifier le registre et
--    les déclarations d'incident.
-- Les rôles des comptes existants ne sont pas modifiés.
-- Retour arrière : supabase/rollback/20261005000000_comptes_moindre_privilege_rollback.sql

begin;

set local client_min_messages = warning;

create or replace function public.check_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Mise à jour sans changement d'adresse (connexion, métadonnées) : rien à contrôler
  if tg_op = 'UPDATE' and new.email is not distinct from old.email then
    return new;
  end if;
  if lower(coalesce(new.email, '')) !~ '^[^@[:space:]]+@actionlogement\.fr$' then
    raise exception 'Accès refusé : seules les adresses @actionlogement.fr sont autorisées.';
  end if;
  return new;
end;
$$;

revoke all on function public.check_email_domain() from public, anon, authenticated;

-- Déclencheurs sur auth.users, créés seulement s'il n'en existe pas déjà un équivalent
do $$
begin
  if not exists (
    select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal
      and p.proname = 'check_email_domain' and (t.tgtype & 4) <> 0          -- INSERT
  ) then
    create trigger verifier_domaine_email_creation
      before insert on auth.users
      for each row execute function public.check_email_domain();
  end if;
  if not exists (
    select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal
      and p.proname = 'check_email_domain' and (t.tgtype & 16) <> 0         -- UPDATE
  ) then
    create trigger verifier_domaine_email_modification
      before update of email on auth.users
      for each row execute function public.check_email_domain();
  end if;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, role)
  values (new.id, new.email, 'auditeur')
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

commit;
