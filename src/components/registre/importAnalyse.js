// Analyse d'un classeur Excel du registre d'information avant import.
// Formats reconnus :
//   - modèle d'illustration EBA/ESA (onglets « RT.01.01 » … « RT.99.01 », exercice à blanc 2024)
//   - modèle maître EBA (onglets « b_01.01 » … « b_99.01 »), enregistré en .xlsx
//   - tout classeur dont les onglets et les codes de colonnes suivent la même logique
//     (« B_02.02.0010 », « RT.02.02.0010 » ou « c0010 »)
// Les valeurs sont acceptées sous plusieurs formes : numéro d'option (« 1 » ou « 1. Libellé »),
// code EBA (« eba_CT:x12 »), libellé officiel anglais ou libellé français de l'application.
import { SECTIONS } from './registreConfig';
import { ACTIVITES_AUTORISEES, FONCTIONS_DE_SOUTIEN } from './activitesAutorisees';
import { LIBELLES_ACTIVITES_EBA } from './activitesLibellesEba';

// ---------------------------------------------------------------------------
// Outils de normalisation
// ---------------------------------------------------------------------------
const normaliser = (v) => String(v ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[’'`"«»()[\],;:.\-_/]/g, ' ').replace(/\s+/g, ' ').trim();

const vide = (v) => v === null || v === undefined || (typeof v === 'string' && /^(|…|\.\.\.)$/.test(v.trim()));

// LEI (ISO 17442) : même contrôle que la fonction ri_lei_valide() de la base
export function leiValide(lei) {
  if (!/^[A-Z0-9]{18}[0-9]{2}$/.test(lei)) return false;
  let reste = 0;
  for (const c of lei) {
    const chiffres = /[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c;
    for (const d of chiffres) reste = (reste * 10 + Number(d)) % 97;
  }
  return reste === 1;
}

// ---------------------------------------------------------------------------
// Listes fermées : numéro d'option, code EBA et libellés acceptés
// ---------------------------------------------------------------------------
const libellesFr = Object.fromEntries(SECTIONS.flatMap((s) => s.fields
  .filter((f) => f.options)
  .map((f) => [`${s.table}.${f.name}`, f.options])));

// [numéro, code EBA, libellés anglais officiels…]
const LISTES = {
  type_entite: [
    [1, 'eba_CT:x12', 'credit institutions'], [2, 'eba_CT:x300', 'payment institutions', 'payment institution'],
    [3, 'eba_CT:x301', 'account information service providers'], [4, 'eba_CT:x302', 'electronic money institutions'],
    [5, 'eba_CT:x599', 'investment firms'], [6, 'eba_CT:x303', 'crypto asset service providers'],
    [7, 'eba_CT:x310', 'issuers of asset referenced tokens'], [8, 'eba_CT:x304', 'central securities depositories', 'central security depository'],
    [9, 'eba_CT:x643', 'central counterparties', 'central counterparties ccps'], [10, 'eba_CT:x305', 'trading venues'],
    [11, 'eba_CT:x306', 'trade repositories'], [12, 'eba_CT:x307', 'managers of alternative investment funds'],
    [13, 'eba_CT:x639', 'management companies', 'asset management companies'], [14, 'eba_CT:x308', 'data reporting service providers'],
    [15, 'eba_CT:x309', 'insurance and reinsurance undertakings'],
    [16, 'eba_CT:x320', 'insurance intermediaries reinsurance intermediaries and ancillary insurance intermediaries'],
    [17, 'eba_CT:x311', 'institutions for occupational retirement provision'], [18, 'eba_CT:x312', 'credit rating agencies', 'credit rating agency'],
    [19, 'eba_CT:x313', 'administrators of critical benchmarks', 'administrator of critical benchmarks'],
    [20, 'eba_CT:x314', 'crowdfunding service providers'], [21, 'eba_CT:x315', 'securitisation repositories', 'securitisation repository'],
    [22, 'eba_CT:x316', 'other financial entity'], [23, 'eba_CT:x317', 'non financial entity ict intra group service provider'],
    [24, 'eba_CT:x318', 'non financial entity other', 'non financial entity other than ict intra group service provider'],
  ],
  rang_hierarchique: [
    [1, 'eba_RP:x53', 'ultimate parent', 'the entity is the ultimate parent undertaking in the consolidation'],
    [2, 'eba_RP:x551', 'parent other than ultimate parent', 'the entity is the parent undertaking of a sub consolidated part in the consolidation'],
    [3, 'eba_RP:x56', 'subsidiary'], [4, 'eba_RP:x21', 'entities other than entities of the group', 'the entity is not part of a group'],
    [5, 'eba_RP:x210', 'outsourcing'],
  ],
  type_accord: [[1, 'eba_CO:x1', 'standalone arrangement'], [2, 'eba_CO:x2', 'overarching arrangement', 'overarching contractual arrangement'],
    [3, 'eba_CO:x3', 'subsequent or associated arrangement']],
  motif_fin: [[1, 'eba_CO:x4', 'termination not for cause'], [2, 'eba_CO:x5', 'termination for cause provider in breach'],
    [3, 'eba_CO:x6', 'termination for cause identified impediments'], [4, 'eba_CO:x7', 'termination for cause provider s weaknesses'],
    [5, 'eba_CO:x8', 'termination as requested by the competent authority'], [6, 'eba_CO:x9', 'other reasons for termination', 'other']],
  sensibilite_donnees: [[1, 'eba_ZZ:x791', 'low'], [2, 'eba_ZZ:x792', 'medium'], [3, 'eba_ZZ:x793', 'high']],
  niveau_dependance: [[1, 'eba_ZZ:x794', 'not significant'], [2, 'eba_ZZ:x795', 'low reliance'], [3, 'eba_ZZ:x796', 'material reliance'],
    [4, 'eba_ZZ:x797', 'full reliance']],
  type_personne: [[1, 'eba_CT:x212', 'legal person', 'legal person excluding individual acting in a business capacity'],
    [2, 'eba_CT:x213', 'individual acting in a business capacity']],
  criticite: [[1, 'eba_BT:x28', 'yes'], [2, 'eba_BT:x29', 'no'], [3, 'eba_BT:x21', 'assessment not performed']],
  incidence: [[1, 'eba_ZZ:x791', 'low'], [2, 'eba_ZZ:x792', 'medium'], [3, 'eba_ZZ:x793', 'high'], [4, 'eba_ZZ:x799', 'assessment not performed']],
  substituabilite: [[1, 'eba_ZZ:x959', 'not substitutable'], [2, 'eba_ZZ:x960', 'highly complex substitutability'],
    [3, 'eba_ZZ:x961', 'medium complexity in terms of substitutability'], [4, 'eba_ZZ:x962', 'easily substitutable']],
  raison_non_substituable: [[1, 'eba_ZZ:x963', 'lack of real alternatives'], [2, 'eba_ZZ:x964', 'difficulties in migrating or reintegrating'],
    [3, 'eba_ZZ:x965', 'lack of real alternatives and difficulties in migrating or reintegrating', 'both']],
  reintegration: [[1, 'eba_ZZ:x798', 'easy'], [2, 'eba_ZZ:x966', 'difficult'], [3, 'eba_ZZ:x967', 'highly complex']],
  autres_prestataires: [[1, 'eba_BT:x28', 'yes'], [2, 'eba_BT:x29', 'no'], [7, 'eba_BT:x21', 'assessment not performed']],
};

// Libellés français de l'application (ex. « 1. Établissements de crédit ») ajoutés aux libellés anglais
const LIEN_FR = {
  type_entite: 'ri_entites.type_entite', rang_hierarchique: 'ri_entites.rang_hierarchique', type_accord: 'ri_contrats.type_accord',
  motif_fin: 'ri_contrats_services.motif_fin', sensibilite_donnees: 'ri_contrats_services.sensibilite_donnees',
  niveau_dependance: 'ri_contrats_services.niveau_dependance', type_personne: 'ri_prestataires.type_personne',
  criticite: 'ri_fonctions.criticite', incidence: 'ri_fonctions.incidence_interruption',
  substituabilite: 'ri_evaluations.substituabilite', raison_non_substituable: 'ri_evaluations.raison_non_substituable',
  reintegration: 'ri_evaluations.reintegration', autres_prestataires: 'ri_evaluations.autres_prestataires',
};

function lireOption(liste, valeur) {
  if (vide(valeur)) return { valeur: null };
  const brut = String(valeur).trim();
  const options = LISTES[liste];
  if (typeof valeur === 'number') {
    const o = options.find(([n]) => n === valeur);
    return o ? { valeur: o[0] } : { erreur: `option « ${brut} » inconnue` };
  }
  const code = options.find(([, c]) => c.toLowerCase() === brut.toLowerCase());
  if (code) return { valeur: code[0] };
  const numero = /^(\d+)\s*[.)\-–]?(\s|$)/.exec(brut);
  if (numero && options.some(([n]) => n === Number(numero[1]))) return { valeur: Number(numero[1]) };
  const n = normaliser(brut);
  const fr = (libellesFr[LIEN_FR[liste]] || []).map((o) => [o.value, normaliser(o.label.replace(/^\d+\.\s*/, ''))]);
  const candidats = [
    ...options.flatMap(([num, , ...libs]) => libs.map((l) => [num, normaliser(l)])),
    ...fr,
  ];
  const exact = candidats.find(([, l]) => l === n);
  if (exact) return { valeur: exact[0] };
  const debut = [...new Set(candidats.filter(([, l]) => l.startsWith(n) || n.startsWith(l)).map(([num]) => num))];
  if (debut.length === 1) return { valeur: debut[0] };
  return { erreur: `valeur « ${brut} » non reconnue` };
}

const ACTIVITES = ACTIVITES_AUTORISEES.flatMap((g) => g.options);
const ACTIVITES_EN = {
  x276: ['supporting function', 'support functions', 'supporting functions'],
};
const ACTIVITES_PAR_LIBELLE_EN = new Map(Object.entries(LIBELLES_ACTIVITES_EBA)
  .flatMap(([codeEba, libelles]) => libelles.map((l) => [normaliser(l), codeEba])));
function lireActivite(valeur, libellesEba) {
  if (vide(valeur)) return { valeur: null };
  const brut = String(valeur).trim();
  const code = /^(?:eba_TA:)?(q?x\d+)$/i.exec(brut);
  if (code) {
    const v = `eba_TA:${code[1].toLowerCase()}`;
    return ACTIVITES.some((a) => a.value === v) ? { valeur: v } : { erreur: `code d'activité « ${brut} » inconnu` };
  }
  const n = normaliser(brut);
  if (['fonctions de soutien', 'fonction de soutien', ...ACTIVITES_EN.x276].includes(n)) return { valeur: FONCTIONS_DE_SOUTIEN };
  const fr = ACTIVITES.find((a) => normaliser(a.label) === n);
  if (fr) return { valeur: fr.value };
  if (ACTIVITES_PAR_LIBELLE_EN.has(n)) return { valeur: ACTIVITES_PAR_LIBELLE_EN.get(n) };
  const en = Object.entries(libellesEba || {}).find(([, l]) => normaliser(l) === n);
  if (en) return { valeur: en[0] };
  return { erreur: `activité « ${brut} » non reconnue (utiliser le libellé ou le code EBA, ex. eba_TA:x163)` };
}

function lireTexte(v) {
  return vide(v) ? { valeur: null } : { valeur: String(v).trim() };
}
function lireMajuscules(v) {
  return vide(v) ? { valeur: null } : { valeur: String(v).trim().toUpperCase() };
}
function lireLei(v) {
  if (vide(v)) return { valeur: null };
  const lei = String(v).trim().toUpperCase();
  return leiValide(lei) ? { valeur: lei } : { erreur: `LEI « ${lei} » invalide (20 caractères, chiffres de contrôle)` };
}
function lirePays(v) {
  if (vide(v)) return { valeur: null };
  const brut = String(v).trim();
  if (/^(eba_GA:)?qx2007$/i.test(brut) || normaliser(brut) === 'not applicable') return { valeur: null };
  const p = /^(?:eba_GA:)?([A-Za-z]{2})$/.exec(brut);
  return p ? { valeur: p[1].toUpperCase() } : { erreur: `pays « ${brut} » invalide (code ISO à 2 lettres, ex. FR)` };
}
function lireDevise(v) {
  if (vide(v)) return { valeur: null };
  const brut = String(v).trim();
  const d = /^(?:eba_CU:|iso4217:)?([A-Za-z]{3})$/.exec(brut);
  return d ? { valeur: d[1].toUpperCase() } : { erreur: `devise « ${brut} » invalide (code ISO à 3 lettres, ex. EUR)` };
}
function lireDate(v) {
  if (vide(v)) return { valeur: null };
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { erreur: 'date invalide' };
    return { valeur: v.toISOString().slice(0, 10) };
  }
  if (typeof v === 'number') { // numéro de série Excel
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return { valeur: d.toISOString().slice(0, 10) };
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return { valeur: `${m[1]}-${m[2]}-${m[3]}` };
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (m) return { valeur: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` };
  return { erreur: `date « ${s} » invalide (format attendu : aaaa-mm-jj ou jj/mm/aaaa)` };
}
function lireNombre(v, entier = false) {
  if (vide(v)) return { valeur: null };
  let n = v;
  if (typeof v !== 'number') {
    const s = String(v).trim().replace(/[\s\u00a0\u202f]/g, '').replace(/[€$£]/g, '');
    n = Number(/,\d{1,2}$/.test(s) ? s.replaceAll('.', '').replace(',', '.') : s.replaceAll(',', ''));
  }
  if (!Number.isFinite(n)) return { erreur: `nombre « ${v} » invalide` };
  if (entier && !Number.isInteger(n)) return { erreur: `nombre entier attendu (« ${v} »)` };
  return { valeur: n };
}
function lireBooleen(v) {
  if (vide(v)) return { valeur: null };
  if (typeof v === 'boolean') return { valeur: v };
  const n = normaliser(v);
  if (['yes', 'oui', 'true', '1', 'eba bt x28', '1 yes', '1 oui'].includes(n)) return { valeur: true };
  if (['no', 'non', 'false', '0', 'eba bt x29', '2 no', '2 non'].includes(n)) return { valeur: false };
  return { erreur: `« ${v} » : Oui ou Non attendu` };
}
function lireService(v) {
  if (vide(v)) return { valeur: null };
  const brut = String(v).trim();
  const m = /^(?:eba_TA:)?S(\d{1,2})\b/i.exec(brut) || /^(\d{1,2})\s*[.)\-–]?(\s|$)/.exec(brut);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 19) return { valeur: `S${String(Number(m[1])).padStart(2, '0')}` };
  return { erreur: `type de service « ${brut} » non reconnu (S01 à S19)` };
}
const TYPES_CODE = { qx2000: 'LEI', qx2002: 'EUID', qx2003: 'CRN', qx2004: 'VAT', qx2005: 'PNR', qx2001: 'NIN' };
function lireTypeCode(v, { supplementaire = false } = {}) {
  if (vide(v)) return { valeur: null };
  const brut = String(v).trim();
  const eba = /^(?:eba_qCO:)?(qx200[0-5])$/i.exec(brut);
  let t = eba ? TYPES_CODE[eba[1].toLowerCase()] : brut.toUpperCase().replace(/\s+/g, '');
  if (!supplementaire && ['CRN', 'VAT', 'PNR', 'NIN'].includes(t)) t = `FR_${t}`; // pays par défaut si absent
  if (supplementaire) t = t.replace(/^[A-Z]{2}_/, '');
  const ok = supplementaire
    ? ['LEI', 'EUID', 'CRN', 'VAT', 'PNR', 'NIN'].includes(t)
    : t === 'LEI' || t === 'EUID' || /^[A-Z]{2}_(CRN|VAT|PNR|NIN)$/.test(t);
  return ok ? { valeur: t } : { erreur: `type de code « ${brut} » non reconnu (LEI, EUID ou pays_type, ex. FR_VAT)` };
}
function lireIdentifiantFonction(v) {
  if (vide(v)) return { valeur: null };
  const s = String(v).trim().toUpperCase();
  return /^F[1-9][0-9]*$/.test(s) ? { valeur: s } : { erreur: `identifiant de fonction « ${s} » invalide (F1, F2…)` };
}

// ---------------------------------------------------------------------------
// Correspondance colonnes -> champs, par modèle
// Pour B_05.01 et B_06.01, deux numérotations coexistent (voir docs/eba/README.md)
// ---------------------------------------------------------------------------
const opt = (liste) => (v) => lireOption(liste, v);

const COLONNES = {
  'B_01.01': { '0010': ['lei', lireLei], '0020': ['nom', lireTexte], '0030': ['pays', lirePays], '0040': ['type_entite', opt('type_entite')], '0050': ['autorite_competente', lireTexte] },
  'B_01.02': { '0010': ['lei', lireLei], '0020': ['nom', lireTexte], '0030': ['pays', lirePays], '0040': ['type_entite', opt('type_entite')],
    '0050': ['rang_hierarchique', opt('rang_hierarchique')], '0060': ['lei_mere_directe', lireLei], '0070': ['date_derniere_maj', lireDate],
    '0080': ['date_integration', lireDate], '0090': ['date_suppression', lireDate], '0100': ['monnaie', lireDevise], '0110': ['total_actifs', lireNombre] },
  'B_01.03': { '0010': ['code', lireTexte], '0020': ['lei_siege', lireLei], '0030': ['nom', lireTexte], '0040': ['pays', lirePays] },
  'B_02.01': { '0010': ['reference', lireTexte], '0020': ['type_accord', opt('type_accord')], '0030': ['reference_general', lireTexte],
    '0040': ['monnaie', lireDevise], '0050': ['depenses_annuelles', lireNombre] },
  'B_02.02': { '0010': ['reference_contrat', lireTexte], '0020': ['lei_entite', lireLei], '0030': ['prestataire_code', lireMajuscules],
    '0040': ['prestataire_type_code', (v) => lireTypeCode(v)], '0050': ['fonction_id', lireIdentifiantFonction], '0060': ['type_service', lireService],
    '0070': ['date_debut', lireDate], '0080': ['date_fin', lireDate], '0090': ['motif_fin', opt('motif_fin')],
    '0100': ['preavis_entite_jours', (v) => lireNombre(v, true)], '0110': ['preavis_prestataire_jours', (v) => lireNombre(v, true)],
    '0120': ['pays_droit_applicable', lirePays], '0130': ['pays_fourniture', lirePays], '0140': ['stockage_donnees', lireBooleen],
    '0150': ['pays_stockage', lirePays], '0160': ['pays_traitement', lirePays], '0170': ['sensibilite_donnees', opt('sensibilite_donnees')],
    '0180': ['niveau_dependance', opt('niveau_dependance')] },
  'B_02.03': { '0010': ['reference_contrat', lireTexte], '0020': ['reference_contrat_lie', lireTexte] },
  'B_03.01': { '0010': ['reference_contrat', lireTexte], '0020': ['lei_entite', lireLei] },
  'B_03.03': { '0010': ['reference_contrat', lireTexte], '0020': ['lei_entite', lireLei] },
  'B_04.01': { '0010': ['reference_contrat', lireTexte], '0020': ['lei_entite', lireLei], '0030': ['nature', lireTexte], '0040': ['succursale_code', lireTexte] },
  // Format définitif (règlement 2024/2956 et DPM 4.0) : 12 colonnes
  'B_05.01': { '0010': ['code', lireMajuscules], '0020': ['type_code', (v) => lireTypeCode(v)], '0030': ['code_supp', lireMajuscules],
    '0040': ['type_code_supp', (v) => lireTypeCode(v, { supplementaire: true })], '0050': ['raison_sociale', lireTexte], '0060': ['nom_latin', lireTexte],
    '0070': ['type_personne', opt('type_personne')], '0080': ['pays_siege', lirePays], '0090': ['monnaie', lireDevise],
    '0100': ['depenses_annuelles', lireNombre], '0110': ['mere_code', lireMajuscules], '0120': ['mere_type_code', (v) => lireTypeCode(v)] },
  // Exercice à blanc 2024 (onglets RT.05.01) : 9 colonnes
  'B_05.01@2024': { '0010': ['code', lireMajuscules], '0020': ['type_code', (v) => lireTypeCode(v)], '0030': ['raison_sociale', lireTexte],
    '0040': ['type_personne', opt('type_personne')], '0050': ['pays_siege', lirePays], '0060': ['monnaie', lireDevise],
    '0070': ['depenses_annuelles', lireNombre], '0080': ['mere_code', lireMajuscules], '0090': ['mere_type_code', (v) => lireTypeCode(v)] },
  'B_05.02': { '0010': ['reference_contrat', lireTexte], '0020': ['type_service', lireService], '0030': ['prestataire_code', lireMajuscules],
    '0040': ['prestataire_type_code', (v) => lireTypeCode(v)], '0050': ['rang', (v) => lireNombre(v, true)],
    '0060': ['destinataire_code', lireMajuscules], '0070': ['destinataire_type_code', (v) => lireTypeCode(v)] },
  // Numérotation DPM 4.0 et exercice à blanc : 0010 à 0100
  'B_06.01': { '0010': ['identifiant', lireIdentifiantFonction], '0020': ['activite_autorisee', 'activite'], '0030': ['nom', lireTexte],
    '0040': ['lei_entite', lireLei], '0050': ['criticite', opt('criticite')], '0060': ['raisons_criticite', lireTexte],
    '0070': ['date_derniere_evaluation', lireDate], '0080': ['rto_heures', (v) => lireNombre(v, true)], '0090': ['rpo_heures', (v) => lireNombre(v, true)],
    '0100': ['incidence_interruption', opt('incidence')] },
  // Numérotation du texte du règlement : 0060 à 0110
  'B_06.01@its': { '0010': ['identifiant', lireIdentifiantFonction], '0020': ['activite_autorisee', 'activite'], '0030': ['nom', lireTexte],
    '0040': ['lei_entite', lireLei], '0060': ['criticite', opt('criticite')], '0070': ['raisons_criticite', lireTexte],
    '0080': ['date_derniere_evaluation', lireDate], '0090': ['rto_heures', (v) => lireNombre(v, true)], '0100': ['rpo_heures', (v) => lireNombre(v, true)],
    '0110': ['incidence_interruption', opt('incidence')] },
  'B_07.01': { '0010': ['reference_contrat', lireTexte], '0020': ['prestataire_code', lireMajuscules], '0030': ['prestataire_type_code', (v) => lireTypeCode(v)],
    '0040': ['type_service', lireService], '0050': ['substituabilite', opt('substituabilite')], '0060': ['raison_non_substituable', opt('raison_non_substituable')],
    '0070': ['date_dernier_audit', lireDate], '0080': ['plan_sortie', lireBooleen], '0090': ['reintegration', (v) => (/^(eba_ZZ:)?x0$/i.test(String(v ?? '').trim()) || normaliser(v) === 'not applicable' ? { valeur: null } : lireOption('reintegration', v))],
    '0100': ['incidence_cessation', opt('incidence')], '0110': ['autres_prestataires', opt('autres_prestataires')], '0120': ['autre_prestataire_info', lireTexte] },
};

// Champs obligatoires (contraintes de la base) : l'import les signale avant d'écrire
const OBLIGATOIRES = {
  'B_01.01': ['lei', 'nom', 'pays', 'type_entite'],
  'B_01.02': ['lei', 'nom', 'pays', 'type_entite', 'rang_hierarchique', 'lei_mere_directe', 'date_derniere_maj', 'date_integration'],
  'B_01.03': ['code', 'lei_siege', 'nom', 'pays'],
  'B_02.01': ['reference', 'type_accord', 'monnaie', 'depenses_annuelles'],
  'B_02.02': ['reference_contrat', 'lei_entite', 'prestataire_code', 'fonction_id', 'type_service', 'date_debut'],
  'B_02.03': ['reference_contrat', 'reference_contrat_lie'],
  'B_03.01': ['reference_contrat', 'lei_entite'],
  'B_03.03': ['reference_contrat', 'lei_entite'],
  'B_04.01': ['reference_contrat', 'lei_entite'],
  'B_05.01': ['code', 'type_code', 'raison_sociale', 'type_personne', 'pays_siege'],
  'B_05.02': ['reference_contrat', 'type_service', 'prestataire_code', 'rang'],
  'B_06.01': ['identifiant', 'activite_autorisee', 'nom', 'lei_entite', 'criticite', 'rto_heures', 'rpo_heures', 'incidence_interruption'],
  'B_07.01': ['reference_contrat', 'prestataire_code', 'type_service', 'substituabilite', 'plan_sortie', 'incidence_cessation', 'autres_prestataires'],
};

// ---------------------------------------------------------------------------
// Lecture d'un onglet
// ---------------------------------------------------------------------------
const MODELE_ONGLET = /^(?:RT|B)[._ ]?(\d{2})[._](\d{2})\b/i;
const CODE_COLONNE = /^(?:(?:RT|B)[._ ]?\d{2}[._]\d{2}[._])?c?(\d{4})$/i;

function modeleDeLOnglet(nom) {
  const m = MODELE_ONGLET.exec(String(nom).trim());
  return m ? `B_${m[1]}.${m[2]}` : null;
}

// Trouve la ligne des codes de colonnes et renvoie { index, colonnes: { position: '0010' } }
function trouverEntete(lignes, modele) {
  const prefixe = modele.slice(2); // « 02.02 »
  for (let i = 0; i < Math.min(lignes.length, 15); i += 1) {
    const colonnes = {};
    lignes[i].forEach((c, j) => {
      const s = String(c ?? '').trim();
      const m = CODE_COLONNE.exec(s);
      if (m && (s.length <= 5 || s.replace(/[._ ]/g, '').toUpperCase().includes(prefixe.replace('.', '')))) colonnes[j] = m[1];
    });
    if (Object.keys(colonnes).length >= 2) return { index: i, colonnes };
  }
  return null;
}

const TYPES_DE_COLONNE = /^(alphanumerical|alphanumerique|closed set of options|ensemble ferme d options|country|pays|currency|monnaie|date|monetary|monetaire|pattern|code|natural number|nombre naturel|yes no|oui non|fill with true for each populated row)$/;

function estLigneDEntete(ligne) {
  const valeurs = ligne.filter((c) => !vide(c));
  if (!valeurs.length) return true;
  return valeurs.filter((c) => TYPES_DE_COLONNE.test(normaliser(c))).length >= Math.ceil(valeurs.length / 2);
}

// Première ligne de données : après la ligne des codes, on saute les lignes de libellés
// (« LEI of the entity… ») et de types (« Alphanumerical »…) des modèles EBA
const LIBELLE_DE_COLONNE = / of the |^(lei|name|type|country|currency|date|identification|contractual|function|rank|notice|storage|location|level|value|hierarchy|reason|substitutability|existence|possibility|impact|are there|licenced|criticality|recovery|link|nom|pays|monnaie|numero|code) /;
function debutDesDonnees(lignes, indexEntete) {
  let debut = indexEntete + 1;
  for (let k = indexEntete + 1; k <= Math.min(indexEntete + 3, lignes.length - 1); k += 1) {
    const valeurs = lignes[k].filter((c) => !vide(c));
    if (!valeurs.length) continue;
    const libelles = valeurs.filter((c) => typeof c === 'string' && LIBELLE_DE_COLONNE.test(`${normaliser(c)} `)).length;
    if (estLigneDEntete(lignes[k]) || libelles >= Math.ceil(valeurs.length / 2)) debut = k + 1;
    else break;
  }
  return debut;
}

// B_99.01 : disposition en lignes (modèle d'illustration) ou en une ligne de 19 colonnes (modèle EBA)
const COLONNES_99 = ['B_02.01.0020', 'B_02.02.0170', 'B_06.01.0110', 'B_07.01.0050', 'B_07.01.0090', 'B_07.01.0100'];
const OPTIONS_99 = [3, 3, 3, 4, 3, 3];
const NOMS_OPTIONS_99 = new Set(['standalone arrangement', 'overarching arrangement', 'subsequent or associated arrangement',
  'low', 'medium', 'high', 'not substitutable', 'highly complex substitutability', 'medium complexity in terms of substitutability',
  'easily substitutable', 'easy', 'difficult', 'highly complex']);
function lireDefinitions(lignes, onglet, erreurs) {
  const definitions = [];
  const enteteLarge = trouverEntete(lignes, 'B_99.01');
  if (enteteLarge && Object.values(enteteLarge.colonnes).includes('0190')) {
    // Colonne n (0010 à 0190) -> (colonne définie, numéro d'option), dans l'ordre de la maquette DPM 4.0
    const cibles = COLONNES_99.flatMap((c, k) => Array.from({ length: OPTIONS_99[k] }, (_, o) => [c, o + 1]));
    for (let i = debutDesDonnees(lignes, enteteLarge.index); i < lignes.length; i += 1) {
      const valeurs = lignes[i].filter((c) => !vide(c));
      // Ligne des noms d'options (« Standalone arrangement », « Low »…) : ignorée
      if (!valeurs.length || valeurs.every((c) => NOMS_OPTIONS_99.has(normaliser(c)))) continue;
      for (const [position, codeCol] of Object.entries(enteteLarge.colonnes)) {
        const cible = cibles[Number(codeCol) / 10 - 1];
        const texte = lignes[i][position];
        if (cible && !vide(texte)) definitions.push({ colonne: cible[0], option: cible[1], definition: String(texte).trim() });
      }
    }
    return definitions;
  }
  let colonneCourante = null;
  lignes.forEach((ligne, i) => {
    const cellules = ligne.map((c) => String(c ?? '').trim());
    const colonne = cellules.find((c) => /^(?:RT|B)[._]\d{2}\.\d{2}\.\d{4}$/i.test(c) && !/99\.01/.test(c));
    if (colonne) {
      const m = /(\d{2})\.(\d{2})\.(\d{4})$/.exec(colonne);
      colonneCourante = `B_${m[1]}.${m[2]}.${m[3]}`;
      if (colonneCourante === 'B_06.01.0100') colonneCourante = 'B_06.01.0110'; // numérotation 2024 de l'incidence
    }
    const option = cellules.map((c) => /^(\d)\.\s/.exec(c)).find(Boolean);
    if (!colonneCourante || !option) return;
    const position = cellules.findIndex((c) => /^(\d)\.\s/.test(c));
    const texte = cellules.slice(position + 1).find((c) => c);
    if (!texte) return;
    if (!COLONNES_99.includes(colonneCourante)) {
      erreurs.push({ onglet, ligne: i + 1, message: `colonne ${colonneCourante} non prévue dans B_99.01` });
      return;
    }
    definitions.push({ colonne: colonneCourante, option: Number(option[1]), definition: texte });
  });
  return definitions;
}

// ---------------------------------------------------------------------------
// Analyse du classeur
// ---------------------------------------------------------------------------
/**
 * @param feuilles [{ sheet: nom, data: [[cellule, …], …] }] (format de read-excel-file)
 * @param libellesActivitesEba { 'eba_TA:x163': 'Lending activities', … } (facultatif)
 * @returns { format, lignesLues, donnees, erreurs, ignores }
 */
export function analyserClasseur(feuilles, libellesActivitesEba = {}) {
  const erreurs = [];
  const ignores = [];
  const brut = {};
  let format = 'inconnu';

  for (const { sheet, data } of feuilles) {
    const modele = modeleDeLOnglet(sheet);
    if (!modele) continue;
    if (/^RT/i.test(sheet)) format = "modèle d'illustration EBA (onglets RT)";
    else if (format === 'inconnu') format = 'modèle EBA (onglets B)';

    if (modele === 'B_99.01') {
      brut['B_99.01'] = lireDefinitions(data, sheet, erreurs);
      continue;
    }
    if (modele === 'B_03.02') { ignores.push(`${sheet} : déduit automatiquement des services contractés`); continue; }

    const entete = trouverEntete(data, modele);
    if (!entete) {
      erreurs.push({ onglet: sheet, ligne: null, message: 'ligne des codes de colonnes introuvable (ex. RT.02.02.0010 ou c0010)' });
      continue;
    }
    const codes = Object.values(entete.colonnes);
    let cle = modele;
    if (modele === 'B_05.01' && !codes.includes('0110')) cle = 'B_05.01@2024';
    if (modele === 'B_06.01' && codes.includes('0110')) cle = 'B_06.01@its';
    const correspondance = COLONNES[cle];
    if (!correspondance) continue;

    const enregistrements = [];
    for (let i = debutDesDonnees(data, entete.index); i < data.length; i += 1) {
      const ligne = data[i];
      if (estLigneDEntete(ligne)) continue;
      const enregistrement = { _ligne: i + 1, _onglet: sheet };
      const erreursLigne = [];
      const illisibles = new Set();
      for (const [position, codeCol] of Object.entries(entete.colonnes)) {
        const regle = correspondance[codeCol];
        if (!regle) continue;
        const [champ, lire] = regle;
        const resultat = lire === 'activite' ? lireActivite(ligne[position], libellesActivitesEba) : lire(ligne[position]);
        if (resultat.erreur) {
          erreursLigne.push({ onglet: sheet, ligne: i + 1, colonne: `${modele}.${codeCol}`, message: resultat.erreur });
          illisibles.add(champ);
        } else {
          enregistrement[champ] = resultat.valeur;
        }
      }
      const obligatoires = OBLIGATOIRES[modele] || [];
      const manquants = obligatoires.filter((c) => !illisibles.has(c) && (enregistrement[c] === null || enregistrement[c] === undefined));
      // Une ligne sans aucune valeur lisible pour les champs obligatoires est considérée comme vide
      if (!erreursLigne.length && manquants.length === obligatoires.length) continue;
      if (manquants.length) {
        erreursLigne.push({ onglet: sheet, ligne: i + 1, message: `champ(s) obligatoire(s) manquant(s) : ${manquants.join(', ')}` });
      }
      // Une ligne en erreur n'entre pas dans le registre : elle est gardée avec son motif pour
      // être mise en attente de correction (les valeurs illisibles restent vides)
      if (erreursLigne.length) {
        erreurs.push(...erreursLigne);
        enregistrement._motif = erreursLigne.map((e) => e.message).join(' ; ');
      }
      enregistrements.push(enregistrement);
    }
    brut[modele] = enregistrements;
  }

  return { format, erreurs, ignores, donnees: normaliserDonnees(brut, erreurs) };
}

// Regroupe les lignes éclatées par pays et prépare les données par table
function normaliserDonnees(brut, erreurs) {
  const services = new Map();
  for (const r of brut['B_02.02'] || []) {
    const cle = [r.reference_contrat, r.lei_entite, r.prestataire_code, r.fonction_id, r.type_service].join('|');
    const existant = services.get(cle);
    if (existant) {
      if (r._motif) existant._motif = existant._motif ? `${existant._motif} ; ${r._motif}` : r._motif;
      if (r.pays_stockage && !existant.pays_stockage.includes(r.pays_stockage)) existant.pays_stockage.push(r.pays_stockage);
      if (r.pays_traitement && !existant.pays_traitement.includes(r.pays_traitement)) existant.pays_traitement.push(r.pays_traitement);
      continue;
    }
    services.set(cle, {
      ...r,
      pays_stockage: r.pays_stockage ? [r.pays_stockage] : [],
      pays_traitement: r.pays_traitement ? [r.pays_traitement] : [],
    });
  }
  // Succursales utilisatrices (B_04.01) reportées sur les services correspondants
  for (const r of brut['B_04.01'] || []) {
    if (r._motif) continue; // déjà signalée dans la liste des problèmes
    const succursale = r.succursale_code && normaliser(r.succursale_code) !== 'not applicable' ? r.succursale_code : null;
    if (!succursale) continue;
    let trouve = false;
    for (const s of services.values()) {
      if (s.reference_contrat === r.reference_contrat && s.lei_entite === r.lei_entite) {
        s.succursale_code = succursale;
        trouve = true;
      }
    }
    if (!trouve) {
      erreurs.push({ onglet: r._onglet, ligne: r._ligne, message: `aucun service contracté pour ${r.reference_contrat} / ${r.lei_entite} : succursale ignorée` });
    }
  }
  for (const s of services.values()) {
    if (!s.pays_stockage.length) s.pays_stockage = null;
    if (!s.pays_traitement.length) s.pays_traitement = null;
  }

  // Valeurs par défaut prévues par le règlement (« 9999-12-31 » = sans objet / en cours)
  const parDefaut = (lignes, champs) => lignes.map((l) => {
    const r = { ...l };
    for (const [champ, valeur] of Object.entries(champs)) if (r[champ] === null || r[champ] === undefined) r[champ] = valeur;
    return r;
  });
  const prestataires = (brut['B_05.01'] || []).map((p) => ({
    ...p,
    nom_latin: p.nom_latin ?? p.raison_sociale,
    // Sans groupe, le modèle répète le propre code du prestataire : pas de maison mère à rattacher
    mere_code: p.mere_code && !(p.mere_code === p.code && (p.mere_type_code ?? p.type_code) === p.type_code) ? p.mere_code : null,
  }));

  return {
    teneur: (brut['B_01.01'] || []).slice(0, 1),
    entites: parDefaut(brut['B_01.02'] || [], { date_suppression: '9999-12-31' }),
    succursales: brut['B_01.03'] || [],
    prestataires,
    fonctions: parDefaut(brut['B_06.01'] || [], { date_derniere_evaluation: '9999-12-31' }),
    contrats: brut['B_02.01'] || [],
    services: parDefaut([...services.values()], { date_fin: '9999-12-31' }),
    intragroupe: brut['B_02.03'] || [],
    signatairesReception: brut['B_03.01'] || [],
    signatairesFourniture: brut['B_03.03'] || [],
    // Le rang 1 est déduit des services : seuls les sous-traitants sont importés
    sousTraitance: (brut['B_05.02'] || []).filter((r) => r.rang >= 2 || (r._motif && r.rang == null)),
    evaluations: parDefaut(brut['B_07.01'] || [], { date_dernier_audit: '9999-12-31' }),
    definitions: (brut['B_99.01'] || []).filter((r) => !r._motif),
  };
}
