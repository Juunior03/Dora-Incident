// Comparaison d'un rapport avec le rapport validé qui le précède (même incident)
// Sert au validateur : les données reprises des rapports précédents peuvent être mises à jour dans le
// rapport suivant (règlement d'exécution 2025/302, annexe II) ; il doit voir ce qui a changé avant de valider.

export const ORDRE_RAPPORTS = ['initial_notification', 'intermediate_report', 'final_report'];
export const RECLASSEMENT = 'major_incident_reclassified_as_non-major';
export const LIBELLES_RAPPORTS = {
  initial_notification: 'notification initiale',
  intermediate_report: 'rapport intermédiaire',
  final_report: 'rapport final',
  [RECLASSEMENT]: 'reclassement en incident non majeur',
};

// Rang d'un rapport dans la suite des déclarations ; un reclassement suit le rapport dont il découle
const rangDe = (r) => (r?.incidentSubmission === RECLASSEMENT
  ? Math.max(0, ORDRE_RAPPORTS.indexOf(r.reclassificationBase)) + 1
  : ORDRE_RAPPORTS.indexOf(r?.incidentSubmission));

// type : 'texte' (défaut) | 'liste' | 'date' | 'nombre' | 'booleen' | 'entites' | 'telephone'
const CHAMPS = [
  // Identité et contacts (étapes « Identity » et « Contacts »)
  ['identite', '1.2', "Nom de l'entité déclarante", 'submittingEntity.name'],
  ['identite', '1.3', "Code de l'entité déclarante", 'submittingEntity.code'],
  ['identite', '1.4', "Type d'entité financière", 'submittingEntity.affectedEntityType', 'liste'],
  ['identite', '1.5 / 1.6', 'Entités affectées (nom, LEI, type)', 'affectedEntity', 'entites'],
  ['identite', '1.7', 'Contact principal : nom', 'primaryContact.name'],
  ['identite', '1.8', 'Contact principal : e-mail', 'primaryContact.email'],
  ['identite', '1.9', 'Contact principal : téléphone', 'primaryContact', 'telephone'],
  ['identite', '1.10', 'Second contact : nom', 'secondaryContact.name'],
  ['identite', '1.11', 'Second contact : e-mail', 'secondaryContact.email'],
  ['identite', '1.12', 'Second contact : téléphone', 'secondaryContact', 'telephone'],
  ['identite', '1.13', "Nom de l'entreprise mère ultime", 'ultimateParentUndertaking.name'],
  ['identite', '1.14', "LEI de l'entreprise mère ultime", 'ultimateParentUndertaking.LEI'],
  ['identite', '1.15', 'Devise', 'reportCurrency'],
  // Notification initiale
  ['initial_notification', '2.1', "Code de l'incident (entité)", 'incident.financialEntityCode'],
  ['initial_notification', '2.2', 'Date de détection', 'incident.detectionDateTime', 'date'],
  ['initial_notification', '2.3', 'Date de classification', 'incident.classificationDateTime', 'date'],
  ['initial_notification', '2.4', "Description de l'incident", 'incident.incidentDescription'],
  ['initial_notification', '2.5', 'Critères de classification', 'incident.classificationTypes.0.classificationCriterion', 'liste'],
  ['initial_notification', '2.6', 'Pays touchés (propagation géographique)', 'incident.classificationTypes.0.countryCodeMaterialityThresholds', 'liste'],
  ['initial_notification', '2.7', "Mode de découverte de l'incident", 'incident.incidentDiscovery'],
  ['initial_notification', '2.8', 'Origine : prestataire tiers ou autre entité', 'incident.originatesFromThirdPartyProvider'],
  ['initial_notification', '2.9', 'Plan de continuité activé', 'incident.isBusinessContinuityActivated', 'booleen'],
  ['initial_notification', '2.10', 'Autres informations', 'incident.otherInformation'],
  // Rapport intermédiaire
  ['intermediate_report', '3.1', "Code de l'incident (ACPR)", 'incident.competentAuthorityCode'],
  ['intermediate_report', '3.2', 'Date de survenance', 'incident.incidentOccurrenceDateTime', 'date'],
  ['intermediate_report', '3.3', 'Date de rétablissement des services', 'impactAssessment.serviceImpact.serviceRestorationDateTime', 'date'],
  ['intermediate_report', '3.4', 'Nombre de clients affectés', 'impactAssessment.affectedAssets.affectedClients.number', 'nombre'],
  ['intermediate_report', '3.5', 'Pourcentage de clients affectés', 'impactAssessment.affectedAssets.affectedClients.percentage', 'nombre'],
  ['intermediate_report', '3.6', 'Nombre de contreparties financières affectées', 'impactAssessment.affectedAssets.affectedFinancialCounterparts.number', 'nombre'],
  ['intermediate_report', '3.7', 'Pourcentage de contreparties financières affectées', 'impactAssessment.affectedAssets.affectedFinancialCounterparts.percentage', 'nombre'],
  ['intermediate_report', '3.8', 'Impact sur des clients ou contreparties importants', 'impactAssessment.hasImpactOnRelevantClients', 'booleen'],
  ['intermediate_report', '3.9', 'Nombre de transactions affectées', 'impactAssessment.affectedAssets.affectedTransactions.number', 'nombre'],
  ['intermediate_report', '3.10', 'Pourcentage de transactions affectées', 'impactAssessment.affectedAssets.affectedTransactions.percentage', 'nombre'],
  ['intermediate_report', '3.11', 'Valeur des transactions affectées (milliers)', 'impactAssessment.affectedAssets.valueOfAffectedTransactions', 'nombre'],
  ['intermediate_report', '3.12', 'Chiffres réels, estimés ou absence d\'impact', 'impactAssessment.affectedAssets.numbersActualEstimate', 'liste'],
  ['intermediate_report', '3.13', "Type d'impact sur la réputation", 'incident.classificationTypes.0.reputationalImpactType', 'liste'],
  ['intermediate_report', '3.14', "Description de l'impact sur la réputation", 'incident.classificationTypes.0.reputationalImpactDescription'],
  ['intermediate_report', '3.15', "Durée de l'incident", 'incident.incidentDuration'],
  ['intermediate_report', '3.16', "Durée d'interruption du service", 'impactAssessment.serviceImpact.serviceDowntime'],
  ['intermediate_report', '3.17', 'Durées réelles ou estimées', 'informationDurationServiceDowntimeActualOrEstimate'],
  ['intermediate_report', '3.18', "Type d'impact dans les autres États membres", 'incident.classificationTypes.0.memberStatesImpactType', 'liste'],
  ['intermediate_report', '3.19', "Description de l'impact dans les autres États membres", 'incident.classificationTypes.0.memberStatesImpactTypeDescription'],
  ['intermediate_report', '3.20', 'Type de pertes de données', 'incident.classificationTypes.0.dataLosseMaterialityThresholds', 'liste'],
  ['intermediate_report', '3.21', 'Description des pertes de données', 'incident.classificationTypes.0.dataLossesDescription'],
  ['intermediate_report', '3.22', 'Services critiques affectés', 'impactAssessment.criticalServicesAffected'],
  ['intermediate_report', '3.23', "Type d'incident", 'incident.incidentType.incidentClassification', 'liste'],
  ['intermediate_report', '3.24', "Autre type d'incident", 'incident.incidentType.otherIncidentClassification'],
  ['intermediate_report', '3.25', 'Techniques de menace', 'incident.incidentType.threatTechniques', 'liste'],
  ['intermediate_report', '3.26', 'Autre technique de menace', 'incident.incidentType.otherThreatTechniques'],
  ['intermediate_report', '3.27', 'Fonctions et processus touchés', 'impactAssessment.affectedFunctionalAreas'],
  ['intermediate_report', '3.28', "Composants d'infrastructure touchés", 'impactAssessment.isAffectedInfrastructureComponents'],
  ['intermediate_report', '3.29', "Description des composants d'infrastructure touchés", 'impactAssessment.affectedInfrastructureComponents'],
  ['intermediate_report', '3.30', 'Impact sur les intérêts financiers des clients', 'impactAssessment.isImpactOnFinancialInterest'],
  ['intermediate_report', '3.31', 'Autres autorités informées', 'reportingToOtherAuthorities', 'liste'],
  ['intermediate_report', '3.32', 'Précision « autres » autorités', 'reportingToOtherAuthoritiesOther'],
  ['intermediate_report', '3.33', 'Actions temporaires prises ou prévues', 'impactAssessment.serviceImpact.isTemporaryActionsMeasuresForRecovery', 'booleen'],
  ['intermediate_report', '3.34', 'Description des actions temporaires', 'impactAssessment.serviceImpact.descriptionOfTemporaryActionsMeasuresForRecovery'],
  ['intermediate_report', '3.35', 'Indicateurs de compromission', 'incident.incidentType.indicatorsOfCompromise'],
].map(([section, numero, libelle, chemin, type = 'texte']) => ({ section, numero, libelle, chemin, type }));

