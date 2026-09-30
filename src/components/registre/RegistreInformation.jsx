// Registre d'information DORA : consultation et saisie des modèles B_01.01 à B_99.01
import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../supabaseClient';
import { SECTIONS } from './registreConfig';
import { messageErreur } from './erreursBase';
import RapportAnomalies from './RapportAnomalies';
import ExportAcpr from './ExportAcpr';
import ImportExcel from './ImportExcel';

const RAPPORT = 'anomalies';
const EXPORT = 'export';
const IMPORT = 'import';

const inputClasses = 'mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full disabled:opacity-60';

// Valeur stockée -> valeur de formulaire
function versFormulaire(field, value) {
  if (value === null || value === undefined) return '';
  if (field.type === 'countries') return Array.isArray(value) ? value.join(', ') : '';
  if (field.type === 'bool' || field.type === 'boolRequired') return value ? 'true' : 'false';
  return String(value);
}

// Valeur de formulaire -> valeur stockée
function versBase(field, raw) {
  const value = typeof raw === 'string' ? raw.trim() : raw;
  if (value === '' || value === undefined) return null;
  switch (field.type) {
    case 'number':
      return Number(value);
    case 'select':
      return typeof field.options?.[0]?.value === 'number' ? Number(value) : value;
    case 'bool':
    case 'boolRequired':
      return value === 'true';
    case 'countries': {
      const codes = value.split(/[\s,;]+/).filter(Boolean).map((c) => c.toUpperCase());
      return codes.length ? codes : null;
    }
    default:
      return field.upper ? value.toUpperCase() : value;
  }
}

function formulaireVide(section) {
  return Object.fromEntries(
    section.fields.map((f) => [f.name, f.default === undefined ? '' : String(f.default)]),
  );
}

