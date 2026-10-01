-- =============================================================================
-- Déploiement du registre d'information DORA sur le Supabase self-hosted (octobre 2026)
--
-- Contenu : les migrations 20260930000000 à 20261006000000, dans l'ordre (chacune dans sa
-- propre transaction). La migration 20260928000000 (durcissement RLS) doit déjà être appliquée.
-- Le script est rejouable : le relancer après un incident ne crée pas de doublon.
-- Aucune déclaration d'incident ni aucun commentaire n'est modifié ; les comptes existants
-- gardent leur rôle et reçoivent un rôle sur le registre équivalent à leurs droits actuels.
--
-- Utilisation : SQL Editor du Studio, nouvelle requête, coller TOUT le fichier, Run.
-- Ensuite : exécuter supabase/deploiement/verification.sql.
-- Généré par supabase/deploiement/generer_script.py : ne pas modifier à la main.
-- =============================================================================

-- Contrôle des prérequis : arrêt immédiat si la base n'est pas dans l'état attendu
do $$
begin
  if to_regclass('auth.users') is null or to_regclass('public.users') is null then
    raise exception 'Base inattendue : tables auth.users / public.users introuvables. Vérifiez que vous êtes sur le bon projet.';
  end if;
  if to_regprocedure('public.current_user_role()') is null then
    raise exception 'Prérequis manquant : appliquez d''abord supabase/migrations/20260928000000_durcissement_rls.sql.';
  end if;
end;
$$;

