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
