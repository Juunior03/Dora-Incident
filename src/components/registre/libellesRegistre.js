// Libellés lisibles des tableaux et des champs du registre, à partir de registreConfig :
// les noms internes (tables, colonnes) ne sont jamais affichés tels quels.
import { SECTIONS } from './registreConfig';

// Champs propres à l'import Excel (codes lus dans le fichier avant rattachement)
const CHAMPS_IMPORT = {
  prestataire_code: 'Prestataire',
  prestataire_type_code: 'Type de code du prestataire',
  destinataire_code: 'Prestataire qui lui sous-traite',
  destinataire_type_code: 'Type de code du prestataire qui lui sous-traite',
  mere_code: 'Entreprise mère ultime',
  mere_type_code: "Type de code de l'entreprise mère",
  succursale_code: 'Succursale utilisatrice',
  reference_contrat: 'Contrat',
  lei_entite: 'Entité',
};

// Numérotations différentes d'une même colonne (ITS 2024 / taxonomie DPM 4.0)
const ALIAS_CODES = { 'B_06.01.0110': 'B_06.01.0100' };

// « Pays (ISO, ex. FR) » -> « Pays », « Stockage de données ? » -> « Stockage de données »
const nettoyer = (libelle) => libelle
  .replace(/\s*\((?:ISO|ex\.|F1|\d+ caractères)[^)]*\)\s*$/, '')
  .replace(/\s*\?\s*$/, '');

export const sectionParModele = (modele) => SECTIONS.find((s) => s.code === modele) ?? null;
export const sectionParTable = (table) => SECTIONS.find((s) => s.table === table) ?? null;

/** Libellé d'un champ d'un tableau (section, code de modèle ou nom de table) */
export function libelleChamp(cible, nom) {
  const section = typeof cible === 'string' ? sectionParModele(cible) ?? sectionParTable(cible) : cible;
  const champ = section?.fields.find((f) => f.name === nom);
  if (champ) return nettoyer(champ.label);
  // Code lu dans le fichier (ex. prestataire_code) : libellé du champ rattaché (prestataire_id)
  const rattache = nom.endsWith('_code') && section?.fields.find((f) => f.name === nom.replace(/_code$/, '_id'));
  if (rattache) return nettoyer(rattache.label);
  return CHAMPS_IMPORT[nom] ?? nom.replace(/_/g, ' ');
}

/** Champ désigné par un code de colonne EBA (ex. B_02.02.0090) */
export function champParCode(code) {
  const c = ALIAS_CODES[code] ?? code;
  for (const section of SECTIONS) {
    const champ = section.fields.find((f) => f.code === c);
    if (champ) return { section, champ, libelle: nettoyer(champ.label) };
  }
  return null;
}

/** Libellé de la colonne visée par une anomalie (modèle + colonne, ou code complet pour B_99.01) */
export function libelleColonne(modele, colonne) {
  // Sans colonne, ou sur la colonne clé (0010) : l'anomalie porte sur la ligne entière
  if (!colonne || colonne === '0010') return sectionParModele(modele)?.title ?? null;
  const code = colonne.startsWith('B_') ? colonne : `${modele}.${colonne}`;
  const trouve = champParCode(code);
  if (!trouve) return null;
  return colonne.startsWith('B_') ? `Options de « ${trouve.libelle} »` : trouve.libelle;
}

/** Code complet affiché à côté du libellé (ex. B_02.02.0090) */
export const codeColonne = (modele, colonne) => (!colonne ? modele : colonne.startsWith('B_') ? colonne : `${modele}.${colonne}`);
