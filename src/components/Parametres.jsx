// Page Paramètres : entité déclarante, compte, apparence et journal d'activité
import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useTheme } from '../utils/theme';
import JournalActivite from './JournalActivite';

const LEI_VALIDE = /^[A-Z0-9]{18}[0-9]{2}$/;

const ROLES_DECLARATIONS = {
  saisisseur: ['Saisisseur', 'Créer et modifier vos brouillons de déclaration'],
  validateur: ['Validateur', 'Relire et valider les déclarations'],
  auditeur: ['Auditeur', 'Consulter les déclarations validées'],
};
const ROLES_REGISTRE = {
  gestionnaire: ['Gestionnaire', 'Consulter, modifier et importer'],
  lecteur: ['Lecteur', "Consulter, rapport d'anomalies et export"],
};

const RUBRIQUES = [
  { cle: 'entite', libelle: 'Entité déclarante', icone: '🏢', saisisseur: true },
  { cle: 'compte', libelle: 'Mon compte', icone: '👤' },
  { cle: 'apparence', libelle: 'Apparence', icone: '🎨' },
  { cle: 'journal', libelle: "Journal d'activité", icone: '🕘' },
];

const lireRubrique = () => {
  const [segment, cle] = (globalThis.location?.hash ?? '').replace(/^#\/?/, '').split('/');
  return segment === 'parametres' ? cle : null;
};
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const dateCourte = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : null);

