// Délais de notification des incidents majeurs liés aux TIC
// Règlement délégué (UE) 2025/301, article 5 :
//   1. a) notification initiale : dans les 4 heures suivant la classification de l'incident comme
//         majeur, et au plus tard 24 heures après sa détection ;
//      b) rapport intermédiaire : dans les 72 heures suivant la transmission de la notification initiale ;
//      c) rapport final : au plus tard un mois après la transmission du dernier rapport intermédiaire.
//   2. incident classé majeur plus de 24 heures après sa détection : notification initiale dans les
//      4 heures suivant la classification.
//   4. échéance tombant un week-end ou un jour férié : remise possible jusqu'au jour ouvré suivant à midi ;
//   5. sauf pour la notification initiale et le rapport intermédiaire des établissements de crédit,
//      contreparties centrales, plates-formes de négociation, entités essentielles ou importantes (NIS2)
//      et entités déclarées significatives ou systémiques.
// Le report (paragraphes 4 et 5) dépend de la nature de l'entité : il n'est appliqué que sur option.
// La date de transmission retenue est la date de validation (reports.validated_at).

const HEURE = 3600 * 1000;
// En deçà de ce délai restant, l'échéance est signalée comme proche
export const SEUIL_URGENCE_MS = 4 * HEURE;

export const ETAPES = [
  { type: 'initial_notification', libelle: 'Notification initiale' },
  { type: 'intermediate_report', libelle: 'Rapport intermédiaire' },
  { type: 'final_report', libelle: 'Rapport final' },
];

const date = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const plus = (d, ms) => (d ? new Date(d.getTime() + ms) : null);

// Jours fériés en France (métropole) : fixes, et mobiles calculés depuis Pâques
function paques(annee) {
  const a = annee % 19; const b = Math.floor(annee / 100); const c = annee % 100;
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31); const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(annee, mois - 1, jour);
}
export function estJourFerie(d) {
  const a = d.getFullYear();
  const cle = (x) => `${x.getMonth() + 1}-${x.getDate()}`;
  const p = paques(a);
  const decale = (n) => new Date(a, p.getMonth(), p.getDate() + n);
  const feries = new Set(['1-1', '5-1', '5-8', '7-14', '8-15', '11-1', '11-11', '12-25',
    cle(decale(1)), cle(decale(39)), cle(decale(50))]); // lundi de Pâques, Ascension, lundi de Pentecôte
  return feries.has(cle(d));
}
const estOuvre = (d) => d.getDay() !== 0 && d.getDay() !== 6 && !estJourFerie(d);

/** Échéance tombant un week-end ou un jour férié : jour ouvré suivant à midi (article 5, paragraphe 4) */
export function reporterJourOuvre(echeance) {
  if (!echeance || estOuvre(echeance)) return echeance;
  const r = new Date(echeance.getFullYear(), echeance.getMonth(), echeance.getDate() + 1, 12, 0, 0);
  while (!estOuvre(r)) r.setDate(r.getDate() + 1);
  return r;
}

// Un mois calendaire plus tard (31 janvier -> 28 ou 29 février)
export function plusUnMois(d) {
  if (!d) return null;
  const r = new Date(d.getTime());
  const jour = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + 1);
  const dernierJour = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(jour, dernierJour));
  return r;
}

/**
 * Échéancier d'un incident.
 * @param reports rapports de l'incident (incidentSubmission, status, validatedAt, incident.*)
 * @param reportJourOuvre 'aucun' (au plus strict) | 'final' (rapport final seulement : établissements
 *        de crédit, contreparties centrales, plates-formes de négociation, entités NIS2 ou significatives)
 *        | 'tous' (autres entités financières) — article 5, paragraphes 4 et 5
 * @returns { etapes: [{ type, libelle, echeance, transmisLe, etat, base }], prochaine, cloture }
 *   etat : 'respecte' | 'tardif' | 'transmis' (date de validation inconnue) | 'a_venir' |
 *          'proche' | 'depasse' | 'indetermine' (dates de départ manquantes)
 */
