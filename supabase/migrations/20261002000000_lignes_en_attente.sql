-- Lignes importées en attente de correction
--
-- Une ligne d'un classeur Excel qui ne peut pas entrer dans le registre (valeur illisible,
-- champ obligatoire vide, contrôle refusé, prestataire ou contrat inconnu…) n'est pas perdue :
-- elle est conservée ici avec ses valeurs et le motif du refus, et signalée comme anomalie
-- bloquante dans le rapport tant qu'elle n'a pas été corrigée ou écartée. Les tables du
-- registre gardent ainsi tous leurs contrôles et l'export ne contient que des données valides.
--
-- La fonction de rapport d'origine est renommée ri_anomalies_registre() ; ri_anomalies()
-- y ajoute les lignes en attente (colonnes rejet_id et rejet_donnees en plus).
-- Dépend des migrations 20260928000000, 20260930000000 et 20261001000000.
-- Retour arrière : supabase/rollback/20261002000000_lignes_en_attente_rollback.sql

begin;

set local client_min_messages = warning;

create table if not exists public.ri_import_rejets (
  id          uuid primary key default gen_random_uuid(),
  section     text not null,        -- tableau de l'application (clé de registreConfig)
  modele      text not null,        -- modèle EBA, ex. B_05.01
  reference   text not null,        -- clé lisible de la ligne, ex. code du prestataire
  donnees     jsonb not null,       -- valeurs lues, au format des colonnes du tableau
  motif       text not null,
  onglet      text,
  ligne       integer,
  cree_le     timestamptz not null default now(),
  cree_par    uuid,
  modifie_le  timestamptz not null default now(),
  modifie_par uuid,
  constraint ri_import_rejets_cle unique (section, reference)
);

drop trigger if exists ri_horodatage on public.ri_import_rejets;
create trigger ri_horodatage before insert or update on public.ri_import_rejets
  for each row execute function public.ri_horodatage();

alter table public.ri_import_rejets enable row level security;
revoke all on table public.ri_import_rejets from anon;
revoke all on table public.ri_import_rejets from authenticated;
grant select, insert, update, delete on table public.ri_import_rejets to authenticated;

drop policy if exists ri_lecture on public.ri_import_rejets;
create policy ri_lecture on public.ri_import_rejets for select to authenticated
  using (public.current_user_role() in ('saisisseur', 'validateur', 'auditeur'));
drop policy if exists ri_creation on public.ri_import_rejets;
create policy ri_creation on public.ri_import_rejets for insert to authenticated
  with check (public.current_user_role() = 'saisisseur');
drop policy if exists ri_modification on public.ri_import_rejets;
create policy ri_modification on public.ri_import_rejets for update to authenticated
  using (public.current_user_role() = 'saisisseur')
  with check (public.current_user_role() = 'saisisseur');
drop policy if exists ri_suppression on public.ri_import_rejets;
create policy ri_suppression on public.ri_import_rejets for delete to authenticated
  using (public.current_user_role() = 'saisisseur');

-- Renommage de la fonction d'origine (une seule fois)
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'ri_anomalies_registre') then
    alter function public.ri_anomalies() rename to ri_anomalies_registre;
  else
    drop function if exists public.ri_anomalies();
  end if;
end;
$$;

create function public.ri_anomalies()
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
           'Ligne importée non intégrée au registre'
             || coalesce(' (onglet ' || r.onglet || coalesce(', ligne ' || r.ligne, '') || ')', '')
             || ' : ' || r.motif || '. Ouvrez-la pour la compléter et l''enregistrer.',
           r.id, r.donnees
    from public.ri_import_rejets r
    union all
    select a.gravite, a.modele, a.colonne, a.section, a.reference, a.message, null::uuid, null::jsonb
    from public.ri_anomalies_registre() a
  ) x(gravite, modele, colonne, section, reference, message, rejet_id, rejet_donnees)
  order by case x.gravite when 'bloquant' then 1 when 'avertissement' then 2 else 3 end,
           x.rejet_id is null, x.modele, x.reference nulls first, x.colonne
$$;

revoke all on function public.ri_anomalies() from public, anon;
revoke all on function public.ri_anomalies_registre() from public, anon;
grant execute on function public.ri_anomalies() to authenticated;
grant execute on function public.ri_anomalies_registre() to authenticated;

commit;
