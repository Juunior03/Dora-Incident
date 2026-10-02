// Délais de notification des incidents majeurs liés aux TIC
// Règlement délégué (UE) 2025/301, article 5 :
//   - notification initiale : dans les 4 heures suivant la classification de l'incident comme
//     majeur, et au plus tard 24 heures après sa détection ;
//   - rapport intermédiaire : dans les 72 heures suivant la transmission de la notification initiale ;
//   - rapport final : au plus tard un mois après la transmission du dernier rapport intermédiaire.
// La date de transmission retenue est la date de validation (reports.validated_at).
// Le report au jour ouvré suivant, que le règlement permet sous conditions pour une échéance
// tombant un week-end ou un jour férié, n'est pas appliqué : l'échéance affichée est la plus stricte.

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
 * @returns { etapes: [{ type, libelle, echeance, transmisLe, etat, base }], prochaine, cloture }
 *   etat : 'respecte' | 'tardif' | 'transmis' (date de validation inconnue) | 'a_venir' |
 *          'proche' | 'depasse' | 'indetermine' (dates de départ manquantes)
 */
export function echeancier(reports, maintenant = new Date()) {
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

  const echeanceInitiale = [plus(classification, 4 * HEURE), plus(detection, 24 * HEURE)]
    .filter(Boolean).sort((a, b) => a - b)[0] ?? null;
  const baseInitiale = !echeanceInitiale ? null
    : classification && echeanceInitiale.getTime() === plus(classification, 4 * HEURE).getTime()
      ? 'classification + 4 h' : 'détection + 24 h';

  const transmisInitiale = initiales[0];
  const transmisIntermediaire = intermediaires[0];
  const dernierIntermediaire = intermediaires.at(-1);
  const transmisFinal = finals[0];

  const brutes = [
    { ...ETAPES[0], echeance: echeanceInitiale, base: baseInitiale, rapport: transmisInitiale },
    {
      ...ETAPES[1],
      echeance: plus(date(transmisInitiale?.validatedAt), 72 * HEURE),
      base: 'notification initiale + 72 h',
      rapport: transmisIntermediaire,
    },
    {
      ...ETAPES[2],
      echeance: plusUnMois(date(dernierIntermediaire?.validatedAt)),
      base: 'dernier rapport intermédiaire + 1 mois',
      rapport: transmisFinal,
    },
  ];

  const etapes = brutes.map(({ rapport, ...e }) => {
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
