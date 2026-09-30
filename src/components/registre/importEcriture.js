// Écriture en base des données issues d'un classeur Excel (voir importAnalyse.js).
// Principe : ajout ou mise à jour (« upsert ») sur la clé de chaque table ; les lignes absentes
// du fichier ne sont ni modifiées ni supprimées. Les tables sont écrites dans l'ordre des
// dépendances ; si un lot est refusé, ses lignes sont réessayées une par une pour ne perdre
// que les lignes en erreur, chacune étant listée avec la raison du refus.
import { supabase } from '../../supabaseClient';
import { messageErreur } from './erreursBase';

const TAILLE_LOT = 200;

// Libellés affichés dans le rapport : les noms des tables restent internes
const LIBELLES = {
  ri_teneur_registre: 'B_01.01 – Entité tenant le registre', ri_entites: 'B_01.02 – Entités du périmètre',
  ri_succursales: 'B_01.03 – Succursales', ri_prestataires: 'B_05.01 – Prestataires TIC', ri_fonctions: 'B_06.01 – Fonctions',
  ri_contrats: 'B_02.01 – Contrats', ri_contrats_services: 'B_02.02 – Services contractés',
  ri_accords_intragroupe: 'B_02.03 – Accords intra-groupe', ri_signataires_reception: 'B_03.01 – Signataires (réception)',
  ri_signataires_fourniture: 'B_03.03 – Signataires (fourniture)', ri_sous_traitance: 'B_05.02 – Sous-traitance',
  ri_evaluations: 'B_07.01 – Évaluations des services', ri_definitions: 'B_99.01 – Définitions internes',
};

const garder = (objet, champs) => Object.fromEntries(champs.map((c) => [c, objet[c] ?? null]));

