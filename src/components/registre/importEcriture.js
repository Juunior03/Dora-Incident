// Écriture en base des données issues d'un classeur Excel (voir importAnalyse.js).
// Principe : ajout ou mise à jour (« upsert ») sur la clé de chaque table ; les lignes absentes
// du fichier ne sont ni modifiées ni supprimées. Les tables sont écrites dans l'ordre des
// dépendances ; si un lot est refusé, ses lignes sont réessayées une par une.
// Aucune ligne n'est perdue : celles qui ne peuvent pas entrer dans le registre (erreur de
// lecture ou refus de la base) sont mises en attente dans ri_import_rejets avec leurs valeurs
// et le motif, et apparaissent comme anomalies bloquantes jusqu'à leur correction.
import { supabase } from '../../supabaseClient';
import { messageErreur } from './erreursBase';

const TAILLE_LOT = 200;

// Libellé affiché, tableau de l'application et modèle EBA : les noms des tables restent internes
const TABLES = {
  ri_teneur_registre: ['B_01.01 – Entité tenant le registre', 'teneur', 'B_01.01'],
  ri_entites: ['B_01.02 – Entités du périmètre', 'entites', 'B_01.02'],
  ri_succursales: ['B_01.03 – Succursales', 'succursales', 'B_01.03'],
  ri_prestataires: ['B_05.01 – Prestataires TIC', 'prestataires', 'B_05.01'],
  ri_fonctions: ['B_06.01 – Fonctions', 'fonctions', 'B_06.01'],
  ri_contrats: ['B_02.01 – Contrats', 'contrats', 'B_02.01'],
  ri_contrats_services: ['B_02.02 – Services contractés', 'services', 'B_02.02'],
  ri_accords_intragroupe: ['B_02.03 – Accords intra-groupe', 'intragroupe', 'B_02.03'],
  ri_signataires_reception: ['B_03.01 – Signataires (réception)', 'signataires_reception', 'B_03.01'],
  ri_signataires_fourniture: ['B_03.03 – Signataires (fourniture)', 'signataires_fourniture', 'B_03.03'],
  ri_sous_traitance: ['B_05.02 – Sous-traitance', 'sous_traitance', 'B_05.02'],
  ri_evaluations: ['B_07.01 – Évaluations des services', 'evaluations', 'B_07.01'],
  ri_definitions: ['B_99.01 – Définitions internes', 'definitions', 'B_99.01'],
};

const garder = (objet, champs) => Object.fromEntries(champs.map((c) => [c, objet[c] ?? null]));

// Référence lisible d'une ligne ; si la clé est incomplète (valeur illisible), onglet et ligne Excel
const referenceSure = (fn) => (r) => {
  const ref = fn(r);
  return !ref || /(^|\/ )(null|undefined)( \/|$)/.test(ref) ? `${r._onglet ?? 'fichier'} ligne ${r._ligne ?? '?'}` : ref;
};

async function ecrireLot(table, lignes, conflit, reference, rapport) {
  const [libelle] = TABLES[table];
  const ref = referenceSure(reference);
  const etape = { table, libelle, lus: lignes.length, ecrits: 0, erreurs: [], reussies: [] };
  rapport.push(etape);
  const refus = (l, message) => etape.erreurs.push({ reference: ref(l), message, donnees: l.payload, onglet: l._onglet, ligne: l._ligne });
  const valides = lignes.filter((l) => !l._erreur);
  for (const l of lignes.filter((x) => x._erreur)) refus(l, l._erreur);

  for (let i = 0; i < valides.length; i += TAILLE_LOT) {
    const lot = valides.slice(i, i + TAILLE_LOT);
    const { error } = await supabase.from(table).upsert(lot.map((l) => l.payload), { onConflict: conflit });
    if (!error) {
      etape.ecrits += lot.length;
      etape.reussies.push(...lot.map(ref));
      continue;
    }
    // Lot refusé : ligne par ligne pour isoler les lignes en erreur
    for (const l of lot) {
      const res = await supabase.from(table).upsert([l.payload], { onConflict: conflit });
      if (res.error) refus(l, messageErreur(res.error));
      else {
        etape.ecrits += 1;
        etape.reussies.push(ref(l));
      }
    }
  }
  return etape;
}

async function chargerPrestataires() {
  const { data, error } = await supabase.from('ri_prestataires').select('id, code, type_code');
  if (error) throw error;
  const parCle = new Map(data.map((p) => [`${p.code}|${p.type_code}`, p.id]));
  const parCode = new Map();
  for (const p of data) parCode.set(p.code, parCode.has(p.code) ? null : p.id); // null = ambigu
  return (code, typeCode) => (typeCode && parCle.get(`${code}|${typeCode}`)) || parCode.get(code) || null;
}

