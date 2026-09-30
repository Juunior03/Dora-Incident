// Rapport d'anomalies du registre d'information : règles de la base (ri_anomalies)
// et vérification des LEI auprès du GLEIF.
import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../supabaseClient';
import { anomaliesGleif, collecterLei, interrogerGleif } from './gleif';

const GRAVITES = {
  bloquant: { label: 'Bloquant', classes: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
  avertissement: { label: 'Avertissement', classes: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200' },
  information: { label: 'Information', classes: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' },
};
const ORDRE = { bloquant: 1, avertissement: 2, information: 3 };

function messageErreurRapport(error) {
  const texte = `${error.message || ''} ${error.details || ''}`;
  if (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(texte)) {
    return "Le rapport n'est pas encore installé dans la base : appliquez la migration 20261001000000_rapport_anomalies.sql.";
  }
  if (error.code === 'PGRST205' || /could not find the table/i.test(texte)) {
    return "Le registre n'est pas encore installé dans la base : appliquez la migration 20260930000000_registre_information.sql.";
  }
  return error.message;
}

export default function RapportAnomalies({ onNaviguer }) {
  const [anomaliesBase, setAnomaliesBase] = useState([]);
  const [anomaliesLei, setAnomaliesLei] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [filtre, setFiltre] = useState('');
  const [gleif, setGleif] = useState({ etat: 'jamais' }); // jamais | encours | fait | erreur

  const analyser = useCallback(async () => {
    setChargement(true);
    setErreur('');
    const { data, error } = await supabase.rpc('ri_anomalies');
    if (error) {
      setErreur(messageErreurRapport(error));
      setAnomaliesBase([]);
    } else {
      setAnomaliesBase(data || []);
    }
    setChargement(false);
  }, []);

  useEffect(() => {
    analyser();
  }, [analyser]);

  const verifierGleif = async () => {
    setGleif({ etat: 'encours' });
    try {
      const refs = await collecterLei();
      const trouves = await interrogerGleif(refs.map((r) => r.lei));
      setAnomaliesLei(anomaliesGleif(refs, trouves));
      setGleif({ etat: 'fait', nombre: new Set(refs.map((r) => r.lei)).size, date: new Date() });
    } catch (e) {
      setAnomaliesLei([]);
      setGleif({
        etat: 'erreur',
        message: e instanceof TypeError
          ? "Le GLEIF n'est pas joignable depuis ce poste (réseau ou pare-feu de l'entreprise ?). Les LEI n'ont pas été vérifiés."
          : `Vérification impossible : ${e.message}`,
      });
    }
  };

  const toutes = useMemo(
    () => [...anomaliesBase, ...anomaliesLei].sort((a, b) => ORDRE[a.gravite] - ORDRE[b.gravite]),
    [anomaliesBase, anomaliesLei],
  );
  const compteurs = useMemo(
    () => Object.fromEntries(Object.keys(GRAVITES).map((g) => [g, toutes.filter((a) => a.gravite === g).length])),
    [toutes],
  );
  const affichees = filtre ? toutes.filter((a) => a.gravite === filtre) : toutes;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-xl font-semibold">Rapport d'anomalies</h3>
          <p className="text-sm opacity-80 mt-1">
            Contrôles du règlement 2024/2956 et des règles de validation de l'EBA qui portent sur
            plusieurs tableaux. Les contrôles de format sont déjà appliqués à la saisie.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={analyser} disabled={chargement} className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50">
            {chargement ? 'Analyse…' : 'Relancer l’analyse'}
          </button>
          <button onClick={verifierGleif} disabled={gleif.etat === 'encours'} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 transition-colors disabled:opacity-50">
            {gleif.etat === 'encours' ? 'Vérification…' : 'Vérifier les LEI (GLEIF)'}
          </button>
        </div>
      </div>

      {erreur && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">{erreur}</div>
      )}
      {gleif.etat === 'erreur' && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-sm">{gleif.message}</div>
      )}
      {gleif.etat === 'fait' && (
        <p className="mb-4 text-xs opacity-70">
          {gleif.nombre} LEI vérifiés auprès du GLEIF le {gleif.date.toLocaleString('fr-FR')}.
        </p>
      )}

      {!chargement && !erreur && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => setFiltre('')} className={`px-3 py-1 rounded-full text-sm ${filtre === '' ? 'ring-2 ring-indigo-500' : ''} bg-gray-100 dark:bg-gray-800`}>
            Toutes ({toutes.length})
          </button>
          {Object.entries(GRAVITES).map(([cle, g]) => (
            <button key={cle} onClick={() => setFiltre(cle)} className={`px-3 py-1 rounded-full text-sm ${g.classes} ${filtre === cle ? 'ring-2 ring-indigo-500' : ''}`}>
              {g.label} ({compteurs[cle]})
            </button>
          ))}
        </div>
      )}

      {chargement ? (
        <p className="text-sm opacity-70">Analyse du registre…</p>
      ) : !erreur && toutes.length === 0 ? (
        <p className="p-4 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-sm">
          Aucune anomalie détectée.{gleif.etat !== 'fait' && ' Pensez à vérifier aussi les LEI auprès du GLEIF.'}
        </p>
      ) : !erreur && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b dark:border-gray-700">
                <th className="py-2 pr-4 font-medium">Gravité</th>
                <th className="py-2 pr-4 font-medium">Colonne</th>
                <th className="py-2 pr-4 font-medium">Référence</th>
                <th className="py-2 pr-4 font-medium">Anomalie</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {affichees.map((a) => (
                <tr key={`${a.source || 'base'}|${a.modele}|${a.colonne}|${a.reference}|${a.message}`} className="border-b dark:border-gray-800 align-top">
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${GRAVITES[a.gravite].classes}`}>{GRAVITES[a.gravite].label}</span>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap text-xs">
                    {a.modele}{a.colonne && !a.colonne.startsWith('B_') ? `.${a.colonne}` : ''}
                    {a.source && <span className="block opacity-60">{a.source}</span>}
                  </td>
                  <td className="py-2 pr-4 text-xs break-all">{a.reference || '—'}</td>
                  <td className="py-2 pr-4">{a.message}</td>
                  <td className="py-2 text-right">
                    {a.section && (
                      <button onClick={() => onNaviguer(a.section)} className="px-3 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                        Aller au tableau
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

RapportAnomalies.propTypes = {
  onNaviguer: PropTypes.func.isRequired,
};
