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