// Met en attente les lignes refusées et retire de l'attente celles qui sont passées cette fois-ci
async function mettreEnAttente(rapport) {
  const rejets = new Map();
  const reussies = new Map(); // section -> références
  for (const e of rapport) {
    const [, section, modele] = TABLES[e.table];
    for (const x of e.erreurs) {
      const cle = `${section}|${x.reference}`;
      const precedent = rejets.get(cle);
      rejets.set(cle, {
        section, modele, reference: x.reference,
        donnees: { ...(precedent?.donnees || {}), ...(x.donnees || {}) },
        motif: precedent ? `${precedent.motif} ; ${x.message}` : x.message,
        onglet: x.onglet ?? null, ligne: x.ligne ?? null,
      });
    }
    if (!reussies.has(section)) reussies.set(section, new Set());
    for (const r of e.reussies || []) reussies.get(section).add(r);
  }

  const lignes = [...rejets.values()];
  for (let i = 0; i < lignes.length; i += TAILLE_LOT) {
    const { error } = await supabase.from('ri_import_rejets').upsert(lignes.slice(i, i + TAILLE_LOT), { onConflict: 'section,reference' });
    if (error) {
      const absente = error.code === '42P01' || error.code === 'PGRST205' || /could not find the table/i.test(`${error.message}`);
      return {
        nombre: lignes.length,
        erreur: absente
          ? "Les lignes refusées n'ont pas pu être mises en attente : appliquez la migration 20261002000000_lignes_en_attente.sql, puis relancez l'import."
          : `Les lignes refusées n'ont pas pu être mises en attente : ${messageErreur(error)}`,
      };
    }
  }
  for (const [section, refs] of reussies) {
    const aRetirer = [...refs].filter((r) => !rejets.has(`${section}|${r}`));
    for (let i = 0; i < aRetirer.length; i += 100) {
      await supabase.from('ri_import_rejets').delete().eq('section', section).in('reference', aRetirer.slice(i, i + 100));
    }
  }
  return { nombre: lignes.length, erreur: null };
}

/**
 * @param donnees résultat de analyserClasseur().donnees
 * @param onEtape (libellé) => void, pour afficher la progression
 * @returns { etapes: [{ libelle, lus, ecrits, erreurs: [{ reference, message }] }],
 *            attente: { nombre, erreur } }
 */
