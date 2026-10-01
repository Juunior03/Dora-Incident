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
