// Import d'un classeur Excel dans le registre d'information : lecture, aperçu, écriture, rapport.
import { useState } from 'react';
import PropTypes from 'prop-types';
import { analyserClasseur } from './importAnalyse';
import { importerDonnees } from './importEcriture';
import { messageErreur } from './erreursBase';

// Un registre complet tient en quelques Mo : au-delà, fichier anormal (ou piégé) qui bloquerait le navigateur
const TAILLE_MAX = 20 * 1048576;

const LIBELLES = {
  teneur: ['B_01.01', 'Entité tenant le registre'], entites: ['B_01.02', 'Entités du périmètre'],
  succursales: ['B_01.03', 'Succursales'], prestataires: ['B_05.01', 'Prestataires TIC'], fonctions: ['B_06.01', 'Fonctions'],
  contrats: ['B_02.01', 'Contrats'], services: ['B_02.02', 'Services contractés'], intragroupe: ['B_02.03', 'Accords intra-groupe'],
  signatairesReception: ['B_03.01', 'Signataires (réception)'], signatairesFourniture: ['B_03.03', 'Signataires (fourniture)'],
  sousTraitance: ['B_05.02', 'Sous-traitance (rang 2 et plus)'], evaluations: ['B_07.01', 'Évaluations des services'],
  definitions: ['B_99.01', 'Définitions internes'],
};

