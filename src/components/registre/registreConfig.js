// Configuration des écrans du registre d'information DORA
// Listes fermées et colonnes : règlement d'exécution (UE) 2024/2956, annexes I et III.
import { ACTIVITES_AUTORISEES } from './activitesAutorisees';

const numbered = (labels, start = 1) =>
  labels.map((label, i) => ({ value: start + i, label: `${start + i}. ${label}` }));

export const TYPES_ENTITE = numbered([
  'Établissements de crédit',
  'Établissements de paiement (y compris exemptés)',
  "Prestataires de services d'information sur les comptes",
  'Établissements de monnaie électronique (y compris exemptés)',
  "Entreprises d'investissement",
  'Prestataires de services sur crypto-actifs',
  'Émetteurs de jetons se référant à un ou des actifs',
  'Dépositaires centraux de titres',
  'Contreparties centrales',
  'Plates-formes de négociation',
  'Référentiels centraux',
  "Gestionnaires de fonds d'investissement alternatifs",
  'Sociétés de gestion',
  'Prestataires de services de communication de données',
  "Entreprises d'assurance et de réassurance",
  "Intermédiaires d'assurance et de réassurance",
  'Institutions de retraite professionnelle',
  'Agences de notation de crédit',
  "Administrateurs d'indices de référence d'importance critique",
  'Prestataires de services de financement participatif',
  'Référentiels des titrisations',
  'Autre entité financière',
  'Entité non financière : prestataire de services TIC intra-groupe',
  'Entité non financière : autre',
]);

const RANGS_HIERARCHIQUES = numbered([
  'Entreprise mère ultime dans la consolidation',
  "Entreprise mère d'une partie sous-consolidée",
  "Filiale, non mère d'une partie sous-consolidée",
  "Ne fait pas partie d'un groupe",
  'Prestataire auquel toutes les activités opérationnelles sont sous-traitées',
]);

export const TYPES_SERVICE = [
  'Gestion des projets de TIC',
  'Développement des TIC',
  "Service d'assistance informatique (helpdesk) et de premier niveau",
  'Services de gestion de la sécurité des TIC',
  'Fourniture de données',
  'Analyse de données',
  "TIC, installations et services d'hébergement (hors nuage)",
  'Calcul',
  'Stockage non-nuage de données',
  'Opérateurs de télécommunications',
  'Infrastructure de réseau',
  'Matériel et dispositifs physiques',
  'Licences logicielles (hors logiciels à la demande)',
  "Gestion de l'exploitation des TIC (y compris maintenance)",
  'Conseil en matière de TIC',
  'Gestion du risque lié aux TIC',
  'Services en nuage : IaaS',
  'Services en nuage : PaaS',
  'Services en nuage : logiciel à la demande (SaaS)',
].map((label, i) => {
  const code = `S${String(i + 1).padStart(2, '0')}`;
  return { value: code, label: `${code} – ${label}` };
});

const TYPES_CODE_PRESTATAIRE = [
  { value: 'LEI', label: 'LEI' },
  { value: 'EUID', label: 'EUID' },
  // Personnes physiques : code pays + type (le pays peut être modifié, ex. BE_VAT)
  ...['CRN', 'VAT', 'PNR', 'NIN'].map((t) => ({
    value: `FR_${t}`,
    label: `FR_${t} — personne physique uniquement`,
  })),
];

const TYPES_CODE_SUPP = ['LEI', 'EUID', 'CRN', 'VAT', 'PNR', 'NIN'].map((v) => ({ value: v, label: v }));

const FAIBLE_MOYEN_ELEVE_NR = numbered(['Faible', 'Moyen', 'Élevé', 'Évaluation non réalisée']);

// Libellés des clés étrangères
const fkEntite = { table: 'ri_entites', value: 'lei', label: (r) => `${r.nom} (${r.lei})` };
const fkPrestataire = { table: 'ri_prestataires', value: 'id', label: (r) => `${r.nom_latin} (${r.code})` };
const fkFonction = { table: 'ri_fonctions', value: 'identifiant', label: (r) => `${r.identifiant} – ${r.nom}` };
const fkContrat = { table: 'ri_contrats', value: 'reference', label: (r) => r.reference };
const fkSuccursale = { table: 'ri_succursales', value: 'code', label: (r) => `${r.code} – ${r.nom}` };

const TOUJOURS = '9999-12-31';