function Carte({ titre, description, aDroite, children, pied }) {
  return (
    <section className="rounded-2xl bg-white dark:bg-gray-800/60 shadow">
      <div className="flex flex-wrap items-start justify-between gap-3 px-7 pt-6 pb-2">
        <div>
          <h3 className="text-lg font-semibold">{titre}</h3>
          {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-2xl">{description}</p>}
        </div>
        {aDroite}
      </div>
      <div className="px-7 pt-3 pb-6">{children}</div>
      {pied && <div className="flex flex-wrap items-center justify-between gap-3 px-7 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/30 rounded-b-2xl">{pied}</div>}
    </section>
  );
}
Carte.propTypes = { titre: PropTypes.string.isRequired, description: PropTypes.node, aDroite: PropTypes.node, children: PropTypes.node, pied: PropTypes.node };

const classeChamp = 'w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500';

/** Choix des types d'entité : étiquettes + recherche */
function ChoixTypes({ options, valeurs, onChange, id }) {
  const [texte, setTexte] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const zone = useRef(null);
  useEffect(() => {
    const fermer = (e) => { if (zone.current && !zone.current.contains(e.target)) setOuvert(false); };
    document.addEventListener('mousedown', fermer);
    return () => document.removeEventListener('mousedown', fermer);
  }, []);
  const libelle = (v) => options.find((o) => o.value === v)?.label?.trim() ?? v;
  const proposes = options.filter((o) => !valeurs.includes(o.value) && o.label.toLowerCase().includes(texte.trim().toLowerCase()));
  const ajouter = (v) => { onChange([...valeurs, v]); setTexte(''); };
  return (
    <div ref={zone} className="relative">
      <div className={`flex flex-wrap items-center gap-2 p-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 ${ouvert ? 'ring-2 ring-indigo-500' : ''}`}>
        {valeurs.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 text-sm">
            {libelle(v)}
            <button type="button" onClick={() => onChange(valeurs.filter((x) => x !== v))} aria-label={`Retirer ${libelle(v)}`}
              className="w-5 h-5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-800 leading-none">×</button>
          </span>
        ))}
        <input id={id} value={texte} onChange={(e) => { setTexte(e.target.value); setOuvert(true); }} onFocus={() => setOuvert(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && proposes[0]) { e.preventDefault(); ajouter(proposes[0].value); }
            if (e.key === 'Escape') setOuvert(false);
            if (e.key === 'Backspace' && !texte && valeurs.length) onChange(valeurs.slice(0, -1));
          }}
          placeholder={valeurs.length ? 'Ajouter un type…' : 'Rechercher un type d\'entité…'}
          className="flex-1 min-w-[12rem] px-2 py-1 bg-transparent focus:outline-none text-sm" autoComplete="off" />
      </div>
      {ouvert && proposes.length > 0 && (
        <ul role="listbox" className="absolute z-20 mt-1 w-full max-w-md max-h-64 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
          {proposes.map((o) => (
            <li key={o.value}>
              <button type="button" onClick={() => ajouter(o.value)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">{o.label.trim()}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
ChoixTypes.propTypes = { options: PropTypes.arrayOf(PropTypes.object).isRequired, valeurs: PropTypes.arrayOf(PropTypes.string).isRequired, onChange: PropTypes.func.isRequired, id: PropTypes.string };

function EntiteDeclarante({ reglages, typesEntite, onEnregistrer, notifier }) {
  const initial = useMemo(() => ({ name: reglages.name ?? '', code: reglages.code ?? '', affectedEntityType: reglages.affectedEntityType ?? [] }), [reglages]);
  const [form, setForm] = useState(initial);
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => setForm(initial), [initial]);
  const modifie = !egal(form, initial);
  const lei = form.code.trim();
  const leiOk = LEI_VALIDE.test(lei);
  const erreur = !form.name.trim() ? "Le nom légal de l'entité est obligatoire."
    : !leiOk ? 'Le LEI doit compter 20 caractères : 18 lettres majuscules ou chiffres, puis 2 chiffres.'
      : !form.affectedEntityType.length ? "Choisissez au moins un type d'entité." : null;
  const enregistrer = async () => {
    setEnvoi(true);
    try {
      await onEnregistrer({ ...form, name: form.name.trim(), code: lei });
      notifier('Paramètres enregistrés');
    } catch {
      notifier("Les paramètres n'ont pas pu être enregistrés. Réessayez.", 'erreur');
    } finally {
      setEnvoi(false);
    }
  };
  const configuree = reglages.isLocked;
  return (
    <Carte
      titre="Entité déclarante"
      description="Ces informations préremplissent chaque nouvelle déclaration d'incident (champs 1.2, 1.3 et 1.4 de la maquette) et ne sont plus modifiables dans les rapports."
      aDroite={configuree
        ? <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">● Configurée{dateCourte(reglages.updatedAt) ? ` — enregistrée le ${dateCourte(reglages.updatedAt)}` : ''}</span>
        : <span className="text-xs px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">● Non configurée</span>}
      pied={(
        <>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {modifie ? (erreur ?? 'Modifications non enregistrées') : configuree ? 'Aucune modification' : ''}
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={!modifie || envoi} onClick={() => setForm(initial)}
              className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">Annuler</button>
            <button type="button" disabled={!modifie || !!erreur || envoi} onClick={enregistrer}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </>
      )}
    >
      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <label htmlFor="submittingEntityName" className="block text-sm font-semibold mb-1.5">Nom légal de l&apos;entité <span className="font-normal text-gray-400">champ 1.2</span></label>
          <input id="submittingEntityName" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={classeChamp} />
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Nom légal complet, sans abréviation (même orthographe dans toutes les déclarations).</p>
        </div>
        <div>
          <label htmlFor="submittingEntityCode" className="block text-sm font-semibold mb-1.5">LEI <span className="font-normal text-gray-400">champ 1.3</span></label>
          <input id="submittingEntityCode" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            className={`${classeChamp} font-mono tracking-wide`} maxLength={20} spellCheck={false} autoComplete="off" />
          {lei && (leiOk
            ? <p className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400">✓ Format valide (20 caractères)</p>
            : <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">✗ Format attendu : 18 lettres majuscules ou chiffres, puis 2 chiffres ({lei.length}/20)</p>)}
        </div>
      </div>
      <div className="mt-6">
        <label htmlFor="choixTypesEntite" className="block text-sm font-semibold mb-1.5">Type d&apos;entité financière <span className="font-normal text-gray-400">champ 1.4</span></label>
        <ChoixTypes id="choixTypesEntite" options={typesEntite} valeurs={form.affectedEntityType} onChange={(v) => setForm({ ...form, affectedEntityType: v })} />
      </div>
    </Carte>
  );
}
EntiteDeclarante.propTypes = { reglages: PropTypes.object.isRequired, typesEntite: PropTypes.array.isRequired, onEnregistrer: PropTypes.func.isRequired, notifier: PropTypes.func.isRequired };

function Ligne({ titre, sousTitre, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-4 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <div>
        <div className="text-sm">{titre}</div>
        {sousTitre && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sousTitre}</div>}
      </div>
      {children}
    </div>
  );
}
Ligne.propTypes = { titre: PropTypes.node.isRequired, sousTitre: PropTypes.node, children: PropTypes.node };

const Badge = ({ children, neutre }) => (
  <span className={`text-xs px-3 py-1 rounded-full ${neutre ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' : 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200'}`}>{children}</span>
);
Badge.propTypes = { children: PropTypes.node, neutre: PropTypes.bool };

function MonCompte({ email, role, roleRegistre, onModifierMotDePasse }) {
  const [rD, dD] = ROLES_DECLARATIONS[role] ?? ['Aucun', 'Aucun accès aux déclarations'];
  const [rR, dR] = ROLES_REGISTRE[roleRegistre] ?? ['Aucun accès', "Le registre d'information n'est pas affiché"];
  return (
    <Carte titre="Mon compte" description="Vos droits sont attribués par l'administrateur de l'application.">
      <Ligne titre="Adresse e-mail" sousTitre={email} />
      <Ligne titre="Déclarations d'incident" sousTitre={dD}><Badge neutre={!ROLES_DECLARATIONS[role]}>{rD}</Badge></Ligne>
      <Ligne titre="Registre d'information" sousTitre={dR}><Badge neutre={!ROLES_REGISTRE[roleRegistre]}>{rR}</Badge></Ligne>
      <Ligne titre="Mot de passe">
        <button type="button" onClick={onModifierMotDePasse} className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm">🔑 Modifier le mot de passe</button>
      </Ligne>
    </Carte>
  );
}
MonCompte.propTypes = { email: PropTypes.string, role: PropTypes.string, roleRegistre: PropTypes.string, onModifierMotDePasse: PropTypes.func.isRequired };

const APERCUS = {
  clair: ['☀️ Clair', 'bg-gray-100', 'bg-gray-300'],
  sombre: ['🌙 Sombre', 'bg-gray-900', 'bg-gray-700'],
  systeme: ['💻 Système', 'bg-gradient-to-r from-gray-100 from-50% to-gray-900 to-50%', 'bg-gradient-to-r from-gray-300 from-50% to-gray-700 to-50%'],
};
function Apparence() {
  const [theme, changer] = useTheme();
  return (
    <Carte titre="Apparence" description="Choix mémorisé sur ce poste.">
      <div role="radiogroup" aria-label="Thème" className="grid sm:grid-cols-3 gap-4">
        {Object.entries(APERCUS).map(([cle, [libelle, fond, barre]]) => (
          <button key={cle} type="button" role="radio" aria-checked={theme === cle} onClick={() => changer(cle)}
            className={`rounded-xl border-2 p-3 text-sm text-center transition-colors ${theme === cle ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 font-semibold' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
            <div className={`h-16 rounded-lg mb-2.5 p-2.5 flex flex-col gap-1.5 ${fond}`}>
              {[0, 1, 2].map((i) => <span key={i} className={`block h-2 rounded ${barre}`} />)}
            </div>
            {libelle}
            {cle === 'systeme' && <span className="block text-xs font-normal text-gray-500 dark:text-gray-400 mt-0.5">suit le réglage de l&apos;ordinateur</span>}
          </button>
        ))}
      </div>
    </Carte>
  );
}

export default function Parametres({ role, roleRegistre, email, reglages, typesEntite, onEnregistrer, onModifierMotDePasse }) {
  const rubriques = RUBRIQUES.filter((r) => !r.saisisseur || role === 'saisisseur');
  const [active, setActive] = useState(() => {
    const cle = lireRubrique();
    return rubriques.some((r) => r.cle === cle) ? cle : rubriques[0].cle;
  });
  useEffect(() => {
    const cible = `#parametres/${active}`;
    if (globalThis.location.hash !== cible) globalThis.history.replaceState(null, '', cible);
  }, [active]);
  const [message, setMessage] = useState(null);
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(t);
  }, [message]);
  const notifier = (texte, type = 'ok') => setMessage({ texte, type, t: Date.now() });

  return (
    <div className="grid grid-cols-12 gap-6">
      <aside className="col-span-12 md:col-span-3">
        <nav aria-label="Rubriques des paramètres" className="p-4 rounded-2xl bg-white dark:bg-gray-800/60 shadow md:sticky md:top-[calc(var(--entete)+1.5rem)]">
          <h2 className="text-xl font-semibold mb-3 px-2">Paramètres</h2>
          {rubriques.map((r) => (
            <button key={r.cle} type="button" onClick={() => setActive(r.cle)} aria-current={active === r.cle ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 mb-1 rounded-xl text-sm text-left transition-colors ${active === r.cle ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 font-semibold' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}>
              <span aria-hidden="true" className="w-5 text-center">{r.icone}</span>{r.libelle}
            </button>
          ))}
        </nav>
      </aside>
      <div className="col-span-12 md:col-span-9 min-w-0">
        {active === 'entite' && <EntiteDeclarante reglages={reglages} typesEntite={typesEntite} onEnregistrer={onEnregistrer} notifier={notifier} />}
        {active === 'compte' && <MonCompte email={email} role={role} roleRegistre={roleRegistre} onModifierMotDePasse={onModifierMotDePasse} />}
        {active === 'apparence' && <Apparence />}
        {active === 'journal' && <JournalActivite />}
      </div>
      {message && (
        <div role="status" className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm text-white ${message.type === 'erreur' ? 'bg-red-700' : 'bg-emerald-700'}`}>
          {message.type === 'erreur' ? '✗ ' : '✓ '}{message.texte}
        </div>
      )}
    </div>
  );
}

Parametres.propTypes = {
  role: PropTypes.string,
  roleRegistre: PropTypes.string,
  email: PropTypes.string,
  reglages: PropTypes.object.isRequired,
  typesEntite: PropTypes.array.isRequired,
  onEnregistrer: PropTypes.func.isRequired,
  onModifierMotDePasse: PropTypes.func.isRequired,
};
