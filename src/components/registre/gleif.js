// Vérification des LEI auprès du GLEIF (règles EBA VR_2, VR_12, VR_16, VR_23, VR_71, VR_77).
// L'appel part du navigateur de l'utilisateur vers l'API publique du GLEIF.
import { supabase } from '../../supabaseClient';

const API = 'https://api.gleif.org/api/v1/lei-records';
const TAILLE_LOT = 100;

// Statuts d'enregistrement GLEIF acceptables pour un LEI « valide et actif »
const STATUTS_OK = ['ISSUED', 'PENDING_TRANSFER', 'PENDING_ARCHIVAL'];

// Recense les LEI à vérifier dans le registre, avec l'endroit où ils sont déclarés
export async function collecterLei() {
  const [teneur, entites, prestataires] = await Promise.all([
    supabase.from('ri_teneur_registre').select('lei, pays'),
    supabase.from('ri_entites').select('lei, pays, lei_mere_directe'),
    supabase.from('ri_prestataires').select('code, type_code, code_supp, type_code_supp'),
  ]);
  const erreur = teneur.error || entites.error || prestataires.error;
  if (erreur) throw erreur;

  const refs = [];
  for (const t of teneur.data) {
    refs.push({ lei: t.lei, modele: 'B_01.01', colonne: '0010', regle: 'VR_2', section: 'teneur', pays: t.pays });
  }
  for (const e of entites.data) {
    refs.push({ lei: e.lei, modele: 'B_01.02', colonne: '0010', regle: 'VR_12', section: 'entites', pays: e.pays });
    if (e.lei_mere_directe && e.lei_mere_directe !== e.lei) {
      refs.push({ lei: e.lei_mere_directe, modele: 'B_01.02', colonne: '0060', regle: 'VR_23', section: 'entites', entite: e.lei });
    }
  }
  for (const p of prestataires.data) {
    if (p.type_code === 'LEI') refs.push({ lei: p.code, modele: 'B_05.01', colonne: '0010', regle: 'VR_71', section: 'prestataires' });
    if (p.type_code_supp === 'LEI') refs.push({ lei: p.code_supp, modele: 'B_05.01', colonne: '0030', regle: 'VR_77', section: 'prestataires', prestataire: p.code });
  }
  return refs;
}

// Interroge le GLEIF par lots ; renvoie { LEI: enregistrement } pour les LEI trouvés
export async function interrogerGleif(leis, fetchImpl = fetch) {
  const uniques = [...new Set(leis)];
  const trouves = {};
  for (let i = 0; i < uniques.length; i += TAILLE_LOT) {
    const lot = uniques.slice(i, i + TAILLE_LOT);
    const url = `${API}?filter[lei]=${lot.join(',')}&page[size]=${TAILLE_LOT}`;
    const reponse = await fetchImpl(url, { headers: { Accept: 'application/vnd.api+json' } });
    if (!reponse.ok) throw new Error(`Le GLEIF a répondu ${reponse.status}.`);
    const json = await reponse.json();
    for (const enregistrement of json.data || []) {
      trouves[enregistrement.attributes.lei] = enregistrement.attributes;
    }
  }
  return trouves;
}

// Transforme le résultat du GLEIF en anomalies au format du rapport
export function anomaliesGleif(refs, trouves) {
  const anomalies = [];
  const ajouter = (ref, gravite, message) => anomalies.push({
    gravite,
    modele: ref.modele,
    colonne: ref.colonne,
    section: ref.section,
    reference: ref.lei,
    message: `${message} (contrôle EBA ${ref.regle})`,
    source: 'GLEIF',
  });

  for (const ref of refs) {
    const g = trouves[ref.lei];
    if (!g) {
      ajouter(ref, 'bloquant', "Ce LEI n'existe pas dans la base mondiale des LEI (GLEIF). Vérifiez-le, une faute de frappe est probable, sur search.gleif.org");
      continue;
    }
    const nom = g.entity?.legalName?.name ? ` (« ${g.entity.legalName.name} »)` : '';
    if (g.entity?.status && g.entity.status !== 'ACTIVE') {
      ajouter(ref, 'bloquant', `L'entité${nom} est déclarée inactive au GLEIF. Vérifiez qu'elle existe toujours, ou indiquez l'identifiant de l'entité qui l'a remplacée`);
    }
    const statut = g.registration?.status;
    if (statut === 'LAPSED') {
      ajouter(ref, 'avertissement', `Le LEI de l'entité${nom} n'a pas été renouvelé (statut « expiré » au GLEIF). Il reste utilisable, mais demandez son renouvellement`);
    } else if (statut && !STATUTS_OK.includes(statut)) {
      ajouter(ref, 'bloquant', `Le LEI de l'entité${nom} n'est plus valide (statut « ${statut} » au GLEIF). Vérifiez-le ou utilisez le LEI qui l'a remplacé`);
    }
    if (ref.pays && ref.modele === 'B_01.02' && ref.colonne === '0010') {
      const paysGleif = [...new Set([g.entity?.jurisdiction, g.entity?.legalAddress?.country].filter(Boolean))];
      if (paysGleif.length && !paysGleif.includes(ref.pays)) {
        anomalies.push({
          gravite: 'avertissement',
          modele: ref.modele,
          colonne: '0030',
          section: ref.section,
          reference: ref.lei,
          message: `Le pays indiqué (${ref.pays}) diffère de celui enregistré au GLEIF (${paysGleif.join(' / ')}). Corrigez le pays si nécessaire (contrôle EBA VR_16)`,
          source: 'GLEIF',
        });
      }
    }
  }
  return anomalies;
}