/**
 * Chaque section décrit une table :
 * - pk : colonnes identifiant une ligne
 * - single : une seule ligne autorisée
 * - fields : { name, label, code, type, options, fk, required, list, default, help }
 *   types : text, textarea, number, date, select, fk, bool (Oui/Non/—), boolRequired, countries
 */
export const SECTIONS = [
  {
    key: 'teneur',
    table: 'ri_teneur_registre',
    code: 'B_01.01',
    title: 'Entité tenant le registre',
    pk: ['unique_ligne'],
    single: true,
    fields: [
      { name: 'lei', label: 'LEI', code: 'B_01.01.0010', type: 'text', required: true, list: true, upper: true },
      { name: 'nom', label: 'Nom', code: 'B_01.01.0020', type: 'text', required: true, list: true },
      { name: 'pays', label: 'Pays (ISO, ex. FR)', code: 'B_01.01.0030', type: 'text', required: true, list: true, upper: true },
      { name: 'type_entite', label: "Type d'entité", code: 'B_01.01.0040', type: 'select', options: TYPES_ENTITE.slice(0, 22), required: true, list: true },
      { name: 'autorite_competente', label: 'Autorité compétente', code: 'B_01.01.0050', type: 'text', list: true },
    ],
  },
  {
    key: 'entites',
    table: 'ri_entites',
    code: 'B_01.02',
    title: 'Entités du périmètre',
    pk: ['lei'],
    fields: [
      { name: 'lei', label: 'LEI', code: 'B_01.02.0010', type: 'text', required: true, list: true, upper: true },
      { name: 'nom', label: 'Nom', code: 'B_01.02.0020', type: 'text', required: true, list: true },
      { name: 'pays', label: 'Pays (ISO)', code: 'B_01.02.0030', type: 'text', required: true, list: true, upper: true },
      { name: 'type_entite', label: "Type d'entité", code: 'B_01.02.0040', type: 'select', options: TYPES_ENTITE, required: true, list: true },
      { name: 'rang_hierarchique', label: 'Rang hiérarchique', code: 'B_01.02.0050', type: 'select', options: RANGS_HIERARCHIQUES, required: true },
      { name: 'lei_mere_directe', label: "LEI de l'entreprise mère directe", code: 'B_01.02.0060', type: 'text', required: true, upper: true, help: "Sans groupe : répéter le LEI de l'entité" },
      { name: 'date_derniere_maj', label: 'Dernière mise à jour', code: 'B_01.02.0070', type: 'date', required: true },
      { name: 'date_integration', label: "Date d'intégration", code: 'B_01.02.0080', type: 'date', required: true },
      { name: 'date_suppression', label: 'Date de suppression', code: 'B_01.02.0090', type: 'date', required: true, default: TOUJOURS, help: '9999-12-31 si non supprimée' },
      { name: 'monnaie', label: 'Monnaie (ISO, ex. EUR)', code: 'B_01.02.0100', type: 'text', upper: true },
      { name: 'total_actifs', label: 'Total des actifs', code: 'B_01.02.0110', type: 'number', help: 'Obligatoire pour une entité financière (types 1 à 22)' },
    ],
  },
  {
    key: 'succursales',
    table: 'ri_succursales',
    code: 'B_01.03',
    title: 'Succursales',
    pk: ['code'],
    fields: [
      { name: 'code', label: 'Code de la succursale', code: 'B_01.03.0010', type: 'text', required: true, list: true },
      { name: 'lei_siege', label: 'Entité (siège)', code: 'B_01.03.0020', type: 'fk', fk: fkEntite, required: true, list: true },
      { name: 'nom', label: 'Nom', code: 'B_01.03.0030', type: 'text', required: true, list: true },
      { name: 'pays', label: 'Pays (ISO)', code: 'B_01.03.0040', type: 'text', required: true, list: true, upper: true },
    ],
  },
  {
    key: 'prestataires',
    table: 'ri_prestataires',
    code: 'B_05.01',
    title: 'Prestataires TIC',
    pk: ['id'],
    fields: [
      { name: 'code', label: "Code d'identification", code: 'B_05.01.0010', type: 'text', required: true, list: true, upper: true },
      { name: 'type_code', label: 'Type de code', code: 'B_05.01.0020', type: 'text', required: true, list: true, upper: true, suggestions: TYPES_CODE_PRESTATAIRE, help: 'LEI, EUID, ou pays + type pour une personne physique (ex. FR_VAT)' },
      { name: 'code_supp', label: 'Code supplémentaire', code: 'B_05.01.0030', type: 'text', upper: true },
      { name: 'type_code_supp', label: 'Type du code supplémentaire', code: 'B_05.01.0040', type: 'select', options: TYPES_CODE_SUPP },
      { name: 'raison_sociale', label: 'Raison sociale', code: 'B_05.01.0050', type: 'text', required: true },
      { name: 'nom_latin', label: 'Nom en alphabet latin', code: 'B_05.01.0060', type: 'text', required: true, list: true },
      { name: 'type_personne', label: 'Type de personne', code: 'B_05.01.0070', type: 'select', options: numbered(['Personne morale', 'Personne physique agissant à titre professionnel']), required: true },
      { name: 'pays_siege', label: 'Pays du siège (ISO)', code: 'B_05.01.0080', type: 'text', required: true, list: true, upper: true },
      { name: 'monnaie', label: 'Monnaie (ISO)', code: 'B_05.01.0090', type: 'text', upper: true },
      { name: 'depenses_annuelles', label: 'Dépenses annuelles totales', code: 'B_05.01.0100', type: 'number', help: 'Obligatoire pour un prestataire direct' },
      { name: 'mere_ultime_id', label: 'Entreprise mère ultime', code: 'B_05.01.0110', type: 'fk', fk: fkPrestataire, help: "Laisser vide si le prestataire n'a pas de mère (il est sa propre mère ultime)" },
    ],
  },
  {
    key: 'fonctions',
    table: 'ri_fonctions',
    code: 'B_06.01',
    title: 'Fonctions',
    pk: ['identifiant'],
    fields: [
      { name: 'identifiant', label: 'Identifiant (F1, F2…)', code: 'B_06.01.0010', type: 'text', required: true, list: true, upper: true },
      { name: 'activite_autorisee', label: 'Activité autorisée', code: 'B_06.01.0020', type: 'select', groups: ACTIVITES_AUTORISEES, required: true, list: true, help: "Activité de l'annexe II, ou « fonctions de soutien » si la fonction n'est liée à aucune activité autorisée" },
      { name: 'nom', label: 'Nom de la fonction', code: 'B_06.01.0030', type: 'text', required: true, list: true },
      { name: 'lei_entite', label: 'Entité', code: 'B_06.01.0040', type: 'fk', fk: fkEntite, required: true },
      { name: 'criticite', label: 'Critique ou importante ?', code: 'B_06.01.0060', type: 'select', options: numbered(['Oui', 'Non', 'Évaluation non réalisée']), required: true, list: true },
      { name: 'raisons_criticite', label: 'Raisons (300 caractères max.)', code: 'B_06.01.0070', type: 'textarea', maxLength: 300 },
      { name: 'date_derniere_evaluation', label: 'Date de la dernière évaluation', code: 'B_06.01.0080', type: 'date', required: true, default: TOUJOURS, help: '9999-12-31 si non évaluée' },
      { name: 'rto_heures', label: 'RTO (heures)', code: 'B_06.01.0090', type: 'number', required: true, help: '1 si moins d’une heure, 0 si non défini' },
      { name: 'rpo_heures', label: 'RPO (heures)', code: 'B_06.01.0100', type: 'number', required: true, help: '1 si moins d’une heure, 0 si non défini' },
      { name: 'incidence_interruption', label: "Incidence de l'interruption", code: 'B_06.01.0110', type: 'select', options: FAIBLE_MOYEN_ELEVE_NR, required: true },
    ],
  },
  {
    key: 'contrats',
    table: 'ri_contrats',
    code: 'B_02.01',
    title: 'Contrats',
    pk: ['reference'],
    fields: [
      { name: 'reference', label: 'Numéro de référence', code: 'B_02.01.0010', type: 'text', required: true, list: true },
      { name: 'type_accord', label: "Type d'accord", code: 'B_02.01.0020', type: 'select', options: numbered(['Accord autonome', 'Accord général / directeur', 'Accord ultérieur ou associé']), required: true, list: true },
      { name: 'reference_general', label: 'Accord général de rattachement', code: 'B_02.01.0030', type: 'fk', fk: fkContrat, list: true, help: 'Uniquement pour un accord ultérieur ou associé' },
      { name: 'monnaie', label: 'Monnaie (ISO)', code: 'B_02.01.0040', type: 'text', required: true, upper: true, default: 'EUR' },
      { name: 'depenses_annuelles', label: "Dépenses annuelles de l'année écoulée", code: 'B_02.01.0050', type: 'number', required: true, list: true },
    ],
  },
  {
    key: 'services',
    table: 'ri_contrats_services',
    code: 'B_02.02',
    title: 'Services contractés',
    pk: ['id'],
    fields: [
      { name: 'reference_contrat', label: 'Contrat', code: 'B_02.02.0010', type: 'fk', fk: fkContrat, required: true, list: true },
      { name: 'lei_entite', label: 'Entité utilisatrice', code: 'B_02.02.0020', type: 'fk', fk: fkEntite, required: true, list: true },
      { name: 'succursale_code', label: 'Succursale utilisatrice', code: 'B_04.01.0040', type: 'fk', fk: fkSuccursale, help: 'Seulement si le service est utilisé par une succursale' },
      { name: 'prestataire_id', label: 'Prestataire', code: 'B_02.02.0030', type: 'fk', fk: fkPrestataire, required: true, list: true },
      { name: 'fonction_id', label: 'Fonction soutenue', code: 'B_02.02.0050', type: 'fk', fk: fkFonction, required: true, list: true },
      { name: 'type_service', label: 'Type de service TIC', code: 'B_02.02.0060', type: 'select', options: TYPES_SERVICE, required: true, list: true },
      { name: 'date_debut', label: 'Date de début', code: 'B_02.02.0070', type: 'date', required: true },
      { name: 'date_fin', label: 'Date de fin', code: 'B_02.02.0080', type: 'date', required: true, default: TOUJOURS, help: '9999-12-31 si durée indéterminée' },
      { name: 'motif_fin', label: 'Motif de fin', code: 'B_02.02.0090', type: 'select', options: numbered(['Sans motif (expiré, non renouvelé)', 'Infraction du prestataire', 'Défauts du prestataire nuisant à la fonction', 'Faiblesses de sécurité des données', "Demande d'une autorité compétente", 'Autre']) },
      { name: 'preavis_entite_jours', label: "Préavis de l'entité (jours)", code: 'B_02.02.0100', type: 'number' },
      { name: 'preavis_prestataire_jours', label: 'Préavis du prestataire (jours)', code: 'B_02.02.0110', type: 'number' },
      { name: 'pays_droit_applicable', label: 'Pays du droit applicable (ISO)', code: 'B_02.02.0120', type: 'text', upper: true },
      { name: 'pays_fourniture', label: 'Pays de fourniture (ISO)', code: 'B_02.02.0130', type: 'text', upper: true },
      { name: 'stockage_donnees', label: 'Stockage de données ?', code: 'B_02.02.0140', type: 'bool' },
      { name: 'pays_stockage', label: 'Pays de stockage (ex. FR, IE)', code: 'B_02.02.0150', type: 'countries' },
      { name: 'pays_traitement', label: 'Pays de traitement (ex. FR)', code: 'B_02.02.0160', type: 'countries' },
      { name: 'sensibilite_donnees', label: 'Sensibilité des données', code: 'B_02.02.0170', type: 'select', options: numbered(['Faible', 'Moyen', 'Élevé']) },
      { name: 'niveau_dependance', label: 'Niveau de dépendance', code: 'B_02.02.0180', type: 'select', options: numbered(['Insignifiant', 'Faible dépendance', 'Dépendance significative', 'Dépendance totale']) },
    ],
  },
  {
    key: 'sous_traitance',
    table: 'ri_sous_traitance',
    code: 'B_05.02',
    title: 'Sous-traitance',
    pk: ['id'],
    intro: 'Le prestataire direct (rang 1) est déduit des services contractés. Ne déclarer ici que les sous-traitants (rang 2 et plus).',
    fields: [
      { name: 'reference_contrat', label: 'Contrat', code: 'B_05.02.0010', type: 'fk', fk: fkContrat, required: true, list: true },
      { name: 'type_service', label: 'Type de service TIC', code: 'B_05.02.0020', type: 'select', options: TYPES_SERVICE, required: true, list: true },
      { name: 'prestataire_id', label: 'Sous-traitant', code: 'B_05.02.0030', type: 'fk', fk: fkPrestataire, required: true, list: true },
      { name: 'rang', label: 'Rang', code: 'B_05.02.0050', type: 'number', required: true, default: 2, list: true },
      { name: 'destinataire_id', label: 'Prestataire qui lui sous-traite', code: 'B_05.02.0060', type: 'fk', fk: fkPrestataire, required: true, list: true },
    ],
  },
  {
    key: 'evaluations',
    table: 'ri_evaluations',
    code: 'B_07.01',
    title: 'Évaluations des services',
    pk: ['reference_contrat', 'prestataire_id', 'type_service'],
    intro: 'À remplir pour les services qui soutiennent une fonction critique ou importante.',
    fields: [
      { name: 'reference_contrat', label: 'Contrat', code: 'B_07.01.0010', type: 'fk', fk: fkContrat, required: true, list: true },
      { name: 'prestataire_id', label: 'Prestataire', code: 'B_07.01.0020', type: 'fk', fk: fkPrestataire, required: true, list: true },
      { name: 'type_service', label: 'Type de service TIC', code: 'B_07.01.0040', type: 'select', options: TYPES_SERVICE, required: true, list: true },
      { name: 'substituabilite', label: 'Substituabilité', code: 'B_07.01.0050', type: 'select', options: numbered(['Non substituable', 'Substituabilité très complexe', 'Substituabilité moyennement complexe', 'Facilement substituable']), required: true, list: true },
      { name: 'raison_non_substituable', label: 'Raison de la non-substituabilité', code: 'B_07.01.0060', type: 'select', options: numbered(['Absence de réelles solutions de substitution', 'Difficultés de migration ou de réintégration', 'Les deux']), help: 'Obligatoire si non substituable ou très complexe' },
      { name: 'date_dernier_audit', label: 'Date du dernier audit', code: 'B_07.01.0070', type: 'date', required: true, default: TOUJOURS, help: "9999-12-31 si aucun audit" },
      { name: 'plan_sortie', label: 'Plan de sortie ?', code: 'B_07.01.0080', type: 'boolRequired', required: true },
      { name: 'reintegration', label: 'Possibilité de réintégration', code: 'B_07.01.0090', type: 'select', options: numbered(['Facile', 'Difficile', 'Très complexe']), help: 'Sans objet pour un prestataire intra-groupe' },
      { name: 'incidence_cessation', label: 'Incidence de la cessation', code: 'B_07.01.0100', type: 'select', options: FAIBLE_MOYEN_ELEVE_NR, required: true },
      { name: 'autres_prestataires', label: 'Autres prestataires recensés ?', code: 'B_07.01.0110', type: 'select', options: [{ value: 1, label: '1. Oui' }, { value: 2, label: '2. Non' }, { value: 7, label: '7. Évaluation non réalisée' }], required: true },
      { name: 'autre_prestataire_info', label: 'Identification de ces prestataires', code: 'B_07.01.0120', type: 'textarea' },
    ],
  },
  {
    key: 'intragroupe',
    table: 'ri_accords_intragroupe',
    code: 'B_02.03',
    title: 'Accords intra-groupe',
    pk: ['reference_contrat', 'reference_contrat_lie'],
    fields: [
      { name: 'reference_contrat', label: 'Contrat avec le prestataire intra-groupe', code: 'B_02.03.0010', type: 'fk', fk: fkContrat, required: true, list: true },
      { name: 'reference_contrat_lie', label: 'Contrat lié (intra-groupe ↔ prestataire direct)', code: 'B_02.03.0020', type: 'fk', fk: fkContrat, required: true, list: true },
    ],
  },
  {
    key: 'signataires_reception',
    table: 'ri_signataires_reception',
    code: 'B_03.01',
    title: 'Signataires (réception)',
    pk: ['reference_contrat', 'lei_entite'],
    fields: [
      { name: 'reference_contrat', label: 'Contrat', code: 'B_03.01.0010', type: 'fk', fk: fkContrat, required: true, list: true },
      { name: 'lei_entite', label: 'Entité signataire', code: 'B_03.01.0020', type: 'fk', fk: fkEntite, required: true, list: true },
    ],
  },
  {
    key: 'signataires_fourniture',
    table: 'ri_signataires_fourniture',
    code: 'B_03.03',
    title: 'Signataires (fourniture intra-groupe)',
    pk: ['reference_contrat', 'lei_entite'],
    fields: [
      { name: 'reference_contrat', label: 'Contrat', code: 'B_03.03.0010', type: 'fk', fk: fkContrat, required: true, list: true },
      { name: 'lei_entite', label: 'Entité du groupe qui fournit le service', code: 'B_03.03.0020', type: 'fk', fk: fkEntite, required: true, list: true },
    ],
  },
  {
    key: 'definitions',
    table: 'ri_definitions',
    code: 'B_99.01',
    title: 'Définitions internes',
    pk: ['colonne', 'option'],
    fields: [
      { name: 'colonne', label: 'Colonne', code: 'B_99.01.C0010', type: 'select', required: true, list: true, options: [
        { value: 'B_02.01.0020', label: "B_02.01.0020 – Type d'accord contractuel" },
        { value: 'B_02.02.0170', label: 'B_02.02.0170 – Sensibilité des données' },
        { value: 'B_06.01.0110', label: "B_06.01.0110 – Incidence de l'interruption de la fonction" },
        { value: 'B_07.01.0050', label: 'B_07.01.0050 – Substituabilité' },
        { value: 'B_07.01.0090', label: 'B_07.01.0090 – Possibilité de réintégration' },
        { value: 'B_07.01.0100', label: 'B_07.01.0100 – Incidence de la cessation' },
      ] },
      { name: 'option', label: "Numéro de l'option", code: 'B_99.01.C0030', type: 'number', required: true, list: true },
      { name: 'definition', label: 'Définition interne', code: 'B_99.01.C0040', type: 'textarea', required: true, list: true },
    ],
  },
];

