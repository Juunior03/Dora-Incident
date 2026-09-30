// Message affiché à l'utilisateur quand la base refuse une opération sans message métier prévu.
// Le message brut de PostgreSQL/PostgREST cite des tables, colonnes et contraintes : il n'est
// écrit que dans la console du navigateur, l'écran n'affiche qu'un code de référence.
export function messageTechnique(error) {
  if (!error) return '';
  console.error('Erreur technique :', error);
  const texte = `${error.message || ''} ${error.details || ''}`;
  if (error.code === '42501' || /row-level security|permission denied/i.test(texte)) {
    return 'Action non autorisée pour votre rôle.';
  }
  if (error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(texte)) {
    return 'Le serveur est injoignable. Vérifiez votre connexion puis réessayez.';
  }
  const reference = error.code ? ` (référence ${error.code})` : '';
  return `L'opération n'a pas pu aboutir${reference}. Réessayez ou contactez l'équipe SSI.`;
}
