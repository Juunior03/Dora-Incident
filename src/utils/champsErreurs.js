// Champ du formulaire concerné par chaque message de validation (validateReportFields), pour que l'étape
// Review puisse y conduire l'utilisateur. Le chemin correspond à l'attribut data-champ des champs du formulaire.

const CORRESPONDANCES = [
  [/^Type of report is required/, 'incidentSubmission', '1.1'],
  [/^Report currency is required/, 'reportCurrency', '1.15'],
  [/^Submitting entity name/, 'submittingEntity.name', '1.2'],
  [/^Submitting entity code/, 'submittingEntity.code', '1.3'],
  [/^Affected entity type is required/, 'submittingEntity.affectedEntityType', '1.4'],
  [/^Type of the affected financial entity is required/, 'submittingEntity.affectedEntityType', '1.4'],
  [/^Affected entity (\d+): (?:type of entity)/, 'submittingEntity.affectedEntityType', '1.4'],
  [/^Affected entity (\d+): name/, (m) => `affectedEntity.${Number(m[1]) - 1}.name`, '1.5'],
  [/^Affected entity (\d+): LEI/, (m) => `affectedEntity.${Number(m[1]) - 1}.LEI`, '1.6'],
  [/^Primary contact name/, 'primaryContact.name', '1.7'],
  [/^Primary contact email/, 'primaryContact.email', '1.8'],
  [/^Primary contact phone/, 'primaryContact.phone', '1.9'],
  [/^Secondary contact name/, 'secondaryContact.name', '1.10'],
  [/^Secondary contact email/, 'secondaryContact.email', '1.11'],
  [/^Secondary contact phone/, 'secondaryContact.phone', '1.12'],
  [/^Ultimate parent undertaking: name and LEI/, (m, r) => (r?.ultimateParentUndertaking?.name ? 'ultimateParentUndertaking.LEI' : 'ultimateParentUndertaking.name'), '1.13 / 1.14'],
  [/^Ultimate parent undertaking LEI/, 'ultimateParentUndertaking.LEI', '1.14'],
  [/^Incident Reference code is required|^Incident reference code may only/, 'incident.financialEntityCode', '2.1'],
  [/^Incident detection date/, 'incident.detectionDateTime', '2.2'],
  [/^Incident classification date/, 'incident.classificationDateTime', '2.3'],
  [/^Incident description is required/, 'incident.incidentDescription', '2.4'],
  [/classification criterion is required|^Classification criteria must include|^At least one classification criterion in addition/, 'incident.classificationTypes.0.classificationCriterion', '2.5'],
  [/^Country code materiality thresholds/, 'incident.classificationTypes.0.countryCodeMaterialityThresholds', '2.6'],
  [/^Incident discovery is required/, 'incident.incidentDiscovery', '2.7'],
  [/^Incident occurrence date/, 'incident.incidentOccurrenceDateTime', '3.2'],
  [/^Date and time of service restoration/, 'impactAssessment.serviceImpact.serviceRestorationDateTime', '3.3'],
  [/^Number of affected clients/, 'impactAssessment.affectedAssets.affectedClients.number', '3.4'],
  [/^Percentage of affected clients/, 'impactAssessment.affectedAssets.affectedClients.percentage', '3.5'],
  [/^Number of affected financial counterparts/, 'impactAssessment.affectedAssets.affectedFinancialCounterparts.number', '3.6'],
  [/^Percentage of affected financial counterparts/, 'impactAssessment.affectedAssets.affectedFinancialCounterparts.percentage', '3.7'],
  [/^Number of affected transactions/, 'impactAssessment.affectedAssets.affectedTransactions.number', '3.9'],
  [/^Percentage of affected transactions/, 'impactAssessment.affectedAssets.affectedTransactions.percentage', '3.10'],
  [/^Value of affected transactions/, 'impactAssessment.affectedAssets.valueOfAffectedTransactions', '3.11'],
  [/^Information whether the values are actual or estimates/, 'impactAssessment.affectedAssets.numbersActualEstimate', '3.12'],
  [/^Reputational impact type/, 'incident.classificationTypes.0.reputationalImpactType', '3.13'],
  [/^Reputational impact description/, 'incident.classificationTypes.0.reputationalImpactDescription', '3.14'],
  [/^Incident duration is required/, 'incident.incidentDuration', '3.15'],
  [/^Information whether the values for duration/, 'informationDurationServiceDowntimeActualOrEstimate', '3.17'],
  [/type of impact in the member states/, 'incident.classificationTypes.0.memberStatesImpactType', '3.18'],
  [/^Description of the impact and severity in each affected member state/, 'incident.classificationTypes.0.memberStatesImpactTypeDescription', '3.19'],
  [/type of data loss is required/, 'incident.classificationTypes.0.dataLosseMaterialityThresholds', '3.20'],
  [/^Description of the data losses/, 'incident.classificationTypes.0.dataLossesDescription', '3.21'],
  [/^Critical services affected is required/, 'impactAssessment.criticalServicesAffected', '3.22'],
  [/^Incident classification is required/, 'incident.incidentType.incidentClassification', '3.23'],
  [/^Other incident classification/, 'incident.incidentType.otherIncidentClassification', '3.24'],
  [/^Threat techniques are required/, 'incident.incidentType.threatTechniques', '3.25'],
  [/^Other threat techniques/, 'incident.incidentType.otherThreatTechniques', '3.26'],
  [/^Affected functional areas/, 'impactAssessment.affectedFunctionalAreas', '3.27'],
  [/^Information about whether infrastructure components/, 'impactAssessment.isAffectedInfrastructureComponents', '3.28'],
  [/^Information about affected infrastructure components/, 'impactAssessment.affectedInfrastructureComponents', '3.29'],
  [/^Information about impact on financial interest/, 'impactAssessment.isImpactOnFinancialInterest', '3.30'],
  [/^Information about reporting to other authorities/, 'reportingToOtherAuthorities', '3.31'],
  [/^Specification of 'other' authorities/, 'reportingToOtherAuthoritiesOther', '3.32'],
  [/^Information about temporary actions/, 'impactAssessment.serviceImpact.isTemporaryActionsMeasuresForRecovery', '3.33'],
  [/^Description of temporary actions|^Reason why no temporary actions/, 'impactAssessment.serviceImpact.descriptionOfTemporaryActionsMeasuresForRecovery', '3.34'],
  [/^Indicators of compromise/, 'incident.incidentType.indicatorsOfCompromise', '3.35'],
  [/^High-level classification of root cause/, 'incident.rootCauseHLClassification', '4.1'],
  [/^Detailed classification of root causes/, 'incident.rootCausesDetailedClassification', '4.2'],
  [/^Additional classification of root causes/, 'incident.rootCausesAdditionalClassification', '4.3'],
  [/^Other types of root causes/, 'incident.rootCausesOther', '4.4'],
  [/^Information about the root causes/, 'incident.rootCausesInformation', '4.5'],
  [/^Incident resolution summary/, 'incident.incidentResolutionSummary', '4.6'],
  [/^Date and time when the incident root cause was addressed/, 'incident.rootCauseAddressingDateTime', '4.7'],
  [/^Date and time when the incident was resolved/, 'incident.incidentResolutionDateTime', '4.8'],
  [/^Reason for the difference between permanent resolution date/, 'incident.incidentResolutionVsPlannedImplementation', '4.9'],
  [/^Materiality threshold for the classification criterion 'Economic Impact'/, 'incident.classificationTypes.0.economicImpactMaterialityThreshold', '4.12'],
  [/^Amount of gross direct and indirect costs/, 'incident.grossAmountIndirectDirectCosts', '4.13'],
  [/^Amount of financial recoveries/, 'incident.financialRecoveriesAmount', '4.14'],
  [/^Recurring incidents/, (m, r) => (r?.incident?.recurringNonMajorIncidentsDescription ? 'incident.recurringIncidentDate' : 'incident.recurringNonMajorIncidentsDescription'), '4.15 / 4.16'],
];

// Étapes du formulaire : 0 Identity, 1 Contacts, 2 Incident
const ETAPE_IDENTITE = /^(incidentSubmission|reportCurrency|submittingEntity|affectedEntity|ultimateParentUndertaking)\b/;
const ETAPE_CONTACTS = /^(primaryContact|secondaryContact)\b/;

/** { champ, numero, etape } du champ visé par un message de validation, ou null s'il n'est pas reconnu */
export function champDeLErreur(message, rapport) {
  for (const [motif, champ, numero] of CORRESPONDANCES) {
    const m = motif.exec(message);
    if (m) {
      const chemin = typeof champ === 'function' ? champ(m, rapport) : champ;
      const etape = ETAPE_IDENTITE.test(chemin) ? 0 : ETAPE_CONTACTS.test(chemin) ? 1 : 2;
      return { champ: chemin, numero, etape };
    }
  }
  return null;
}