async function ecrireLot(table, lignes, conflit, reference, rapport) {
  const etape = { libelle: LIBELLES[table], lus: lignes.length, ecrits: 0, erreurs: [] };
  rapport.push(etape);
  const valides = lignes.filter((l) => !l._erreur);
  for (const l of lignes.filter((x) => x._erreur)) etape.erreurs.push({ reference: reference(l), message: l._erreur });

  for (let i = 0; i < valides.length; i += TAILLE_LOT) {
    const lot = valides.slice(i, i + TAILLE_LOT);
    const payload = lot.map((l) => l.payload);
    const { error } = await supabase.from(table).upsert(payload, { onConflict: conflit });
    if (!error) {
      etape.ecrits += lot.length;
      continue;
    }
    // Lot refusé : ligne par ligne pour isoler les lignes en erreur
    for (const l of lot) {
      const res = await supabase.from(table).upsert([l.payload], { onConflict: conflit });
      if (res.error) etape.erreurs.push({ reference: reference(l), message: messageErreur(res.error) });
      else etape.ecrits += 1;
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

/**
 * @param donnees résultat de analyserClasseur().donnees
 * @param onEtape (libellé) => void, pour afficher la progression
 * @returns rapport : [{ libelle, lus, ecrits, erreurs: [{ reference, message }] }]
 */
export async function importerDonnees(donnees, onEtape = () => {}) {
  const rapport = [];
  const ligne = (source, payload) => ({ ...source, payload });

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
  await ecrireLot('ri_prestataires',
    donnees.prestataires.map((r) => ligne(r, garder(r, ['code', 'type_code', 'code_supp', 'type_code_supp', 'raison_sociale',
      'nom_latin', 'type_personne', 'pays_siege', 'monnaie', 'depenses_annuelles']))),
    'code,type_code', (r) => r.code, rapport);

  // Entreprises mères ultimes : rattachées une fois tous les prestataires enregistrés
  let idPrestataire = await chargerPrestataires();
  const meres = { libelle: 'Rattachement aux entreprises mères ultimes', lus: 0, ecrits: 0, erreurs: [], complement: true };
  for (const p of donnees.prestataires.filter((x) => x.mere_code)) {
    meres.lus += 1;
    const id = idPrestataire(p.code, p.type_code);
    const idMere = idPrestataire(p.mere_code, p.mere_type_code);
    if (!idMere) {
      meres.erreurs.push({ reference: p.code, message: `entreprise mère ${p.mere_code} absente de la liste des prestataires (B_05.01)` });
      continue;
    }
    const { error } = await supabase.from('ri_prestataires').update({ mere_ultime_id: idMere }).eq('id', id);
    if (error) meres.erreurs.push({ reference: p.code, message: messageErreur(error) });
    else meres.ecrits += 1;
  }
  if (meres.lus) rapport.push(meres);

  onEtape('Fonctions et contrats');
  await ecrireLot('ri_fonctions',
    donnees.fonctions.map((r) => ligne(r, garder(r, ['identifiant', 'activite_autorisee', 'nom', 'lei_entite', 'criticite',
      'raisons_criticite', 'date_derniere_evaluation', 'rto_heures', 'rpo_heures', 'incidence_interruption']))),
    'identifiant', (r) => r.identifiant, rapport);
  // Accords généraux et autonomes d'abord : les accords ultérieurs s'y rattachent
  const champsContrat = ['reference', 'type_accord', 'reference_general', 'monnaie', 'depenses_annuelles'];
  const contrats = [...donnees.contrats].sort((a, b) => (a.type_accord === 3) - (b.type_accord === 3));
  const premiers = contrats.filter((c) => c.type_accord !== 3);
  const suivants = contrats.filter((c) => c.type_accord === 3);
  const etapeContrats = await ecrireLot('ri_contrats', premiers.map((r) => ligne(r, garder(r, champsContrat))), 'reference', (r) => r.reference, rapport);
  const etapeSuivants = await ecrireLot('ri_contrats', suivants.map((r) => ligne(r, garder(r, champsContrat))), 'reference', (r) => r.reference, []);
  etapeContrats.lus += etapeSuivants.lus;
  etapeContrats.ecrits += etapeSuivants.ecrits;
  etapeContrats.erreurs.push(...etapeSuivants.erreurs);

  onEtape('Services contractés');
  idPrestataire = await chargerPrestataires();
  const avecPrestataire = (r, champ = 'prestataire') => {
    const id = idPrestataire(r[`${champ}_code`], r[`${champ}_type_code`]);
    return id ? { id } : { erreur: `prestataire ${r[`${champ}_code`]} absent de la liste des prestataires (B_05.01)` };
  };
  await ecrireLot('ri_contrats_services', donnees.services.map((r) => {
    const p = avecPrestataire(r);
    if (p.erreur) return { ...r, _erreur: p.erreur };
    return ligne(r, {
      ...garder(r, ['reference_contrat', 'lei_entite', 'succursale_code', 'fonction_id', 'type_service', 'date_debut', 'date_fin',
        'motif_fin', 'preavis_entite_jours', 'preavis_prestataire_jours', 'pays_droit_applicable', 'pays_fourniture',
        'stockage_donnees', 'pays_stockage', 'pays_traitement', 'sensibilite_donnees', 'niveau_dependance']),
      prestataire_id: p.id,
    });
  }), 'reference_contrat,lei_entite,prestataire_id,fonction_id,type_service',
  (r) => `${r.reference_contrat} / ${r.prestataire_code} / ${r.fonction_id} / ${r.type_service}`, rapport);

  onEtape('Liens entre contrats et signataires');
  await ecrireLot('ri_accords_intragroupe',
    donnees.intragroupe.map((r) => ligne(r, garder(r, ['reference_contrat', 'reference_contrat_lie']))),
    'reference_contrat,reference_contrat_lie', (r) => `${r.reference_contrat} → ${r.reference_contrat_lie}`, rapport);
  await ecrireLot('ri_signataires_reception',
    donnees.signatairesReception.map((r) => ligne(r, garder(r, ['reference_contrat', 'lei_entite']))),
    'reference_contrat,lei_entite', (r) => `${r.reference_contrat} / ${r.lei_entite}`, rapport);
  await ecrireLot('ri_signataires_fourniture',
    donnees.signatairesFourniture.map((r) => ligne(r, garder(r, ['reference_contrat', 'lei_entite']))),
    'reference_contrat,lei_entite', (r) => `${r.reference_contrat} / ${r.lei_entite}`, rapport);

  onEtape('Sous-traitance et évaluations');
  await ecrireLot('ri_sous_traitance', donnees.sousTraitance.map((r) => {
    const p = avecPrestataire(r);
    const d = avecPrestataire(r, 'destinataire');
    if (p.erreur || d.erreur) return { ...r, _erreur: p.erreur || d.erreur };
    return ligne(r, { ...garder(r, ['reference_contrat', 'type_service', 'rang']), prestataire_id: p.id, destinataire_id: d.id });
  }), 'reference_contrat,type_service,prestataire_id,destinataire_id',
  (r) => `${r.reference_contrat} / ${r.type_service} / ${r.prestataire_code}`, rapport);
  await ecrireLot('ri_evaluations', donnees.evaluations.map((r) => {
    const p = avecPrestataire(r);
    if (p.erreur) return { ...r, _erreur: p.erreur };
    return ligne(r, {
      ...garder(r, ['reference_contrat', 'type_service', 'substituabilite', 'raison_non_substituable', 'date_dernier_audit',
        'plan_sortie', 'reintegration', 'incidence_cessation', 'autres_prestataires', 'autre_prestataire_info']),
      prestataire_id: p.id,
    });
  }), 'reference_contrat,prestataire_id,type_service',
  (r) => `${r.reference_contrat} / ${r.prestataire_code} / ${r.type_service}`, rapport);

  onEtape('Définitions internes');
  await ecrireLot('ri_definitions',
    donnees.definitions.map((r) => ligne(r, garder(r, ['colonne', 'option', 'definition']))),
    'colonne,option', (r) => `${r.colonne} option ${r.option}`, rapport);

  return rapport.filter((e) => e.lus > 0);
}
