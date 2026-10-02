// Données des rapports précédents modifiées dans le rapport en cours, pour la relecture avant validation
import PropTypes from 'prop-types';
import { LIBELLES_RAPPORTS } from '../utils/comparaisonRapports';

const SECTIONS = {
  identite: 'Identité et contacts',
  initial_notification: 'Notification initiale',
  intermediate_report: 'Rapport intermédiaire',
};

const dateValidation = (precedent) => (precedent?.validatedAt
  ? ` validé le ${new Date(precedent.validatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`
  : ' validé');

export default function ModificationsRapport({ precedent, modifications }) {
  if (!precedent) {
    return (
      <div className="mb-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm">
        <h4 className="font-medium">Modifications par rapport au rapport précédent</h4>
        <p className="mt-1 opacity-70">Rapport précédent validé introuvable : comparaison impossible.</p>
      </div>
    );
  }
  const libelle = LIBELLES_RAPPORTS[precedent.incidentSubmission];
  if (modifications.length === 0) {
    return (
      <div className="mb-4 p-4 rounded-lg bg-green-50 dark:bg-green-900/30 text-sm text-green-900 dark:text-green-100">
        <h4 className="font-medium">Modifications par rapport au {libelle}{dateValidation(precedent)}</h4>
        <p className="mt-1">Aucune donnée reprise du {libelle} n&apos;a été modifiée.</p>
      </div>
    );
  }
  return (
    <div className="mb-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-sm" data-testid="modifications-rapport">
      <h4 className="font-medium text-amber-900 dark:text-amber-100">
        ✏️ {modifications.length} donnée(s) modifiée(s) par rapport au {libelle}{dateValidation(precedent)}
      </h4>
      <p className="mt-1 mb-3 opacity-80">
        Ces informations ont déjà été transmises à l&apos;ACPR et sont mises à jour dans ce rapport. À vérifier avant
        la validation.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-amber-200 dark:border-amber-800">
              <th className="py-1 pr-3 font-medium">N°</th>
              <th className="py-1 pr-3 font-medium">Champ</th>
              <th className="py-1 pr-3 font-medium">Avant</th>
              <th className="py-1 font-medium">Après</th>
            </tr>
          </thead>
          <tbody>
            {modifications.map((m) => (
              <tr key={m.numero + m.libelle} className="border-b border-amber-100 dark:border-amber-900 align-top">
                <td className="py-1 pr-3 whitespace-nowrap">{m.numero}</td>
                <td className="py-1 pr-3">
                  {m.libelle}
                  <div className="opacity-60">{SECTIONS[m.section]}</div>
                </td>
                <td className="py-1 pr-3 line-through opacity-70 break-words max-w-xs">{m.avant || <em>vide</em>}</td>
                <td className="py-1 font-medium break-words max-w-xs">{m.apres || <em>vide</em>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

ModificationsRapport.propTypes = {
  precedent: PropTypes.object,
  modifications: PropTypes.arrayOf(PropTypes.shape({
    section: PropTypes.string,
    numero: PropTypes.string,
    libelle: PropTypes.string,
    avant: PropTypes.string,
    apres: PropTypes.string,
  })).isRequired,
};
