// Traduction des erreurs de la base (Supabase/PostgreSQL) en messages lisibles, commune aux
// écrans de saisie et à l'import Excel.
import { MESSAGES_CONTRAINTES } from './registreConfig';

// Traduit une erreur Supabase/PostgreSQL en message lisible
export function messageErreur(error) {
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