export default function ImportExcel({ lectureSeule, onTermine, onOuvrirRapport }) {
  const [fichier, setFichier] = useState(null);
  const [analyse, setAnalyse] = useState(null);
  const [etat, setEtat] = useState('attente'); // attente | lecture | pret | import | fini
  const [etape, setEtape] = useState('');
  const [erreur, setErreur] = useState('');
  const [rapport, setRapport] = useState(null);

  const choisir = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // permet de recharger le même fichier après l'avoir corrigé
    setErreur('');
    setAnalyse(null);
    setRapport(null);
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) {
      setErreur('Format non pris en charge : enregistrez le classeur au format .xlsx (Fichier > Enregistrer sous > Classeur Excel).');
      return;
    }
    if (f.size > TAILLE_MAX) {
      setErreur(`Fichier trop volumineux (${Math.round(f.size / 1048576)} Mo) : la limite est de ${TAILLE_MAX / 1048576} Mo. Supprimez les onglets inutiles ou les mises en forme lourdes.`);
      return;
    }
    setFichier(f);
    setEtat('lecture');
    try {
      const { default: lireClasseur } = await import('read-excel-file/browser');
      const feuilles = await lireClasseur(f);
      const resultat = analyserClasseur(feuilles);
      setAnalyse(resultat);
      setEtat('pret');
    } catch (err) {
      setErreur(`Lecture du fichier impossible : ${err.message}`);
      setEtat('attente');
    }
  };

  const total = analyse ? Object.values(analyse.donnees).reduce((n, l) => n + l.length, 0) : 0;
  const enAttente = (lignes) => lignes.filter((l) => l._motif).length;
  const totalEnAttente = analyse ? Object.values(analyse.donnees).reduce((n, l) => n + enAttente(l), 0) : 0;

  const importer = async () => {
    if (!globalThis.confirm(`Importer ${total} ligne(s) dans le registre ? Les lignes déjà présentes avec la même clé seront mises à jour.`)) return;
    setEtat('import');
    setErreur('');
    try {
      setRapport(await importerDonnees(analyse.donnees, setEtape));
      setEtat('fini');
      onTermine();
    } catch (err) {
      setErreur(`Import interrompu : ${messageErreur(err)}`);
      setEtat('pret');
    }
  };

  const etapes = rapport?.etapes ?? [];
  const erreursImport = etapes.reduce((n, e) => n + e.erreurs.length, 0);
  // Le rattachement aux entreprises mères complète des lignes déjà comptées : il n'entre pas dans le total
  const ecrits = etapes.filter((e) => !e.complement).reduce((n, e) => n + e.ecrits, 0);

  return (
    <div>
      <h3 className="text-xl font-semibold">Importer un fichier Excel</h3>
      <p className="text-sm opacity-80 mt-1 mb-4">
        Reprend un registre tenu sous Excel : modèle d'illustration de l'EBA (onglets RT.01.01 à RT.99.01) ou modèle
        EBA (onglets B_01.01 à B_99.01), au format .xlsx. Les lignes existantes avec la même clé (LEI, référence de
        contrat, identifiant de fonction…) sont mises à jour ; rien n'est supprimé.
      </p>

      {lectureSeule ? (
        <p className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-sm">L'import est réservé aux gestionnaires du registre.</p>
      ) : (
        <div className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <label htmlFor="import-fichier" className="text-sm font-medium">Fichier Excel (.xlsx)</label>
          <input id="import-fichier" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={choisir} disabled={etat === 'lecture' || etat === 'import'} className="block mt-2 text-sm" />
          {etat === 'lecture' && <p className="text-sm opacity-70 mt-2">Lecture de {fichier?.name}…</p>}
        </div>
      )}

      {erreur && <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">{erreur}</div>}

      {analyse && etat !== 'fini' && (
        <div className="mt-6">
          <p className="text-sm"><span className="font-medium">Format reconnu :</span> {analyse.format}</p>
          {total === 0 ? (
            <p className="mt-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 text-sm">
              Aucune ligne exploitable. Vérifiez que les onglets s'appellent RT.01.01, B_01.01… et contiennent la ligne des
              codes de colonnes (ex. RT.01.01.0010).
            </p>
          ) : (
            <table className="mt-3 text-sm">
              <thead><tr className="text-left border-b dark:border-gray-700"><th className="pr-6 py-1">Tableau</th><th className="text-right">Lignes lues</th><th className="text-right pl-6">dont à corriger</th></tr></thead>
              <tbody>
                {Object.entries(analyse.donnees).map(([cle, lignes]) => (
                  <tr key={cle}><td className="pr-6 py-0.5">{LIBELLES[cle][0]} – {LIBELLES[cle][1]}</td><td className="text-right">{lignes.length}</td>
                    <td className={`text-right pl-6 ${enAttente(lignes) ? 'text-orange-700 dark:text-orange-300 font-medium' : 'opacity-50'}`}>{enAttente(lignes) || '—'}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {analyse.ignores.map((m) => <p key={m} className="text-xs opacity-70 mt-2">{m}</p>)}

          {analyse.erreurs.length > 0 && (
            <div className="mt-4">
              <p className="font-medium text-sm text-red-700 dark:text-red-300">
                {analyse.erreurs.length} problème(s) dans le fichier. Rien n'est perdu : les lignes concernées seront mises
                en attente et signalées comme anomalies bloquantes, à compléter dans l'application. Vous pouvez aussi les
                corriger dans Excel et recharger le fichier.
              </p>
              <div className="mt-2 max-h-64 overflow-y-auto border dark:border-gray-700 rounded-lg">
                <table className="w-full text-xs">
                  <thead><tr className="text-left border-b dark:border-gray-700"><th className="p-2">Onglet</th><th className="p-2">Ligne</th><th className="p-2">Problème</th></tr></thead>
                  <tbody>
                    {analyse.erreurs.map((e) => (
                      <tr key={`${e.onglet}|${e.ligne}|${e.colonne}|${e.message}`} className="border-b dark:border-gray-800">
                        <td className="p-2">{e.onglet}</td><td className="p-2">{e.ligne ?? '—'}</td>
                        <td className="p-2">{e.message}{e.colonne && <span className="block opacity-50">Colonne {e.colonne}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {total > 0 && (
            <div className="mt-4 flex justify-end">
              <button onClick={importer} disabled={etat === 'import'}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50">
                {etat === 'import' ? `Import en cours… ${etape}` : `Importer ${total} ligne(s)${totalEnAttente ? ` (dont ${totalEnAttente} à corriger)` : ''}`}
              </button>
            </div>
          )}
        </div>
      )}

      {rapport && (
        <div className="mt-6">
          {rapport.attente.erreur && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">{rapport.attente.erreur}</div>
          )}
          <div className={`p-3 rounded-lg text-sm ${erreursImport ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200' : 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200'}`}>
            <p className="font-medium">
              Import terminé : {ecrits} ligne(s) enregistrée(s) dans le registre
              {!rapport.attente.erreur && rapport.attente.nombre > 0 && `, ${rapport.attente.nombre} ligne(s) en attente de correction`}.
            </p>
            <p className="mt-1">
              {!rapport.attente.erreur && rapport.attente.nombre > 0
                ? "Les lignes en attente figurent en tête du rapport d'anomalies : ouvrez-les pour les compléter, elles rejoindront alors le registre."
                : "Lancez ensuite le rapport d'anomalies pour vérifier la cohérence d'ensemble du registre."}
            </p>
            <button onClick={onOuvrirRapport} className="mt-2 px-3 py-1 rounded-lg bg-white/70 dark:bg-gray-800 hover:bg-white">
              Ouvrir le rapport d'anomalies
            </button>
          </div>
          <table className="mt-4 w-full text-sm">
            <thead><tr className="text-left border-b dark:border-gray-700"><th className="py-1">Tableau</th><th className="text-right">Lues</th><th className="text-right">Enregistrées</th><th className="text-right pr-2">En attente</th></tr></thead>
            <tbody>
              {etapes.map((e) => (
                <tr key={e.libelle} className="border-b dark:border-gray-800">
                  <td className={`py-1 ${e.complement ? 'pl-4 opacity-70' : ''}`}>{e.libelle}</td><td className="text-right">{e.lus}</td><td className="text-right">{e.ecrits}</td>
                  <td className={`text-right pr-2 ${e.erreurs.length ? 'text-orange-700 dark:text-orange-300 font-medium' : ''}`}>{e.erreurs.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {erreursImport > 0 && (
            <div className="mt-4 max-h-64 overflow-y-auto border dark:border-gray-700 rounded-lg">
              <table className="w-full text-xs">
                <thead><tr className="text-left border-b dark:border-gray-700"><th className="p-2">Tableau</th><th className="p-2">Ligne</th><th className="p-2">À corriger</th></tr></thead>
                <tbody>
                  {etapes.flatMap((e) => e.erreurs.map((x) => (
                    <tr key={`${e.libelle}|${x.reference}|${x.message}`} className="border-b dark:border-gray-800">
                      <td className="p-2">{e.libelle}</td><td className="p-2 break-all">{x.reference}</td><td className="p-2">{x.message}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

ImportExcel.propTypes = {
  lectureSeule: PropTypes.bool.isRequired,
  onTermine: PropTypes.func.isRequired,
  onOuvrirRapport: PropTypes.func.isRequired,
};
