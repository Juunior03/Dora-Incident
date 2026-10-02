// Suivi des délais de notification des incidents majeurs (règlement délégué (UE) 2025/301, art. 5)
import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { echeancier, formaterReste } from '../utils/delaisNotification';

const ETATS = {
  depasse: { libelle: 'Échéance dépassée', classes: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200', ordre: 1 },
  proche: { libelle: 'Moins de 4 h', classes: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200', ordre: 2 },
  a_venir: { libelle: 'À venir', classes: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200', ordre: 3 },
  indetermine: { libelle: 'Dates à compléter', classes: 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200', ordre: 4 },
  respecte: { libelle: 'Transmis dans les délais', classes: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
  tardif: { libelle: 'Transmis en retard', classes: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  attente: { libelle: 'Après le rapport précédent', classes: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  transmis: { libelle: 'Transmis (date inconnue)', classes: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
};

const formater = (d) => (d ? d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

// Explication de l'état « indéterminé » selon l'étape
const manque = (type) => (type === 'initial_notification'
  ? 'Renseignez la date de détection et la date de classification de l\'incident.'
  : 'Le rapport précédent a été validé avant la mise en place du suivi : sa date de transmission est inconnue.');

/** Pastille d'état de la prochaine échéance, pour la liste des incidents */
export function BadgeEcheance({ reports }) {
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const { prochaine } = echeancier(reports, maintenant);
  if (!prochaine) return null;
  const e = ETATS[prochaine.etat];
  return (
    <span className={`ml-2 text-xs px-2 py-1 rounded-full ${e.classes}`} title={prochaine.echeance ? `Échéance : ${formater(prochaine.echeance)}` : undefined}>
      {prochaine.libelle} : {prochaine.echeance ? formaterReste(prochaine.echeance, maintenant) : 'dates à compléter'}
    </span>
  );
}

BadgeEcheance.propTypes = { reports: PropTypes.array.isRequired };

/** Tuile du Dashboard : synthèse des échéances, détail dans un panneau latéral */
export default function SuiviDelais({ incidents }) {
  const [maintenant, setMaintenant] = useState(() => new Date());
  const [panneau, setPanneau] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setMaintenant(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!panneau) return undefined;
    const fermer = (e) => { if (e.key === 'Escape') setPanneau(false); };
    globalThis.addEventListener('keydown', fermer);
    return () => globalThis.removeEventListener('keydown', fermer);
  }, [panneau]);

  const lignes = useMemo(() => Object.entries(incidents)
    .map(([code, incident]) => ({ code, incident, ...echeancier(incident.reports, maintenant) }))
    .filter((l) => !l.cloture && l.prochaine)
    .sort((a, b) => (ETATS[a.prochaine.etat].ordre - ETATS[b.prochaine.etat].ordre)
      || ((a.prochaine.echeance?.getTime() ?? Infinity) - (b.prochaine.echeance?.getTime() ?? Infinity))),
  [incidents, maintenant]);

  const retards = lignes.filter((l) => l.prochaine.etat === 'depasse').length;
  const proches = lignes.filter((l) => l.prochaine.etat === 'proche').length;
  const suivante = lignes.find((l) => l.prochaine.echeance && l.prochaine.etat !== 'depasse');
  const couleur = retards ? 'bg-red-50 dark:bg-red-900/30 ring-1 ring-red-300 dark:ring-red-800'
    : proches ? 'bg-orange-50 dark:bg-orange-900/30 ring-1 ring-orange-300 dark:ring-orange-800'
      : 'bg-blue-50 dark:bg-blue-900/30';

  return (
    <>
      <button type="button" onClick={() => setPanneau(true)} aria-haspopup="dialog"
        className={`p-4 rounded-lg text-left hover:brightness-95 transition ${couleur}`}>
        <div className="text-sm">Échéances de notification</div>
        <div className="text-2xl font-bold">
          {retards > 0 ? `${retards} en retard` : proches > 0 ? `${proches} < 4 h` : lignes.length}
        </div>
        <div className="text-xs opacity-70 mt-1 truncate">
          {lignes.length === 0 ? 'Aucune en cours'
            : suivante ? `Prochaine ${formaterReste(suivante.prochaine.echeance, maintenant)}`
              : 'Voir le détail'}
        </div>
      </button>

      {panneau && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Délais de notification">
          <button type="button" aria-label="Fermer" className="absolute inset-0 bg-black/30 cursor-default" onClick={() => setPanneau(false)} />
          <aside className="relative w-full max-w-md h-full overflow-y-auto bg-white dark:bg-gray-900 shadow-xl p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold">Délais de notification</h3>
                <p className="text-xs opacity-70">{lignes.length} incident(s) avec une échéance en cours</p>
              </div>
              <button type="button" onClick={() => setPanneau(false)} className="px-3 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-sm">
                Fermer
              </button>
            </div>

            {lignes.length === 0 ? (
              <p className="text-sm p-3 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200">Aucune échéance en cours.</p>
            ) : (
              <ul className="space-y-3">
                {lignes.map((l) => <CarteEcheance key={l.code} {...l} maintenant={maintenant} />)}
              </ul>
            )}

            <ExplicationDelais />
          </aside>
        </div>
      )}
    </>
  );
}

// Explication des délais du règlement délégué (UE) 2025/301, article 5, en langage courant
function ExplicationDelais() {
  return (
    <details className="mt-6 rounded-lg border dark:border-gray-700 text-sm" open>
      <summary className="cursor-pointer px-3 py-2 font-medium">Comment les échéances sont-elles calculées ?</summary>
      <div className="px-3 pb-3 space-y-3">
        <p className="opacity-80">
          Un incident majeur lié aux TIC donne lieu à trois rapports à l&apos;ACPR. Chaque délai court à partir
          d&apos;un événement précis (règlement délégué (UE) 2025/301, article 5) :
        </p>
        <ol className="space-y-2">
          <li className="p-2 rounded bg-gray-50 dark:bg-gray-800">
            <div className="font-medium">1. Notification initiale</div>
            <div className="opacity-80">
              Dans les <strong>4 heures</strong> après que l&apos;incident a été qualifié de majeur (date de
              classification), et en tout état de cause au plus tard <strong>24 heures</strong> après sa détection.
              La date la plus proche des deux s&apos;applique.
            </div>
          </li>
          <li className="p-2 rounded bg-gray-50 dark:bg-gray-800">
            <div className="font-medium">2. Rapport intermédiaire</div>
            <div className="opacity-80">
              Dans les <strong>72 heures</strong> après l&apos;envoi de la notification initiale, même si la
              situation n&apos;a pas changé.
            </div>
          </li>
          <li className="p-2 rounded bg-gray-50 dark:bg-gray-800">
            <div className="font-medium">3. Rapport final</div>
            <div className="opacity-80">
              Au plus tard <strong>1 mois</strong> après l&apos;envoi du dernier rapport intermédiaire.
            </div>
          </li>
        </ol>
        <div className="p-2 rounded bg-indigo-50 dark:bg-indigo-900/30">
          <div className="font-medium">Exemple</div>
          <div className="opacity-80">
            Incident détecté lundi à 8 h, qualifié de majeur à 10 h : notification initiale avant lundi 14 h
            (10 h + 4 h, plus tôt que mardi 8 h). Notification envoyée lundi à 13 h : rapport intermédiaire avant
            jeudi 13 h. Rapport intermédiaire envoyé mercredi 10 h : rapport final avant le même jour du mois
            suivant, 10 h.
          </div>
        </div>
        <ul className="list-disc pl-5 opacity-80 space-y-1 text-xs">
          <li>L&apos;application considère qu&apos;un rapport est envoyé au moment où il est validé.</li>
          <li>
            Si l&apos;incident est qualifié de majeur tardivement, la limite des 24 heures après la détection
            reste la plus contraignante.
          </li>
          <li>
            Le règlement permet à certaines entités, sous conditions, de reporter au jour ouvré suivant une
            échéance tombant un week-end ou un jour férié : ce report n&apos;est pas appliqué ici, l&apos;échéance
            affichée est toujours la plus stricte.
          </li>
        </ul>
      </div>
    </details>
  );
}

function CarteEcheance({ code, incident, etapes, prochaine, maintenant }) {
  const [detail, setDetail] = useState(false);
  const e = ETATS[prochaine.etat];
  return (
    <li className="p-3 rounded-lg border dark:border-gray-700">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{code}</div>
          {incident.description && <div className="text-xs opacity-60 truncate">{incident.description}</div>}
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${e.classes}`}>{e.libelle}</span>
      </div>
      <div className="mt-2 text-sm">
        {prochaine.libelle} :{' '}
        {prochaine.echeance
          ? <><span className="font-medium">{formater(prochaine.echeance)}</span> <span className="opacity-70">({formaterReste(prochaine.echeance, maintenant)})</span></>
          : <span className="opacity-70">{manque(prochaine.type)}</span>}
      </div>
      <button type="button" onClick={() => setDetail(!detail)} className="mt-2 text-xs text-indigo-700 dark:text-indigo-300 hover:underline">
        {detail ? 'Masquer les étapes' : 'Voir les 3 étapes'}
      </button>
      {detail && (
        <ol className="mt-2 space-y-1">
          {etapes.map((x, i) => ({ ...x, etat: i > etapes.indexOf(prochaine) && x.etat === 'indetermine' ? 'attente' : x.etat })).map((x) => (
            <li key={x.type} className="flex items-start justify-between gap-2 text-xs p-2 rounded bg-gray-50 dark:bg-gray-800">
              <div>
                <div className="font-medium">{x.libelle}</div>
                <div className="opacity-70">Échéance : {formater(x.echeance)}</div>
                {x.base && <div className="opacity-60">{x.base}</div>}
                {x.transmisLe && <div className="opacity-70">Transmis le {formater(x.transmisLe)}</div>}
              </div>
              <span className={`px-2 py-0.5 rounded-full whitespace-nowrap ${ETATS[x.etat].classes}`}>{ETATS[x.etat].libelle}</span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

CarteEcheance.propTypes = {
  code: PropTypes.string.isRequired,
  incident: PropTypes.object.isRequired,
  etapes: PropTypes.array.isRequired,
  prochaine: PropTypes.object.isRequired,
  maintenant: PropTypes.instanceOf(Date).isRequired,
};

SuiviDelais.propTypes = { incidents: PropTypes.object.isRequired };