const lire = (objet, chemin) => chemin.split('.').reduce((o, k) => o?.[k], objet);

// Valeur comparable (chaîne) et valeur affichable
function normaliser(valeur, type) {
  switch (type) {
    case 'liste':
      return Array.isArray(valeur) ? [...valeur].sort().join(', ') : '';
    case 'date': {
      if (!valeur) return '';
      const d = new Date(valeur);
      return Number.isNaN(d.getTime()) ? String(valeur) : String(d.getTime());
    }
    case 'nombre':
      return valeur === '' || valeur === null || valeur === undefined ? '0' : String(Number(valeur));
    case 'booleen':
      return valeur ? 'Oui' : 'Non';
    case 'telephone':
      return valeur?.phone ? `${valeur.phone.startsWith('+') ? '' : valeur.countryCode ?? ''}${valeur.phone}` : '';
    case 'entites':
      return (valeur ?? [])
        .filter((e) => e?.name || e?.LEI)
        .map((e) => `${e.name || '—'} (${e.LEI || 'sans LEI'})`)
        .join(' ; ');
    default:
      return typeof valeur === 'string' ? valeur.trim() : valeur === undefined || valeur === null ? '' : String(valeur);
  }
}

function afficher(valeur, type) {
  if (type === 'date') {
    if (!valeur) return '';
    const d = new Date(valeur);
    return Number.isNaN(d.getTime()) ? String(valeur) : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }
  if (type === 'liste') return (Array.isArray(valeur) ? valeur : []).map((v) => String(v).replaceAll('_', ' ')).join(', ');
  return normaliser(valeur, type);
}

