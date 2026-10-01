// Traduction des erreurs de la base (Supabase/PostgreSQL) en messages lisibles, commune aux
// écrans de saisie et à l'import Excel. Les noms internes (tables, colonnes, contraintes) sont
// remplacés par les libellés de l'application.
import { MESSAGES_CONTRAINTES, SECTIONS } from './registreConfig';
import { libelleChamp, sectionParTable } from './libellesRegistre';
import { messageTechnique } from '../../utils/messageTechnique';

const titreTable = (table) => sectionParTable(table)?.title;

// « Key (reference_contrat, lei_entite)=(CTR-1, 9695…) … » -> { colonnes, valeurs }
function cleDuDetail(texte) {
  const m = /Key \(([^)]+)\)=\((.*)\)/.exec(texte);
  return m ? { colonnes: m[1].split(/,\s*/), valeurs: m[2] } : null;
}

export function messageErreur(error) {
  if (!error) return '';
  const texte = `${error.message || ''} ${error.details || ''}`;
  if (error.code === '42P01' || error.code === 'PGRST205' || /could not find the table/i.test(texte)) {
    return "Le registre n'est pas encore installé dans la base : appliquez la migration 20260930000000_registre_information.sql.";
  }
  const contrainte = /constraint "([^"]+)"/.exec(texte)?.[1];
  if (contrainte && MESSAGES_CONTRAINTES[contrainte]) {
    return MESSAGES_CONTRAINTES[contrainte];
  }
  const relation = /relation "([^"]+)"/.exec(texte)?.[1];

  if (error.code === '23503') {
    const cle = cleDuDetail(texte);
    if (/update or delete/i.test(texte)) {
      const utilisatrice = /referenced from table "([^"]+)"/.exec(texte)?.[1] ?? [...texte.matchAll(/on table "([^"]+)"/g)].at(-1)?.[1];
      const tableau = utilisatrice && titreTable(utilisatrice);
      return `Suppression impossible : cette ligne est utilisée dans ${tableau ? `« ${tableau} »` : 'un autre tableau du registre'}. Modifiez ou supprimez d'abord ces lignes.`;
    }
    const cible = /not present in table "([^"]+)"/.exec(texte)?.[1];
    const tableau = cible && titreTable(cible);
    if (cle && tableau && !/^[0-9a-f-]{36}$/i.test(cle.valeurs)) {
      return `« ${cle.valeurs} » n'existe pas dans « ${tableau} ». Créez-le d'abord dans ce tableau, ou corrigez la valeur.`;
    }
    return tableau
      ? `La valeur choisie n'existe pas (ou plus) dans « ${tableau} ».`
      : "Une valeur sélectionnée n'existe pas (ou plus) dans le registre.";
  }
  if (error.code === '23505') {
    const cle = cleDuDetail(texte);
    // Table retrouvée par le préfixe du nom de la contrainte (ex. ri_contrats_pkey)
    const table = relation ?? SECTIONS.map((x) => x.table).filter((t) => contrainte?.startsWith(`${t}_`))
      .sort((a, b) => b.length - a.length)[0];
    const tableau = table && titreTable(table);
    return cle && tableau
      ? `« ${cle.valeurs} » existe déjà dans « ${tableau} ».`
      : 'Cette ligne existe déjà dans le registre.';
  }
  if (error.code === '23502') {
    const colonne = /column "([^"]+)"/.exec(texte)?.[1];
    return colonne && relation
      ? `Le champ « ${libelleChamp(relation, colonne)} » est obligatoire.`
      : 'Un champ obligatoire est vide.';
  }
  if (error.code === '23514') {
    // Contrôle de colonne nommé automatiquement « <table>_<colonne>_check »
    const colonne = relation && contrainte?.startsWith(`${relation}_`) && contrainte.endsWith('_check')
      ? contrainte.slice(relation.length + 1, -'_check'.length) : null;
    const champ = colonne && sectionParTable(relation)?.fields.find((f) => f.name === colonne);
    return champ
      ? `Valeur refusée pour « ${libelleChamp(relation, colonne)} » : vérifiez son format ou choisissez une valeur de la liste.`
      : 'Valeur refusée par un contrôle du registre : vérifiez les valeurs saisies.';
  }
  return messageTechnique(error);
}
