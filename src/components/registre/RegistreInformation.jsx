// Registre d'information DORA : consultation et saisie des modèles B_01.01 à B_99.01
import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../supabaseClient';
import { SECTIONS, MESSAGES_CONTRAINTES } from './registreConfig';

const inputClasses = 'mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full disabled:opacity-60';

// Traduit une erreur Supabase/PostgreSQL en message lisible
function messageErreur(error) {
  if (!error) return '';
  const texte = `${error.message || ''} ${error.details || ''}`;
  if (error.code === '42P01' || error.code === 'PGRST205' || /could not find the table/i.test(texte)) {
    return "Le registre n'est pas encore installé dans la base : appliquez la migration 20260930000000_registre_information.sql.";
  }
  if (error.code === '42501' || /row-level security/i.test(texte)) {
    return "Action non autorisée pour votre rôle.";
  }
  const contrainte = /constraint "([^"]+)"/.exec(texte)?.[1];
  if (contrainte && MESSAGES_CONTRAINTES[contrainte]) {
    return MESSAGES_CONTRAINTES[contrainte];
  }
  if (error.code === '23503') {
    return /update or delete/i.test(texte)
      ? 'Suppression impossible : cette ligne est utilisée ailleurs dans le registre.'
      : "Une valeur sélectionnée n'existe pas (ou plus) dans le registre.";
  }
  if (error.code === '23505') return 'Cette ligne existe déjà dans le registre.';
  if (error.code === '23502') return 'Un champ obligatoire est vide.';
  if (error.code === '23514') return `Valeur refusée par un contrôle du registre (${contrainte || 'contrôle'}).`;
  return error.message;
}

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
      return typeof field.options[0]?.value === 'number' ? Number(value) : value;
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
    control = (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClasses} disabled={disabled}>
        <option value="">{field.required ? 'Choisir…' : '—'}</option>
        {options.map((o) => (
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

function EditeurSection({ section, lectureSeule, onChangement }) {
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
      options[f.name] = (res.data || []).map((r) => ({ value: r[f.fk.value], label: f.fk.label(r) }));
    }
    setFkOptions(options);
    setChargement(false);
  }, [section, champsFk]);

  useEffect(() => {
    setEdition(null);
    charger();
  }, [charger]);

  const libelle = (field, value) => {
    if (value === null || value === undefined || value === '') return '—';
    if (field.type === 'fk') return fkOptions[field.name]?.find((o) => o.value === value)?.label ?? value;
    if (field.type === 'select') return field.options.find((o) => o.value === value)?.label ?? value;
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
};

export default function RegistreInformation({ role }) {
  const [active, setActive] = useState(SECTIONS[0].key);
  const [compteurs, setCompteurs] = useState({});
  const lectureSeule = role !== 'saisisseur';

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
          <ul className="space-y-1 list-none p-0 m-0">
            {SECTIONS.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => setActive(s.key)}
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
        <EditeurSection key={section.key} section={section} lectureSeule={lectureSeule} onChangement={chargerCompteurs} />
      </section>
    </div>
  );
}

RegistreInformation.propTypes = {
  role: PropTypes.string,
};