/** Dernier rapport validé de l'incident dont le type précède celui du rapport (null si aucun) */
export function rapportPrecedent(rapport, rapports) {
  const rang = rangDe(rapport);
  if (rang <= 0) return null;
  const candidats = (rapports ?? []).filter((r) => r.id !== rapport.id
    && r.incidentId === rapport.incidentId
    && r.status === 'validated'
    && ORDRE_RAPPORTS.indexOf(r.incidentSubmission) >= 0
    && ORDRE_RAPPORTS.indexOf(r.incidentSubmission) < rang);
  candidats.sort((a, b) => (ORDRE_RAPPORTS.indexOf(b.incidentSubmission) - ORDRE_RAPPORTS.indexOf(a.incidentSubmission))
    || (new Date(b.validatedAt ?? 0) - new Date(a.validatedAt ?? 0)));
  return candidats[0] ?? null;
}

/**
 * Données des rapports précédents modifiées dans ce rapport.
 * Seuls les champs des sections antérieures au type du rapport sont comparés : les champs propres au
 * rapport (par exemple les causes dans le rapport final) sont nouveaux par nature.
 * @returns [{ section, numero, libelle, avant, apres }]
 */
export function modificationsRapport(rapport, precedent) {
  if (!rapport || !precedent) return [];
  const rang = rangDe(rapport);
  return CHAMPS
    .filter((c) => c.section === 'identite' || ORDRE_RAPPORTS.indexOf(c.section) < rang)
    // Reclassement : le champ 2.10 porte les raisons du reclassement, ce n'est pas une mise à jour
    .filter((c) => !(rapport.incidentSubmission === RECLASSEMENT && c.chemin === 'incident.otherInformation'))
    .filter((c) => normaliser(lire(rapport, c.chemin), c.type) !== normaliser(lire(precedent, c.chemin), c.type))
    .map((c) => ({
      section: c.section,
      numero: c.numero,
      libelle: c.libelle,
      avant: afficher(lire(precedent, c.chemin), c.type),
      apres: afficher(lire(rapport, c.chemin), c.type),
    }));
}