// Messages lisibles pour les contrôles de la base
export const MESSAGES_CONTRAINTES = {
  ri_teneur_registre_lei_check: 'LEI invalide : 20 caractères et chiffres de contrôle corrects requis.',
  ri_entites_lei_check: 'LEI invalide : 20 caractères et chiffres de contrôle corrects requis.',
  ri_entites_lei_mere_directe_check: "LEI de l'entreprise mère invalide.",
  ri_entites_actifs: "Le total des actifs est obligatoire pour une entité financière (types 1 à 22).",
  ri_entites_monnaie: 'La monnaie est obligatoire quand le total des actifs est renseigné.',
  ri_entites_dates: "La date de suppression doit être postérieure à la date d'intégration.",
  ri_prestataires_lei: 'LEI du prestataire invalide.',
  ri_prestataires_lei_supp: 'LEI du code supplémentaire invalide.',
  ri_prestataires_type_code_check: 'Type de code invalide : LEI, EUID, ou pays + _CRN/_VAT/_PNR/_NIN (ex. FR_VAT).',
  ri_prestataires_personne_morale: "Une personne morale doit être identifiée par un LEI ou un EUID.",
  ri_prestataires_code_supp: 'Le code supplémentaire et son type doivent être renseignés ensemble.',
  ri_prestataires_monnaie: 'La monnaie est obligatoire quand les dépenses annuelles sont renseignées.',
  ri_prestataires_mere: 'Un prestataire ne peut pas être sa propre entreprise mère.',
  ri_prestataires_code_type_code_key: 'Un prestataire avec ce code existe déjà.',
  ri_fonctions_identifiant_check: "L'identifiant de fonction doit être de la forme F1, F2, F3…",
  ri_fonctions_lei_entite_activite_autorisee_nom_key: 'Cette fonction existe déjà pour cette entité et cette activité.',
  ri_contrats_general: "Un accord ultérieur ou associé doit être rattaché à un accord général ; les autres types n'en ont pas.",
  ri_contrats_general_soi: 'Un contrat ne peut pas être rattaché à lui-même.',
  ri_contrats_services_dates: 'La date de fin doit être postérieure à la date de début.',
  ri_contrats_services_stockage: 'Indiquer au moins un pays de stockage quand le stockage de données est « Oui ».',
  ri_contrats_services_pays_stockage_check: 'Pays de stockage invalides : codes ISO à 2 lettres séparés par des virgules.',
  ri_contrats_services_pays_traitement_check: 'Pays de traitement invalides : codes ISO à 2 lettres séparés par des virgules.',
  ri_contrats_services_succursale: "Cette succursale n'appartient pas à l'entité utilisatrice.",
  ri_evaluations_raison: 'La raison est obligatoire pour un prestataire non substituable ou très complexe à substituer.',
  ri_sous_traitance_rang_check: 'Un sous-traitant a un rang de 2 ou plus.',
};
