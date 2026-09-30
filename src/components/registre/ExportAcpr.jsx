// Écran d'export du registre au format de remise EBA « plain-csv » (fichier ZIP à déposer auprès de l'ACPR).
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { strToU8, zipSync } from 'fflate';
import { supabase } from '../../supabaseClient';
import { construirePaquet, MODELES } from './paquetEba';
import { messageErreur } from './erreursBase';

const TABLES = {
  teneur: 'ri_teneur_registre', entites: 'ri_entites', succursales: 'ri_succursales',
  prestataires: 'ri_prestataires', fonctions: 'ri_fonctions', contrats: 'ri_contrats',
  services: 'ri_contrats_services', intragroupe: 'ri_accords_intragroupe',
  signatairesReception: 'ri_signataires_reception', signatairesFourniture: 'ri_signataires_fourniture',
  sousTraitance: 'ri_sous_traitance', evaluations: 'ri_evaluations', definitions: 'ri_definitions',
};

const inputClasses = 'mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full';
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const finAnneePrecedente = () => `${new Date().getFullYear() - 1}-12-31`;

async function chargerRegistre() {
  const entrees = await Promise.all(
    Object.entries(TABLES).map(async ([cle, table]) => {
      const { data, error } = await supabase.from(table).select('*');
      if (error) throw error;
      return [cle, data];
    }),
  );
  return Object.fromEntries(entrees);
}

