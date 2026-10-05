// Contrôles avant transmission d'une déclaration d'incident à l'ACPR
// Sources : guide ACPR « Comment remplir la maquette d'incident DORA » (26/08/2025), schéma
// DORA IR v1.3 de la Banque de France (21/05/2026), règlement d'exécution (UE) 2025/302 et
// règlement délégué (UE) 2024/1772 (critères de classification).
// Les contrôles portent sur le JSON exporté (cleanReportForExport).

const LEI = /^[A-Z0-9]{18}\d{2}$/;
const DUREE = /^\d{1,3}:(?:[01]\d|2[0-3]):[0-5]\d$/;
const CODE_ACPR = /^\d{4}[IM]\d{7}$/;

const CRITERES_SECONDAIRES = [
  'clients_financial_counterparts_and_transactions_affected', 'geographical_spread', 'data_losses',
  'economic_impact', 'reputational_impact', 'duration_and_service_downtime',
];
// Cause générale -> préfixe attendu des causes détaillées
const PREFIXES_CAUSES = {
  malicious_actions: 'malicious_actions_', process_failure: 'process_failure_',
  system_failure_malfunction: 'system_failure_', human_error: 'human_error_', external_event: 'external_event_',
};
const CATEGORIES_CHIFFRES = [
  ['clients', ['actual_figures_for_clients_affected', 'estimates_for_clients_affected', 'no_impact_on_clients']],
  ['transactions', ['actual_figures_for_transactions_affected', 'estimates_for_transactions_affected', 'no_impact_on_transactions']],
  ['contreparties financières', ['actual_figures_for_financial_counterparts_affected', 'estimates_for_financial_counterparts_affected', 'no_impact_on_financial_counterparts']],
];

const texte = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * @returns [{ gravite: 'bloquant' | 'avertissement', message }]
 *   bloquant : non conforme au format ou à une obligation explicite (rejet ou relance probable)
 *   avertissement : point relevé fréquemment par l'ACPR, à vérifier
 */
