// Journal d'activité : historique des déclarations d'incident et du registre (table journal_activite,
// alimentée par la base ; chacun n'y voit que ce à quoi il a accès)
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { messageTechnique } from '../utils/messageTechnique';
import { SECTIONS } from './registre/registreConfig';

const ACTIONS = {
  creation: ['Création', 'bg-indigo-50 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200'],
  modification: ['Modification', 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'],
  validation: ['Validation', 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'],
  reclassement: ['Reclassement', 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'],
  commentaire: ['Commentaire', 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'],
  ajout: ['Ajout', 'bg-indigo-50 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200'],
  suppression: ['Suppression', 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'],
};
const TYPES_RAPPORT = {
  initial_notification: 'Notification initiale',
  intermediate_report: 'Rapport intermédiaire',
  final_report: 'Rapport final',
  'major_incident_reclassified_as_non-major': 'Reclassement en non majeur',
};
const TABLES_REGISTRE = Object.fromEntries([...SECTIONS.map((s) => [s.table, s.title]), ['ri_import_rejets', 'Lignes en attente']]);
const PERIODES = { 7: '7 derniers jours', 30: '30 derniers jours', 90: '90 derniers jours', 0: 'Tout l\'historique' };
const PAR_PAGE = 50;

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
function objetDe(e) {
  return e.partie === 'registre' ? (TABLES_REGISTRE[e.objet] ?? e.objet) : (e.incident || '—');
}
function detailDe(e) {
  if (e.partie === 'registre') {
    const verbe = { ajout: 'ajoutée', modification: 'modifiée', suppression: 'supprimée' }[e.action] ?? '';
    return `${pluriel(e.nb_lignes ?? 0, 'ligne')} ${verbe}${(e.nb_lignes ?? 0) > 1 ? 's' : ''}`;
  }
  const type = TYPES_RAPPORT[e.type_rapport] ?? e.type_rapport ?? '';
  if (e.action === 'commentaire') return `${type} — « ${e.detail ?? ''} »`;
  if (e.action === 'modification' && e.nb_champs != null) return `${type} — ${pluriel(e.nb_champs, 'champ')} modifié${e.nb_champs > 1 ? 's' : ''}`;
  if (e.action === 'creation') return `${type} (brouillon)`;
  return type;
}
const dateHeure = (v) => new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

function exporterCsv(lignes) {
  const champ = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const contenu = [['Date', 'Personne', 'Partie', 'Action', 'Objet', 'Détail'],
    ...lignes.map((e) => [dateHeure(e.cree_le), e.email, e.partie === 'registre' ? 'Registre' : 'Déclarations', ACTIONS[e.action]?.[0] ?? e.action, objetDe(e), detailDe(e)])]
    .map((l) => l.map(champ).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + contenu], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `journal-activite-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

const classeFiltre = 'px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

export default function JournalActivite() {
  const [periode, setPeriode] = useState('30');
  const [entrees, setEntrees] = useState([]);
  const [etat, setEtat] = useState('chargement');
  const [erreur, setErreur] = useState(null);
  const [texte, setTexte] = useState('');
  const [partie, setPartie] = useState('');
  const [action, setAction] = useState('');
  const [nb, setNb] = useState(PAR_PAGE);

  useEffect(() => {
    let annule = false;
    (async () => {
      setEtat('chargement');
      let q = supabase.from('journal_activite').select('*').order('cree_le', { ascending: false }).limit(2000);
      if (Number(periode) > 0) q = q.gte('cree_le', new Date(Date.now() - Number(periode) * 86400000).toISOString());
      const { data, error } = await q;
      if (annule) return;
      if (error) {
        const absent = ['42P01', 'PGRST205'].includes(error.code) || /journal_activite/.test(error.message ?? '');
        setErreur(absent ? "Le journal d'activité n'est pas encore disponible : la migration 20261009000000_journal_activite doit être appliquée sur la base." : messageTechnique(error));
        setEtat('erreur');
        return;
      }
      setEntrees(data ?? []);
      setEtat('pret');
      setNb(PAR_PAGE);
    })();
    return () => { annule = true; };
  }, [periode]);

  const filtrees = useMemo(() => {
    const t = texte.trim().toLowerCase();
    return entrees.filter((e) => (!partie || e.partie === partie) && (!action || e.action === action)
      && (!t || [e.email, objetDe(e), detailDe(e)].some((v) => String(v ?? '').toLowerCase().includes(t))));
  }, [entrees, texte, partie, action]);

  return (
    <section className="rounded-2xl bg-white dark:bg-gray-800/60 shadow overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-7 pt-6 pb-2">
        <div>
          <h3 className="text-lg font-semibold">Journal d&apos;activité</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-2xl">
            Historique des actions sur les déclarations d&apos;incident et le registre d&apos;information, enregistré
            automatiquement par la base de données. Il ne peut être ni modifié ni supprimé depuis l&apos;application.
          </p>
        </div>
        <button type="button" disabled={!filtrees.length} onClick={() => exporterCsv(filtrees)}
          className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm disabled:opacity-50">⬇ Exporter (CSV)</button>
      </div>
      <div className="px-7 pt-3 pb-6">
        <div className="flex flex-wrap gap-3 mb-4">
          <input type="search" value={texte} onChange={(e) => { setTexte(e.target.value); setNb(PAR_PAGE); }} placeholder="🔍 Rechercher un incident, une personne, une table…"
            aria-label="Rechercher dans le journal" className={`${classeFiltre} flex-1 min-w-[14rem]`} />
          <select aria-label="Partie" value={partie} onChange={(e) => { setPartie(e.target.value); setNb(PAR_PAGE); }} className={classeFiltre}>
            <option value="">Déclarations et registre</option>
            <option value="declarations">Déclarations</option>
            <option value="registre">Registre</option>
          </select>
          <select aria-label="Action" value={action} onChange={(e) => { setAction(e.target.value); setNb(PAR_PAGE); }} className={classeFiltre}>
            <option value="">Toutes les actions</option>
            {Object.entries(ACTIONS).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select aria-label="Période" value={periode} onChange={(e) => setPeriode(e.target.value)} className={classeFiltre}>
            {Object.entries(PERIODES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        {etat === 'chargement' && <p className="text-sm text-gray-500 py-6">Chargement du journal…</p>}
        {etat === 'erreur' && <p className="text-sm p-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100">{erreur}</p>}
        {etat === 'pret' && (filtrees.length === 0
          ? <p className="text-sm text-gray-500 py-6">Aucune activité pour ces critères.</p>
          : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      {['Date', 'Personne', 'Partie', 'Action', 'Objet', 'Détail'].map((t) => <th key={t} className="py-2 px-2.5 font-semibold">{t}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filtrees.slice(0, nb).map((e) => (
                      <tr key={e.id} className="border-b border-gray-100 dark:border-gray-700/60 align-top">
                        <td className="py-2.5 px-2.5 whitespace-nowrap">{dateHeure(e.cree_le)}</td>
                        <td className="py-2.5 px-2.5 break-all">{e.email ?? '—'}</td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap text-gray-500 dark:text-gray-400">{e.partie === 'registre' ? 'Registre' : 'Déclarations'}</td>
                        <td className="py-2.5 px-2.5"><span className={`text-xs px-2.5 py-0.5 rounded-full whitespace-nowrap ${ACTIONS[e.action]?.[1] ?? ''}`}>{ACTIONS[e.action]?.[0] ?? e.action}</span></td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap">{objetDe(e)}</td>
                        <td className="py-2.5 px-2.5">{detailDe(e)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between mt-3 text-xs text-gray-500 dark:text-gray-400">
                <span>{pluriel(filtrees.length, 'entrée')}{entrees.length >= 2000 ? ' (2 000 plus récentes)' : ''}</span>
                {nb < filtrees.length && (
                  <button type="button" onClick={() => setNb(nb + PAR_PAGE)} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                    Afficher {Math.min(PAR_PAGE, filtrees.length - nb)} de plus
                  </button>
                )}
              </div>
            </>
          ))}
      </div>
    </section>
  );
}