-- =============================================================================
-- 20260930000000_registre_information
-- =============================================================================
-- Registre d'information DORA (article 28, paragraphe 3, du règlement (UE) 2022/2554)
-- Modèle aligné sur le règlement d'exécution (UE) 2024/2956, annexes I à IV.
--
-- Principes :
-- - chaque table porte en commentaire le modèle B_xx.xx et les colonnes qu'elle couvre ;
-- - les listes fermées sont stockées sous forme du numéro d'option officiel
--   (ex. type d'entité 1 à 24) et les types de services TIC sous leur code S01..S19 ;
-- - les modèles qui ne font que répéter des liens déjà saisis (B_03.02, B_04.01,
--   rang 1 de B_05.02) ne sont pas stockés : ils seront générés à l'export, ce qui
--   garantit leur cohérence ;
-- - les obligations conditionnelles qui dépendent de plusieurs tables (ex. « obligatoire
--   si le service soutient une fonction critique ») seront contrôlées par le rapport
--   d'anomalies, pas par des contraintes.
--
-- Dépend de public.current_user_role() (migration 20260928000000_durcissement_rls).

begin;

-- Masque les messages « ... does not exist, skipping » des suppressions préalables
set local client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- Fonctions de contrôle
-- ---------------------------------------------------------------------------

-- LEI (ISO 17442) : 18 caractères alphanumériques + 2 chiffres de contrôle (ISO 7064 mod 97-10)
create or replace function public.ri_lei_valide(lei text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  reste integer := 0;
  c text;
  chiffres text;
  i integer;
  j integer;
begin
  if lei is null then
    return true;
  end if;
  if lei !~ '^[A-Z0-9]{18}[0-9]{2}$' then
    return false;
  end if;
  for i in 1..20 loop
    c := substr(lei, i, 1);
    if c ~ '[A-Z]' then
      chiffres := (ascii(c) - 55)::text;  -- A = 10 ... Z = 35
    else
      chiffres := c;
    end if;
    for j in 1..length(chiffres) loop
      reste := (reste * 10 + substr(chiffres, j, 1)::integer) % 97;
    end loop;
  end loop;
  return reste = 1;
end;
$$;

-- Liste de codes pays ISO 3166-1 alpha-2 (localisations multiples de B_02.02)
create or replace function public.ri_codes_pays_valides(codes text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select codes is null
      or not exists (select 1 from unnest(codes) as c where c is null or c !~ '^[A-Z]{2}$')
$$;

-- Horodatage et auteur des modifications (piste d'audit)
create or replace function public.ri_horodatage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.cree_le := now();
    new.cree_par := auth.uid();
  else
    new.cree_le := old.cree_le;
    new.cree_par := old.cree_par;
  end if;
  new.modifie_le := now();
  new.modifie_par := auth.uid();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- B_01.01 — Entité tenant le registre d'informations (une seule ligne)
-- B_01.01.0060 (date de communication) est un paramètre de l'export.
-- ---------------------------------------------------------------------------
create table if not exists public.ri_teneur_registre (
  unique_ligne        boolean primary key default true check (unique_ligne),
  lei                 text not null check (public.ri_lei_valide(lei)),          -- B_01.01.0010
  nom                 text not null check (btrim(nom) <> ''),                   -- B_01.01.0020
  pays                text not null check (pays ~ '^[A-Z]{2}$'),                -- B_01.01.0030
  type_entite         smallint not null check (type_entite between 1 and 22),   -- B_01.01.0040
  autorite_competente text,                                                     -- B_01.01.0050
  cree_le timestamptz, cree_par uuid, modifie_le timestamptz, modifie_par uuid
);

-- ---------------------------------------------------------------------------
-- B_01.02 — Entités relevant du périmètre du registre
-- ---------------------------------------------------------------------------
create table if not exists public.ri_entites (
  lei                   text primary key check (public.ri_lei_valide(lei)),     -- B_01.02.0010
  nom                   text not null check (btrim(nom) <> ''),                 -- B_01.02.0020
  pays                  text not null check (pays ~ '^[A-Z]{2}$'),              -- B_01.02.0030
  type_entite           smallint not null check (type_entite between 1 and 24), -- B_01.02.0040
  rang_hierarchique     smallint not null check (rang_hierarchique between 1 and 5), -- B_01.02.0050
  lei_mere_directe      text not null check (public.ri_lei_valide(lei_mere_directe)), -- B_01.02.0060
  date_derniere_maj     date not null,                                          -- B_01.02.0070
  date_integration      date not null,                                          -- B_01.02.0080
  date_suppression      date not null default '9999-12-31',                     -- B_01.02.0090
  monnaie               text check (monnaie ~ '^[A-Z]{3}$'),                    -- B_01.02.0100
  total_actifs          numeric(20, 2) check (total_actifs >= 0),               -- B_01.02.0110
  cree_le timestamptz, cree_par uuid, modifie_le timestamptz, modifie_par uuid,
  constraint ri_entites_dates check (date_suppression >= date_integration),
  -- B_01.02.0100 obligatoire uniquement si B_01.02.0110 est rempli
  constraint ri_entites_monnaie check (total_actifs is null or monnaie is not null),
  -- B_01.02.0110 obligatoire si l'entité est une entité financière (types 1 à 22)
  constraint ri_entites_actifs check (type_entite > 22 or total_actifs is not null)
);

-- ---------------------------------------------------------------------------
-- B_01.03 — Succursales
-- ---------------------------------------------------------------------------
create table if not exists public.ri_succursales (
  code      text primary key check (btrim(code) <> ''),                          -- B_01.03.0010
  lei_siege text not null references public.ri_entites (lei) on update cascade, -- B_01.03.0020
  nom       text not null check (btrim(nom) <> ''),                              -- B_01.03.0030
  pays      text not null check (pays ~ '^[A-Z]{2}$'),                           -- B_01.03.0040
  cree_le timestamptz, cree_par uuid, modifie_le timestamptz, modifie_par uuid,
  unique (code, lei_siege)
);

-- ---------------------------------------------------------------------------
-- B_05.01 — Prestataires tiers de services TIC
-- (prestataires directs, intra-groupe, sous-traitants et entreprises mères ultimes)
-- ---------------------------------------------------------------------------
create table if not exists public.ri_prestataires (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null check (btrim(code) <> ''),                    -- B_05.01.0010
  type_code          text not null check (
                       type_code in ('LEI', 'EUID')
                       or type_code ~ '^[A-Z]{2}_(CRN|VAT|PNR|NIN)$'),          -- B_05.01.0020
  code_supp          text,                                                       -- B_05.01.0030
  type_code_supp     text check (
                       type_code_supp in ('LEI', 'EUID', 'CRN', 'VAT', 'PNR', 'NIN')), -- B_05.01.0040
  raison_sociale     text not null check (btrim(raison_sociale) <> ''),          -- B_05.01.0050
  nom_latin          text not null check (btrim(nom_latin) <> ''),               -- B_05.01.0060
  type_personne      smallint not null check (type_personne in (1, 2)),          -- B_05.01.0070
  pays_siege         text not null check (pays_siege ~ '^[A-Z]{2}$'),            -- B_05.01.0080
  monnaie            text check (monnaie ~ '^[A-Z]{3}$'),                        -- B_05.01.0090
  depenses_annuelles numeric(20, 2) check (depenses_annuelles >= 0),             -- B_05.01.0100
  -- B_05.01.0110 / 0120 : vide = le prestataire est sa propre mère ultime
  -- (l'export répète alors son propre code, comme l'exige le texte)
  mere_ultime_id     uuid references public.ri_prestataires (id),
  cree_le timestamptz, cree_par uuid, modifie_le timestamptz, modifie_par uuid,
  unique (code, type_code),
  constraint ri_prestataires_lei check (type_code <> 'LEI' or public.ri_lei_valide(code)),
  constraint ri_prestataires_lei_supp check (type_code_supp is distinct from 'LEI' or public.ri_lei_valide(code_supp)),
  -- B_05.01.0040 obligatoire si B_05.01.0030 est rempli (et inversement)
  constraint ri_prestataires_code_supp check ((code_supp is null) = (type_code_supp is null)),
  -- Seuls le LEI ou l'EUID sont admis pour une personne morale
  constraint ri_prestataires_personne_morale check (type_personne <> 1 or type_code in ('LEI', 'EUID')),
  -- B_05.01.0090 obligatoire si B_05.01.0100 est rempli
  constraint ri_prestataires_monnaie check (depenses_annuelles is null or monnaie is not null),
  constraint ri_prestataires_mere check (mere_ultime_id is distinct from id)
);

-- ---------------------------------------------------------------------------
-- B_06.01 — Fonctions
-- ---------------------------------------------------------------------------
create table if not exists public.ri_fonctions (
  identifiant                text primary key check (identifiant ~ '^F[1-9][0-9]*$'), -- B_06.01.0010
  activite_autorisee         text not null check (btrim(activite_autorisee) <> ''), -- B_06.01.0020 (annexe II ou « fonctions de soutien »)
  nom                        text not null check (btrim(nom) <> ''),              -- B_06.01.0030
  lei_entite                 text not null references public.ri_entites (lei) on update cascade, -- B_06.01.0040
  criticite                  smallint not null check (criticite between 1 and 3), -- B_06.01.0060
  raisons_criticite          varchar(300),                                        -- B_06.01.0070
  date_derniere_evaluation   date not null default '9999-12-31',                  -- B_06.01.0080
  rto_heures                 integer not null check (rto_heures >= 0),           -- B_06.01.0090
  rpo_heures                 integer not null check (rpo_heures >= 0),           -- B_06.01.0100
  incidence_interruption     smallint not null check (incidence_interruption between 1 and 4), -- B_06.01.0110
  cree_le timestamptz, cree_par uuid, modifie_le timestamptz, modifie_par uuid,
  -- Un identifiant unique par combinaison LEI / activité autorisée / nom de fonction
  unique (lei_entite, activite_autorisee, nom)
);

-- ---------------------------------------------------------------------------
-- B_02.01 — Accords contractuels : informations générales
-- ---------------------------------------------------------------------------
create table if not exists public.ri_contrats (
  reference           text primary key check (btrim(reference) <> ''),           -- B_02.01.0010
  type_accord         smallint not null check (type_accord between 1 and 3),     -- B_02.01.0020
  reference_general   text references public.ri_contrats (reference) on update cascade, -- B_02.01.0030
  monnaie             text not null check (monnaie ~ '^[A-Z]{3}$'),              -- B_02.01.0040
  depenses_annuelles  numeric(20, 2) not null check (depenses_annuelles >= 0),   -- B_02.01.0050
  cree_le timestamptz, cree_par uuid, modifie_le timestamptz, modifie_par uuid,
  -- B_02.01.0030 : sans objet pour un accord autonome (1) ou général (2),
  -- obligatoire pour un accord ultérieur ou associé (3)
  constraint ri_contrats_general check ((type_accord = 3) = (reference_general is not null)),
  constraint ri_contrats_general_soi check (reference_general is distinct from reference)
);

-- ---------------------------------------------------------------------------
-- B_02.02 — Accords contractuels : informations spécifiques
-- Une ligne par combinaison contrat / entité / prestataire / fonction / type de service.
-- Les localisations multiples (B_02.02.0150 et 0160) sont stockées en liste et
-- éclatées en lignes à l'export (article 4, paragraphe 2).
-- La succursale sert à générer B_04.01.
-- ---------------------------------------------------------------------------
create table if not exists public.ri_contrats_services (
  id                      uuid primary key default gen_random_uuid(),
  reference_contrat       text not null references public.ri_contrats (reference) on update cascade on delete cascade, -- B_02.02.0010
  lei_entite              text not null references public.ri_entites (lei) on update cascade,  -- B_02.02.0020
  succursale_code         text,                                                  -- B_04.01.0030 / 0040
  prestataire_id          uuid not null references public.ri_prestataires (id),   -- B_02.02.0030 / 0040
  fonction_id             text not null references public.ri_fonctions (identifiant) on update cascade, -- B_02.02.0050
  type_service            text not null check (type_service ~ '^S(0[1-9]|1[0-9])$'), -- B_02.02.0060 (annexe III)
  date_debut              date not null,                                         -- B_02.02.0070
  date_fin                date not null default '9999-12-31',                   -- B_02.02.0080
  motif_fin               smallint check (motif_fin between 1 and 6),            -- B_02.02.0090
  preavis_entite_jours    integer check (preavis_entite_jours >= 0),            -- B_02.02.0100
  preavis_prestataire_jours integer check (preavis_prestataire_jours >= 0),     -- B_02.02.0110
  pays_droit_applicable   text check (pays_droit_applicable ~ '^[A-Z]{2}$'),     -- B_02.02.0120
  pays_fourniture         text check (pays_fourniture ~ '^[A-Z]{2}$'),           -- B_02.02.0130
  stockage_donnees        boolean,                                               -- B_02.02.0140
  pays_stockage           text[] check (public.ri_codes_pays_valides(pays_stockage)),   -- B_02.02.0150
  pays_traitement         text[] check (public.ri_codes_pays_valides(pays_traitement)), -- B_02.02.0160
  sensibilite_donnees     smallint check (sensibilite_donnees between 1 and 3),  -- B_02.02.0170
  niveau_dependance       smallint check (niveau_dependance between 1 and 4),    -- B_02.02.0180
  cree_le timestamptz, cree_par uuid, modifie_le timestamptz, modifie_par uuid,
  -- La succursale doit appartenir à l'entité utilisatrice
  constraint ri_contrats_services_succursale
    foreign key (succursale_code, lei_entite)
    references public.ri_succursales (code, lei_siege) on update cascade,
  constraint ri_contrats_services_dates check (date_fin >= date_debut),
  -- B_02.02.0150 obligatoire si « Oui » en B_02.02.0140
  constraint ri_contrats_services_stockage check (
    stockage_donnees is not true or coalesce(cardinality(pays_stockage), 0) > 0),
  unique (reference_contrat, lei_entite, prestataire_id, fonction_id, type_service)
);

-- ---------------------------------------------------------------------------
-- B_02.03 — Accords contractuels intra-groupe
-- ---------------------------------------------------------------------------
create table if not exists public.ri_accords_intragroupe (
  reference_contrat      text not null references public.ri_contrats (reference) on update cascade on delete cascade, -- B_02.03.0010
  reference_contrat_lie  text not null references public.ri_contrats (reference) on update cascade on delete cascade, -- B_02.03.0020
  cree_le timestamptz, cree_par uuid, modifie_le timestamptz, modifie_par uuid,
  primary key (reference_contrat, reference_contrat_lie),
  check (reference_contrat <> reference_contrat_lie)
);

-- ---------------------------------------------------------------------------
-- B_03.01 — Entités signant les accords pour la réception de services TIC
-- ---------------------------------------------------------------------------
create table if not exists public.ri_signataires_reception (
  reference_contrat text not null references public.ri_contrats (reference) on update cascade on delete cascade, -- B_03.01.0010
  lei_entite        text not null references public.ri_entites (lei) on update cascade,  -- B_03.01.0020
  cree_le timestamptz, cree_par uuid, modifie_le timestamptz, modifie_par uuid,
  primary key (reference_contrat, lei_entite)
);

-- ---------------------------------------------------------------------------
-- B_03.03 — Entités du groupe signant des accords pour fournir des services TIC
-- ---------------------------------------------------------------------------
create table if not exists public.ri_signataires_fourniture (
  reference_contrat text not null references public.ri_contrats (reference) on update cascade on delete cascade, -- B_03.03.0010
  lei_entite        text not null references public.ri_entites (lei) on update cascade,  -- B_03.03.0020
  cree_le timestamptz, cree_par uuid, modifie_le timestamptz, modifie_par uuid,
  primary key (reference_contrat, lei_entite)
);

-- ---------------------------------------------------------------------------
-- B_05.02 — Chaîne d'approvisionnement : sous-traitants (rang >= 2)
-- Le rang 1 (prestataire direct) est déduit de B_02.02 à l'export.
-- ---------------------------------------------------------------------------
create table if not exists public.ri_sous_traitance (
  id                uuid primary key default gen_random_uuid(),
  reference_contrat text not null references public.ri_contrats (reference) on update cascade on delete cascade, -- B_05.02.0010
  type_service      text not null check (type_service ~ '^S(0[1-9]|1[0-9])$'),  -- B_05.02.0020
  prestataire_id    uuid not null references public.ri_prestataires (id),        -- B_05.02.0030 / 0040
  rang              integer not null check (rang >= 2),                          -- B_05.02.0050
  destinataire_id   uuid not null references public.ri_prestataires (id),        -- B_05.02.0060 / 0070
  cree_le timestamptz, cree_par uuid, modifie_le timestamptz, modifie_par uuid,
  check (prestataire_id <> destinataire_id),
  unique (reference_contrat, type_service, prestataire_id, destinataire_id)
);

-- ---------------------------------------------------------------------------
-- B_07.01 — Évaluation des services TIC (fonctions critiques ou importantes)
-- ---------------------------------------------------------------------------
create table if not exists public.ri_evaluations (
  reference_contrat        text not null references public.ri_contrats (reference) on update cascade on delete cascade, -- B_07.01.0010
  prestataire_id           uuid not null references public.ri_prestataires (id),  -- B_07.01.0020 / 0030
  type_service             text not null check (type_service ~ '^S(0[1-9]|1[0-9])$'), -- B_07.01.0040
  substituabilite          smallint not null check (substituabilite between 1 and 4), -- B_07.01.0050
  raison_non_substituable  smallint check (raison_non_substituable between 1 and 3), -- B_07.01.0060
  date_dernier_audit       date not null default '9999-12-31',                   -- B_07.01.0070
  plan_sortie              boolean not null,                                      -- B_07.01.0080
  reintegration            smallint check (reintegration between 1 and 3),       -- B_07.01.0090 (sans objet si intra-groupe)
  incidence_cessation      smallint not null check (incidence_cessation between 1 and 4), -- B_07.01.0100
  -- B_07.01.0110 : options officielles 1 (Oui), 2 (Non) et 7 (Évaluation non réalisée),
  -- numérotation reprise telle quelle du règlement
  autres_prestataires      smallint not null check (autres_prestataires in (1, 2, 7)),
  autre_prestataire_info   text,                                                  -- B_07.01.0120
  cree_le timestamptz, cree_par uuid, modifie_le timestamptz, modifie_par uuid,
  primary key (reference_contrat, prestataire_id, type_service),
  -- B_07.01.0060 obligatoire si « non substituable » ou « substituabilité très complexe »
  constraint ri_evaluations_raison check (
    substituabilite not in (1, 2) or raison_non_substituable is not null)
);

-- ---------------------------------------------------------------------------
-- B_99.01 — Définitions internes des options des listes fermées
-- ---------------------------------------------------------------------------
create table if not exists public.ri_definitions (
  colonne    text not null check (colonne in (
               'B_02.01.0020', 'B_02.02.0170', 'B_06.01.0110',
               'B_07.01.0050', 'B_07.01.0090', 'B_07.01.0100')),                 -- B_99.01.C0010
  option     smallint not null check (option between 1 and 4),                  -- B_99.01.C0030
  definition text not null check (btrim(definition) <> ''),                     -- B_99.01.C0040
  cree_le timestamptz, cree_par uuid, modifie_le timestamptz, modifie_par uuid,
  primary key (colonne, option)
);

-- ---------------------------------------------------------------------------
-- Index sur les clés étrangères
-- ---------------------------------------------------------------------------
create index if not exists ri_succursales_lei_idx          on public.ri_succursales (lei_siege);
create index if not exists ri_prestataires_mere_idx        on public.ri_prestataires (mere_ultime_id);
create index if not exists ri_fonctions_lei_idx            on public.ri_fonctions (lei_entite);
create index if not exists ri_contrats_general_idx         on public.ri_contrats (reference_general);
create index if not exists ri_contrats_services_contrat_idx on public.ri_contrats_services (reference_contrat);
create index if not exists ri_contrats_services_presta_idx on public.ri_contrats_services (prestataire_id);
create index if not exists ri_contrats_services_fonction_idx on public.ri_contrats_services (fonction_id);
create index if not exists ri_sous_traitance_contrat_idx   on public.ri_sous_traitance (reference_contrat);
create index if not exists ri_evaluations_presta_idx       on public.ri_evaluations (prestataire_id);

-- ---------------------------------------------------------------------------
-- Piste d'audit, droits et règles d'accès (communs à toutes les tables)
--   lecture   : saisisseur, validateur, auditeur
--   écriture  : saisisseur
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'ri_teneur_registre', 'ri_entites', 'ri_succursales', 'ri_prestataires',
    'ri_fonctions', 'ri_contrats', 'ri_contrats_services', 'ri_accords_intragroupe',
    'ri_signataires_reception', 'ri_signataires_fourniture', 'ri_sous_traitance',
    'ri_evaluations', 'ri_definitions'
  ] loop
    execute format('drop trigger if exists ri_horodatage on public.%I', t);
    execute format('create trigger ri_horodatage before insert or update on public.%I
                    for each row execute function public.ri_horodatage()', t);

    execute format('alter table public.%I enable row level security', t);

    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke all on table public.%I from authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);

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

revoke all on function public.ri_horodatage() from public, anon, authenticated;
grant execute on function public.ri_lei_valide(text) to authenticated;
grant execute on function public.ri_codes_pays_valides(text[]) to authenticated;

commit;

-- =============================================================================
-- 20261001000000_rapport_anomalies
-- =============================================================================
-- Ré-exécution : ri_anomalies() a changé de signature en 20261002 ; on la retire pour la recréer
do $$
begin
  if to_regprocedure('public.ri_anomalies_registre()') is not null then
    drop function if exists public.ri_anomalies();
  end if;
end;
$$;

-- Rapport d'anomalies du registre d'information DORA
--
-- Complète les contrôles appliqués à la saisie (contraintes des tables ri_*) par les
-- règles qui portent sur plusieurs tables ou sur des obligations conditionnelles du
-- règlement d'exécution (UE) 2024/2956, et par les erreurs fréquentes relevées par les
-- autorités européennes lors de la campagne 2025 (voir docs/eba).
--
-- Gravité :
--   bloquant       : information obligatoire manquante ou incohérente, rejet ou
--                    signalement probable lors de la remise
--   avertissement  : incohérence probable, à vérifier
--   information    : point d'attention, sans obligation réglementaire directe
--
-- Les codes de colonnes suivent la numérotation de la taxonomie EBA DPM 4.0.
-- La fonction s'exécute avec les droits de l'utilisateur (règles d'accès appliquées).
-- La vérification des LEI auprès du GLEIF est faite par l'application (appel externe).

begin;

set local client_min_messages = warning;

create or replace function public.ri_anomalies()
returns table (
  gravite   text,
  modele    text,
  colonne   text,
  section   text,
  reference text,
  message   text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with
  teneur as (select * from public.ri_teneur_registre limit 1),
  services as (
    select s.*, f.criticite, p.code as prestataire_code, p.nom_latin as prestataire_nom
    from public.ri_contrats_services s
    join public.ri_fonctions f on f.identifiant = s.fonction_id
    join public.ri_prestataires p on p.id = s.prestataire_id
  ),
  -- Services qui soutiennent une fonction critique ou importante (B_06.01.0050 = Oui)
  critiques as (select * from services where criticite = 1),
  -- Prestataires intra-groupe : identifiés par le LEI d'une entité du périmètre
  intragroupe as (
    select p.id
    from public.ri_prestataires p
    join public.ri_entites e on e.lei = p.code
    where p.type_code = 'LEI'
  ),
  -- Pays de l'Espace économique européen (préfixe d'un EUID)
  eee(pays) as (
    select unnest(array['AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE',
                        'IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK','IS','LI','NO'])
  ),
  anomalies (gravite, modele, colonne, section, reference, message) as (

    -- B_01.01 : entité tenant le registre
    select 'bloquant', 'B_01.01', null, 'teneur', null,
           'Aucune entité tenant le registre n''est renseignée.'
    where not exists (select 1 from public.ri_teneur_registre)

    -- B_01.02 : entités du périmètre
    union all
    select 'bloquant', 'B_01.02', null, 'entites', null,
           'Aucune entité n''est déclarée dans le périmètre du registre.'
    where not exists (select 1 from public.ri_entites)

    union all
    select 'avertissement', 'B_01.02', '0010', 'entites', t.lei,
           'L''entité tenant le registre n''apparaît pas dans la liste des entités du périmètre '
           || '(normal uniquement si elle agit pour le compte d''une entité financière).'
    from teneur t
    where exists (select 1 from public.ri_entites)
      and not exists (select 1 from public.ri_entites e where e.lei = t.lei)

    union all
    select 'avertissement', 'B_01.02', '0070', 'entites', e.lei,
           'La date de dernière mise à jour (' || e.date_derniere_maj || ') est dans le futur.'
    from public.ri_entites e
    where e.date_derniere_maj > current_date

    union all
    select 'avertissement', 'B_01.02', '0080', 'entites', e.lei,
           'La date d''intégration dans le registre (' || e.date_integration || ') est dans le futur.'
    from public.ri_entites e
    where e.date_integration > current_date

    -- B_02.01 : contrats sans détail en B_02.02
    union all
    select 'bloquant', 'B_02.02', '0010', 'services', c.reference,
           'Le contrat n''a aucune ligne dans « Services contractés » : services, entité utilisatrice, '
           || 'prestataire et fonction soutenue sont à renseigner.'
    from public.ri_contrats c
    where c.type_accord in (1, 3)
      and not exists (select 1 from public.ri_contrats_services s where s.reference_contrat = c.reference)

    union all
    select 'avertissement', 'B_02.02', '0010', 'services', c.reference,
           'L''accord général n''a ni ligne dans « Services contractés », ni accord ultérieur rattaché.'
    from public.ri_contrats c
    where c.type_accord = 2
      and not exists (select 1 from public.ri_contrats_services s where s.reference_contrat = c.reference)
      and not exists (select 1 from public.ri_contrats u where u.reference_general = c.reference)

    -- B_03.01 : entité signataire
    union all
    select 'avertissement', 'B_03.01', '0020', 'signataires_reception', c.reference,
           'Aucune entité signataire n''est déclarée pour ce contrat.'
    from public.ri_contrats c
    where not exists (select 1 from public.ri_signataires_reception r where r.reference_contrat = c.reference)

    -- B_03.03 : contrat conclu avec une entité du groupe
    union all
    select distinct 'avertissement', 'B_03.03', '0020', 'signataires_fourniture', s.reference_contrat,
           'Le prestataire ' || s.prestataire_code || ' est une entité du groupe : déclarer l''entité '
           || 'qui fournit le service dans « Signataires (fourniture intra-groupe) ».'
    from services s
    where s.prestataire_id in (select id from intragroupe)
      and not exists (select 1 from public.ri_signataires_fourniture f where f.reference_contrat = s.reference_contrat)

    -- B_02.02 : informations obligatoires lorsque le service soutient une fonction critique
    union all
    select 'bloquant', 'B_02.02', m.colonne, 'services',
           c.reference_contrat || ' / ' || c.prestataire_code || ' / ' || c.fonction_id || ' / ' || c.type_service,
           m.libelle || ' est obligatoire : le service soutient une fonction critique ou importante ('
           || c.fonction_id || ').'
    from critiques c
    cross join lateral (values
      ('0100', 'Le délai de préavis de l''entité',         c.preavis_entite_jours is null),
      ('0110', 'Le délai de préavis du prestataire',       c.preavis_prestataire_jours is null),
      ('0120', 'Le pays du droit applicable',              c.pays_droit_applicable is null),
      ('0130', 'Le pays de fourniture des services',       c.pays_fourniture is null),
      ('0140', 'L''indication du stockage de données',     c.stockage_donnees is null),
      ('0170', 'La sensibilité des données',               c.stockage_donnees is true and c.sensibilite_donnees is null),
      ('0180', 'Le niveau de dépendance',                  c.niveau_dependance is null)
    ) as m(colonne, libelle, manquant)
    where m.manquant

    -- B_02.02.0090 : motif de fin
    union all
    select 'bloquant', 'B_02.02', '0090', 'services',
           s.reference_contrat || ' / ' || s.prestataire_code || ' / ' || s.type_service,
           'Le contrat a pris fin le ' || s.date_fin || ' : le motif de fin est obligatoire.'
    from services s
    where s.date_fin < current_date and s.motif_fin is null

    union all
    select 'avertissement', 'B_02.02', '0090', 'services',
           s.reference_contrat || ' / ' || s.prestataire_code || ' / ' || s.type_service,
           'Un motif de fin est indiqué alors que le contrat n''a pas pris fin (date de fin : '
           || s.date_fin || ').'
    from services s
    where s.motif_fin is not null and s.date_fin >= current_date

    union all
    select 'information', 'B_02.02', '0160', 'services',
           s.reference_contrat || ' / ' || s.prestataire_code || ' / ' || s.type_service,
           'Des données sont stockées mais aucun pays de traitement n''est indiqué : obligatoire si le '
           || 'service traite des données.'
    from services s
    where s.stockage_donnees is true and coalesce(cardinality(s.pays_traitement), 0) = 0

    -- B_05.01 : prestataires
    union all
    select distinct 'bloquant', 'B_05.01', '0100', 'prestataires', s.prestataire_code,
           'Les dépenses annuelles sont obligatoires pour un prestataire direct (' || s.prestataire_nom || ').'
    from services s
    join public.ri_prestataires p on p.id = s.prestataire_id
    where p.depenses_annuelles is null

    union all
    select 'bloquant', 'B_05.01', m.colonne, 'prestataires', p.code,
           'EUID mal formé : il doit commencer par le code d''un pays de l''EEE et contenir un point '
           || '(ex. FRRCS.123456789).'
    from public.ri_prestataires p
    cross join lateral (values ('0010', p.type_code, p.code), ('0030', p.type_code_supp, p.code_supp))
      as m(colonne, type_code, code)
    where m.type_code = 'EUID'
      and (position('.' in m.code) = 0 or left(m.code, 2) not in (select pays from eee))

    union all
    select 'avertissement', 'B_05.01', '0090', 'prestataires', p.code,
           'La monnaie (' || p.monnaie || ') diffère de celle des états financiers de l''entité ('
           || e.monnaie || ').'
    from public.ri_prestataires p
    cross join teneur t
    join public.ri_entites e on e.lei = t.lei
    where p.monnaie is not null and e.monnaie is not null and p.monnaie <> e.monnaie

    union all
    select 'information', 'B_05.01', '0010', 'prestataires', p.code,
           'Le prestataire ' || p.nom_latin || ' n''est lié à aucun service, sous-traitance ou filiale.'
    from public.ri_prestataires p
    where not exists (select 1 from public.ri_contrats_services s where s.prestataire_id = p.id)
      and not exists (select 1 from public.ri_sous_traitance t where p.id in (t.prestataire_id, t.destinataire_id))
      and not exists (select 1 from public.ri_prestataires f where f.mere_ultime_id = p.id)

    -- B_05.02 : chaîne de sous-traitance
    union all
    select 'bloquant', 'B_05.02', '0010', 'sous_traitance', t.reference_contrat || ' / ' || t.type_service,
           'Cette chaîne de sous-traitance ne correspond à aucun service contracté (même contrat et même '
           || 'type de service).'
    from public.ri_sous_traitance t
    where not exists (select 1 from public.ri_contrats_services s
                      where s.reference_contrat = t.reference_contrat and s.type_service = t.type_service)

    union all
    select 'bloquant', 'B_05.02', '0060', 'sous_traitance', t.reference_contrat || ' / ' || t.type_service,
           case when t.rang = 2
             then 'Au rang 2, le destinataire doit être le prestataire direct de ce service.'
             else 'Au rang ' || t.rang || ', le destinataire doit être un sous-traitant déclaré au rang '
                  || (t.rang - 1) || ' de la même chaîne.'
           end
    from public.ri_sous_traitance t
    where exists (select 1 from public.ri_contrats_services s
                  where s.reference_contrat = t.reference_contrat and s.type_service = t.type_service)
      and not (
        (t.rang = 2 and exists (select 1 from public.ri_contrats_services s
                                where s.reference_contrat = t.reference_contrat
                                  and s.type_service = t.type_service
                                  and s.prestataire_id = t.destinataire_id))
        or (t.rang > 2 and exists (select 1 from public.ri_sous_traitance u
                                   where u.reference_contrat = t.reference_contrat
                                     and u.type_service = t.type_service
                                     and u.prestataire_id = t.destinataire_id
                                     and u.rang = t.rang - 1))
      )

    -- B_06.01 : fonctions
    union all
    select 'avertissement', 'B_06.01', '0070', 'fonctions', f.identifiant,
           'La criticité est évaluée mais la date de la dernière évaluation est 9999-12-31.'
    from public.ri_fonctions f
    where f.criticite in (1, 2) and f.date_derniere_evaluation = '9999-12-31'

    union all
    select 'avertissement', 'B_06.01', '0070', 'fonctions', f.identifiant,
           'Évaluation « non réalisée » alors qu''une date d''évaluation est indiquée ('
           || f.date_derniere_evaluation || ').'
    from public.ri_fonctions f
    where f.criticite = 3 and f.date_derniere_evaluation <> '9999-12-31'

    union all
    select 'information', 'B_06.01', '0010', 'fonctions', f.identifiant,
           'La fonction « ' || f.nom || ' » n''est soutenue par aucun service contracté.'
    from public.ri_fonctions f
    where not exists (select 1 from public.ri_contrats_services s where s.fonction_id = f.identifiant)

    -- B_07.01 : évaluations des services soutenant une fonction critique
    union all
    select distinct 'bloquant', 'B_07.01', '0010', 'evaluations',
           c.reference_contrat || ' / ' || c.prestataire_code || ' / ' || c.type_service,
           'Évaluation manquante : ce service soutient une fonction critique ou importante.'
    from critiques c
    where not exists (select 1 from public.ri_evaluations v
                      where v.reference_contrat = c.reference_contrat
                        and v.prestataire_id = c.prestataire_id
                        and v.type_service = c.type_service)

    union all
    select 'avertissement', 'B_07.01', '0010', 'evaluations',
           v.reference_contrat || ' / ' || p.code || ' / ' || v.type_service,
           'Cette évaluation ne correspond à aucun service contracté (même contrat, prestataire et type).'
    from public.ri_evaluations v
    join public.ri_prestataires p on p.id = v.prestataire_id
    where not exists (select 1 from public.ri_contrats_services s
                      where s.reference_contrat = v.reference_contrat
                        and s.prestataire_id = v.prestataire_id
                        and s.type_service = v.type_service)

    union all
    select 'bloquant', 'B_07.01', '0090', 'evaluations',
           v.reference_contrat || ' / ' || p.code || ' / ' || v.type_service,
           'La possibilité de réintégration est obligatoire pour un prestataire extérieur au groupe.'
    from public.ri_evaluations v
    join public.ri_prestataires p on p.id = v.prestataire_id
    where v.reintegration is null
      and v.prestataire_id not in (select id from intragroupe)

    -- B_99.01 : définitions internes des options utilisées
    union all
    select 'information', 'B_99.01', d.colonne, 'definitions', null,
           'Aucune définition interne n''est renseignée pour les options de la colonne ' || d.colonne
           || ' (' || d.libelle || ').'
    from (values
      ('B_02.01.0020', 'type d''accord contractuel',     exists (select 1 from public.ri_contrats)),
      ('B_02.02.0170', 'sensibilité des données',        exists (select 1 from public.ri_contrats_services where sensibilite_donnees is not null)),
      ('B_06.01.0110', 'incidence de l''interruption',   exists (select 1 from public.ri_fonctions)),
      ('B_07.01.0050', 'substituabilité',                exists (select 1 from public.ri_evaluations)),
      ('B_07.01.0090', 'possibilité de réintégration',   exists (select 1 from public.ri_evaluations where reintegration is not null)),
      ('B_07.01.0100', 'incidence de la cessation',      exists (select 1 from public.ri_evaluations))
    ) as d(colonne, libelle, utilisee)
    where d.utilisee
      and not exists (select 1 from public.ri_definitions x where x.colonne = d.colonne)
  )
  select a.gravite, a.modele, a.colonne, a.section, a.reference, a.message
  from anomalies a
  order by case a.gravite when 'bloquant' then 1 when 'avertissement' then 2 else 3 end,
           a.modele, a.reference nulls first, a.colonne
$$;

revoke all on function public.ri_anomalies() from public, anon;
grant execute on function public.ri_anomalies() to authenticated;

commit;

-- =============================================================================
-- 20261002000000_lignes_en_attente
-- =============================================================================
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

-- =============================================================================
-- 20261003000000_messages_anomalies
-- =============================================================================
-- Messages du rapport d'anomalies réécrits pour les saisisseurs
--
-- Chaque message dit le problème puis l'action à faire, en nommant les tableaux tels qu'ils
-- apparaissent dans l'application et les dates au format JJ/MM/AAAA. Les contrôles eux-mêmes
-- sont inchangés (mêmes règles, mêmes gravités, mêmes colonnes et références).
-- Dépend de la migration 20261002000000_lignes_en_attente.
-- Retour arrière : supabase/rollback/20261003000000_messages_anomalies_rollback.sql

begin;

set local client_min_messages = warning;

create or replace function public.ri_anomalies_registre()
returns table (
  gravite   text,
  modele    text,
  colonne   text,
  section   text,
  reference text,
  message   text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with
  teneur as (select * from public.ri_teneur_registre limit 1),
  services as (
    select s.*, f.criticite, f.nom as fonction_nom, p.code as prestataire_code, p.nom_latin as prestataire_nom
    from public.ri_contrats_services s
    join public.ri_fonctions f on f.identifiant = s.fonction_id
    join public.ri_prestataires p on p.id = s.prestataire_id
  ),
  -- Services qui soutiennent une fonction critique ou importante (B_06.01.0050 = Oui)
  critiques as (select * from services where criticite = 1),
  -- Prestataires intra-groupe : identifiés par le LEI d'une entité du périmètre
  intragroupe as (
    select p.id
    from public.ri_prestataires p
    join public.ri_entites e on e.lei = p.code
    where p.type_code = 'LEI'
  ),
  -- Pays de l'Espace économique européen (préfixe d'un EUID)
  eee(pays) as (
    select unnest(array['AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE',
                        'IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK','IS','LI','NO'])
  ),
  anomalies (gravite, modele, colonne, section, reference, message) as (

    -- B_01.01 : entité tenant le registre
    select 'bloquant', 'B_01.01', null, 'teneur', null,
           'L''entité qui tient le registre n''est pas renseignée. Complétez le tableau '
           || '« Entité tenant le registre ».'
    where not exists (select 1 from public.ri_teneur_registre)

    -- B_01.02 : entités du périmètre
    union all
    select 'bloquant', 'B_01.02', null, 'entites', null,
           'Aucune entité n''est déclarée dans le périmètre du registre. Ajoutez au moins votre propre '
           || 'entité dans « Entités du périmètre ».'
    where not exists (select 1 from public.ri_entites)

    union all
    select 'avertissement', 'B_01.02', '0010', 'entites', t.lei,
           'L''entité qui tient le registre ne figure pas dans « Entités du périmètre ». Ajoutez-la, '
           || 'sauf si elle tient le registre pour le compte d''une autre entité financière.'
    from teneur t
    where exists (select 1 from public.ri_entites)
      and not exists (select 1 from public.ri_entites e where e.lei = t.lei)

    union all
    select 'avertissement', 'B_01.02', '0070', 'entites', e.lei,
           'La date de dernière mise à jour (' || to_char(e.date_derniere_maj, 'DD/MM/YYYY') || ') est postérieure à '
           || 'aujourd''hui. Corrigez-la avec la date réelle de la dernière mise à jour des informations.'
    from public.ri_entites e
    where e.date_derniere_maj > current_date

    union all
    select 'avertissement', 'B_01.02', '0080', 'entites', e.lei,
           'La date d''intégration dans le registre (' || to_char(e.date_integration, 'DD/MM/YYYY') || ') est postérieure '
           || 'à aujourd''hui. Vérifiez cette date.'
    from public.ri_entites e
    where e.date_integration > current_date

    -- B_02.01 : contrats sans détail en B_02.02
    union all
    select 'bloquant', 'B_02.02', '0010', 'services', c.reference,
           'Ce contrat n''a aucun service rattaché. Ajoutez-le dans « Services contractés » en '
           || 'indiquant l''entité utilisatrice, le prestataire, la fonction soutenue et le type de service.'
    from public.ri_contrats c
    where c.type_accord in (1, 3)
      and not exists (select 1 from public.ri_contrats_services s where s.reference_contrat = c.reference)

    union all
    select 'avertissement', 'B_02.02', '0010', 'services', c.reference,
           'Cet accord général n''a ni service rattaché, ni accord ultérieur. Ajoutez un service dans '
           || '« Services contractés » ou rattachez-lui un accord ultérieur dans « Contrats ».'
    from public.ri_contrats c
    where c.type_accord = 2
      and not exists (select 1 from public.ri_contrats_services s where s.reference_contrat = c.reference)
      and not exists (select 1 from public.ri_contrats u where u.reference_general = c.reference)

    -- B_03.01 : entité signataire
    union all
    select 'avertissement', 'B_03.01', '0020', 'signataires_reception', c.reference,
           'Aucune entité du groupe n''est indiquée comme signataire de ce contrat. Ajoutez-la dans '
           || '« Signataires (réception) ».'
    from public.ri_contrats c
    where not exists (select 1 from public.ri_signataires_reception r where r.reference_contrat = c.reference)

    -- B_03.03 : contrat conclu avec une entité du groupe
    union all
    select distinct 'avertissement', 'B_03.03', '0020', 'signataires_fourniture', s.reference_contrat,
           'Le prestataire « ' || s.prestataire_nom || ' » fait partie du groupe. Indiquez l''entité du '
           || 'groupe qui fournit le service dans « Signataires (fourniture intra-groupe) ».'
    from services s
    where s.prestataire_id in (select id from intragroupe)
      and not exists (select 1 from public.ri_signataires_fourniture f where f.reference_contrat = s.reference_contrat)

    -- B_02.02 : informations obligatoires lorsque le service soutient une fonction critique
    union all
    select 'bloquant', 'B_02.02', m.colonne, 'services',
           c.reference_contrat || ' / ' || c.prestataire_code || ' / ' || c.fonction_id || ' / ' || c.type_service,
           m.libelle || ' manque. Il est obligatoire car ce service soutient la fonction critique ou '
           || 'importante « ' || c.fonction_nom || ' » (' || c.fonction_id || '). Complétez-le dans « Services contractés ».'
    from critiques c
    cross join lateral (values
      ('0100', 'Le délai de préavis de l''entité',         c.preavis_entite_jours is null),
      ('0110', 'Le délai de préavis du prestataire',       c.preavis_prestataire_jours is null),
      ('0120', 'Le pays du droit applicable',              c.pays_droit_applicable is null),
      ('0130', 'Le pays de fourniture des services',       c.pays_fourniture is null),
      ('0140', 'L''indication du stockage de données',     c.stockage_donnees is null),
      ('0170', 'La sensibilité des données',               c.stockage_donnees is true and c.sensibilite_donnees is null),
      ('0180', 'Le niveau de dépendance',                  c.niveau_dependance is null)
    ) as m(colonne, libelle, manquant)
    where m.manquant

    -- B_02.02.0090 : motif de fin
    union all
    select 'bloquant', 'B_02.02', '0090', 'services',
           s.reference_contrat || ' / ' || s.prestataire_code || ' / ' || s.type_service,
           'Ce service a pris fin le ' || to_char(s.date_fin, 'DD/MM/YYYY') || ' : indiquez le motif de fin.'
    from services s
    where s.date_fin < current_date and s.motif_fin is null

    union all
    select 'avertissement', 'B_02.02', '0090', 'services',
           s.reference_contrat || ' / ' || s.prestataire_code || ' / ' || s.type_service,
           'Un motif de fin est indiqué alors que le service est toujours en cours ('
           || case when s.date_fin = '9999-12-31' then 'sans date de fin'
                   else 'fin prévue le ' || to_char(s.date_fin, 'DD/MM/YYYY') end
           || '). Retirez le motif ou corrigez la date de fin.'
    from services s
    where s.motif_fin is not null and s.date_fin >= current_date

    union all
    select 'information', 'B_02.02', '0160', 'services',
           s.reference_contrat || ' / ' || s.prestataire_code || ' / ' || s.type_service,
           'Des données sont stockées mais aucun pays de traitement n''est indiqué. Renseignez les pays '
           || 'où le prestataire traite les données (obligatoire si le service en traite).'
    from services s
    where s.stockage_donnees is true and coalesce(cardinality(s.pays_traitement), 0) = 0

    -- B_05.01 : prestataires
    union all
    select distinct 'bloquant', 'B_05.01', '0100', 'prestataires', s.prestataire_code,
           'Les dépenses annuelles du prestataire « ' || s.prestataire_nom || ' » ne sont pas renseignées. '
           || 'Elles sont obligatoires pour un prestataire qui fournit directement un service.'
    from services s
    join public.ri_prestataires p on p.id = s.prestataire_id
    where p.depenses_annuelles is null

    union all
    select 'bloquant', 'B_05.01', m.colonne, 'prestataires', p.code,
           'L''EUID « ' || m.code || ' » est mal formé : il doit commencer par le code d''un pays '
           || 'européen et contenir un point, par exemple FRRCS.123456789.'
    from public.ri_prestataires p
    cross join lateral (values ('0010', p.type_code, p.code), ('0030', p.type_code_supp, p.code_supp))
      as m(colonne, type_code, code)
    where m.type_code = 'EUID'
      and (position('.' in m.code) = 0 or left(m.code, 2) not in (select pays from eee))

    union all
    select 'avertissement', 'B_05.01', '0090', 'prestataires', p.code,
           'Les dépenses de ce prestataire sont exprimées en ' || p.monnaie || ' alors que les états '
           || 'financiers de l''entité sont en ' || e.monnaie || '. Le registre attend la monnaie des états '
           || 'financiers : vérifiez la monnaie et le montant.'
    from public.ri_prestataires p
    cross join teneur t
    join public.ri_entites e on e.lei = t.lei
    where p.monnaie is not null and e.monnaie is not null and p.monnaie <> e.monnaie

    union all
    select 'information', 'B_05.01', '0010', 'prestataires', p.code,
           'Le prestataire « ' || p.nom_latin || ' » n''est rattaché à aucun service, sous-traitance ou '
           || 'filiale. Rattachez-le, ou supprimez-le s''il n''est plus utilisé.'
    from public.ri_prestataires p
    where not exists (select 1 from public.ri_contrats_services s where s.prestataire_id = p.id)
      and not exists (select 1 from public.ri_sous_traitance t where p.id in (t.prestataire_id, t.destinataire_id))
      and not exists (select 1 from public.ri_prestataires f where f.mere_ultime_id = p.id)

    -- B_05.02 : chaîne de sous-traitance
    union all
    select 'bloquant', 'B_05.02', '0010', 'sous_traitance', t.reference_contrat || ' / ' || t.type_service,
           'Aucun service contracté ne correspond à cette sous-traitance (même contrat et même type de '
           || 'service). Corrigez le contrat ou le type de service, ou déclarez d''abord le service.'
    from public.ri_sous_traitance t
    where not exists (select 1 from public.ri_contrats_services s
                      where s.reference_contrat = t.reference_contrat and s.type_service = t.type_service)

    union all
    select 'bloquant', 'B_05.02', '0060', 'sous_traitance', t.reference_contrat || ' / ' || t.type_service,
           case when t.rang = 2
             then 'Au rang 2, « Prestataire qui lui sous-traite » doit être le prestataire direct du '
                  || 'service, celui du contrat.'
             else 'Au rang ' || t.rang || ', « Prestataire qui lui sous-traite » doit être un sous-traitant '
                  || 'déclaré au rang ' || (t.rang - 1) || ' pour le même contrat et le même type de service.'
           end
    from public.ri_sous_traitance t
    where exists (select 1 from public.ri_contrats_services s
                  where s.reference_contrat = t.reference_contrat and s.type_service = t.type_service)
      and not (
        (t.rang = 2 and exists (select 1 from public.ri_contrats_services s
                                where s.reference_contrat = t.reference_contrat
                                  and s.type_service = t.type_service
                                  and s.prestataire_id = t.destinataire_id))
        or (t.rang > 2 and exists (select 1 from public.ri_sous_traitance u
                                   where u.reference_contrat = t.reference_contrat
                                     and u.type_service = t.type_service
                                     and u.prestataire_id = t.destinataire_id
                                     and u.rang = t.rang - 1))
      )

    -- B_06.01 : fonctions
    union all
    select 'avertissement', 'B_06.01', '0070', 'fonctions', f.identifiant,
           'La fonction est indiquée comme évaluée mais sa date d''évaluation est le 31/12/9999, qui '
           || 'signifie « jamais évaluée ». Renseignez la date de la dernière évaluation.'
    from public.ri_fonctions f
    where f.criticite in (1, 2) and f.date_derniere_evaluation = '9999-12-31'

    union all
    select 'avertissement', 'B_06.01', '0070', 'fonctions', f.identifiant,
           'La criticité est « Évaluation non réalisée » alors qu''une date d''évaluation est indiquée ('
           || to_char(f.date_derniere_evaluation, 'DD/MM/YYYY') || '). Corrigez la criticité ou la date.'
    from public.ri_fonctions f
    where f.criticite = 3 and f.date_derniere_evaluation <> '9999-12-31'

    union all
    select 'information', 'B_06.01', '0010', 'fonctions', f.identifiant,
           'La fonction « ' || f.nom || ' » n''est soutenue par aucun service contracté. Rattachez-la à '
           || 'un service, ou supprimez-la si elle ne dépend d''aucun prestataire TIC.'
    from public.ri_fonctions f
    where not exists (select 1 from public.ri_contrats_services s where s.fonction_id = f.identifiant)

    -- B_07.01 : évaluations des services soutenant une fonction critique
    union all
    select distinct 'bloquant', 'B_07.01', '0010', 'evaluations',
           c.reference_contrat || ' / ' || c.prestataire_code || ' / ' || c.type_service,
           'Ce service soutient une fonction critique ou importante : son évaluation est obligatoire. '
           || 'Ajoutez-la dans « Évaluations des services ».'
    from critiques c
    where not exists (select 1 from public.ri_evaluations v
                      where v.reference_contrat = c.reference_contrat
                        and v.prestataire_id = c.prestataire_id
                        and v.type_service = c.type_service)

    union all
    select 'avertissement', 'B_07.01', '0010', 'evaluations',
           v.reference_contrat || ' / ' || p.code || ' / ' || v.type_service,
           'Cette évaluation ne correspond à aucun service contracté (même contrat, prestataire et type '
           || 'de service). Corrigez-la ou supprimez-la.'
    from public.ri_evaluations v
    join public.ri_prestataires p on p.id = v.prestataire_id
    where not exists (select 1 from public.ri_contrats_services s
                      where s.reference_contrat = v.reference_contrat
                        and s.prestataire_id = v.prestataire_id
                        and s.type_service = v.type_service)

    union all
    select 'bloquant', 'B_07.01', '0090', 'evaluations',
           v.reference_contrat || ' / ' || p.code || ' / ' || v.type_service,
           'Indiquez la possibilité de réintégration : elle est obligatoire quand le prestataire est '
           || 'extérieur au groupe.'
    from public.ri_evaluations v
    join public.ri_prestataires p on p.id = v.prestataire_id
    where v.reintegration is null
      and v.prestataire_id not in (select id from intragroupe)

    -- B_99.01 : définitions internes des options utilisées
    union all
    select 'information', 'B_99.01', d.colonne, 'definitions', null,
           'Les options de « ' || d.libelle || ' » ne sont pas définies. Expliquez dans « Définitions '
           || 'internes » ce que chaque option signifie dans votre entité : l''autorité le demande.'
    from (values
      ('B_02.01.0020', 'type d''accord contractuel',     exists (select 1 from public.ri_contrats)),
      ('B_02.02.0170', 'sensibilité des données',        exists (select 1 from public.ri_contrats_services where sensibilite_donnees is not null)),
      ('B_06.01.0110', 'incidence de l''interruption',   exists (select 1 from public.ri_fonctions)),
      ('B_07.01.0050', 'substituabilité',                exists (select 1 from public.ri_evaluations)),
      ('B_07.01.0090', 'possibilité de réintégration',   exists (select 1 from public.ri_evaluations where reintegration is not null)),
      ('B_07.01.0100', 'incidence de la cessation',      exists (select 1 from public.ri_evaluations))
    ) as d(colonne, libelle, utilisee)
    where d.utilisee
      and not exists (select 1 from public.ri_definitions x where x.colonne = d.colonne)
  )
  select a.gravite, a.modele, a.colonne, a.section, a.reference, a.message
  from anomalies a
  order by case a.gravite when 'bloquant' then 1 when 'avertissement' then 2 else 3 end,
           a.modele, a.reference nulls first, a.colonne
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

commit;

-- =============================================================================
-- 20261004000000_conformite_its
-- =============================================================================
-- Mise en conformité du rapport d'anomalies avec le règlement d'exécution (UE) 2024/2956
--
-- Relecture de l'annexe I colonne par colonne. Ajouts et changements de gravité :
--   - B_01.01.0050 autorité compétente vide : bloquant (« obligatoire en cas de communication »)
--   - B_01.03 succursale dans le pays du siège, ou codée avec le LEI du siège : avertissement
--   - B_02.01.0040 / B_05.01.0090 monnaie différente de celle des états financiers : bloquant
--     (« la dépense est exprimée dans la monnaie » des états financiers)
--   - B_03.01 contrat sans entité signataire : bloquant (toutes les entités signataires sont déclarées)
--   - B_05.01.0020 EUID pour un prestataire établi hors de l'Union : bloquant (LEI seul admis)
--   - B_07.01 premier sous-traitant hors groupe non évalué quand le prestataire direct est
--     intra-groupe : bloquant ; recherche d'autres prestataires « non réalisée » : avertissement
--   - B_02.02.0160 pays de traitement et B_99.01 définitions internes : avertissement
--   - B_02.02.0090 : le message rappelle le cas de la reconduction
-- Dépend de la migration 20261003000000_messages_anomalies.
-- Retour arrière : supabase/rollback/20261004000000_conformite_its_rollback.sql

begin;

set local client_min_messages = warning;

create or replace function public.ri_anomalies_registre()
returns table (
  gravite   text,
  modele    text,
  colonne   text,
  section   text,
  reference text,
  message   text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with
  teneur as (select * from public.ri_teneur_registre limit 1),
  services as (
    select s.*, f.criticite, f.nom as fonction_nom, p.code as prestataire_code, p.nom_latin as prestataire_nom
    from public.ri_contrats_services s
    join public.ri_fonctions f on f.identifiant = s.fonction_id
    join public.ri_prestataires p on p.id = s.prestataire_id
  ),
  -- Services qui soutiennent une fonction critique ou importante (B_06.01.0050 = Oui)
  critiques as (select * from services where criticite = 1),
  -- Prestataires intra-groupe : identifiés par le LEI d'une entité du périmètre
  intragroupe as (
    select p.id
    from public.ri_prestataires p
    join public.ri_entites e on e.lei = p.code
    where p.type_code = 'LEI'
  ),
  -- Pays de l'Espace économique européen (préfixe d'un EUID)
  eee(pays) as (
    select unnest(array['AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE',
                        'IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK','IS','LI','NO'])
  ),
  anomalies (gravite, modele, colonne, section, reference, message) as (

    -- B_01.01 : entité tenant le registre
    select 'bloquant', 'B_01.01', null, 'teneur', null,
           'L''entité qui tient le registre n''est pas renseignée. Complétez le tableau '
           || '« Entité tenant le registre ».'
    where not exists (select 1 from public.ri_teneur_registre)

    union all
    select 'bloquant', 'B_01.01', '0050', 'teneur', t.lei,
           'L''autorité compétente à laquelle le registre est remis n''est pas indiquée (ex. ACPR). '
           || 'Elle est obligatoire pour toute remise : complétez « Entité tenant le registre ».'
    from teneur t
    where nullif(btrim(t.autorite_competente), '') is null

    -- B_01.02 : entités du périmètre
    union all
    select 'bloquant', 'B_01.02', null, 'entites', null,
           'Aucune entité n''est déclarée dans le périmètre du registre. Ajoutez au moins votre propre '
           || 'entité dans « Entités du périmètre ».'
    where not exists (select 1 from public.ri_entites)

    union all
    select 'avertissement', 'B_01.02', '0010', 'entites', t.lei,
           'L''entité qui tient le registre ne figure pas dans « Entités du périmètre ». Ajoutez-la, '
           || 'sauf si elle tient le registre pour le compte d''une autre entité financière.'
    from teneur t
    where exists (select 1 from public.ri_entites)
      and not exists (select 1 from public.ri_entites e where e.lei = t.lei)

    union all
    select 'avertissement', 'B_01.02', '0070', 'entites', e.lei,
           'La date de dernière mise à jour (' || to_char(e.date_derniere_maj, 'DD/MM/YYYY') || ') est postérieure à '
           || 'aujourd''hui. Corrigez-la avec la date réelle de la dernière mise à jour des informations.'
    from public.ri_entites e
    where e.date_derniere_maj > current_date

    union all
    select 'avertissement', 'B_01.02', '0080', 'entites', e.lei,
           'La date d''intégration dans le registre (' || to_char(e.date_integration, 'DD/MM/YYYY') || ') est postérieure '
           || 'à aujourd''hui. Vérifiez cette date.'
    from public.ri_entites e
    where e.date_integration > current_date

    -- B_01.03 : succursales situées hors du pays d'origine
    union all
    select 'avertissement', 'B_01.03', '0040', 'succursales', b.code,
           'La succursale « ' || b.nom || ' » est dans le même pays (' || b.pays || ') que son siège. '
           || 'Le registre ne recense que les succursales situées hors du pays d''origine : vérifiez le pays, '
           || 'ou supprimez-la.'
    from public.ri_succursales b
    join public.ri_entites e on e.lei = b.lei_siege
    where b.pays = e.pays

    union all
    select 'avertissement', 'B_01.03', '0010', 'succursales', b.code,
           'Le code de la succursale « ' || b.nom || ' » est le LEI de son siège. Utilisez le LEI propre à '
           || 'la succursale s''il existe, sinon un code interne qui la distingue.'
    from public.ri_succursales b
    where b.code = b.lei_siege

    -- B_02.01.0040 : monnaie des états financiers
    union all
    select 'bloquant', 'B_02.01', '0040', 'contrats', c.reference,
           'Les dépenses de ce contrat sont exprimées en ' || c.monnaie || ' alors que les états '
           || 'financiers de l''entité sont en ' || e.monnaie || '. Le règlement impose la monnaie des états '
           || 'financiers : convertissez le montant et changez la monnaie.'
    from public.ri_contrats c
    cross join teneur t
    join public.ri_entites e on e.lei = t.lei
    where e.monnaie is not null and c.monnaie <> e.monnaie

    -- B_02.01 : contrats sans détail en B_02.02
    union all
    select 'bloquant', 'B_02.02', '0010', 'services', c.reference,
           'Ce contrat n''a aucun service rattaché. Ajoutez-le dans « Services contractés » en '
           || 'indiquant l''entité utilisatrice, le prestataire, la fonction soutenue et le type de service.'
    from public.ri_contrats c
    where c.type_accord in (1, 3)
      and not exists (select 1 from public.ri_contrats_services s where s.reference_contrat = c.reference)

    union all
    select 'avertissement', 'B_02.02', '0010', 'services', c.reference,
           'Cet accord général n''a ni service rattaché, ni accord ultérieur. Ajoutez un service dans '
           || '« Services contractés » ou rattachez-lui un accord ultérieur dans « Contrats ».'
    from public.ri_contrats c
    where c.type_accord = 2
      and not exists (select 1 from public.ri_contrats_services s where s.reference_contrat = c.reference)
      and not exists (select 1 from public.ri_contrats u where u.reference_general = c.reference)

    -- B_03.01 : entité signataire
    union all
    select 'bloquant', 'B_03.01', '0020', 'signataires_reception', c.reference,
           'Aucune entité n''est indiquée comme signataire de ce contrat. Ajoutez-la dans « Signataires '
           || '(réception) » : pour un registre individuel, c''est votre propre entité.'
    from public.ri_contrats c
    where not exists (select 1 from public.ri_signataires_reception r where r.reference_contrat = c.reference)

    -- B_03.03 : contrat conclu avec une entité du groupe
    union all
    select distinct 'avertissement', 'B_03.03', '0020', 'signataires_fourniture', s.reference_contrat,
           'Le prestataire « ' || s.prestataire_nom || ' » fait partie du groupe. Indiquez l''entité du '
           || 'groupe qui fournit le service dans « Signataires (fourniture intra-groupe) ».'
    from services s
    where s.prestataire_id in (select id from intragroupe)
      and not exists (select 1 from public.ri_signataires_fourniture f where f.reference_contrat = s.reference_contrat)

    -- B_02.02 : informations obligatoires lorsque le service soutient une fonction critique
    union all
    select 'bloquant', 'B_02.02', m.colonne, 'services',
           c.reference_contrat || ' / ' || c.prestataire_code || ' / ' || c.fonction_id || ' / ' || c.type_service,
           m.libelle || ' manque. Il est obligatoire car ce service soutient la fonction critique ou '
           || 'importante « ' || c.fonction_nom || ' » (' || c.fonction_id || '). Complétez-le dans « Services contractés ».'
    from critiques c
    cross join lateral (values
      ('0100', 'Le délai de préavis de l''entité',         c.preavis_entite_jours is null),
      ('0110', 'Le délai de préavis du prestataire',       c.preavis_prestataire_jours is null),
      ('0120', 'Le pays du droit applicable',              c.pays_droit_applicable is null),
      ('0130', 'Le pays de fourniture des services',       c.pays_fourniture is null),
      ('0140', 'L''indication du stockage de données',     c.stockage_donnees is null),
      ('0170', 'La sensibilité des données',               c.stockage_donnees is true and c.sensibilite_donnees is null),
      ('0180', 'Le niveau de dépendance',                  c.niveau_dependance is null)
    ) as m(colonne, libelle, manquant)
    where m.manquant

    -- B_02.02.0090 : motif de fin
    union all
    select 'bloquant', 'B_02.02', '0090', 'services',
           s.reference_contrat || ' / ' || s.prestataire_code || ' / ' || s.type_service,
           'La date de fin (' || to_char(s.date_fin, 'DD/MM/YYYY') || ') est passée. Si le contrat a été '
           || 'reconduit, indiquez la nouvelle date de reconduction ; sinon, indiquez le motif de fin.'
    from services s
    where s.date_fin < current_date and s.motif_fin is null

    union all
    select 'avertissement', 'B_02.02', '0090', 'services',
           s.reference_contrat || ' / ' || s.prestataire_code || ' / ' || s.type_service,
           'Un motif de fin est indiqué alors que le service est toujours en cours ('
           || case when s.date_fin = '9999-12-31' then 'sans date de fin'
                   else 'fin prévue le ' || to_char(s.date_fin, 'DD/MM/YYYY') end
           || '). Retirez le motif ou corrigez la date de fin.'
    from services s
    where s.motif_fin is not null and s.date_fin >= current_date

    union all
    select 'avertissement', 'B_02.02', '0160', 'services',
           s.reference_contrat || ' / ' || s.prestataire_code || ' / ' || s.type_service,
           'Des données sont stockées mais aucun pays de traitement n''est indiqué. Renseignez les pays '
           || 'où le prestataire traite les données (obligatoire si le service en traite).'
    from services s
    where s.stockage_donnees is true and coalesce(cardinality(s.pays_traitement), 0) = 0

    -- B_05.01 : prestataires
    union all
    select distinct 'bloquant', 'B_05.01', '0100', 'prestataires', s.prestataire_code,
           'Les dépenses annuelles du prestataire « ' || s.prestataire_nom || ' » ne sont pas renseignées. '
           || 'Elles sont obligatoires pour un prestataire qui fournit directement un service.'
    from services s
    join public.ri_prestataires p on p.id = s.prestataire_id
    where p.depenses_annuelles is null

    union all
    select 'bloquant', 'B_05.01', m.colonne, 'prestataires', p.code,
           'L''EUID « ' || m.code || ' » est mal formé : il doit commencer par le code d''un pays '
           || 'européen et contenir un point, par exemple FRRCS.123456789.'
    from public.ri_prestataires p
    cross join lateral (values ('0010', p.type_code, p.code), ('0030', p.type_code_supp, p.code_supp))
      as m(colonne, type_code, code)
    where m.type_code = 'EUID'
      and (position('.' in m.code) = 0 or left(m.code, 2) not in (select pays from eee))

    union all
    select 'bloquant', 'B_05.01', '0020', 'prestataires', p.code,
           'Le prestataire « ' || p.nom_latin || ' » a son siège hors de l''Union (' || p.pays_siege || ') : '
           || 'il doit être identifié par son LEI, l''EUID n''étant possible que pour une société européenne.'
    from public.ri_prestataires p
    where p.type_code = 'EUID' and p.pays_siege not in (select pays from eee)

    union all
    select 'bloquant', 'B_05.01', '0090', 'prestataires', p.code,
           'Les dépenses de ce prestataire sont exprimées en ' || p.monnaie || ' alors que les états '
           || 'financiers de l''entité sont en ' || e.monnaie || '. Le règlement impose la monnaie des états '
           || 'financiers : convertissez le montant et changez la monnaie.'
    from public.ri_prestataires p
    cross join teneur t
    join public.ri_entites e on e.lei = t.lei
    where p.monnaie is not null and e.monnaie is not null and p.monnaie <> e.monnaie

    union all
    select 'information', 'B_05.01', '0010', 'prestataires', p.code,
           'Le prestataire « ' || p.nom_latin || ' » n''est rattaché à aucun service, sous-traitance ou '
           || 'filiale. Rattachez-le, ou supprimez-le s''il n''est plus utilisé.'
    from public.ri_prestataires p
    where not exists (select 1 from public.ri_contrats_services s where s.prestataire_id = p.id)
      and not exists (select 1 from public.ri_sous_traitance t where p.id in (t.prestataire_id, t.destinataire_id))
      and not exists (select 1 from public.ri_prestataires f where f.mere_ultime_id = p.id)

    -- B_05.02 : chaîne de sous-traitance
    union all
    select 'bloquant', 'B_05.02', '0010', 'sous_traitance', t.reference_contrat || ' / ' || t.type_service,
           'Aucun service contracté ne correspond à cette sous-traitance (même contrat et même type de '
           || 'service). Corrigez le contrat ou le type de service, ou déclarez d''abord le service.'
    from public.ri_sous_traitance t
    where not exists (select 1 from public.ri_contrats_services s
                      where s.reference_contrat = t.reference_contrat and s.type_service = t.type_service)

    union all
    select 'bloquant', 'B_05.02', '0060', 'sous_traitance', t.reference_contrat || ' / ' || t.type_service,
           case when t.rang = 2
             then 'Au rang 2, « Prestataire qui lui sous-traite » doit être le prestataire direct du '
                  || 'service, celui du contrat.'
             else 'Au rang ' || t.rang || ', « Prestataire qui lui sous-traite » doit être un sous-traitant '
                  || 'déclaré au rang ' || (t.rang - 1) || ' pour le même contrat et le même type de service.'
           end
    from public.ri_sous_traitance t
    where exists (select 1 from public.ri_contrats_services s
                  where s.reference_contrat = t.reference_contrat and s.type_service = t.type_service)
      and not (
        (t.rang = 2 and exists (select 1 from public.ri_contrats_services s
                                where s.reference_contrat = t.reference_contrat
                                  and s.type_service = t.type_service
                                  and s.prestataire_id = t.destinataire_id))
        or (t.rang > 2 and exists (select 1 from public.ri_sous_traitance u
                                   where u.reference_contrat = t.reference_contrat
                                     and u.type_service = t.type_service
                                     and u.prestataire_id = t.destinataire_id
                                     and u.rang = t.rang - 1))
      )

    -- B_06.01 : fonctions
    union all
    select 'avertissement', 'B_06.01', '0070', 'fonctions', f.identifiant,
           'La fonction est indiquée comme évaluée mais sa date d''évaluation est le 31/12/9999, qui '
           || 'signifie « jamais évaluée ». Renseignez la date de la dernière évaluation.'
    from public.ri_fonctions f
    where f.criticite in (1, 2) and f.date_derniere_evaluation = '9999-12-31'

    union all
    select 'avertissement', 'B_06.01', '0070', 'fonctions', f.identifiant,
           'La criticité est « Évaluation non réalisée » alors qu''une date d''évaluation est indiquée ('
           || to_char(f.date_derniere_evaluation, 'DD/MM/YYYY') || '). Corrigez la criticité ou la date.'
    from public.ri_fonctions f
    where f.criticite = 3 and f.date_derniere_evaluation <> '9999-12-31'

    union all
    select 'information', 'B_06.01', '0010', 'fonctions', f.identifiant,
           'La fonction « ' || f.nom || ' » n''est soutenue par aucun service contracté. Rattachez-la à '
           || 'un service, ou supprimez-la si elle ne dépend d''aucun prestataire TIC.'
    from public.ri_fonctions f
    where not exists (select 1 from public.ri_contrats_services s where s.fonction_id = f.identifiant)

    -- B_07.01 : évaluations des services soutenant une fonction critique
    union all
    select distinct 'bloquant', 'B_07.01', '0010', 'evaluations',
           c.reference_contrat || ' / ' || c.prestataire_code || ' / ' || c.type_service,
           'Ce service soutient une fonction critique ou importante : son évaluation est obligatoire. '
           || 'Ajoutez-la dans « Évaluations des services ».'
    from critiques c
    where not exists (select 1 from public.ri_evaluations v
                      where v.reference_contrat = c.reference_contrat
                        and v.prestataire_id = c.prestataire_id
                        and v.type_service = c.type_service)

    union all
    select distinct 'bloquant', 'B_07.01', '0010', 'evaluations',
           c.reference_contrat || ' / ' || sp.code || ' / ' || c.type_service,
           'Le prestataire direct « ' || c.prestataire_nom || ' » fait partie du groupe : le premier '
           || 'sous-traitant hors groupe, « ' || sp.nom_latin || ' », doit aussi être évalué. Ajoutez son '
           || 'évaluation dans « Évaluations des services ».'
    from critiques c
    join public.ri_sous_traitance t
      on t.reference_contrat = c.reference_contrat and t.type_service = c.type_service
     and t.rang = 2 and t.destinataire_id = c.prestataire_id
    join public.ri_prestataires sp on sp.id = t.prestataire_id
    where c.prestataire_id in (select id from intragroupe)
      and t.prestataire_id not in (select id from intragroupe)
      and not exists (select 1 from public.ri_evaluations v
                      where v.reference_contrat = c.reference_contrat
                        and v.prestataire_id = t.prestataire_id
                        and v.type_service = c.type_service)

    union all
    select 'avertissement', 'B_07.01', '0110', 'evaluations',
           v.reference_contrat || ' / ' || p.code || ' / ' || v.type_service,
           'La recherche d''autres prestataires est indiquée « non réalisée ». Pour un service qui soutient '
           || 'une fonction critique ou importante, le règlement exige qu''elle soit faite : mettez-la à jour.'
    from public.ri_evaluations v
    join public.ri_prestataires p on p.id = v.prestataire_id
    where v.autres_prestataires = 7

    union all
    select 'avertissement', 'B_07.01', '0010', 'evaluations',
           v.reference_contrat || ' / ' || p.code || ' / ' || v.type_service,
           'Cette évaluation ne correspond à aucun service contracté (même contrat, prestataire et type '
           || 'de service). Corrigez-la ou supprimez-la.'
    from public.ri_evaluations v
    join public.ri_prestataires p on p.id = v.prestataire_id
    where not exists (select 1 from public.ri_contrats_services s
                      where s.reference_contrat = v.reference_contrat
                        and s.prestataire_id = v.prestataire_id
                        and s.type_service = v.type_service)

    union all
    select 'bloquant', 'B_07.01', '0090', 'evaluations',
           v.reference_contrat || ' / ' || p.code || ' / ' || v.type_service,
           'Indiquez la possibilité de réintégration : elle est obligatoire quand le prestataire est '
           || 'extérieur au groupe.'
    from public.ri_evaluations v
    join public.ri_prestataires p on p.id = v.prestataire_id
    where v.reintegration is null
      and v.prestataire_id not in (select id from intragroupe)

    -- B_99.01 : définitions internes des options utilisées
    union all
    select 'avertissement', 'B_99.01', d.colonne, 'definitions', null,
           'Les options de « ' || d.libelle || ' » ne sont pas définies. Expliquez dans « Définitions '
           || 'internes » ce que chaque option signifie dans votre entité : l''autorité le demande.'
    from (values
      ('B_02.01.0020', 'type d''accord contractuel',     exists (select 1 from public.ri_contrats)),
      ('B_02.02.0170', 'sensibilité des données',        exists (select 1 from public.ri_contrats_services where sensibilite_donnees is not null)),
      ('B_06.01.0110', 'incidence de l''interruption',   exists (select 1 from public.ri_fonctions)),
      ('B_07.01.0050', 'substituabilité',                exists (select 1 from public.ri_evaluations)),
      ('B_07.01.0090', 'possibilité de réintégration',   exists (select 1 from public.ri_evaluations where reintegration is not null)),
      ('B_07.01.0100', 'incidence de la cessation',      exists (select 1 from public.ri_evaluations))
    ) as d(colonne, libelle, utilisee)
    where d.utilisee
      and not exists (select 1 from public.ri_definitions x where x.colonne = d.colonne)
  )
  select a.gravite, a.modele, a.colonne, a.section, a.reference, a.message
  from anomalies a
  order by case a.gravite when 'bloquant' then 1 when 'avertissement' then 2 else 3 end,
           a.modele, a.reference nulls first, a.colonne
$$;

commit;

-- =============================================================================
-- 20261005000000_comptes_moindre_privilege
-- =============================================================================
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

-- =============================================================================
-- 20261006000000_roles_registre
-- =============================================================================
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