export function controlesAcpr(rapport) {
  const r = [];
  const bloquant = (message) => r.push({ gravite: 'bloquant', message });
  const avertissement = (message) => r.push({ gravite: 'avertissement', message });
  const type = rapport.incidentSubmission;
  const suivi = type === 'intermediate_report' || type === 'final_report';
  const inc = rapport.incident ?? {};
  const impact = rapport.impactAssessment ?? {};

  // Identification
  const code = texte(inc.financialEntityCode);
  if (code && !/^[A-Za-z0-9-]+$/.test(code)) {
    bloquant(`Le code de l'incident « ${code} » ne doit contenir que des lettres, des chiffres et des tirets (« - »).`);
  }
  const entites = [
    ['entité déclarante', rapport.submittingEntity],
    ['entreprise mère ultime', rapport.ultimateParentUndertaking],
    ...(rapport.affectedEntity ?? []).map((e, i) => [`entité affectée n° ${i + 1}`, e]),
  ];
  for (const [nom, e] of entites) {
    if (e?.LEI && !LEI.test(e.LEI)) {
      bloquant(`Le LEI de l'${nom} (« ${e.LEI} ») doit être le LEI seul : 20 caractères, sans mention « LEI : » ni autre code.`);
    }
  }
  const codeAcpr = texte(inc.competentAuthorityCode);
  if (suivi && !codeAcpr) {
    bloquant("Le code de l'incident attribué par l'ACPR (reçu par e-mail avec l'accusé de réception de la notification initiale) est obligatoire.");
  } else if (codeAcpr && !CODE_ACPR.test(codeAcpr)) {
    bloquant(`Le code ACPR « ${codeAcpr} » doit être celui de l'accusé de réception : année, lettre I (incident) ou M (menace), puis 7 chiffres (ex. 2026I0001234).`);
  }

  // Classification : un incident est majeur s'il touche des services critiques et remplit au moins
  // deux autres critères (ou s'il s'agit d'un accès malveillant ayant entraîné des pertes de données)
  const criteres = (inc.classificationTypes ?? []).map((c) => c.classificationCriterion);
  const secondaires = criteres.filter((c) => CRITERES_SECONDAIRES.includes(c)).length;
  const malveillant = (inc.incidentType?.incidentClassification ?? []).includes('cybersecurity-related');
  if (criteres.length && (!criteres.includes('critical_services_affected')
    || (secondaires < 2 && !(malveillant && criteres.includes('data_losses'))))) {
    avertissement("Les critères cochés ne suffisent pas à qualifier l'incident de majeur : il faut « services critiques affectés » "
      + "et au moins deux autres critères (ou un accès malveillant avec pertes de données). Vérifiez la classification avant de notifier.");
  }

  // Formats
  if (inc.incidentDuration && !DUREE.test(inc.incidentDuration)) {
    bloquant(`Durée de l'incident « ${inc.incidentDuration} » : format attendu jours:heures:minutes (ex. 00:04:12).`);
  }
  const arret = impact.serviceImpact?.serviceDowntime;
  if (arret && !DUREE.test(arret)) {
    bloquant(`Durée d'interruption du service « ${arret} » : format attendu jours:heures:minutes (ex. 00:04:12).`);
  }
  for (const [cle, nom] of [['affectedClients', 'clients'], ['affectedFinancialCounterparts', 'contreparties financières'], ['affectedTransactions', 'transactions']]) {
    const p = impact.affectedAssets?.[cle]?.percentage;
    if (typeof p === 'number' && Math.round(p * 10) !== p * 10) {
      bloquant(`Pourcentage de ${nom} affectés (${p}) : une décimale au plus, arrondie au supérieur (ex. 150,45 % -> 150.5).`);
    }
  }
  if ([inc.grossAmountIndirectDirectCosts, inc.financialRecoveriesAmount, impact.affectedAssets?.valueOfAffectedTransactions].some((v) => v > 0)) {
    avertissement('Les montants (coûts, recouvrements, valeur des transactions) sont attendus en milliers de la devise : 0.1 = 100 €, 1 = 1 000 €.');
  }

  // Champs conditionnels
  const typesIncident = inc.incidentType?.incidentClassification ?? [];
  if (typesIncident.includes('other') && !texte(inc.incidentType?.otherIncidentClassification)) {
    bloquant('Type d\'incident « autre » : décrivez précisément la classification (champ « Other incident classification »).');
  }
  if ((inc.incidentType?.threatTechniques ?? []).includes('other') && !texte(inc.incidentType?.otherThreatTechniques)) {
    bloquant('Technique de menace « autre » : décrivez la technique employée.');
  }
  const autorites = rapport.reportingToOtherAuthorities ?? [];
  if (autorites.includes('none') && autorites.length > 1) {
    bloquant('Autres autorités notifiées : « none » ne peut pas être combiné avec une autre réponse.');
  }
  if (autorites.includes('other') && !texte(rapport.reportingToOtherAuthoritiesOther)) {
    bloquant('Autres autorités notifiées « other » : indiquez le nom de toutes les autres autorités informées.');
  }
  if (suivi && autorites.length === 0) {
    bloquant('Autres autorités notifiées : répondez « none » si seule l\'ACPR a été informée.');
  }
  const chiffres = impact.affectedAssets?.numbersActualEstimate ?? [];
  if (suivi || chiffres.length) {
    for (const [nom, valeurs] of CATEGORIES_CHIFFRES) {
      const n = chiffres.filter((v) => valeurs.includes(v)).length;
      if (n !== 1) bloquant(`Chiffres réels ou estimés : une réponse et une seule est attendue pour les ${nom} (${n} cochée(s)).`);
    }
  }
  const causesGenerales = inc.rootCauseHLClassification ?? [];
  const prefixes = causesGenerales.map((c) => PREFIXES_CAUSES[c]).filter(Boolean);
  const incoherentes = (inc.rootCausesDetailedClassification ?? []).filter((d) => !prefixes.some((p) => d.startsWith(p)));
  if (causesGenerales.length && incoherentes.length) {
    bloquant(`Causes détaillées sans rapport avec les causes générales cochées : ${incoherentes.join(', ')}.`);
  }
  if (type === 'final_report') {
    if (!texte(inc.rootCausesInformation)) bloquant('Rapport final : décrivez la séquence des événements ayant conduit à l\'incident (informations sur les causes).');
    if (!texte(impact.serviceImpact?.descriptionOfTemporaryActionsMeasuresForRecovery)) {
      bloquant(impact.serviceImpact?.isTemporaryActionsMeasuresForRecovery === true
        ? 'Rapport final : des actions temporaires sont déclarées (3.33), décrivez-les (3.34).'
        : 'Rapport final : indiquez pourquoi aucune action temporaire n\'a été prise (3.34, attendu par l\'ACPR).');
    }
    if (!(inc.rootCausesDetailedClassification ?? []).length) bloquant('Rapport final : la classification détaillée des causes est obligatoire.');
    if (!texte(inc.incidentResolutionSummary)) bloquant('Rapport final : décrivez la résolution de l\'incident et les enseignements tirés.');
  }

  // Chronologie : survenance <= détection <= classification
  const d = (v) => (v ? new Date(v) : null);
  const [survenance, detection, classification] = [inc.incidentOccurrenceDateTime, inc.detectionDateTime, inc.classificationDateTime].map(d);
  if (detection && classification && classification < detection) {
    avertissement('La date de classification est antérieure à la date de détection : vérifiez les deux dates.');
  }
  if (survenance && detection && detection < survenance) {
    avertissement('La date de détection est antérieure à la date de survenance de l\'incident : vérifiez les deux dates.');
  }
  if (!rapport.ultimateParentUndertaking?.name || !rapport.ultimateParentUndertaking?.LEI) {
    avertissement('Entreprise mère ultime : son nom et son LEI sont obligatoires si l\'entité appartient à un groupe (champs 1.13 et 1.14).');
  }
  const pays = (inc.classificationTypes ?? []).flatMap((c) => c.countryCodeMaterialityThresholds ?? []);
  if (pays.includes('FR')) {
    avertissement('Propagation géographique : la France, pays d\'origine de l\'entité, ne doit pas figurer parmi les États membres touchés (seuls les autres États membres comptent).');
  }
  if ((rapport.affectedEntity ?? []).some((e) => !e.LEI)) {
    avertissement('Entité affectée sans LEI : c\'est admis seulement si elle est l\'entité déclarante elle-même (champs 1.5 et 1.6).');
  }

  // Qualité rédactionnelle relevée par l'ACPR
  if (texte(inc.incidentDescription) && texte(inc.incidentDescription).length < 150) {
    avertissement('Description de l\'incident très courte : expliquez le problème et en quoi il est majeur, sans abréviations internes, pour un lecteur extérieur.');
  }
  const tiers = texte(inc.originatesFromThirdPartyProvider);
  if (tiers && (/^(oui|yes|non|no|n\/a|na)$/i.test(tiers) || tiers.length < 15)) {
    avertissement('Incident causé par un prestataire : indiquez « nom légal;code;LEI ou EUID;informations complémentaires » (format recommandé par les autorités européennes). Laissez vide si aucun prestataire n\'est en cause.');
  }
  return r;
}
