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

export default function SuiviDelais({ incidents }) {
  const [maintenant, setMaintenant] = useState(() => new Date());
  const [ouvert, setOuvert] = useState(null);
  useEffect(() => {
    const t = setInterval(() => setMaintenant(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const lignes = useMemo(() => Object.entries(incidents)
    .map(([code, incident]) => ({ code, incident, ...echeancier(incident.reports, maintenant) }))
    .filter((l) => !l.cloture && l.prochaine)
    .sort((a, b) => (ETATS[a.prochaine.etat].ordre - ETATS[b.prochaine.etat].ordre)
      || ((a.prochaine.echeance?.getTime() ?? Infinity) - (b.prochaine.echeance?.getTime() ?? Infinity))),
  [incidents, maintenant]);

  const retards = lignes.filter((l) => l.prochaine.etat === 'depasse').length;
  const proches = lignes.filter((l) => l.prochaine.etat === 'proche').length;

  return (
    <div className="mb-6 p-4 rounded-lg bg-white/80 dark:bg-gray-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h3 className="font-medium">Délais de notification</h3>
        <p className="text-xs opacity-70">
          Initiale : 4 h après la classification, au plus tard 24 h après la détection · intermédiaire :
          72 h après l&apos;initiale · finale : 1 mois après le dernier intermédiaire (règlement délégué 2025/301).
        </p>
      </div>

      {lignes.length === 0 ? (
        <p className="text-sm p-3 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200">
          Aucune échéance en cours.
        </p>
      ) : (
        <>
          {(retards > 0 || proches > 0) && (
            <p className={`text-sm font-medium mb-3 p-2 rounded-lg ${retards ? 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200' : 'bg-orange-50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200'}`}>
              {retards > 0 && `${retards} échéance(s) dépassée(s). `}
              {proches > 0 && `${proches} échéance(s) dans moins de 4 heures.`}
            </p>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b dark:border-gray-700">
                <th className="py-2 pr-4 font-medium">Incident</th>
                <th className="py-2 pr-4 font-medium">Prochain rapport</th>
                <th className="py-2 pr-4 font-medium">Échéance</th>
                <th className="py-2 pr-4 font-medium">État</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {lignes.map(({ code, incident, etapes, prochaine }) => (
                <FragmentLigne key={code} code={code} incident={incident} etapes={etapes} prochaine={prochaine}
                  maintenant={maintenant} ouvert={ouvert === code} basculer={() => setOuvert(ouvert === code ? null : code)} />
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="text-xs opacity-60 mt-3">
        La date de transmission retenue est celle de la validation. Une échéance tombant un week-end ou un jour
        férié peut, pour certaines entités et sous conditions, être reportée au jour ouvré suivant : ce report
        n&apos;est pas appliqué ici, l&apos;échéance affichée est la plus stricte.
      </p>
    </div>
  );
}

function FragmentLigne({ code, incident, etapes, prochaine, maintenant, ouvert, basculer }) {
  const e = ETATS[prochaine.etat];
  return (
    <>
      <tr className="border-b dark:border-gray-700 align-top">
        <td className="py-2 pr-4">
          <span className="font-medium">{code}</span>
          {incident.description && <span className="block text-xs opacity-60">{incident.description.slice(0, 60)}</span>}
        </td>
        <td className="py-2 pr-4">{prochaine.libelle}</td>
        <td className="py-2 pr-4 whitespace-nowrap">
          {formater(prochaine.echeance)}
          {prochaine.echeance && <span className="block text-xs opacity-70">{formaterReste(prochaine.echeance, maintenant)}</span>}
        </td>
        <td className="py-2 pr-4">
          <span className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${e.classes}`}>{e.libelle}</span>
          {prochaine.etat === 'indetermine' && <span className="block text-xs opacity-70 mt-1">{manque(prochaine.type)}</span>}
        </td>
        <td className="py-2 text-right">
          <button onClick={basculer} className="px-3 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs whitespace-nowrap">
            {ouvert ? 'Masquer' : 'Détail'}
          </button>
        </td>
      </tr>
      {ouvert && (
        <tr className="border-b dark:border-gray-700">
          <td colSpan={5} className="py-2">
            <ol className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {etapes.map((x) => (
                <li key={x.type} className="p-2 rounded-lg bg-gray-50 dark:bg-gray-700 text-xs">
                  <div className="font-medium text-sm">{x.libelle}</div>
                  <div>Échéance : {formater(x.echeance)}{x.echeance && <span className="opacity-60"> ({x.base})</span>}</div>
                  <div>Transmis le : {formater(x.transmisLe)}</div>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full ${ETATS[x.etat].classes}`}>{ETATS[x.etat].libelle}</span>
                </li>
              ))}
            </ol>
          </td>
        </tr>
      )}
    </>
  );
}

FragmentLigne.propTypes = {
  code: PropTypes.string.isRequired,
  incident: PropTypes.object.isRequired,
  etapes: PropTypes.array.isRequired,
  prochaine: PropTypes.object.isRequired,
  maintenant: PropTypes.instanceOf(Date).isRequired,
  ouvert: PropTypes.bool.isRequired,
  basculer: PropTypes.func.isRequired,
};

SuiviDelais.propTypes = { incidents: PropTypes.object.isRequired };