function Champ({ field, value, onChange, disabled, fkOptions }) {
  const id = `ri-${field.name}`;
  let control;
  if (field.type === 'select' || field.type === 'fk' || field.type === 'bool' || field.type === 'boolRequired') {
    let options = field.options || [];
    if (field.type === 'fk') options = fkOptions || [];
    if (field.type === 'bool' || field.type === 'boolRequired') {
      options = [{ value: 'true', label: 'Oui' }, { value: 'false', label: 'Non' }];
    }
    const toutes = field.groups ? field.groups.flatMap((g) => g.options) : options;
    // Valeur déjà enregistrée mais absente de la liste (ex. saisie libre antérieure) : on la garde visible
    const horsListe = value !== '' && !toutes.some((o) => String(o.value) === value);
    control = (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClasses} disabled={disabled}>
        <option value="">{field.required ? 'Choisir…' : '—'}</option>
        {horsListe && <option value={value}>{value} (valeur hors liste, à remplacer)</option>}
        {field.groups
          ? field.groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
          ))
          : options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
          ))}
      </select>
    );
  } else if (field.type === 'textarea') {
    control = (
      <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={2}
        maxLength={field.maxLength} className={inputClasses} disabled={disabled} />
    );
  } else {
    const listId = field.suggestions ? `${id}-suggestions` : undefined;
    control = (
      <>
        <input id={id} list={listId} value={value} onChange={(e) => onChange(e.target.value)}
          type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
          step={field.type === 'number' ? 'any' : undefined}
          className={inputClasses} disabled={disabled} />
        {field.suggestions && (
          <datalist id={listId}>
            {field.suggestions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </datalist>
        )}
      </>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {field.label}{field.required && <span className="text-red-600"> *</span>}
        <span className="ml-2 text-xs opacity-50">{field.code}</span>
      </label>
      {control}
      {field.help && <p className="text-xs opacity-60 mt-1">{field.help}</p>}
    </div>
  );
}

Champ.propTypes = {
  field: PropTypes.object.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  fkOptions: PropTypes.array,
};

// Retrouve la ligne visée par une anomalie du rapport, ou prépare la ligne manquante.
// Les références suivent le format de ri_anomalies() : « contrat / code prestataire / … / type ».
function cibleAnomalie(sectionKey, anomalie, lignes, fkOptions) {
  const ref = anomalie?.reference;
  if (!anomalie) return {};
  const parts = ref ? ref.split(' / ') : [];
  const idPrestataire = (code) =>
    (fkOptions.prestataire_id || []).find((o) => o.row?.code === code)?.value;
  const trouver = (predicat) => lignes.find(predicat) ?? null;

  switch (sectionKey) {
    case 'teneur':
      return { ligne: lignes[0] ?? null };
    case 'entites':
      return { ligne: trouver((l) => l.lei === ref) };
    case 'prestataires':
      return { ligne: trouver((l) => l.code === ref) };
    case 'fonctions':
      return { ligne: trouver((l) => l.identifiant === ref) };
    case 'contrats':
      return { ligne: trouver((l) => l.reference === ref) };
    case 'services': {
      if (parts.length <= 1) return { ligne: null, prefill: ref ? { reference_contrat: ref } : null };
      const [contrat, code] = parts;
      const type = parts.at(-1);
      const fonction = parts.length === 4 ? parts[2] : null;
      const id = idPrestataire(code);
      return {
        ligne: trouver((l) => l.reference_contrat === contrat && l.prestataire_id === id
          && l.type_service === type && (!fonction || l.fonction_id === fonction)),
      };
    }
    case 'evaluations': {
      const [contrat, code, type] = parts;
      const id = idPrestataire(code);
      return {
        ligne: trouver((l) => l.reference_contrat === contrat && l.prestataire_id === id && l.type_service === type),
        prefill: { reference_contrat: contrat, prestataire_id: id, type_service: type },
      };
    }
    case 'sous_traitance': {
      const [contrat, type] = parts;
      return { ligne: trouver((l) => l.reference_contrat === contrat && l.type_service === type) };
    }
    case 'signataires_reception':
    case 'signataires_fourniture':
      return { ligne: null, prefill: ref ? { reference_contrat: ref } : null };
    default:
      return {};
  }
}

function EditeurSection({ section, lectureSeule, onChangement, anomalie, onRetourRapport }) {
  const [lignes, setLignes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [fkOptions, setFkOptions] = useState({});
  const [edition, setEdition] = useState(null); // { original: ligne|null, valeurs }
  const [enregistrement, setEnregistrement] = useState(false);

  const champsFk = useMemo(() => section.fields.filter((f) => f.type === 'fk'), [section]);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur('');
    const { data, error } = await supabase.from(section.table).select('*');
    if (error) {
      setErreur(messageErreur(error));
      setLignes([]);
    } else {
      setLignes(data);
    }

    const options = {};
    for (const f of champsFk) {
      const res = await supabase.from(f.fk.table).select('*');
      options[f.name] = (res.data || []).map((r) => ({ value: r[f.fk.value], label: f.fk.label(r), row: r }));
    }
    setFkOptions(options);
    setChargement(false);
  }, [section, champsFk]);

  useEffect(() => {
    setEdition(null);
    charger();
  }, [charger]);

  const cible = useMemo(
    () => (chargement ? {} : cibleAnomalie(section.key, anomalie, lignes, fkOptions)),
    [chargement, section.key, anomalie, lignes, fkOptions],
  );
  const [anomalieOuverte, setAnomalieOuverte] = useState(null);
  useEffect(() => {
    if (!anomalie || chargement || anomalieOuverte === anomalie) return;
    setAnomalieOuverte(anomalie);
    if (cible.ligne) ouvrir(cible.ligne);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anomalie, chargement, cible]);

  const ouvrirLigneManquante = () => {
    setErreur('');
    const valeurs = formulaireVide(section);
    for (const [cle, valeur] of Object.entries(cible.prefill || {})) {
      if (valeur !== undefined && valeur !== null) valeurs[cle] = String(valeur);
    }
    setEdition({ original: null, valeurs });
  };

  const libelle = (field, value) => {
    if (value === null || value === undefined || value === '') return '—';
    if (field.type === 'fk') return fkOptions[field.name]?.find((o) => o.value === value)?.label ?? value;
    if (field.type === 'select') {
      const toutes = field.groups ? field.groups.flatMap((g) => g.options) : field.options;
      return toutes.find((o) => o.value === value)?.label ?? value;
    }
    if (field.type === 'bool' || field.type === 'boolRequired') return value ? 'Oui' : 'Non';
    if (field.type === 'countries') return value.join(', ');
    return String(value);
  };

  const ouvrir = (ligne) => {
    setErreur('');
    setEdition({
      original: ligne,
      valeurs: ligne
        ? Object.fromEntries(section.fields.map((f) => [f.name, versFormulaire(f, ligne[f.name])]))
        : formulaireVide(section),
    });
  };

  const enregistrer = async () => {
    const manquants = section.fields.filter((f) => f.required && !String(edition.valeurs[f.name] ?? '').trim());
    if (manquants.length) {
      setErreur(`Champs obligatoires manquants : ${manquants.map((f) => f.label).join(', ')}.`);
      return;
    }
    const payload = Object.fromEntries(section.fields.map((f) => [f.name, versBase(f, edition.valeurs[f.name])]));

    setEnregistrement(true);
    let requete;
    if (edition.original) {
      requete = supabase.from(section.table).update(payload);
      for (const col of section.pk) requete = requete.eq(col, edition.original[col]);
    } else {
      requete = supabase.from(section.table).insert(payload);
    }
    const { error } = await requete;
    setEnregistrement(false);

    if (error) {
      setErreur(messageErreur(error));
      return;
    }
    setEdition(null);
    await charger();
    onChangement();
  };

  const supprimer = async (ligne) => {
    if (!globalThis.confirm('Supprimer cette ligne du registre ?')) return;
    let requete = supabase.from(section.table).delete();
    for (const col of section.pk) requete = requete.eq(col, ligne[col]);
    const { error } = await requete;
    if (error) {
      setErreur(messageErreur(error));
      return;
    }
    await charger();
    onChangement();
  };

  const colonnes = section.fields.filter((f) => f.list);
  const peutAjouter = !lectureSeule && !(section.single && lignes.length > 0);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-xl font-semibold">{section.title}</h3>
          <p className="text-xs opacity-60">Modèle {section.code}</p>
          {section.intro && <p className="text-sm opacity-80 mt-1">{section.intro}</p>}
        </div>
        {peutAjouter && !edition && (
          <button onClick={() => ouvrir(null)} className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
            Ajouter
          </button>
        )}
      </div>

      {anomalie && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-100 text-sm flex justify-between items-start gap-4">
          <div>
            <p className="font-medium">
              Anomalie à corriger — {anomalie.modele}{anomalie.colonne && !anomalie.colonne.startsWith('B_') ? `.${anomalie.colonne}` : ''}
              {anomalie.reference && <span className="font-normal"> · {anomalie.reference}</span>}
            </p>
            <p className="mt-1">{anomalie.message}</p>
            {!chargement && !cible.ligne && !cible.prefill && !lectureSeule && (
              <p className="mt-1 opacity-80">Utilisez « Ajouter » pour créer la ligne manquante.</p>
            )}
            {!chargement && cible.ligne && (
              <p className="mt-1 opacity-80">La ligne concernée est ouverte ci-dessous.</p>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {!lectureSeule && !chargement && !cible.ligne && cible.prefill && !edition && (
              <button onClick={ouvrirLigneManquante} className="px-3 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                Ajouter la ligne manquante
              </button>
            )}
            <button onClick={onRetourRapport} className="px-3 py-1 rounded-lg bg-white/70 dark:bg-gray-800 hover:bg-white">
              Retour au rapport
            </button>
          </div>
        </div>
      )}

      {erreur && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">{erreur}</div>
      )}

      {edition && (
        <div className="mb-6 p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h4 className="font-medium mb-3">{edition.original ? 'Modifier la ligne' : 'Nouvelle ligne'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {section.fields.map((f) => (
              <Champ
                key={f.name}
                field={f}
                value={edition.valeurs[f.name] ?? ''}
                onChange={(v) => setEdition((e) => ({ ...e, valeurs: { ...e.valeurs, [f.name]: v } }))}
                disabled={lectureSeule}
                fkOptions={fkOptions[f.name]}
              />
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => { setEdition(null); setErreur(''); }} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 transition-colors">
              {lectureSeule ? 'Fermer' : 'Annuler'}
            </button>
            {!lectureSeule && (
              <button onClick={enregistrer} disabled={enregistrement} className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50">
                {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            )}
          </div>
        </div>
      )}

      {chargement ? (
        <p className="text-sm opacity-70">Chargement…</p>
      ) : lignes.length === 0 ? (
        <p className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm">Aucune ligne pour le moment.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b dark:border-gray-700">
                {colonnes.map((f) => <th key={f.name} className="py-2 pr-4 font-medium">{f.label}</th>)}
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne) => (
                <tr key={section.pk.map((c) => ligne[c]).join('|')} className="border-b dark:border-gray-800 align-top">
                  {colonnes.map((f) => <td key={f.name} className="py-2 pr-4">{libelle(f, ligne[f.name])}</td>)}
                  <td className="py-2 whitespace-nowrap text-right">
                    <button onClick={() => ouvrir(ligne)} className="px-3 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 mr-2">
                      {lectureSeule ? 'Voir' : 'Modifier'}
                    </button>
                    {!lectureSeule && (
                      <button onClick={() => supprimer(ligne)} className="px-3 py-1 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                        Supprimer
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

EditeurSection.propTypes = {
  section: PropTypes.object.isRequired,
  lectureSeule: PropTypes.bool.isRequired,
  onChangement: PropTypes.func.isRequired,
  anomalie: PropTypes.object,
  onRetourRapport: PropTypes.func,
};

export default function RegistreInformation({ role }) {
  const [active, setActive] = useState(SECTIONS[0].key);
  const [compteurs, setCompteurs] = useState({});
  const [anomalieCible, setAnomalieCible] = useState(null);
  const lectureSeule = role !== 'saisisseur';

  const ouvrirSection = (cle, anomalie = null) => {
    setAnomalieCible(anomalie);
    setActive(cle);
  };

  const chargerCompteurs = useCallback(async () => {
    const resultats = await Promise.all(
      SECTIONS.map((s) => supabase.from(s.table).select('*', { count: 'exact', head: true })),
    );
    setCompteurs(Object.fromEntries(SECTIONS.map((s, i) => [s.key, resultats[i].count ?? null])));
  }, []);

  useEffect(() => {
    chargerCompteurs();
  }, [chargerCompteurs]);

  const section = SECTIONS.find((s) => s.key === active);

  return (
    <div className="grid grid-cols-12 gap-6">
      <aside className="col-span-3">
        <div className="p-4 rounded-2xl bg-white/80 dark:bg-white/5 shadow sticky top-6">
          <h3 className="font-medium mb-1">Registre d'information</h3>
          <p className="text-xs opacity-60 mb-4">Règlement d'exécution (UE) 2024/2956</p>
          <button
            type="button"
            onClick={() => ouvrirSection(RAPPORT)}
            className={`w-full text-left px-3 py-2 mb-3 rounded-lg text-sm font-medium transition-colors ${
              active === RAPPORT ? 'bg-indigo-600 text-white' : 'bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100'
            }`}
          >
            Rapport d'anomalies
          </button>
          <button
            type="button"
            onClick={() => ouvrirSection(EXPORT)}
            className={`w-full text-left px-3 py-2 mb-3 rounded-lg text-sm font-medium transition-colors ${
              active === EXPORT ? 'bg-indigo-600 text-white' : 'bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100'
            }`}
          >
            Exporter pour l'ACPR
          </button>
          <button
            type="button"
            onClick={() => ouvrirSection(IMPORT)}
            className={`w-full text-left px-3 py-2 mb-3 rounded-lg text-sm font-medium transition-colors ${
              active === IMPORT ? 'bg-indigo-600 text-white' : 'bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100'
            }`}
          >
            Importer un fichier Excel
          </button>
          <ul className="space-y-1 list-none p-0 m-0">
            {SECTIONS.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => ouvrirSection(s.key)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between gap-2 transition-colors ${
                    active === s.key ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-gray-100/50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <span>
                    <span className="block">{s.title}</span>
                    <span className="block text-xs opacity-50">{s.code}</span>
                  </span>
                  {compteurs[s.key] !== undefined && compteurs[s.key] !== null && (
                    <span className="text-xs opacity-60 self-center">{compteurs[s.key]}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {lectureSeule && (
            <p className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs">
              Consultation seule : la saisie du registre est réservée au rôle saisisseur.
            </p>
          )}
        </div>
      </aside>

      <section className="col-span-9 p-6 rounded-2xl bg-white/90 dark:bg-white/5 shadow">
        {active === RAPPORT && <RapportAnomalies onNaviguer={ouvrirSection} />}
        {active === EXPORT && <ExportAcpr onOuvrirRapport={() => ouvrirSection(RAPPORT)} />}
        {active === IMPORT && (
          <ImportExcel lectureSeule={lectureSeule} onTermine={chargerCompteurs} onOuvrirRapport={() => ouvrirSection(RAPPORT)} />
        )}
        {![RAPPORT, EXPORT, IMPORT].includes(active) && (
          <EditeurSection
            key={`${section.key}|${anomalieCible?.reference ?? ''}|${anomalieCible?.message ?? ''}`}
            section={section}
            lectureSeule={lectureSeule}
            onChangement={chargerCompteurs}
            anomalie={anomalieCible}
            onRetourRapport={() => ouvrirSection(RAPPORT)}
          />
        )}
      </section>
    </div>
  );
}

RegistreInformation.propTypes = {
  role: PropTypes.string,
};
