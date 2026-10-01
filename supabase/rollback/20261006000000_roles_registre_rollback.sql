-- Retour arrière de la migration 20261006000000_roles_registre.sql
-- Le registre redevient piloté par le rôle des déclarations d'incident (écriture : saisisseur ;
-- lecture : les trois rôles). La colonne role_registre et les rôles attribués sont supprimés.

begin;

set local client_min_messages = warning;

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
                    using (public.current_user_role() in (''saisisseur'', ''validateur'', ''auditeur''))', t);
    execute format('drop policy if exists ri_creation on public.%I', t);
    execute format('create policy ri_creation on public.%I for insert to authenticated
                    with check (public.current_user_role() = ''saisisseur'')', t);
    execute format('drop policy if exists ri_modification on public.%I', t);
    execute format('create policy ri_modification on public.%I for update to authenticated
                    using (public.current_user_role() = ''saisisseur'')
                    with check (public.current_user_role() = ''saisisseur'')', t);
    execute format('drop policy if exists ri_suppression on public.%I', t);
    execute format('create policy ri_suppression on public.%I for delete to authenticated
                    using (public.current_user_role() = ''saisisseur'')', t);
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
  order by case x.gravite when 'bloquant' then 1 when 'avertissement' then 2 else 3 end,
           x.rejet_id is null, x.modele, x.reference nulls first, x.colonne
$$;

drop function if exists public.current_registre_role();
alter table public.users drop column if exists role_registre;

commit;
