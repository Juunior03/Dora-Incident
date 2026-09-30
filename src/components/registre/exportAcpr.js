// Export du registre d'information au format de remise EBA « plain-csv » (DPM 4.0, module DORA).
// Références : docs/eba (paquet d'exemple officiel, maquettes annotées, listes de valeurs,
// modèle de données et FAQ de l'EBA sur la remise des registres).
//
// Structure produite (identique au paquet d'exemple de l'EBA) :
//   {LEI}.{IND|CON}_{PAYS}_DORA010100_DORA_{date d'arrêté}_{horodatage}/
//     META-INF/reportPackage.json
//     reports/report.json, parameters.csv, FilingIndicators.csv, b_01.01.csv … b_99.01.csv

export const MODELES = ['B_01.01', 'B_01.02', 'B_01.03', 'B_02.01', 'B_02.02', 'B_02.03', 'B_03.01',
  'B_03.02', 'B_03.03', 'B_04.01', 'B_05.01', 'B_05.02', 'B_06.01', 'B_07.01', 'B_99.01'];

// Valeur à déclarer dans une colonne clé quand il n'y a pas de valeur (FAQ EBA n° 26, 59 à 65)
const PAYS_SANS_OBJET = 'eba_GA:qx2007';
const TEXTE_SANS_OBJET = 'Not Applicable';

// ---------------------------------------------------------------------------
// Correspondance entre les options de l'application (numérotation du règlement
// 2024/2956) et les codes EBA (liste des valeurs DPM 4.0 du 3 mars 2025)
// ---------------------------------------------------------------------------
const TYPE_ENTITE = {
  1: 'x12', 2: 'x300', 3: 'x301', 4: 'x302', 5: 'x599', 6: 'x303', 7: 'x310', 8: 'x304',
  9: 'x643', 10: 'x305', 11: 'x306', 12: 'x307', 13: 'x639', 14: 'x308', 15: 'x309', 16: 'x320',
  17: 'x311', 18: 'x312', 19: 'x313', 20: 'x314', 21: 'x315', 22: 'x316', 23: 'x317', 24: 'x318',
};
const RANG_HIERARCHIQUE = { 1: 'x53', 2: 'x551', 3: 'x56', 4: 'x21', 5: 'x210' };
const TYPE_ACCORD = { 1: 'x1', 2: 'x2', 3: 'x3' };
const MOTIF_FIN = { 1: 'x4', 2: 'x5', 3: 'x6', 4: 'x7', 5: 'x8', 6: 'x9' };
const SENSIBILITE = { 1: 'x791', 2: 'x792', 3: 'x793' };
const DEPENDANCE = { 1: 'x794', 2: 'x795', 3: 'x796', 4: 'x797' };
const TYPE_PERSONNE = { 1: 'x212', 2: 'x213' };
const OUI_NON_NR = { 1: 'x28', 2: 'x29', 3: 'x21' }; // criticité B_06.01.0050
const FAIBLE_MOYEN_ELEVE_NR = { 1: 'x791', 2: 'x792', 3: 'x793', 4: 'x799' };
const SUBSTITUABILITE = { 1: 'x959', 2: 'x960', 3: 'x961', 4: 'x962' };
const RAISON_SUBSTITUABILITE = { 1: 'x963', 2: 'x964', 3: 'x965' };
const REINTEGRATION = { 1: 'x798', 2: 'x966', 3: 'x967' };
const AUTRES_PRESTATAIRES = { 1: 'x28', 2: 'x29', 7: 'x21' };
const TYPE_CODE = { LEI: 'qx2000', NIN: 'qx2001', EUID: 'qx2002', CRN: 'qx2003', VAT: 'qx2004', PNR: 'qx2005' };

const code = (prefixe, table, valeur) =>
  (valeur === null || valeur === undefined || table[valeur] === undefined ? '' : `eba_${prefixe}:${table[valeur]}`);
const pays = (p) => (p ? `eba_GA:${p}` : '');
const devise = (d) => (d ? `eba_CU:${d}` : '');
const ouiNon = (b) => (b === null || b === undefined ? '' : `eba_BT:${b ? 'x28' : 'x29'}`);
const service = (s) => (s ? `eba_TA:${s}` : '');
// « FR_VAT » -> VAT ; « LEI » -> LEI
const typeCode = (t) => {
  if (!t) return '';
  const base = t.includes('_') ? t.split('_')[1] : t;
  return TYPE_CODE[base] ? `eba_qCO:${TYPE_CODE[base]}` : '';
};
const texte = (v) => (v === null || v === undefined ? '' : String(v));