export function echeancier(reports, maintenant = new Date(), reportJourOuvre = 'aucun') {
  const valides = (type) => reports
    .filter((r) => r.incidentSubmission === type && r.status === 'validated')
    .sort((a, b) => (date(a.validatedAt)?.getTime() ?? 0) - (date(b.validatedAt)?.getTime() ?? 0));
  // Dates de détection et de classification : celles de la notification initiale en priorité
  const source = reports.find((r) => r.incidentSubmission === 'initial_notification') ?? reports[0];
  const detection = date(source?.incident?.detectionDateTime);
  const classification = date(source?.incident?.classificationDateTime);

  const initiales = valides('initial_notification');
  const intermediaires = valides('intermediate_report');
  const finals = valides('final_report');

  // Classification tardive (plus de 24 h après la détection) : 4 h après la classification (paragraphe 2)
  const tardive = classification && detection && classification > plus(detection, 24 * HEURE);
  let echeanceInitiale;
  let baseInitiale = null;
  if (tardive || (classification && !detection)) {
    echeanceInitiale = plus(classification, 4 * HEURE);
    baseInitiale = tardive
      ? '4 h après la classification (incident qualifié de majeur plus de 24 h après sa détection)'
      : '4 h après la classification comme incident majeur';
  } else if (detection) {
    const quatreHeures = plus(classification, 4 * HEURE);
    const vingtQuatre = plus(detection, 24 * HEURE);
    echeanceInitiale = quatreHeures && quatreHeures < vingtQuatre ? quatreHeures : vingtQuatre;
    baseInitiale = echeanceInitiale === quatreHeures
      ? '4 h après la classification comme incident majeur' : '24 h après la détection (limite maximale)';
  } else {
    echeanceInitiale = null;
  }

  const transmisInitiale = initiales[0];
  const transmisIntermediaire = intermediaires[0];
  const dernierIntermediaire = intermediaires.at(-1);
  const transmisFinal = finals[0];

  const brutes = [
    { ...ETAPES[0], echeance: echeanceInitiale, base: baseInitiale, rapport: transmisInitiale },
    {
      ...ETAPES[1],
      echeance: plus(date(transmisInitiale?.validatedAt), 72 * HEURE),
      base: '72 h après la transmission de la notification initiale',
      rapport: transmisIntermediaire,
    },
    {
      ...ETAPES[2],
      echeance: plusUnMois(date(dernierIntermediaire?.validatedAt)),
      base: '1 mois après la transmission du dernier rapport intermédiaire',
      rapport: transmisFinal,
    },
  ];

  const avecReport = brutes.map((e) => {
    const applicable = reportJourOuvre === 'tous' || (reportJourOuvre === 'final' && e.type === 'final_report');
    const reportee = applicable ? reporterJourOuvre(e.echeance) : e.echeance;
    return reportee && e.echeance && reportee.getTime() !== e.echeance.getTime()
      ? { ...e, echeance: reportee, base: `${e.base}, reportée au jour ouvré suivant à 12 h (week-end ou jour férié)` }
      : e;
  });

  const etapes = avecReport.map(({ rapport, ...e }) => {
    const transmisLe = date(rapport?.validatedAt);
    let etat;
    if (rapport) {
      if (!transmisLe) etat = 'transmis';
      else if (!e.echeance) etat = 'transmis';
      else etat = transmisLe <= e.echeance ? 'respecte' : 'tardif';
    } else if (!e.echeance) {
      etat = 'indetermine';
    } else {
      const reste = e.echeance - maintenant;
      etat = reste < 0 ? 'depasse' : reste <= SEUIL_URGENCE_MS ? 'proche' : 'a_venir';
    }
    return { ...e, transmisLe, etat };
  });

  const cloture = Boolean(transmisFinal);
  // Prochaine étape : la première non transmise (une étape « indéterminée » derrière une étape
  // en attente n'est pas encore pertinente)
  const prochaine = cloture ? null : etapes.find((e) => !['respecte', 'tardif', 'transmis'].includes(e.etat)) ?? null;
  return { etapes, prochaine, cloture };
}

/** « dans 3 h 20 », « depuis 2 j 4 h » */
export function formaterReste(echeance, maintenant = new Date()) {
  if (!echeance) return '';
  const ms = echeance - maintenant;
  const abs = Math.abs(ms);
  const j = Math.floor(abs / (24 * HEURE));
  const h = Math.floor((abs % (24 * HEURE)) / HEURE);
  const m = Math.floor((abs % HEURE) / 60000);
  const duree = j > 0 ? `${j} j ${h} h` : h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
  return ms >= 0 ? `dans ${duree}` : `dépassée depuis ${duree}`;
}