function telecharger(nom, octets) {
  const url = URL.createObjectURL(new Blob([octets], { type: 'application/zip' }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = `${nom}.zip`;
  lien.click();
  URL.revokeObjectURL(url);
}

export default function ExportAcpr({ onOuvrirRapport }) {
  const [parametres, setParametres] = useState({
    dateArrete: finAnneePrecedente(),
    dateCommunication: aujourdhui(),
    perimetre: 'IND',
    paysAutorite: 'FR',
  });
  const [teneur, setTeneur] = useState(undefined); // undefined = chargement, null = absente
  const [bloquants, setBloquants] = useState(null);
  const [malgreAnomalies, setMalgreAnomalies] = useState(false);
  const [erreur, setErreur] = useState('');
  const [resultat, setResultat] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    (async () => {
      const [t, a] = await Promise.all([
        supabase.from('ri_teneur_registre').select('*').maybeSingle(),
        supabase.rpc('ri_anomalies'),
      ]);
      if (t.error) {
        setErreur(messageErreur(t.error));
        setTeneur(null);
        return;
      }
      setTeneur(t.data);
      if (t.data?.pays) setParametres((p) => ({ ...p, paysAutorite: t.data.pays }));
      // Rapport indisponible (migration non appliquée) : on n'empêche pas l'export
      setBloquants(a.error ? null : a.data.filter((x) => x.gravite === 'bloquant').length);
    })();
  }, []);

  const modifier = (cle) => (e) => setParametres((p) => ({ ...p, [cle]: e.target.value }));

  const exporter = async () => {
    setErreur('');
    setResultat(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parametres.dateArrete) || !/^[A-Z]{2}$/.test(parametres.paysAutorite)) {
      setErreur("Vérifiez la date d'arrêté et le code pays de l'autorité (2 lettres, ex. FR).");
      return;
    }
    setEnCours(true);
    try {
      const donnees = await chargerRegistre();
      const entiteDeclarante = donnees.entites.find((e) => e.lei === teneur.lei);
      const paquet = construirePaquet(donnees, {
        ...parametres,
        leiDeclarant: teneur.lei,
        monnaie: entiteDeclarante?.monnaie || 'EUR',
        creation: new Date(),
      });
      const octets = zipSync(
        Object.fromEntries(Object.entries(paquet.fichiers).map(([chemin, contenu]) => [chemin, strToU8(contenu)])),
        { level: 6 },
      );
      telecharger(paquet.nom, octets);
      setResultat(paquet);
    } catch (e) {
      setErreur(`Export impossible : ${e.code ? messageErreur(e) : e.message}`);
    } finally {
      setEnCours(false);
    }
  };

  const bloque = bloquants > 0 && !malgreAnomalies;

  return (
    <div>
      <h3 className="text-xl font-semibold">Exporter pour l'ACPR</h3>
      <p className="text-sm opacity-80 mt-1 mb-4">
        Génère le fichier ZIP de remise au format EBA « plain-csv » (taxonomie DPM 4.0) : un fichier CSV par
        modèle B_01.01 à B_99.01, avec les codes EBA et les fichiers techniques attendus par les autorités.
      </p>

      {teneur === undefined && <p className="text-sm opacity-70">Chargement…</p>}

      {teneur === null && !erreur && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
          Renseignez d'abord l'« Entité tenant le registre » (B_01.01) : son LEI identifie le déclarant dans le fichier.
        </div>
      )}

      {teneur && (
        <>
          {bloquants > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 text-sm">
              <p className="font-medium">
                Le registre contient {bloquants} anomalie(s) bloquante(s) : la remise risque d'être rejetée ou
                signalée par l'autorité.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <button onClick={onOuvrirRapport} className="px-3 py-1 rounded-lg bg-white/70 dark:bg-gray-800 hover:bg-white">
                  Voir le rapport d'anomalies
                </button>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={malgreAnomalies} onChange={(e) => setMalgreAnomalies(e.target.checked)} />
                  Exporter quand même (fichier de test)
                </label>
              </div>
            </div>
          )}
          {bloquants === 0 && (
            <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-sm">
              Aucune anomalie bloquante. Pensez à vérifier aussi les LEI auprès du GLEIF depuis le rapport d'anomalies.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div>
              <label htmlFor="exp-lei" className="text-sm font-medium">Déclarant (LEI de l'entité tenant le registre)</label>
              <input id="exp-lei" value={`${teneur.lei} – ${teneur.nom}`} disabled className={`${inputClasses} opacity-70`} />
            </div>
            <div>
              <label htmlFor="exp-perimetre" className="text-sm font-medium">Niveau du registre</label>
              <select id="exp-perimetre" value={parametres.perimetre} onChange={modifier('perimetre')} className={inputClasses}>
                <option value="IND">Individuel (entité seule) — IND</option>
                <option value="CON">Consolidé ou sous-consolidé (groupe) — CON</option>
              </select>
            </div>
            <div>
              <label htmlFor="exp-arrete" className="text-sm font-medium">Date d'arrêté (date de référence)</label>
              <input id="exp-arrete" type="date" value={parametres.dateArrete} onChange={modifier('dateArrete')} className={inputClasses} />
              <p className="text-xs opacity-60 mt-1">Date de référence demandée par l'autorité pour la campagne (ex. 31/12 de l'année écoulée).</p>
            </div>
            <div>
              <label htmlFor="exp-communication" className="text-sm font-medium">Date de communication (B_01.01.0060)</label>
              <input id="exp-communication" type="date" value={parametres.dateCommunication} onChange={modifier('dateCommunication')} className={inputClasses} />
            </div>
            <div>
              <label htmlFor="exp-pays" className="text-sm font-medium">Pays de l'autorité compétente</label>
              <input id="exp-pays" value={parametres.paysAutorite} maxLength={2}
                onChange={(e) => setParametres((p) => ({ ...p, paysAutorite: e.target.value.toUpperCase() }))} className={inputClasses} />
              <p className="text-xs opacity-60 mt-1">Code à 2 lettres utilisé dans le nom du fichier (FR pour l'ACPR).</p>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button onClick={exporter} disabled={enCours || bloque}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {enCours ? 'Génération…' : 'Générer le fichier de remise'}
            </button>
          </div>
        </>
      )}

      {erreur && (
        <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">{erreur}</div>
      )}

      {resultat && (
        <div className="mt-6 p-4 rounded-xl border dark:border-gray-700">
          <p className="font-medium">Fichier généré et téléchargé :</p>
          <p className="text-xs break-all mt-1 font-mono">{resultat.nom}.zip</p>
          <table className="mt-3 text-sm">
            <tbody>
              {MODELES.map((m) => (
                <tr key={m}>
                  <td className="pr-6 py-0.5">{m}</td>
                  <td className="text-right">{resultat.lignes[m]} ligne(s)</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs opacity-70 mt-3">
            Les modèles vides sont déclarés quand même, comme l'exige l'EBA. Déposez le fichier ZIP tel quel, sans le
            renommer ni le décompresser.
          </p>
        </div>
      )}
    </div>
  );
}

ExportAcpr.propTypes = {
  onOuvrirRapport: PropTypes.func.isRequired,
};