// ---------------------------------------------------------------------------
// CSV : séparateur virgule, guillemets si nécessaire, fins de ligne CRLF
// ---------------------------------------------------------------------------
function champCsv(valeur) {
  const s = texte(valeur);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function csv(colonnes, lignes) {
  const entete = colonnes.map((c) => `c${c}`).join(',');
  const corps = lignes.map((l) => colonnes.map((c) => champCsv(l[c])).join(','));
  return [entete, ...corps].map((l) => `${l}\r\n`).join('');
}

// Supprime les doublons (même valeur pour toutes les colonnes)
function uniques(lignes, colonnes) {
  const vus = new Set();
  return lignes.filter((l) => {
    const cle = colonnes.map((c) => texte(l[c])).join('\u0001');
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Construction des tableaux
// ---------------------------------------------------------------------------
export function construireTableaux(donnees, { dateCommunication }) {
  const {
    teneur = [], entites = [], succursales = [], prestataires = [], fonctions = [], contrats = [],
    services = [], intragroupe = [], signatairesReception = [], signatairesFourniture = [],
    sousTraitance = [], evaluations = [], definitions = [],
  } = donnees;
  const presta = Object.fromEntries(prestataires.map((p) => [p.id, p]));
  const lei = new Set(entites.map((e) => e.lei));
  const estIntragroupe = (p) => p && p.type_code === 'LEI' && lei.has(p.code);

  const t = {};

  t['B_01.01'] = teneur.map((r) => ({
    '0010': r.lei, '0020': r.nom, '0030': pays(r.pays), '0040': code('CT', TYPE_ENTITE, r.type_entite),
    '0050': r.autorite_competente, '0060': dateCommunication,
  }));

  t['B_01.02'] = entites.map((r) => ({
    '0010': r.lei, '0020': r.nom, '0030': pays(r.pays), '0040': code('CT', TYPE_ENTITE, r.type_entite),
    '0050': code('RP', RANG_HIERARCHIQUE, r.rang_hierarchique), '0060': r.lei_mere_directe,
    '0070': r.date_derniere_maj, '0080': r.date_integration, '0090': r.date_suppression,
    '0100': devise(r.monnaie), '0110': r.total_actifs,
  }));

  t['B_01.03'] = succursales.map((r) => ({
    '0010': r.code, '0020': r.lei_siege, '0030': r.nom, '0040': pays(r.pays),
  }));

  t['B_02.01'] = contrats.map((r) => ({
    '0010': r.reference, '0020': code('CO', TYPE_ACCORD, r.type_accord), '0030': r.reference_general,
    '0040': devise(r.monnaie), '0050': r.depenses_annuelles,
  }));

  // B_02.02 : une ligne par pays de stockage et par pays de traitement (article 4, paragraphe 2).
  // Ces colonnes sont des clés : « Not Applicable » quand elles sont sans objet (FAQ 59, 61, 63).
  t['B_02.02'] = services.flatMap((r) => {
    const p = presta[r.prestataire_id];
    const stockages = r.stockage_donnees && r.pays_stockage?.length ? r.pays_stockage.map(pays) : [PAYS_SANS_OBJET];
    const traitements = r.pays_traitement?.length ? r.pays_traitement.map(pays) : [PAYS_SANS_OBJET];
    const base = {
      '0010': r.reference_contrat, '0020': r.lei_entite, '0030': p?.code, '0040': typeCode(p?.type_code),
      '0050': r.fonction_id, '0060': service(r.type_service), '0070': r.date_debut, '0080': r.date_fin,
      '0090': code('CO', MOTIF_FIN, r.motif_fin), '0100': r.preavis_entite_jours, '0110': r.preavis_prestataire_jours,
      '0120': pays(r.pays_droit_applicable), '0130': r.pays_fourniture ? pays(r.pays_fourniture) : PAYS_SANS_OBJET,
      '0140': ouiNon(r.stockage_donnees), '0170': code('ZZ', SENSIBILITE, r.sensibilite_donnees),
      '0180': code('ZZ', DEPENDANCE, r.niveau_dependance),
    };
    return stockages.flatMap((s) => traitements.map((tr) => ({ ...base, '0150': s, '0160': tr })));
  });

  t['B_02.03'] = intragroupe.map((r) => ({ '0010': r.reference_contrat, '0020': r.reference_contrat_lie, '0030': 'true' }));

  t['B_03.01'] = signatairesReception.map((r) => ({ '0010': r.reference_contrat, '0020': r.lei_entite, '0030': 'true' }));

  // B_03.02 : prestataires signataires, déduits des services contractés
  t['B_03.02'] = uniques(services.map((r) => {
    const p = presta[r.prestataire_id];
    return { '0010': r.reference_contrat, '0020': p?.code, '0030': typeCode(p?.type_code) };
  }), ['0010', '0020']);

  t['B_03.03'] = signatairesFourniture.map((r) => ({ '0010': r.reference_contrat, '0020': r.lei_entite, '0031': 'true' }));

  // B_04.01 : entités utilisatrices, déduites des services contractés (FAQ 64 pour les non-succursales)
  t['B_04.01'] = uniques(services.map((r) => ({
    '0010': r.reference_contrat, '0020': r.lei_entite,
    '0030': `eba_ZZ:${r.succursale_code ? 'x838' : 'x839'}`,
    '0040': r.succursale_code || TEXTE_SANS_OBJET,
  })), ['0010', '0020', '0040']);

  t['B_05.01'] = prestataires.map((r) => {
    const mere = r.mere_ultime_id ? presta[r.mere_ultime_id] : r; // sans groupe : son propre code (FAQ 99)
    return {
      '0010': r.code, '0020': typeCode(r.type_code), '0030': r.code_supp, '0040': typeCode(r.type_code_supp),
      '0050': r.raison_sociale, '0060': r.nom_latin, '0070': code('CT', TYPE_PERSONNE, r.type_personne),
      '0080': pays(r.pays_siege), '0090': devise(r.monnaie), '0100': r.depenses_annuelles,
      '0110': mere?.code, '0120': typeCode(mere?.type_code),
    };
  });

  // B_05.02 : rang 1 déduit des services (destinataire = le prestataire lui-même, FAQ 65),
  // puis les sous-traitants déclarés
  const rang1 = uniques(services.map((r) => {
    const p = presta[r.prestataire_id];
    return {
      '0010': r.reference_contrat, '0020': service(r.type_service), '0030': p?.code, '0040': typeCode(p?.type_code),
      '0050': 1, '0060': p?.code, '0070': typeCode(p?.type_code),
    };
  }), ['0010', '0020', '0030']);
  const sousTraitants = sousTraitance.map((r) => {
    const p = presta[r.prestataire_id];
    const d = presta[r.destinataire_id];
    return {
      '0010': r.reference_contrat, '0020': service(r.type_service), '0030': p?.code, '0040': typeCode(p?.type_code),
      '0050': r.rang, '0060': d?.code, '0070': typeCode(d?.type_code),
    };
  });
  t['B_05.02'] = [...rang1, ...sousTraitants];

  t['B_06.01'] = fonctions.map((r) => ({
    '0010': r.identifiant, '0020': r.activite_autorisee, '0030': r.nom, '0040': r.lei_entite,
    '0050': code('BT', OUI_NON_NR, r.criticite), '0060': r.raisons_criticite, '0070': r.date_derniere_evaluation,
    '0080': r.rto_heures, '0090': r.rpo_heures, '0100': code('ZZ', FAIBLE_MOYEN_ELEVE_NR, r.incidence_interruption),
  }));

  t['B_07.01'] = evaluations.map((r) => {
    const p = presta[r.prestataire_id];
    return {
      '0010': r.reference_contrat, '0020': p?.code, '0030': typeCode(p?.type_code), '0040': service(r.type_service),
      '0050': code('ZZ', SUBSTITUABILITE, r.substituabilite),
      '0060': code('ZZ', RAISON_SUBSTITUABILITE, r.raison_non_substituable),
      '0070': r.date_dernier_audit, '0080': ouiNon(r.plan_sortie),
      // Réintégration : « Not applicable » (eba_ZZ:x0) pour un prestataire intra-groupe
      '0090': r.reintegration ? code('ZZ', REINTEGRATION, r.reintegration) : (estIntragroupe(p) ? 'eba_ZZ:x0' : ''),
      '0100': code('ZZ', FAIBLE_MOYEN_ELEVE_NR, r.incidence_cessation),
      '0110': code('BT', AUTRES_PRESTATAIRES, r.autres_prestataires), '0120': r.autre_prestataire_info,
    };
  });

  // B_99.01 : une seule ligne, une colonne par option (maquette annotée DPM 4.0)
  const def = (colonne, option) => definitions.find((d) => d.colonne === colonne && d.option === option)?.definition;
  const ligne99 = {
    '0010': def('B_02.01.0020', 1), '0020': def('B_02.01.0020', 2), '0030': def('B_02.01.0020', 3),
    '0040': def('B_02.02.0170', 1), '0050': def('B_02.02.0170', 2), '0060': def('B_02.02.0170', 3),
    '0070': def('B_06.01.0110', 1), '0080': def('B_06.01.0110', 2), '0090': def('B_06.01.0110', 3),
    '0100': def('B_07.01.0050', 1), '0110': def('B_07.01.0050', 2), '0120': def('B_07.01.0050', 3),
    '0130': def('B_07.01.0050', 4), '0140': def('B_07.01.0090', 1), '0150': def('B_07.01.0090', 2),
    '0160': def('B_07.01.0090', 3), '0170': def('B_07.01.0100', 1), '0180': def('B_07.01.0100', 2),
    '0190': def('B_07.01.0100', 3),
  };
  t['B_99.01'] = Object.values(ligne99).some(Boolean) ? [ligne99] : [];

  return t;
}

// Colonnes de chaque fichier, dans l'ordre de la maquette annotée DPM 4.0
const COLONNES = {
  'B_01.01': ['0010', '0020', '0030', '0040', '0050', '0060'],
  'B_01.02': ['0010', '0020', '0030', '0040', '0050', '0060', '0070', '0080', '0090', '0100', '0110'],
  'B_01.03': ['0010', '0020', '0030', '0040'],
  'B_02.01': ['0010', '0020', '0030', '0040', '0050'],
  'B_02.02': ['0010', '0020', '0030', '0040', '0050', '0060', '0070', '0080', '0090', '0100', '0110', '0120',
    '0130', '0140', '0150', '0160', '0170', '0180'],
  'B_02.03': ['0010', '0020', '0030'],
  'B_03.01': ['0010', '0020', '0030'],
  'B_03.02': ['0010', '0020', '0030'],
  'B_03.03': ['0010', '0020', '0031'],
  'B_04.01': ['0010', '0020', '0030', '0040'],
  'B_05.01': ['0010', '0020', '0030', '0040', '0050', '0060', '0070', '0080', '0090', '0100', '0110', '0120'],
  'B_05.02': ['0010', '0020', '0030', '0040', '0050', '0060', '0070'],
  'B_06.01': ['0010', '0020', '0030', '0040', '0050', '0060', '0070', '0080', '0090', '0100'],
  'B_07.01': ['0010', '0020', '0030', '0040', '0050', '0060', '0070', '0080', '0090', '0100', '0110', '0120'],
  'B_99.01': ['0010', '0020', '0030', '0040', '0050', '0060', '0070', '0080', '0090', '0100', '0110', '0120',
    '0130', '0140', '0150', '0160', '0170', '0180', '0190'],
};

// Horodatage de création au format aaaammjjhhmmssSSS
export function horodatage(d = new Date()) {
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`
    + `${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`;
}

/**
 * Construit le paquet de remise.
 * @param donnees    lignes des tables ri_* (voir construireTableaux)
 * @param parametres { leiDeclarant, perimetre: 'IND'|'CON', paysAutorite, dateArrete, dateCommunication,
 *                     monnaie, creation: Date }
 * @returns { nom, fichiers: { chemin: contenu texte }, lignes: { modèle: nombre } }
 */
export function construirePaquet(donnees, parametres) {
  const { leiDeclarant, perimetre, paysAutorite, dateArrete, dateCommunication, monnaie, creation } = parametres;
  const nom = `${leiDeclarant}.${perimetre}_${paysAutorite}_DORA010100_DORA_${dateArrete}_${horodatage(creation)}`;
  const tableaux = construireTableaux(donnees, { dateCommunication });

  const fichiers = {
    [`${nom}/META-INF/reportPackage.json`]:
      `${JSON.stringify({ documentInfo: { documentType: 'https://xbrl.org/report-package/2023' } }, null, 2)}\n`,
    [`${nom}/reports/report.json`]: `${JSON.stringify({
      documentInfo: {
        documentType: 'https://xbrl.org/2021/xbrl-csv',
        extends: ['http://www.eba.europa.eu/eu/fr/xbrl/crr/fws/dora/4.0/mod/dora.json'],
      },
    }, null, 4)}\n`,
    [`${nom}/reports/parameters.csv`]: [
      'name,value',
      `entityID,rs:${leiDeclarant}.${perimetre}`,
      `refPeriod,${dateArrete}`,
      `baseCurrency,iso4217:${monnaie}`,
      'decimalsInteger,0',
      'decimalsMonetary,-3',
    ].map((l) => `${l}\r\n`).join(''),
    // Tous les modèles sont déclarés, même vides (règle 808 de l'EBA)
    [`${nom}/reports/FilingIndicators.csv`]: ['templateID,reported', ...MODELES.map((m) => `${m},true`)]
      .map((l) => `${l}\r\n`).join(''),
  };
  for (const m of MODELES) {
    fichiers[`${nom}/reports/${m.toLowerCase()}.csv`] = csv(COLONNES[m], tableaux[m]);
  }
  return {
    nom,
    fichiers,
    lignes: Object.fromEntries(MODELES.map((m) => [m, tableaux[m].length])),
  };
}