export async function importerDonnees(donnees, onEtape = () => {}) {
  const rapport = [];
  // Les lignes en erreur à la lecture du fichier gardent leurs valeurs pour la mise en attente
  const ligne = (source, payload, erreur = source._motif) => ({ ...source, payload, ...(erreur ? { _erreur: erreur } : {}) });

  onEtape("Entité tenant le registre et entités");
  await ecrireLot('ri_teneur_registre',
    donnees.teneur.map((r) => ligne(r, garder(r, ['lei', 'nom', 'pays', 'type_entite', 'autorite_competente']))),
    'unique_ligne', (r) => r.lei, rapport);
  await ecrireLot('ri_entites',
    donnees.entites.map((r) => ligne(r, garder(r, ['lei', 'nom', 'pays', 'type_entite', 'rang_hierarchique', 'lei_mere_directe',
      'date_derniere_maj', 'date_integration', 'date_suppression', 'monnaie', 'total_actifs']))),
    'lei', (r) => r.lei, rapport);
  await ecrireLot('ri_succursales',
    donnees.succursales.map((r) => ligne(r, garder(r, ['code', 'lei_siege', 'nom', 'pays']))),
    'code', (r) => r.code, rapport);

  onEtape('Prestataires');
  const champsPrestataire = ['code', 'type_code', 'code_supp', 'type_code_supp', 'raison_sociale',
    'nom_latin', 'type_personne', 'pays_siege', 'monnaie', 'depenses_annuelles'];
  await ecrireLot('ri_prestataires',
    donnees.prestataires.map((r) => ligne(r, garder(r, champsPrestataire))),
    'code,type_code', (r) => r.code, rapport);

  // Entreprises mères ultimes : rattachées une fois tous les prestataires enregistrés
  let idPrestataire = await chargerPrestataires();
  const etapePrestataires = rapport.at(-1);
  const meres = { table: 'ri_prestataires', libelle: 'Rattachement aux entreprises mères ultimes', lus: 0, ecrits: 0, erreurs: [], complement: true };
  for (const p of donnees.prestataires.filter((x) => x.mere_code && !x._motif)) {
    const id = idPrestataire(p.code, p.type_code);
    if (!id) continue; // prestataire lui-même refusé : déjà en attente
    meres.lus += 1;
    const idMere = idPrestataire(p.mere_code, p.mere_type_code);
    const refus = (message) => meres.erreurs.push({ reference: p.code, message, donnees: garder(p, champsPrestataire), onglet: p._onglet, ligne: p._ligne });
    if (!idMere) {
      refus(`entreprise mère ${p.mere_code} absente de la liste des prestataires (B_05.01)`);
      continue;
    }
    const { error } = await supabase.from('ri_prestataires').update({ mere_ultime_id: idMere }).eq('id', id);
    if (error) refus(messageErreur(error));
    else meres.ecrits += 1;
  }
  if (meres.lus) rapport.splice(rapport.indexOf(etapePrestataires) + 1, 0, meres);

  onEtape('Fonctions et contrats');
  await ecrireLot('ri_fonctions',
    donnees.fonctions.map((r) => ligne(r, garder(r, ['identifiant', 'activite_autorisee', 'nom', 'lei_entite', 'criticite',
      'raisons_criticite', 'date_derniere_evaluation', 'rto_heures', 'rpo_heures', 'incidence_interruption']))),
    'identifiant', (r) => r.identifiant, rapport);
  // Accords généraux et autonomes d'abord : les accords ultérieurs s'y rattachent
  const champsContrat = ['reference', 'type_accord', 'reference_general', 'monnaie', 'depenses_annuelles'];
  const premiers = donnees.contrats.filter((c) => c.type_accord !== 3);
  const suivants = donnees.contrats.filter((c) => c.type_accord === 3);
  const etapeContrats = await ecrireLot('ri_contrats', premiers.map((r) => ligne(r, garder(r, champsContrat))), 'reference', (r) => r.reference, rapport);
  const etapeSuivants = await ecrireLot('ri_contrats', suivants.map((r) => ligne(r, garder(r, champsContrat))), 'reference', (r) => r.reference, []);
  etapeContrats.lus += etapeSuivants.lus;
  etapeContrats.ecrits += etapeSuivants.ecrits;
  etapeContrats.erreurs.push(...etapeSuivants.erreurs);
  etapeContrats.reussies.push(...etapeSuivants.reussies);

  onEtape('Services contractés');
  idPrestataire = await chargerPrestataires();
  // Prestataire inconnu : la ligne est mise en attente, prestataire à choisir lors de la correction
  const avecPrestataires = (r, champs, payload) => {
    const manquants = [];
    const ids = {};
    for (const champ of champs) {
      ids[`${champ}_id`] = idPrestataire(r[`${champ}_code`], r[`${champ}_type_code`]);
      if (!ids[`${champ}_id`] && r[`${champ}_code`]) manquants.push(`prestataire ${r[`${champ}_code`]} absent de la liste des prestataires (B_05.01)`);
    }
    const erreur = [r._motif, ...manquants].filter(Boolean).join(' ; ');
    return ligne(r, { ...payload, ...ids }, erreur || null);
  };
  await ecrireLot('ri_contrats_services', donnees.services.map((r) => avecPrestataires(r, ['prestataire'],
    garder(r, ['reference_contrat', 'lei_entite', 'succursale_code', 'fonction_id', 'type_service', 'date_debut', 'date_fin',
      'motif_fin', 'preavis_entite_jours', 'preavis_prestataire_jours', 'pays_droit_applicable', 'pays_fourniture',
      'stockage_donnees', 'pays_stockage', 'pays_traitement', 'sensibilite_donnees', 'niveau_dependance']))),
  'reference_contrat,lei_entite,prestataire_id,fonction_id,type_service',
  (r) => `${r.reference_contrat} / ${r.prestataire_code} / ${r.fonction_id} / ${r.type_service}`, rapport);

  onEtape('Liens entre contrats et signataires');
  await ecrireLot('ri_accords_intragroupe',
    donnees.intragroupe.map((r) => ligne(r, garder(r, ['reference_contrat', 'reference_contrat_lie']))),
    'reference_contrat,reference_contrat_lie', (r) => `${r.reference_contrat} / ${r.reference_contrat_lie}`, rapport);
  await ecrireLot('ri_signataires_reception',
    donnees.signatairesReception.map((r) => ligne(r, garder(r, ['reference_contrat', 'lei_entite']))),
    'reference_contrat,lei_entite', (r) => `${r.reference_contrat} / ${r.lei_entite}`, rapport);
  await ecrireLot('ri_signataires_fourniture',
    donnees.signatairesFourniture.map((r) => ligne(r, garder(r, ['reference_contrat', 'lei_entite']))),
    'reference_contrat,lei_entite', (r) => `${r.reference_contrat} / ${r.lei_entite}`, rapport);

  onEtape('Sous-traitance et évaluations');
  await ecrireLot('ri_sous_traitance', donnees.sousTraitance.map((r) => avecPrestataires(r, ['prestataire', 'destinataire'],
    garder(r, ['reference_contrat', 'type_service', 'rang']))),
  'reference_contrat,type_service,prestataire_id,destinataire_id',
  (r) => `${r.reference_contrat} / ${r.type_service} / ${r.prestataire_code}`, rapport);
  await ecrireLot('ri_evaluations', donnees.evaluations.map((r) => avecPrestataires(r, ['prestataire'],
    garder(r, ['reference_contrat', 'type_service', 'substituabilite', 'raison_non_substituable', 'date_dernier_audit',
      'plan_sortie', 'reintegration', 'incidence_cessation', 'autres_prestataires', 'autre_prestataire_info']))),
  'reference_contrat,prestataire_id,type_service',
  (r) => `${r.reference_contrat} / ${r.prestataire_code} / ${r.type_service}`, rapport);

  onEtape('Définitions internes');
  await ecrireLot('ri_definitions',
    donnees.definitions.map((r) => ligne(r, garder(r, ['colonne', 'option', 'definition']))),
    'colonne,option', (r) => `${r.colonne} option ${r.option}`, rapport);

  onEtape('Lignes en attente de correction');
  const attente = await mettreEnAttente(rapport);

  return { etapes: rapport.filter((e) => e.lus > 0), attente };
}
