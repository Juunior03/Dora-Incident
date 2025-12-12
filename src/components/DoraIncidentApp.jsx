import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext.jsx'
import { v4 as uuidv4 } from 'uuid';
import PropTypes from 'prop-types';
import { getSettings, saveSettings } from '../utils/supabaseSettings.js'

const nowISO = () => new Date().toISOString()

    function orderAffectedEntityKeys(affectedEntities) {
      const keyOrder = ['entityType', 'name', 'code', 'affectedEntityType', 'LEI'];
      return affectedEntities.map(entity => {
        const ordered = {};
        for (const key of keyOrder) {
          if (key in entity) ordered[key] = entity[key];
        }
        return ordered;
      });
    }

    function cleanReportForExport(report) {
      const { id, incidentId, savedAt, status, skipIdentity, skipContacts, nextSubmissionType, comments, isParametersSet, ...cleanedReport } = report;

      // Nettoyer les numéros de téléphone
      cleanedReport.primaryContact = cleanPhoneNumber(cleanedReport.primaryContact);
      cleanedReport.secondaryContact = cleanPhoneNumber(cleanedReport.secondaryContact);

      // Décomposer classificationTypes
      if (cleanedReport.incident?.classificationTypes?.length) {
        cleanedReport.incident.classificationTypes = expandClassificationTypes(cleanedReport.incident.classificationTypes);
      }

      // Convertir les champs numériques
      const { incident: cleanedIncident, impactAssessment: cleanedImpactAssessment } = convertNumericFields(
        cleanedReport.incident,
        cleanedReport.impactAssessment
      );
      cleanedReport.incident = cleanedIncident;
      cleanedReport.impactAssessment = cleanedImpactAssessment;

      // Formater les dates
      if (cleanedReport.incident) {
        cleanedReport.incident = formatDates(cleanedReport.incident);
      }
      if (cleanedReport.impactAssessment?.serviceImpact?.serviceRestorationDateTime) {
        cleanedReport.impactAssessment.serviceImpact.serviceRestorationDateTime =
          formatDateForExport(cleanedReport.impactAssessment.serviceImpact.serviceRestorationDateTime, 'withMilliseconds');
      }

      // Ordonner les clés des entités affectées
      if (Array.isArray(cleanedReport.affectedEntity)) {
        cleanedReport.affectedEntity = orderAffectedEntityKeys(cleanedReport.affectedEntity);
      }

      if (cleanedReport.submittingEntity) {
        const { isParametersSet, ...submittingEntity } = cleanedReport.submittingEntity;
        cleanedReport.submittingEntity = submittingEntity;
      }

      return cleanedReport;
    }

    // Sous-fonction pour nettoyer les numéros de téléphone
    function cleanPhoneNumber(contact) {
      if (!contact) return contact;
      const phoneNumber = typeof contact.phone === 'string' ? contact.phone : '';
      const countryCode = typeof contact.countryCode === 'string' ? contact.countryCode : '+33';
      const hasCountryCode = phoneNumber.startsWith('+');
      if (!hasCountryCode && phoneNumber) {
        contact.phone = countryCode + phoneNumber;
      }
      delete contact.countryCode;
      return contact;
    }

    // Sous-fonction pour décomposer classificationTypes
    function expandClassificationTypes(classificationTypes) {
      if (!Array.isArray(classificationTypes) || !classificationTypes.length) {
        return classificationTypes;
      }

      const expanded = [];

      for (const ct of classificationTypes) {
        if (Array.isArray(ct.classificationCriterion)) {
          for (const criterion of ct.classificationCriterion) {
            expanded.push({ ...ct, classificationCriterion: criterion });
          }
        } else {
          expanded.push(ct);
        }
      }

      return expanded.map(ct => {
        const base = { classificationCriterion: ct.classificationCriterion };

        switch (ct.classificationCriterion) {
          case 'geographical_spread':
            return {
              ...base,
              countryCodeMaterialityThresholds: ct.countryCodeMaterialityThresholds ?? [],
              memberStatesImpactType: ct.memberStatesImpactType ?? [],
              memberStatesImpactTypeDescription: ct.memberStatesImpactTypeDescription ?? "",
            };
          case 'data_losses':
            return {
              ...base,
              dataLosseMaterialityThresholds: ct.dataLosseMaterialityThresholds ?? [],
              dataLossesDescription: ct.dataLossesDescription ?? "",
            };
          case 'reputational_impact':
            return {
              ...base,
              reputationalImpactType: ct.reputationalImpactType ?? [],
              reputationalImpactDescription: ct.reputationalImpactDescription ?? "",
            };
          default:
            return base;
        }
      });
    }

    // Sous-fonction pour convertir les champs numériques
    function convertNumericFields(incident, impactAssessment) {
      if (!incident) return { incident, impactAssessment };

      convertIncidentNumericFields(incident);
      convertImpactAssessmentNumericFields(impactAssessment);

      return { incident, impactAssessment };
    }

    function convertIncidentNumericFields(incident) {
      const numericFields = ['financialRecoveriesAmount', 'grossAmountIndirectDirectCosts'];
      for (const key of numericFields) {
        convertStringToNumber(incident, key);
      }
    }

    function convertImpactAssessmentNumericFields(impactAssessment) {
      if (!impactAssessment?.affectedAssets) return;

      const assets = impactAssessment.affectedAssets;
      const sections = ['affectedClients', 'affectedFinancialCounterparts', 'affectedTransactions'];

      for (const section of sections) {
        if (!assets[section]) continue;

        const fields = ['number', 'percentage'];
        for (const field of fields) {
          convertStringToNumber(assets[section], field);
        }
      }

      convertStringToNumber(assets, 'valueOfAffectedTransactions');
    }

    function convertStringToNumber(object, key) {
      if (!object || typeof object[key] !== 'string') return;

      const val = object[key].trim();
      if (val) {
        object[key] = Number(val);
      }
    }

    // Sous-fonction pour formater les dates
    function formatDates(incident) {
      if (!incident) return incident;

      if (incident.classificationDateTime) {
        incident.classificationDateTime = formatDateForExport(incident.classificationDateTime, 'withZ');
      }

      const otherDateFields = [
        'detectionDateTime',
        'incidentOccurrenceDateTime',
        'rootCauseAddressingDateTime',
        'incidentResolutionDateTime',
        'recurringIncidentDate'
      ];

      for (const field of otherDateFields) {
        if (incident[field]) {
          incident[field] = formatDateForExport(incident[field], 'withMilliseconds');
        }
      }

      return incident;
    }

    function niceDownload(filename, data) {
      const cleanedData = cleanReportForExport(data);
      const blob = new Blob([JSON.stringify(cleanedData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }

    function exportReportJSON(report) {
      // Récupérer la structure de base avec emptyDraft
      const baseStructure = emptyDraft(report.incidentId);

      // Fusionner les données du rapport existant avec la structure de base
      const mergedReport = deepMerge(baseStructure, report);

      // Nettoyer le rapport fusionné pour l'export
      const cleanedReport = cleanReportForExport(mergedReport);

      // Vérification supplémentaire pour éviter la double concaténation
      if (cleanedReport.primaryContact && typeof cleanedReport.primaryContact.phone === 'string') {
        // Si le numéro commence déjà par un +, on ne fait rien
        if (!cleanedReport.primaryContact.phone.startsWith('+')) {
          cleanedReport.primaryContact.phone = (cleanedReport.primaryContact.countryCode || '+33') + cleanedReport.primaryContact.phone;
        }
        delete cleanedReport.primaryContact.countryCode;
      }

      if (cleanedReport.secondaryContact && typeof cleanedReport.secondaryContact.phone === 'string') {
        // Si le numéro commence déjà par un +, on ne fait rien
        if (!cleanedReport.secondaryContact.phone.startsWith('+')) {
          cleanedReport.secondaryContact.phone = (cleanedReport.secondaryContact.countryCode || '+33') + cleanedReport.secondaryContact.phone;
        }
        delete cleanedReport.secondaryContact.countryCode;
      }

      const financialEntityCode = report.incident?.financialEntityCode || 'unknown';
      const filename = `dora-incident-${financialEntityCode}.json`;

      niceDownload(filename, cleanedReport);
    }

    function deepMerge(target, source) {
      const output = { ...target };
      if (isObject(source) && isObject(target)) {
        for (const key of Object.keys(source)) {
          if (isObject(source[key]) && key in target) {
            output[key] = deepMerge(target[key], source[key]);
          } else {
            output[key] = source[key];
          }
        }
      }
      return output;
    }

    function isObject(item) {
      return (item && typeof item === 'object' && !Array.isArray(item));
    }

    const getSecureRandomValue = (() => {
      const crypto = globalThis.crypto || globalThis.msCrypto;
      return () => {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        return array[0] / 4294967295;
      };
    })();

    function ConfettiCanvas({ trigger }) {
      useEffect(() => {
        if (!trigger) return;
        const canvas = document.createElement('canvas');
        canvas.style.position = 'fixed';
        canvas.style.left = '0';
        canvas.style.top = '0';
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '9999';
        document.body.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        const getSecureRandomValue = (() => {
          const crypto = globalThis.crypto || globalThis.msCrypto;
          return () => {
            const array = new Uint32Array(1);
            crypto.getRandomValues(array);
            return array[0] / 4294967295;
          };
        })();
        const randomValues = Array.from({ length: 60 }, () => ({
          x: getSecureRandomValue(),
          yOffset: getSecureRandomValue(),
          r: getSecureRandomValue(),
          vxOffset: getSecureRandomValue(),
          vyOffset: getSecureRandomValue(),
          colorHue: getSecureRandomValue()
        }));
        const pieces = Array.from({ length: 60 }).map((_, i) => ({
          x: randomValues[i].x * canvas.width,
          y: -20 - randomValues[i].yOffset * 200,
          r: 6 + randomValues[i].r * 8,
          vx: -2 + randomValues[i].vxOffset * 4,
          vy: 2 + randomValues[i].vyOffset * 6,
          color: `hsl(${randomValues[i].colorHue * 360}, 80%, 55%)`,
        }));
        let t = 0;
        const id = setInterval(() => {
          t += 1;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          for (const p of pieces) {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
          }
          if (t > 80) {
            clearInterval(id);
            canvas.remove();
          }
        }, 16);
        return () => {
          clearInterval(id);
          canvas.remove();
        };
      }, [trigger]);
      return null;
    }

    ConfettiCanvas.propTypes = {
      trigger: PropTypes.bool,
    };

    function handleError(error) {
      if (error) {
        console.error('Erreur lors de la récupération du rapport depuis Supabase :', error);
        return true;
      }
      return false;
    }

    function ensureCountryCode(draft) {
      if (!draft.primaryContact.countryCode) {
        draft.primaryContact.countryCode = '+33';
      }
      if (!draft.secondaryContact.countryCode) {
        draft.secondaryContact.countryCode = '+33';
      }
    }

    function processPhoneNumber(contact) {
      if (typeof contact.phone === 'string' && contact.phone.startsWith('+')) {
        const countryCodeMatch = contact.phone.match(/^\+\d+/);
        if (countryCodeMatch) {
          contact.countryCode = countryCodeMatch[0];
          contact.phone = contact.phone.substring(countryCodeMatch[0].length);
        }
      }
    }

    function processPhoneNumbers(draft) {
      processPhoneNumber(draft.primaryContact);
      processPhoneNumber(draft.secondaryContact);
    }

    const ENTITY_TYPES = [
      { value: "credit_institution", label: "Credit Institution" },
      { value: "payment_institution", label: "Payment Institution" },
      { value: "exempted_payment_institution", label: "Exempted Payment Institution " },
      { value: "account_information_service_provider", label: "Account Information Service Provider" },
      { value: "electronic_money_institution", label: "Electronic Money Institution " },
      { value: "exempted_electronic_money_institution", label: "Exempted Electronic Money Institution" },
      { value: "investment_firm", label: "Investment Firm" },
      { value: "crypto-asset_service_provider", label: "Crypto Asset Service Provider" },
      { value: "issuer_of_asset-referenced_tokens", label: "Issuer Of Asset Referenced Tokens" },
      { value: "central_securities_depository", label: "Central Securities Depository" },
      { value: "central_counterparty", label: "Central Counterparty " },
      { value: "trading_venue", label: "Trading Venue" },
      { value: "trade_repository", label: "Trade Repository" },
      { value: "manager_of_alternative_investment_fund", label: "Manager Of Alternative Investment Fund " },
      { value: "management_company", label: "Management Company" },
      { value: "data_reporting_service_provider", label: "Data Reporting Service Provider" },
      { value: "insurance_and_reinsurance_undertaking", label: "Insurance And Reinsurance Undertaking" },
      { value: "institution_for_occupational_retirement_provision", label: "Institution For Occupational Retirement Provision" },
      { value: "credit_rating_agency", label: "Credit Rating Agency " },
      { value: "administrator_of_critical_benchmarks", label: "Administrator Of Critical Benchmarks" },
      { value: "crowdfunding_service_provider", label: "Crowdfunding Service Provider" },
      { value: "securitisation_repository", label: "Securitisation Repository" }
    ]

    const CLASSIFICATION_CRITERIA = [
      { value: "clients_financial_counterparts_and_transactions_affected", label: "Clients, financial counterparts affected" },
      { value: "geographical_spread", label: "Geographical spread" },
      { value: "data_losses", label: "Data losses" },
      { value: "critical_services_affected", label: "Critical services affected" },
      { value: "economic_impact", label: "Economic impact" },
      { value: "reputational_impact", label: "Reputational impact" },
      { value: "duration_and_service_downtime", label: "Duration and service downtime" }
    ]

    const COUNTRY_OPTIONS = [
      { value: "AT", label: "Autriche" },  { value: "BE", label: "Belgique" },  { value: "BG", label: "Bulgarie" },
      { value: "HR", label: "Croatie" },  { value: "CY", label: "Chypre" },
      { value: "CZ", label: "République tchèque" },  { value: "DK", label: "Danemark" },  { value: "EE", label: "Estonie" },
      { value: "ES", label: "Espagne" },  { value: "FI", label: "Finlande" },  { value: "FR", label: "France" },
      { value: "DE", label: "Allemagne" },  { value: "GR", label: "Grèce" },  { value: "HU", label: "Hongrie" },
      { value: "IS", label: "Islande" },  { value: "IE", label: "Irlande" },  { value: "IT", label: "Italie" },
      { value: "LI", label: "Liechtenstein" },  { value: "LT", label: "Lituanie" },  { value: "LU", label: "Luxembourg" },
      { value: "LV", label: "Lettonie" },  { value: "MT", label: "Malte" },  { value: "NL", label: "Pays-Bas" },
      { value: "NO", label: "Norvège" },  { value: "PL", label: "Pologne" },  { value: "PT", label: "Portugal" },
      { value: "RO", label: "Roumanie" },  { value: "SE", label: "Suède" },  { value: "SI", label: "Slovénie" },  { value: "SK", label: "Slovaquie" },
    ];

    const INCIDENT_DISCOVERY_OPTIONS = [
      { value: "it_security", label: "IT Security" },
      { value: "staff", label: "Staff" },
      { value: "internal_audit", label: "Internal Audit" },
      { value: "external_audit", label: "External Audit" },
      { value: "clients", label: "Clients" },
      { value: "financial_counterparts", label: "Financial Counterparts" },
      { value: "third-party_provider", label: "Third-Party Provider" },
      { value: "attacker", label: "Attacker" },
      { value: "monitoring_systems", label: "Monitoring Systems" },
      { value: "authority_agency_law_enforcement_body", label: "Authority/Agency/Law Enforcement Body" },
      { value: "other", label: "Other" },
    ];

    const NUMBERS_ACTUAL_ESTIMATE_OPTIONS = [
      { value: "actual_figures_for_clients_affected", label: "Actual figures for clients affected" },
      { value: "actual_figures_for_financial_counterparts_affected", label: "Actual figures for financial counterparts affected" },
      { value: "actual_figures_for_transactions_affected", label: "Actual figures for transactions affected" },
      { value: "estimates_for_clients_affected", label: "Estimates for clients affected" },
      { value: "estimates_for_financial_counterparts_affected", label: "Estimates for financial counterparts affected" },
      { value: "estimates_for_transactions_affected", label: "Estimates for transactions affected" },
      { value: "no_impact_on_clients", label: "No impact on clients" },
      { value: "no_impact_on_financial_counterparts", label: "No impact on financial counterparts" },
      { value: "no_impact_on_transactions", label: "No impact on transactions" },
    ];

    const REPUTATIONAL_IMPACT_OPTIONS = [
      {
        value: "the_major_ict-related_incident_has_been_reflected_in_the_media",
        label: "The major ICT-related incident has been reflected in the media"
      },
      {
        value: "the_major_ict-related_incident_has_resulted_in_repetitive_complaints_from_different_clients_or_financial_counterparts_on_client-facing_services_or_critical_business_relationships",
        label: "The major ICT-related incident has resulted in repetitive complaints from different clients or financial counterparts on client-facing services or critical business relationships"
      },
      {
        value: "the_financial_entity_will_not_be_able_to_or_is_likely_not_to_be_able_to_meet_regulatory_requirements_as_a_result_of_the_major_ict-related_incident",
        label: "The financial entity will not be able to or is likely not to be able to meet regulatory requirements as a result of the major ICT-related incident"
      },
      {
        value: "the_financial_entity_will_or_is_likely_to_lose_clients_or_financial_counterparts_with_a_material_impact_on_its_business_as_a_result_of_the_major_ict-related_incident",
        label: "The financial entity will or is likely to lose clients or financial counterparts with a material impact on its business as a result of the major ICT-related incident"
      },
    ];

    const DURATION_SERVICE_DOWNTIME_OPTIONS = [
      { value: "actual_figures", label: "Actual figures" },
      { value: "estimates", label: "Estimates" },
      { value: "actual_figures_and_estimates", label: "Actual figures and estimates" },
      { value: "no_information_available", label: "No information available" },
    ];

    const MEMBER_STATES_IMPACT_TYPE_OPTIONS = [
      { value: "clients", label: "Clients" },
      { value: "financial_counterparts", label: "Financial counterparts" },
      { value: "branch_of_the_financial_entity", label: "Branch of the financial entity" },
      { value: "financial_entities_within_the_group_carrying_out_activities_in_the_respective_member_state", label: "Financial entities within the group carrying out activities in the respective Member State" },
      { value: "financial_market_infrastructure", label: "Financial market infrastructure" },
      { value: "third-party_providers_that_may_be_common_to_other_financial_entities", label: "Third-party providers that may be common to other financial entities" },
    ];

    const DATA_LOSS_MATERIALITY_THRESHOLDS_OPTIONS = [
      { value: "availability", label: "Availability" },
      { value: "authenticity", label: "Authenticity" },
      { value: "integrity", label: "Integrity" },
      { value: "confidentiality", label: "Confidentiality" },
    ];

    const INCIDENT_CLASSIFICATION_OPTIONS = [
      { value: "cybersecurity-related", label: "Cybersecurity-related" },
      { value: "process_failure", label: "Process failure" },
      { value: "system_failure", label: "System failure" },
      { value: "external_event", label: "External event" },
      { value: "payment-related", label: "Payment-related" },
      { value: "other", label: "Other (please specify)" },
    ];

    const THREAT_TECHNIQUES_OPTIONS = [
      { value: "social_engineering_including_phishing", label: "Social engineering (including phishing)" },
      { value: "ddos", label: "(D)DoS" },
      { value: "identity_theft", label: "Identity theft" },
      { value: "data_encryption_for_impact_including_ransomware", label: "Data encryption for impact (including ransomware)" },
      { value: "resource_hijacking", label: "Resource hijacking" },
      { value: "data_exfiltration_and_manipulation_including_identity_theft", label: "Data exfiltration and manipulation (including identity theft)" },
      { value: "data_destruction", label: "Data destruction" },
      { value: "defacement", label: "Defacement" },
      { value: "supply-chain_attack", label: "Supply-chain attack" },
      { value: "other", label: "Other (please specify)" },
    ];

    const IS_AFFECTED_INFRASTRUCTURE_OPTIONS = [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "information_not_available", label: "Information not available" },
    ];

    const IS_IMPACT_ON_FINANCIAL_INTEREST_OPTIONS = [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "information_not_available", label: "Information not available" },
    ];

    const REPORTING_TO_OTHER_AUTHORITIES_OPTIONS = [
      { value: "police_law_enforcement", label: "Police/Law Enforcement" },
      { value: "csirt", label: "CSIRT" },
      { value: "data_protection_authority", label: "Data Protection Authority" },
      { value: "national_cybersecurity_agency", label: "National Cybersecurity Agency" },
      { value: "none", label: "None" },
      { value: "other", label: "Other (please specify)" },
    ];

    const ROOT_CAUSE_HL_CLASSIFICATION_OPTIONS = [
      { value: "malicious_actions", label: "Malicious actions" },
      { value: "process_failure", label: "Process failure" },
      { value: "system_failure_malfunction", label: "System failure/malfunction" },
      { value: "human_error", label: "Human error" },
      { value: "external_event", label: "External event" },
    ];

    const ROOT_CAUSES_DETAILED_CLASSIFICATION_OPTIONS = [
      { value: "malicious_actions_deliberate_internal_actions", label: "Malicious actions: deliberate internal actions" },
      { value: "malicious_actions_deliberate_physical_damage_manipulation_theft", label: "Malicious actions: deliberate physical damage/manipulation/theft" },
      { value: "malicious_actions_fraudulent_actions", label: "Malicious actions: fraudulent actions" },
      { value: "process_failure_insufficient_monitoring_or_failure_of_monitoring_and_control", label: "Process failure: insufficient monitoring or failure of monitoring and control" },
      { value: "process_failure_insufficient_unclear_roles_and_responsibilities", label: "Process failure: insufficient/unclear roles and responsibilities" },
      { value: "process_failure_ICT_risk_management_process_failure", label: "Process failure: ICT risk management process failure" },
      { value: "process_failure_insufficient_or_failure_of_ict_operations_and_ict_security_operations", label: "Process failure: insufficient or failure of ICT operations and ICT security operations" },
      { value: "process_failure_insufficient_or_failure_of_ict_project_management", label: "Process failure: insufficient or failure of ICT project management" },
      { value: "process_failure_inadequacy_of_internal_policies_procedures_and_documentation", label: "Process failure: inadequacy of internal policies, procedures, and documentation" },
      { value: "process_failure_inadequate_ict_systems_acquisition_development_and_maintenance", label: "Process failure: inadequate ICT systems acquisition, development, and maintenance" },
      { value: "process_failure_other", label: "Process failure: other" },
      { value: "system_failure_hardware_capacity_and_performance", label: "System failure: hardware capacity and performance" },
      { value: "system_failure_hardware_maintenance", label: "System failure: hardware maintenance" },
      { value: "system_failure_hardware_obsolescence_ageing", label: "System failure: hardware obsolescence/ageing" },
      { value: "system_failure_software_compatibility_configuration", label: "System failure: software compatibility/configuration" },
      { value: "system_failure_software_performance", label: "System failure: software performance" },
      { value: "system_failure_network_configuration", label: "System failure: network configuration" },
      { value: "system_failure_physical_damage", label: "System failure: physical damage" },
      { value: "system_failure_other", label: "System failure: other" },
      { value: "human_error_omission", label: "Human error: omission" },
      { value: "human_error_mistake", label: "Human error: mistake" },
      { value: "human_error_skills_knowledge", label: "Human error: skills & knowledge" },
      { value: "human_error_inadequate_human_resources", label: "Human error: inadequate human resources" },
      { value: "human_error_miscommunication", label: "Human error: miscommunication" },
      { value: "human_error_other", label: "Human error: other" },
      { value: "external_event_natural_disasters_force_majeure", label: "External event: natural disasters/force majeure" },
      { value: "external_event_third-party_failures", label: "External event: third-party failures" },
      { value: "external_event_other", label: "External event: other" },
    ];

    const ROOT_CAUSES_ADDITIONAL_CLASSIFICATION_OPTIONS = [
      { value: "monitoring_of_policy_adherence", label: "Monitoring of policy adherence" },
      { value: "monitoring_of_third-party_service_providers", label: "Monitoring of third-party service providers" },
      { value: "monitoring_and_verification_of_remediation_of_vulnerabilities", label: "Monitoring and verification of remediation of vulnerabilities" },
      { value: "identity_and_access_management", label: "Identity and access management" },
      { value: "encryption_and_cryptography", label: "Encryption and cryptography" },
      { value: "logging", label: "Logging" },
      { value: "failure_in_specifying_accurate_risk_tolerance_levels", label: "Failure in specifying accurate risk tolerance levels" },
      { value: "insufficient_vulnerability_and_threat_assessments", label: "Insufficient vulnerability and threat assessments" },
      { value: "inadequate_risk_treatment_measures", label: "Inadequate risk treatment measures" },
      { value: "poor_management_of_residual_ict_risks", label: "Poor management of residual ICT risks" },
      { value: "vulnerability_and_patch_management", label: "Vulnerability and patch management" },
      { value: "change_management", label: "Change management" },
      { value: "capacity_and_performance_management", label: "Capacity and performance management" },
      { value: "ict_asset_management_and_information_classification", label: "ICT asset management and information classification" },
      { value: "backup_and_restore", label: "Backup and restore" },
      { value: "error_handling", label: "Error handling" },
      { value: "inadequate_ict_systems_acquisition_development_and_maintenance", label: "Inadequate ICT systems acquisition, development, and maintenance" },
      { value: "insufficient_or_failure_of_software_testing", label: "Insufficient or failure of software testing" }
    ];

    const COUNTRY_CODES = [
      { value: "+33", label: "(+33)" },
      { value: "+32", label: "(+32)" },
      { value: "+40", label: "(+40)" },
      { value: "+41", label: "(+41)" },
      { value: "+49", label: "(+49)" },
      { value: "+44", label: "(+44)" },
      { value: "+1", label: "(+1)" },
      { value: "+7", label: "(+7)" },
      { value: "+81", label: "(+81)" },
      { value: "+86", label: "(+86)" },
    ];

    /**
     * Valide tous les champs d'un rapport et retourne une liste d'erreurs.
     * @param {Object} report - Le rapport à valider.
     * @returns {Array} Liste des messages d'erreur.
     */
    function validateReportFields(report) {
      const errors = [];

      // Validations communes à tous les types de rapports
      validateCommonFields(report, errors);

      // Validations spécifiques aux rapports intermédiaires et finaux
      if (report.incidentSubmission === "intermediate_report" || report.incidentSubmission === "final_report") {
        validateIntermediateAndFinalReportFields(report, errors);
      }

      // Validations spécifiques aux rapports finaux
      if (report.incidentSubmission === "final_report") {
        validateFinalReportFields(report, errors);
      }

      return errors;
    }

    // Valide les champs obligatoires pour tous les rapports
    function validateCommonFields(report, errors) {
      const commonFields = [
        { path: ['incidentSubmission'], message: "Type of report is required" },
        { path: ['reportCurrency'], message: "Report currency is required" },
        { path: ['submittingEntity', 'name'], message: "Submitting entity name is required" },
        { path: ['submittingEntity', 'code'], message: "Submitting entity code is required" },
        { path: ['submittingEntity', 'affectedEntityType'], check: (value) => value?.length, message: "Affected entity type is required" },
        { path: ['primaryContact', 'name'], message: "Primary contact name is required" },
        { path: ['primaryContact', 'email'], message: "Primary contact email is required" },
        { path: ['primaryContact', 'phone'], message: "Primary contact phone is required" },
        { path: ['secondaryContact', 'name'], message: "Secondary contact name is required" },
        { path: ['secondaryContact', 'email'], message: "Secondary contact email is required" },
        { path: ['secondaryContact', 'phone'], message: "Secondary contact phone is required" },
        { path: ['incident', 'financialEntityCode'], message: "Incident Reference code is required" },
        { path: ['incident', 'detectionDateTime'], check: (value) => value && !Number.isNaN(new Date(value).getTime()), message: "Incident detection date and time must be valid" },
        { path: ['incident', 'classificationDateTime'], check: (value) => value && !Number.isNaN(new Date(value).getTime()), message: "Incident classification date and time must be valid" },
        { path: ['incident', 'incidentDescription'], message: "Incident description is required" },
        { path: ['incident', 'classificationTypes', 0, 'classificationCriterion'], check: (value) => value?.length, message: "At least one classification criterion is required" },
        { path: ['incident', 'incidentDiscovery'], message: "Incident discovery is required" },
      ];

      validateFields(report, commonFields, errors);

      // Validation spécifique pour "countryCodeMaterialityThresholds" si "geographical_spread" est sélectionné
      if (report.incident?.classificationTypes?.[0]?.classificationCriterion?.includes("geographical_spread")) {
        if (!report.incident?.classificationTypes?.[0]?.countryCodeMaterialityThresholds?.length) {
          errors.push("Country code materiality thresholds are required when 'Geographical spread' is selected");
        }
      }

      // Validation des emails
      if (report.primaryContact?.email && !isValidEmail(report.primaryContact.email)) {
        errors.push("Primary contact email must be valid");
      }
      if (report.secondaryContact?.email && !isValidEmail(report.secondaryContact.email)) {
        errors.push("Secondary contact email must be valid");
      }
    }

    /**
     * Valide les champs spécifiques aux rapports intermédiaires et finaux.
     */
    function validateIntermediateAndFinalReportFields(report, errors) {
      // Validations de base pour les champs obligatoires
      validateRequiredFieldsForIntermediateAndFinalReports(report, errors);

      // Validations conditionnelles basées sur les critères de classification
      validateConditionalFieldsByClassification(report, errors);

      // Validations spécifiques aux incidents de type "cybersecurity-related"
      validateCybersecurityRelatedFields(report, errors);

      // Validations spécifiques aux actions temporaires de récupération
      validateTemporaryRecoveryActions(report, errors);
    }

    /**
     * Valide les champs obligatoires pour les rapports intermédiaires et finaux.
     */
    function validateRequiredFieldsForIntermediateAndFinalReports(report, errors) {
      const fields = [
        { path: ['incident', 'incidentOccurrenceDateTime'], check: (value) => value && !Number.isNaN(new Date(value).getTime()), message: "Incident occurrence date and time must be valid" },
        { path: ['impactAssessment', 'affectedAssets', 'affectedClients', 'percentage'], message: "Percentage of affected clients is required for intermediate and final reports" },
        { path: ['impactAssessment', 'affectedAssets', 'affectedFinancialCounterparts', 'number'], message: "Number of affected financial counterparts is required for intermediate and final reports" },
        { path: ['impactAssessment', 'affectedAssets', 'affectedFinancialCounterparts', 'percentage'], message: "Percentage of affected financial counterparts is required for intermediate and final reports" },
        { path: ['impactAssessment', 'affectedAssets', 'numbersActualEstimate'], check: (value) => value?.length, message: "Information whether the values are actual or estimates is required for intermediate and final reports" },
        { path: ['incident', 'incidentDuration'], message: "Incident duration is required for intermediate and final reports" },
        { path: ['impactAssessment', 'criticalServicesAffected'], message: "Critical services affected is required for intermediate and final reports" },
        { path: ['incident', 'incidentType', 'incidentClassification'], check: (value) => value?.length, message: "Incident classification is required for intermediate and final reports" },
        { path: ['impactAssessment', 'affectedFunctionalAreas'], message: "Affected functional areas are required for intermediate and final reports" },
        { path: ['impactAssessment', 'isAffectedInfrastructureComponents'], message: "Information about whether infrastructure components are affected is required for intermediate and final reports" },
        { path: ['impactAssessment', 'isImpactOnFinancialInterest'], message: "Information about impact on financial interest is required for intermediate and final reports" },
        { path: ['reportingToOtherAuthorities'], check: (value) => value?.length, message: "Information about reporting to other authorities is required for intermediate and final reports" },
        { path: ['impactAssessment', 'serviceImpact', 'isTemporaryActionsMeasuresForRecovery'], message: "Information about temporary actions/measures for recovery is required for intermediate and final reports" },
      ];

      validateFields(report, fields, errors);
    }


    //Valide les champs conditionnels basés sur les critères de classification.
    function validateConditionalFieldsByClassification(report, errors) {
      validateReputationalImpactFields(report, errors);
      validateDurationAndServiceDowntimeFields(report, errors);
      validateGeographicalSpreadFields(report, errors);
      validateDataLossesFields(report, errors);
    }

    /**
     * Valide les champs spécifiques au critère "reputational_impact".
     */
    function validateReputationalImpactFields(report, errors) {
      if (report.incident?.classificationTypes?.[0]?.classificationCriterion?.includes("reputational_impact")) {
        if (!report.incident?.classificationTypes?.[0]?.reputationalImpactType?.length) {
          errors.push("Reputational impact type is required when 'Reputational impact' is selected for intermediate and final reports");
        }
        if (!report.incident?.classificationTypes?.[0]?.reputationalImpactDescription) {
          errors.push("Reputational impact description is required when 'Reputational impact' is selected for intermediate and final reports");
        }
      }
    }

    /**
     * Valide les champs spécifiques au critère "duration_and_service_downtime".
     */
    function validateDurationAndServiceDowntimeFields(report, errors) {
      if (report.incident?.classificationTypes?.[0]?.classificationCriterion?.includes("duration_and_service_downtime")) {
        if (!report.informationDurationServiceDowntimeActualOrEstimate) {
          errors.push("Information whether the values for duration and service downtime are actual or estimates is required for intermediate and final reports when 'Duration and service downtime' is selected");
        }
      }
    }

    /**
     * Valide les champs spécifiques au critère "geographical_spread".
     */
    function validateGeographicalSpreadFields(report, errors) {
      if (report.incident?.classificationTypes?.[0]?.classificationCriterion?.includes("geographical_spread")) {
        if (!report.incident?.classificationTypes?.[0]?.memberStatesImpactType?.length) {
          errors.push("At least one type of impact in the member states is required when 'Geographical spread' is selected for intermediate and final reports");
        }
        if (!report.incident?.classificationTypes?.[0]?.memberStatesImpactTypeDescription) {
          errors.push("Description of the impact and severity in each affected member state is required when 'Geographical spread' is selected for intermediate and final reports");
        }
      }
    }

    /**
     * Valide les champs spécifiques au critère "data_losses".
     */
    function validateDataLossesFields(report, errors) {
      if (report.incident?.classificationTypes?.[0]?.classificationCriterion?.includes("data_losses")) {
        if (!report.incident?.classificationTypes?.[0]?.dataLosseMaterialityThresholds?.length) {
          errors.push("At least one type of data loss is required when 'Data losses' is selected for intermediate and final reports");
        }
        if (!report.incident?.classificationTypes?.[0]?.dataLossesDescription) {
          errors.push("Description of the data losses is required when 'Data losses' is selected for intermediate and final reports");
        }
      }
    }


    /**
     * Valide les champs spécifiques aux incidents de type "cybersecurity-related".
     */
    function validateCybersecurityRelatedFields(report, errors) {
      if (report.incident?.incidentType?.incidentClassification?.includes("cybersecurity-related")) {
        if (!report.incident?.incidentType?.threatTechniques?.length) {
          errors.push("Threat techniques are required when 'Cybersecurity-related' is selected for intermediate and final reports");
        }
        if (!report.incident?.incidentType?.indicatorsOfCompromise) {
          errors.push("Indicators of compromise are required when 'Cybersecurity-related' is selected for intermediate and final reports");
        }
      }

      // Validation pour "other" dans les techniques de menace
      if (report.incident?.incidentType?.threatTechniques?.includes("other")) {
        if (!report.incident?.incidentType?.otherThreatTechniques) {
          errors.push("Other threat techniques description is required when 'Other' is selected in threat techniques for intermediate and final reports");
        }
      }
    }

    /**
     * Valide les champs spécifiques aux actions temporaires de récupération.
     */
    function validateTemporaryRecoveryActions(report, errors) {
      if (report.impactAssessment?.serviceImpact?.isTemporaryActionsMeasuresForRecovery === true) {
        if (!report.impactAssessment?.serviceImpact?.descriptionOfTemporaryActionsMeasuresForRecovery) {
          errors.push("Description of temporary actions/measures for recovery is required when temporary actions are taken for intermediate and final reports");
        }
      }
    }

    // Valide les champs spécifiques aux rapports finaux
    function validateFinalReportFields(report, errors) {
      const finalReportFields = [
        { path: ['incident', 'rootCauseHLClassification'], check: (value) => value?.length, message: "High-level classification of root cause is required for final reports" },
        { path: ['incident', 'rootCausesDetailedClassification'], check: (value) => value?.length, message: "Detailed classification of root causes is required for final reports" },
        { path: ['incident', 'rootCausesAdditionalClassification'], check: (value) => value?.length, message: "Additional classification of root causes is required for final reports" },
        { path: ['incident', 'rootCausesInformation'], message: "Information about the root causes of the incident is required for final reports" },
        { path: ['incident', 'incidentResolutionSummary'], message: "Incident resolution summary is required for final reports" },
        { path: ['incident', 'rootCauseAddressingDateTime'], message: "Date and time when the incident root cause was addressed is required for final reports" },
        { path: ['incident', 'incidentResolutionDateTime'], message: "Date and time when the incident was resolved is required for final reports" },
        { path: ['incident', 'incidentResolutionVsPlannedImplementation'], message: "Reason for the difference between permanent resolution date and initially planned implementation date is required for final reports" },
        { path: ['incident', 'classificationTypes', 0, 'economicImpactMaterialityThreshold'], message: "Materiality threshold for the classification criterion 'Economic Impact' is required for final reports" },
        { path: ['incident', 'grossAmountIndirectDirectCosts'], message: "Amount of gross direct and indirect costs and losses is required for final reports" },
      ];

      validateFields(report, finalReportFields, errors);

      // Validations spécifiques pour "other" dans la classification détaillée des causes racines
      if (report.incident?.rootCausesDetailedClassification?.some(value => value.includes("other"))) {
        if (!report.incident?.rootCausesOther) {
          errors.push("Other types of root causes description is required when 'Other' is selected in detailed classification for final reports");
        }
      }

      // Validations spécifiques pour "other" dans la classification des incidents
      if (report.incident?.incidentType?.incidentClassification?.includes("other")) {
        if (!report.incident?.incidentType?.otherIncidentClassification) {
          errors.push("Other incident classification is required when 'Other' is selected for intermediate and final reports");
        }
      }
    }

    /**
     * Valide une liste de champs selon des règles données.
     * @param {Object} report - Le rapport à valider.
     * @param {Array} fields - Liste des règles de validation.
     * @param {Array} errors - Liste des erreurs à remplir.
     */
    function validateFields(report, fields, errors) {
      for (const { path, check, message } of fields) {
        const value = path.reduce((obj, key) => obj?.[key], report);
        const isValid = check ? check(value) : value !== undefined && value !== null;
        if (!isValid) {
          errors.push(message);
        }
      }
    }

    /**
     * Met à jour les types d'entités affectées de manière cohérente.
     * @param {Object} draft - Le draft actuel.
     * @param {Array} updatedValues - Les nouvelles valeurs de affectedEntityType.
     * @returns {Object} - Un nouveau draft avec les types synchronisés.
     */
    function syncAffectedEntityTypes(draft, updatedValues) {
      const newDraft = structuredClone(draft);

      // Mettre à jour submittingEntity
      newDraft.submittingEntity.affectedEntityType = updatedValues;

      // Mettre à jour ultimateParentUndertaking
      newDraft.ultimateParentUndertaking.affectedEntityType = updatedValues;

      // Mettre à jour toutes les affectedEntity
      newDraft.affectedEntity = newDraft.affectedEntity.map(entity => ({
        ...entity,
        affectedEntityType: updatedValues,
      }));

      return newDraft;
    }

    // Valide le format d'un email
    function isValidEmail(email) {
      return /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(email);
    }


    function getNestedObject(obj, path) {
      const parts = path.split('.');
      let cur = obj;

      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!(p in cur)) cur[p] = {};
        cur = cur[p];
      }

      return { obj: cur, field: parts.at(-1) };
    }

    function resetGeographicalSpreadThresholds(draft) {
      const thresholdPath = 'incident.classificationTypes.0.countryCodeMaterialityThresholds';
      const thresholdParts = thresholdPath.split('.');
      let thresholdCur = draft;

      for (let i = 0; i < thresholdParts.length - 1; i++) {
        const p = thresholdParts[i];
        if (!(p in thresholdCur)) thresholdCur[p] = {};
        thresholdCur = thresholdCur[p];
      }

      thresholdCur[thresholdParts.at(-1)] = [];
    }

    function toggleValueInArray(obj, field, value) {
      if (!obj[field]) obj[field] = [];
      if (obj[field].includes(value)) {
        obj[field] = obj[field].filter(v => v !== value);
      } else {
        obj[field].push(value);
      }
    }

    function toggleArrayValue(path, value) {
      setDraft(prev => {
        const next = structuredClone(prev);
        const { obj: cur, field } = getNestedObject(next, path);

        toggleValueInArray(cur, field, value);

        if (path === 'incident.classificationTypes.0.classificationCriterion' && value === 'geographical_spread') {
          if (!cur[field].includes(value)) {
            resetGeographicalSpreadThresholds(next);
          }
        }

        return next;
      });
    }

    function getButtonLabel(role, status) {
      if (role === 'auditeur') {
        return 'View'; // Les auditeurs ne peuvent que voir
      }
      if (role === 'saisisseur') {
        return status === 'validated' ? 'Open' : 'Update';
      } else {
        return status === 'validated' ? 'Open' : 'View';
      }
    }

    function formatDateForExport(dateString, formatType) {
      if (!dateString) return null;

      try {
        // Créer un objet Date à partir de la chaîne
        const date = new Date(dateString);

        // Vérifier si la date est valide avec Number.isNaN
        if (Number.isNaN(date.getTime())) {
          return null;
        }

        // Fonction pour ajouter un zéro devant si nécessaire
        const pad = (num) => num.toString().padStart(2, '0');
        const year = date.getUTCFullYear();
        const month = pad(date.getUTCMonth() + 1);
        const day = pad(date.getUTCDate());
        const hours = pad(date.getUTCHours());
        const minutes = pad(date.getUTCMinutes());
        const seconds = pad(date.getUTCSeconds());

        // Formater selon le type requis
        switch (formatType) {
          case 'withZ':
            // Format: "2001-12-17T09:30:47.0Z" (pour classificationDateTime)
            return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.0Z`;
          case 'withMilliseconds':
            // Format: "2001-12-17T09:30:47.0" (pour les autres dates)
            return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.0`;
          default:
            // Format original si aucun format spécifique n'est demandé
            return dateString;
        }
      } catch (e) {
        console.error('Erreur lors du formatage de la date:', e);
        return null;
      }
    }

    function applySettingsToDraft(prevDraft, settings) {
      const newDraft = structuredClone(prevDraft);

      newDraft.submittingEntity = {
        ...newDraft.submittingEntity,
        name: settings.name,
        code: settings.code,
        affectedEntityType: settings.affectedEntityType,
        isParametersSet: true
      };

      newDraft.ultimateParentUndertaking = {
        ...newDraft.ultimateParentUndertaking,
        affectedEntityType: settings.affectedEntityType
      };

      newDraft.affectedEntity = newDraft.affectedEntity.map(entity => ({
        ...entity,
        affectedEntityType: settings.affectedEntityType
      }));

      return newDraft;
    }


    function emptyDraft(incidentId = null) {
        console.log('--- Dans emptyDraft ---');
        console.log('incidentId:', incidentId);
      return {
        id: null,
        incidentId: incidentId || `incident_${Date.now()}`,
        nextSubmissionType: null,
        skipIdentity: false,
        skipContacts: false,

        incidentSubmission: 'initial_notification',
        reportCurrency: 'EUR',
        submittingEntity: {
          entityType: 'SUBMITTING_ENTITY',
          name: '',
          code: '',
          affectedEntityType: [],
        },
        affectedEntity: [{
          entityType: 'AFFECTED_ENTITY',
          name: '',
          code: '',
          affectedEntityType: [],
          LEI: ''
        }],
        ultimateParentUndertaking: {
          entityType: 'ULTIMATE_PARENT_UNDERTAKING_ENTITY',
          name: '',
          code: '',
          affectedEntityType: [],
          LEI: ''
        },
        primaryContact: { name: '', email: '', phone: '', countryCode: '+33' },
        secondaryContact: { name: '', email: '', phone: '', countryCode: '+33' },
        incident: {
          financialEntityCode: '',
          detectionDateTime: '',
          classificationDateTime: '',
          incidentDescription: '',
          classificationTypes: [{
            classificationCriterion: [],
            countryCodeMaterialityThresholds: [],
            memberStatesImpactType: [],
            memberStatesImpactTypeDescription: '',
            dataLosseMaterialityThresholds: [],
            dataLossesDescription: '',
            reputationalImpactType: [],
            reputationalImpactDescription: '',
            economicImpactMaterialityThreshold: '',
          }],
          isBusinessContinuityActivated: false,
          incidentOccurrenceDateTime: '',
          incidentDuration: '',
          originatesFromThirdPartyProvider: '',
          incidentDiscovery: '',
          competentAuthorityCode: '',
          incidentType: {
              incidentClassification: [],
              threatTechniques: [],
              otherIncidentClassification: '',
              otherThreatTechniques: '',
              indicatorsOfCompromise: '',
          },
          rootCauseHLClassification: [],
          rootCausesAdditionalClassification: [],
          rootCausesOther: '',
          rootCausesInformation: '',
          rootCauseAddressingDateTime: '',
          incidentResolutionSummary: '',
          incidentResolutionDateTime: '',
          incidentResolutionVsPlannedImplementation: '',
          assessmentOfRiskToCriticalFunctions: '',
          informationRelevantToResolutionAuthorities: '',
          financialRecoveriesAmount: 0,
          grossAmountIndirectDirectCosts: 0,
          recurringNonMajorIncidentsDescription: '',
          recurringIncidentDate: '',

          rootCausesDetailedClassification: [],
        },
        impactAssessment: {
          hasImpactOnRelevantClients: false,
          serviceImpact: {
            serviceDowntime: '',
            serviceRestorationDateTime: '',
            isTemporaryActionsMeasuresForRecovery: false,
            descriptionOfTemporaryActionsMeasuresForRecovery: '',
          },
          criticalServicesAffected: '',
          affectedAssets: {
            affectedClients: {
              number: 0,
              percentage: 0,
            },
            affectedFinancialCounterparts: {
              number: 0,
              percentage: 0,
            },
            affectedTransactions: {
              number: 0,
              percentage: 0,
            },
            valueOfAffectedTransactions: 0,
            numbersActualEstimate: [],
          },
          affectedFunctionalAreas: '',
          isAffectedInfrastructureComponents: '',
          affectedInfrastructureComponents: '',
          isImpactOnFinancialInterest: '',
        },
        reportingToOtherAuthorities: [],
        reportingToOtherAuthoritiesOther: '',
        informationDurationServiceDowntimeActualOrEstimate: '',
      }
    }

export default function DoraIncidentApp() {
  const { user, role, signOut } = useAuth();

  const [view, setView] = useState('dashboard')
  const [draft, setDraft] = useState(emptyDraft())
  const [reports, setReports] = useState([])
  const [step, setStep] = useState(0)
  const [confettiTrigger, setConfettiTrigger] = useState(false)
  const [errors, setErrors] = useState([])
  const [fromContinueButton, setFromContinueButton] = useState(false);
  const [groupedIncidents, setGroupedIncidents] = useState({});
  const [filteredIncidents, setFilteredIncidents] = useState({});
  const [showUserMenu, setShowUserMenu] = useState(false);
  const isReportView = view === 'report';

  const [filters, setFilters] = useState({
      searchTerm: '',
      incidentSubmission: '',
      incidentStatus: '',
      classificationCriterion: [],
      dateRange: { start: '', end: '' },
      showFilters: false
  });

  const [submittingEntitySettings, setSubmittingEntitySettings] = useState({
      name: '',
      code: '',
      affectedEntityType: [],
      isLocked: false,
    });


    async function handleSaveSettings() {
      if (!user?.id) return;

      const settingsToSave = {
        name: submittingEntitySettings.name,
        code: submittingEntitySettings.code,
        affectedEntityType: submittingEntitySettings.affectedEntityType,
        isParametersSet: true
      };

      // Sauvegarde Supabase
      await saveSettings(user.id, settingsToSave);

      // Mise à jour du state local
      setSubmittingEntitySettings(prev => ({
        ...prev,
        isLocked: true
      }));

      // Application propre au draft
      setDraft(prev => applySettingsToDraft(prev, settingsToSave));

      alert("Paramètres enregistrés avec succès.");
    }

  const getButtonClasses = (currentView, targetView) => {
      const baseClasses = "px-3 py-2 rounded-xl transition-all";
      const activeClasses = "bg-white/90 dark:bg-white/10 shadow";
      const inactiveClasses = "bg-transparent hover:bg-white/50 dark:hover:bg-white/5";
      return `${baseClasses} ${currentView === targetView ? activeClasses : inactiveClasses}`;
  };

  const getUserInitials = (user) => {
      const name = user.displayName || user.email;
      return name.charAt(0).toUpperCase();
  };

  const animations = {
      initial: { opacity: 0, y: 10 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -10 },
  };

  const getFilteredSteps = (draft) => {
      const steps = [
        { label: 'Identity', step: 0, shouldShow: !draft.skipIdentity },
        { label: 'Contacts', step: 1, shouldShow: !draft.skipContacts },
        { label: 'Incident', step: 2, shouldShow: true },
        { label: 'Review', step: 3, shouldShow: true },
      ];
      return steps.filter(step => step.shouldShow);
  };

  const getStepItemClasses = (currentStep, stepIndex) => {
      const baseClasses = "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all";
      const activeClasses = currentStep === stepIndex ? "bg-indigo-50 dark:bg-indigo-900/30" : "hover:bg-gray-100/50 dark:hover:bg-gray-800/50";
      return `${baseClasses} ${activeClasses}`;
  };

  const getStepIndicatorClasses = (currentStep, stepIndex, index) => {
      const isCompleted = stepIndex < currentStep;
      const isActive = currentStep === stepIndex;
      const baseClasses = "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium";

      if (isCompleted) {
        return `${baseClasses} bg-green-400 text-white`;
      } else if (isActive) {
        return `${baseClasses} bg-indigo-500 text-white`;
      } else {
        return `${baseClasses} bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300`;
      }
  };

    const isFieldDisabled = (role, status) => {
      // Pour les auditeurs, toujours en lecture seule
      if (role === 'auditeur') {
        return true;
      }
      // Pour les validateurs, en lecture seule uniquement si le statut est "validated"
      return status === 'validated' || (role === 'validateur' && status === 'draft');
    };

    useEffect(() => {
      async function loadReports() {
        const reportsFromSupabase = await fetchReportsFromSupabase();
        setReports(reportsFromSupabase);
      }
      loadReports();
    }, []);


    useEffect(() => {
      console.log('Vérification de draft et user :');
      console.log('draft:', draft);
      console.log('user:', user);
    }, [draft, user]);

    useEffect(() => {
      const incidents = groupReportsByIncident(reports);
      setGroupedIncidents(incidents);
      setFilteredIncidents(applyIncidentFilters(incidents));
    }, [reports, filters]);

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (showUserMenu && !event.target.closest('.relative')) {
          setShowUserMenu(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [showUserMenu]);

    function updateDraft(path, value) {
      setDraft(prev => {
        const next = structuredClone(prev);
        const parts = path.split('.');
        let cur = next;

        for (let i = 0; i < parts.length - 1; i++) {
          const p = parts[i];
          if (!(p in cur)) cur[p] = {};
          cur = cur[p];
        }

        cur[parts[parts.length - 1]] = value;
        return next;
      });
    }

    function addAffectedEntity() {
      setDraft(d => {
        const newDraft = structuredClone(d);
        newDraft.affectedEntity.push({
          entityType: 'AFFECTED_ENTITY',
          name: '',
          code: '',
          affectedEntityType: d.submittingEntity.affectedEntityType || [], // Héritage du type
          LEI: ''
        });
        return newDraft;
      });
    }

  function updateAffectedEntity(index, field, value) {
      setDraft(d => {
        const next = structuredClone(d);
        next.affectedEntity[index][field] = value;
        return next;
      });
  }

  function removeAffectedEntity(index) {
      setDraft(d => {
        const next = structuredClone(d);
        next.affectedEntity = next.affectedEntity.filter((_, i) => i !== index);
        return next;
      });
  }

    async function saveReport(final = false) {
      if (role === 'validateur' || role === 'auditeur') {
        alert('Les validateurs et auditeurs ne peuvent pas sauvegarder de rapports.');
        return { ok: false, errors: ['Les validateurs et auditeurs ne peuvent pas sauvegarder de rapports.'] };
      }

      const candidate = { ...emptyDraft(draft.incidentId), ...draft, savedAt: nowISO() };
      const v = validateReportFields(candidate);
      setErrors(Array.isArray(v) ? v : []);

      if (v.length > 0) {
        return { ok: false, errors: v };
      }

      try {
        if (!user.id || typeof user.id !== 'string') {
          console.error('user.id n\'est pas un UUID valide:', user.id);
          return { ok: false, errors: ['user.id n\'est pas un UUID valide'] };
        }

        const reportData = {
          incident_id: candidate.incidentId,
          report_data: candidate,
          status: 'draft',
          created_by: user.id
        };

        if (!draft.id || typeof draft.id !== 'string') {
          delete reportData.id;
        } else {
          reportData.id = draft.id;
        }

        const { data, error } = await supabase
          .from('reports')
          .upsert(reportData)
          .select();

        if (error) {
          console.error('Erreur lors de la sauvegarde dans Supabase :', error);
          return { ok: false, errors: [error.message] };
        } else {
          const report = { id: data[0].id, ...candidate, status: data[0].status };

          // Mettre à jour l'état local immédiatement
          setReports(prevReports => {
            if (candidate.incidentSubmission === 'intermediate_report') {
              return [report, ...prevReports.map(r =>
                r.incidentId === candidate.incidentId && r.incidentSubmission === 'initial_notification'
                  ? { ...r, nextSubmissionType: 'final_report' }
                  : r
              )];
            } else if (candidate.incidentSubmission === 'final_report') {
              return [report, ...prevReports.map(r =>
                r.incidentId === candidate.incidentId
                  ? { ...r, nextSubmissionType: null }
                  : r
              )];
            } else {
              return [report, ...prevReports.filter(report => report.id !== data[0].id)];
            }
          });

          setConfettiTrigger(true);
          setTimeout(() => setConfettiTrigger(false), 100);
          return { ok: true, report };
        }
      } catch (err) {
        console.error('Erreur inattendue lors de la sauvegarde :', err);
        return { ok: false, errors: [err.message] };
      }
    }

    async function fetchReportsFromSupabase() {
      let query = supabase.from('reports').select('*, comments(*)').order('created_at', { ascending: false });

      if (role === 'saisisseur') {
        query = query.eq('created_by', user.id);
      } else if (role === 'auditeur') {
        // **Filtrer UNIQUEMENT les rapports validés pour les auditeurs**
        query = query.eq('status', 'validated');
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erreur lors de la récupération des rapports :', error);
        return [];
      }

      // Mapping des données (sans filtre supplémentaire)
      return data.map(item => {
        const defaultDraft = emptyDraft(item.incident_id);
        const reportData = item.report_data;
        const primaryContact = {
          ...defaultDraft.primaryContact,
          ...(reportData.primaryContact),
        };
        primaryContact.name = primaryContact.name || '';
        primaryContact.email = primaryContact.email || '';
        primaryContact.phone = primaryContact.phone || '';
        primaryContact.countryCode = primaryContact.countryCode || '+33';
        const secondaryContact = {
          ...defaultDraft.secondaryContact,
          ...(reportData.secondaryContact),
        };
        secondaryContact.name = secondaryContact.name || '';
        secondaryContact.email = secondaryContact.email || '';
        secondaryContact.phone = secondaryContact.phone || '';
        secondaryContact.countryCode = secondaryContact.countryCode || '+33';
        // S'assurer que countryCode est toujours une chaîne de caractères
        primaryContact.countryCode = String(primaryContact.countryCode);
        secondaryContact.countryCode = String(secondaryContact.countryCode);
        // Extraire l'indicatif du pays du numéro de téléphone si nécessaire
        if (typeof primaryContact.phone === 'string' && primaryContact.phone.startsWith('+')) {
          const countryCodeMatch = primaryContact.phone.match(/^\+\d+/);
          if (countryCodeMatch) {
            primaryContact.countryCode = countryCodeMatch[0];
            primaryContact.phone = primaryContact.phone.substring(countryCodeMatch[0].length);
          }
        }
        if (typeof secondaryContact.phone === 'string' && secondaryContact.phone.startsWith('+')) {
          const countryCodeMatch = secondaryContact.phone.match(/^\+\d+/);
          if (countryCodeMatch) {
            secondaryContact.countryCode = countryCodeMatch[0];
            secondaryContact.phone = secondaryContact.phone.substring(countryCodeMatch[0].length);
          }
        }
        return {
          ...defaultDraft,
          ...reportData,
          primaryContact: primaryContact,
          secondaryContact: secondaryContact,
          id: item.id,
          status: item.status, // <-- Important : status est bien celui de la base de données
          nextSubmissionType: item.next_submission_type,
          comments: item.comments || [],
          savedAt: reportData.savedAt || item.created_at
        };
      });
    }

    async function validateReport(reportId) {
        if (role !== 'validateur') {
            alert('Seuls les validateurs peuvent valider des rapports.');
            return { ok: false, error: 'Seuls les validateurs peuvent valider des rapports.' };
        }
      try {
        const { data, error } = await supabase
          .from('reports')
          .select('*')
          .eq('id', reportId)
          .single();

        if (error) {
          console.error('Erreur lors de la récupération du rapport:', error);
          return { ok: false, error: error.message };
        }

        // Déterminer le type de rapport suivant
        let nextSubmissionType;
        if (data.report_data.incidentSubmission === 'initial_notification') {
          nextSubmissionType = 'intermediate_report';
        } else if (data.report_data.incidentSubmission === 'intermediate_report') {
          nextSubmissionType = 'final_report';
        } else {
          nextSubmissionType = null; // Aucun rapport après le final
        }

        // Mettre à jour le statut du rapport et ajouter le type de rapport suivant
        const { error: updateError } = await supabase
          .from('reports')
          .update({
            status: 'validated',
            next_submission_type: nextSubmissionType
          })
          .eq('id', reportId)
          .select();

        if (updateError) {
          console.error('Erreur lors de la validation:', updateError);
          return { ok: false, error: updateError.message };
        } else {
          // Rafraîchir les rapports pour refléter le changement de statut
          const reportsFromSupabase = await fetchReportsFromSupabase();
          setReports(reportsFromSupabase);
          return { ok: true, nextSubmissionType };
        }
      } catch (err) {
        console.error('Erreur inattendue lors de la validation:', err);
        return { ok: false, error: err.message };
      }
    }

    async function addComment(reportId, comment) {
      if (role === 'auditeur') {
        alert('Les auditeurs ne peuvent pas ajouter de commentaires.');
        return { ok: false, error: 'Les auditeurs ne peuvent pas ajouter de commentaires.' };
      }
      if (!comment || comment.trim() === '') {
        alert('Le commentaire ne peut pas être vide.');
        return { ok: false, error: 'Le commentaire ne peut pas être vide.' };
      }

      try {
        const { error } = await supabase
          .from('comments')
          .insert({
            report_id: reportId,
            comment: comment,
            created_by: user.id,
            created_at: new Date().toISOString()
          });

        if (error) {
          console.error('Erreur lors de l\'ajout du commentaire:', error);
          alert('Vous n\'êtes pas autorisé à ajouter un commentaire ou une erreur est survenue.');
          return { ok: false, error: error.message };
        } else {
          // Rafraîchir les rapports pour inclure les nouveaux commentaires
          const reportsFromSupabase = await fetchReportsFromSupabase();
          setReports(reportsFromSupabase);
          return { ok: true };
        }
      } catch (err) {
        console.error('Erreur inattendue lors de l\'ajout du commentaire:', err);
        return { ok: false, error: err.message };
      }
    }

    async function continueReport(reportId, nextSubmissionType) {
      if (role === 'auditeur') {
        alert('Les auditeurs ne peuvent pas continuer un rapport.');
        return;
      }

      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error) {
        console.error('Erreur lors de la récupération du rapport:', error);
        return;
      }

      const newDraft = {
        ...emptyDraft(data.incident_id),
        ...data.report_data,
        id: uuidv4(),
        incidentSubmission: nextSubmissionType,
        status: 'draft',
        skipIdentity: true,
        skipContacts: true
      };

      // Mettre à jour l'état local immédiatement
      setReports(prevReports => {
        return prevReports.map(r => {
          if (r.id === reportId) {
            return { ...r, nextSubmissionType: nextSubmissionType === 'intermediate_report' ? 'final_report' : null };
          }
          return r;
        });
      });

      setDraft(newDraft);
      setFromContinueButton(true);
      setView('report');
      setStep(2);
    }

    async function loadReportIntoDraft(reportId) {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (handleError(error)) return;

      if (data) {
        // **Vérification redondante pour les auditeurs**
        if (role === 'auditeur' && data.status !== 'validated') {
          alert('Accès refusé : ce rapport n\'est pas validé.');
          return; // <-- Important : ne pas charger le rapport
        }
        const mergedDraft = createMergedDraft(data);
        processPhoneNumbers(mergedDraft);

        setDraft(mergedDraft);
        setView('report');
        // Définir l'étape en fonction du type de rapport
        if (mergedDraft.incidentSubmission === 'intermediate_report' || mergedDraft.incidentSubmission === 'final_report') {
          setStep(2);
          setFromContinueButton(true);
        } else {
          setStep(0);
          setFromContinueButton(false);
        }
      }
    }

// Chargement des paramètres pour l'utilisateur connecté
    useEffect(() => {
      if (!user?.id) return;

    async function loadUserSettings() {
      if (!user?.id) return;

      const settings = await getSettings(user.id);
      if (!settings) return;

      // Mise à jour des paramètres locaux
      const normalized = {
        name: settings.name ?? '',
        code: settings.code ?? '',
        affectedEntityType: settings.affected_entity_type ?? [],
        isLocked: settings.is_parameters_set ?? false
      };
      setSubmittingEntitySettings(normalized);

      // Application propre au draft
      setDraft(prev => applySettingsToDraft(prev, normalized));
    }

      loadUserSettings();
    }, [user]);

    function createMergedDraft(data) {
      const defaultDraft = emptyDraft(data.report_data.incidentId);
      const mergedDraft = {
        ...defaultDraft,
        ...data.report_data,
        id: data.id,
        status: data.status
      };

      // Synchroniser affectedEntityType entre submittingEntity, affectedEntity et ultimateParentUndertaking
      const affectedEntityType = mergedDraft.submittingEntity.affectedEntityType || [];
      mergedDraft.ultimateParentUndertaking.affectedEntityType = affectedEntityType;
      mergedDraft.affectedEntity = mergedDraft.affectedEntity.map(entity => ({
        ...entity,
        affectedEntityType: affectedEntityType,
      }));

      ensureCountryCode(mergedDraft);
      return mergedDraft;
    }

  function clearDraft() {
      const newDraft = emptyDraft();

      // Apply current saved settings to the new draft
      const updatedDraft = applySettingsToDraft(newDraft, submittingEntitySettings);

      setDraft(updatedDraft);
      setStep(0);
  }


  function hasReportOfTypeForIncident(incidentId, type) {
      return reports.some(report => report.incidentId === incidentId && report.incidentSubmission === type);
  }

  const incidentStats = {
      totalIncidents: Object.keys(groupedIncidents).length,
      closedIncidents: Object.values(groupedIncidents).filter(incident => incident.isClosed).length,
      openIncidents: Object.values(groupedIncidents).filter(incident => !incident.isClosed).length,
      byReportType: Object.values(groupedIncidents).reduce((acc, incident) => {
        // Compter les incidents par type de rapport présent
        const hasInitial = incident.reports.some(r => r.incidentSubmission === 'initial_notification');
        const hasIntermediate = incident.reports.some(r => r.incidentSubmission === 'intermediate_report');
        const hasFinal = incident.reports.some(r => r.incidentSubmission === 'final_report');

        if (hasInitial) acc.initial_notification = (acc.initial_notification || 0) + 1;
        if (hasIntermediate) acc.intermediate_report = (acc.intermediate_report || 0) + 1;
        if (hasFinal) acc.final_report = (acc.final_report || 0) + 1;

        return acc;
      }, {})
    };

    // Fonction pour appliquer les filtres aux incidents
    function applyIncidentFilters(incidents) {
      return Object.entries(incidents)
        .filter(([financialEntityCode, incident]) => {
          // **Ne pas inclure les incidents avec des rapports "draft" pour les auditeurs**
          if (role === 'auditeur' && incident.reports.some(r => r.status !== 'validated')) {
            return false; // <-- Exclure les incidents avec des rapports non validés
          }
          return (
            filterBySearchTerm(financialEntityCode, incident) &&
            filterByIncidentStatus(incident) &&
            filterByIncidentSubmission(incident) &&
            filterByClassificationCriterion(incident) &&
            filterByDateRange(incident)
          );
        })
        .reduce((obj, [key, value]) => {
          obj[key] = value;
          return obj;
        }, {});
    }

    function filterBySearchTerm(financialEntityCode, incident) {
      if (!filters.searchTerm) {
        return true;
      }
      const searchTerm = filters.searchTerm.toLowerCase();
      return (
        financialEntityCode.toLowerCase().includes(searchTerm) ||
        incident.description.toLowerCase().includes(searchTerm)
      );
    }

    function filterByIncidentStatus(incident) {
      if (!filters.incidentStatus) {
        return true;
      }
      if (filters.incidentStatus === 'open' && incident.isClosed) {
        return false;
      }
      if (filters.incidentStatus === 'closed' && !incident.isClosed) {
        return false;
      }
      return true;
    }

    function filterByIncidentSubmission(incident) {
      if (!filters.incidentSubmission) {
        return true;
      }
      const hasMatchingReport = incident.reports.some(r => r.incidentSubmission === filters.incidentSubmission);
      return hasMatchingReport;
    }

    function filterByClassificationCriterion(incident) {
      if (filters.classificationCriterion.length === 0) {
        return true;
      }
      const hasMatchingClassification = incident.reports.some(r => {
        const reportCriteria = r.incident?.classificationTypes?.[0]?.classificationCriterion || [];
        return filters.classificationCriterion.some(criterion => reportCriteria.includes(criterion));
      });
      return hasMatchingClassification;
    }

    function filterByDateRange(incident) {
      if (!filters.dateRange.start && !filters.dateRange.end) {
        return true;
      }
      const startDate = filters.dateRange.start ? new Date(filters.dateRange.start) : new Date(0);
      const endDate = filters.dateRange.end ? new Date(filters.dateRange.end) : new Date();
      const hasReportInDateRange = incident.reports.some(r => {
        const reportDate = new Date(r.savedAt);
        return reportDate >= startDate && reportDate <= endDate;
      });
      return hasReportInDateRange;
    }

    // Fonction pour regrouper les rapports par incident
    function groupReportsByIncident(reports) {
      const incidents = {};
      for (const report of reports) {
        // **Ne pas inclure les rapports "draft" pour les auditeurs**
        if (role === 'auditeur' && report.status !== 'validated') {
          continue; // <-- Sauter les rapports non validés pour les auditeurs
        }
        const financialEntityCode = report.incident?.financialEntityCode || 'unknown';
        if (!incidents[financialEntityCode]) {
          incidents[financialEntityCode] = {
            financialEntityCode: financialEntityCode,
            reports: [],
            isClosed: false,
            description: report.incident?.incidentDescription || '',
            date: report.savedAt || report.created_at
          };
        }
        incidents[financialEntityCode].reports.push(report);
        if (report.incidentSubmission === 'final_report' && report.status === 'validated') {
          incidents[financialEntityCode].isClosed = true;
        }
      }
      return incidents;
    }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-6">
      <ConfettiCanvas trigger={confettiTrigger} />
      <header className="max-w-7xl mx-auto flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-400 flex items-center justify-center text-white font-bold text-lg">DORA</div>
          <div>
            <h1 className="text-xl font-semibold">DORA Incident Reporter</h1>
            <p className="text-sm opacity-70">Complete incident reporting for regulatory compliance</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {role === 'saisisseur' && (
          <button
              onClick={() => setView('report')}
              className={getButtonClasses(view, 'report')}
            >
              Report
            </button>
          )}
          <button
              onClick={() => setView('dashboard')}
              className={getButtonClasses(view, 'dashboard')}
          >
            Dashboard
          </button>

          <button
              onClick={() => {
                setView('settings');
              }}
              className={getButtonClasses(view, 'settings')}
            >
              Paramètres
          </button>

          {user && (
              <div className="relative">
                {/* Bouton Avatar avec initiales */}
                <button
                  className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                >
                  {getUserInitials(user)}
                </button>

                {/* Menu Popup */}
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 z-50 border border-gray-200 dark:border-gray-700">
                    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user.displayName || user.email}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                    </div>
                    <button
                      onClick={() => {
                        signOut();
                        setShowUserMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm hover:bg-red-100 transition-colors"
                    >
                      <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign out
                      </div>
                    </button>
                  </div>
                )}
              </div>
          )}

        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {isReportView && (
            <motion.div
                key="form"
                initial={animations.initial}
                animate={animations.animate}
                exit={animations.exit}
                className="grid grid-cols-12 gap-6"
              >
              <aside className="col-span-3">
                <div className="p-4 rounded-2xl bg-white/80 dark:bg-white/5 shadow sticky top-6">
                  <h3 className="font-medium mb-4">Progress</h3>
                    <ul className="space-y-2 list-none p-0 m-0">
                      {getFilteredSteps(draft).map(({ label, step: stepIndex }, index) => (
                        <li key={`step-${stepIndex}`}>
                          <button
                            type="button"
                            className={`${getStepItemClasses(step, stepIndex)} w-full text-left`}
                            onClick={() => setStep(stepIndex)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setStep(stepIndex); }}
                            tabIndex={0}
                          >
                            <div className={getStepIndicatorClasses(step, stepIndex, index)}>
                              {index + 1}
                            </div>
                            <div className="text-sm">{label}</div>
                          </button>
                        </li>
                      ))}
                    </ul>

                  <div className="mt-6 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs">
                    <p className="font-medium mb-1">Tip</p>
                    <p className="opacity-80">Use the Dashboard to manage saved reports.</p>
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                      {/* <button className="px-3 py-2 bg-white dark:bg-gray-700 rounded-lg shadow text-sm hover:bg-gray-50 transition-colors" onClick={downloadCurrent}>Download JSON</button> */}
                    {role !== 'validateur' && draft.status !== 'validated' && (
                        <button
                          className="px-3 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm hover:bg-red-100 transition-colors"
                          onClick={clearDraft}
                        >
                          Clear draft
                        </button>
                      )}
                  </div>
                </div>
              </aside>

              <section className="col-span-9">
                <div className="p-6 rounded-2xl bg-white/90 dark:bg-white/5 shadow">
                  {!draft.skipIdentity && step === 0 && (
                    <div>

                      <h2 className="text-2xl font-semibold mb-2">Identity</h2>
                      <p className="text-sm opacity-70 mb-6">Who is filing and which entity is affected?</p>

                      <div className="space-y-4">
                        <div className="mt-6 grid grid-cols-2 gap-4">
                          <div>
                            <label htmlFor="incidentSubmission" className="block text-sm font-medium mb-1">Type of report</label>
                            <select id="incidentSubmission" value={draft.incidentSubmission} onChange={e => updateDraft('incidentSubmission', e.target.value)} className="w-full rounded-lg p-2 border dark:border-gray-600 bg-white dark:bg-gray-800" disabled={isFieldDisabled(role, draft.status)}>
                              <option value="initial_notification">Initial Notification</option>
                              <option value="intermediate_report">Intermediate Report</option>
                              <option value="final_report">Final Report</option>
                            </select>
                          </div>
                          <div>
                            <label htmlFor="reportCurrency" className="block text-sm font-medium mb-1">Report currency</label>
                            <select id="reportCurrency" value={draft.reportCurrency} onChange={e => updateDraft('reportCurrency', e.target.value)} className="w-full rounded-lg p-2 border dark:border-gray-600 bg-white dark:bg-gray-800" disabled={isFieldDisabled(role, draft.status)}>
                              <option value="EUR">EUR</option>
                              <option value="BGN">BGN</option>
                              <option value="CZK">CZK</option>
                              <option value="DKK">DKK</option>
                              <option value="HUF">HUF</option>
                              <option value="PLN">PLN</option>
                              <option value="RON">RON</option>
                              <option value="ISK">ISK</option>
                              <option value="CHF">CHF</option>
                              <option value="NOK">NOK</option>
                              <option value="SEK">SEK</option>
                            </select>
                          </div>
                        </div>

                        <div className="border-t dark:border-gray-700 pt-4">
                          <h4 className="text-sm font-medium mb-3">Submitting Entity</h4>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                                placeholder="Name"
                                value={draft.submittingEntity.name}
                                onChange={e => {
                                  if (!draft.submittingEntity.isParametersSet) {
                                    updateDraft('submittingEntity.name', e.target.value);
                                  }
                                }}
                                className="p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800"
                                readOnly={draft.submittingEntity.isParametersSet}
                                style={draft.submittingEntity.isParametersSet ? {
                                  backgroundColor: '#f3f4f6',
                                  cursor: 'not-allowed',
                                  color: '#6b7280'
                                } : {}}
                                title={draft.submittingEntity.isParametersSet ? "Ce champ a été défini dans les paramètres et ne peut plus être modifié" : ""}
                            />
                            <input
                                placeholder="Identification Code"
                                value={draft.submittingEntity.code}
                                onChange={e => {
                                  if (!draft.submittingEntity.isParametersSet) {
                                    updateDraft('submittingEntity.code', e.target.value);
                                  }
                                }}
                                className="p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800"
                                readOnly={draft.submittingEntity.isParametersSet}
                                style={draft.submittingEntity.isParametersSet ? {
                                  backgroundColor: '#f3f4f6',
                                  cursor: 'not-allowed',
                                  color: '#6b7280'
                                } : {}}
                                title={draft.submittingEntity.isParametersSet ? "Ce champ a été défini dans les paramètres et ne peut plus être modifié" : ""}
                            />
                          </div>

                          <div className="mt-6">
                            <div className="flex items-center gap-2 mb-3">
                              <h4 className="text-sm font-medium">Ultimate Parent Undertaking</h4>
                              <div className="relative group">
                                <div className="w-4 h-4 rounded-full bg-blue-400 flex items-center justify-center text-white text-xs cursor-pointer">
                                  i
                                </div>
                                <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-64 px-3 py-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg shadow-lg">
                                  A compléter si l'entité financière appartient à un groupe
                                </div>
                              </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <input
                              placeholder="Name"
                              value={draft.ultimateParentUndertaking.name}
                              onChange={e => updateDraft('ultimateParentUndertaking.name', e.target.value)}
                              className="p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800"
                            />
                            <input
                              placeholder="Identification Code"
                              value={draft.ultimateParentUndertaking.code}
                              onChange={e => updateDraft('ultimateParentUndertaking.code', e.target.value)}
                              className="p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800"
                            />
                            <input
                              placeholder="LEI Code"
                              value={draft.ultimateParentUndertaking.LEI}
                              onChange={e => updateDraft('ultimateParentUndertaking.LEI', e.target.value)}
                              className="p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800"
                            />
                          </div>
                        </div>

                            <div className="mt-6">
                              <p className="block text-xs font-medium mb-2">Affected entity types</p>
                              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                {ENTITY_TYPES.map(type => (
                                  <label
                                    key={type.value}
                                    htmlFor={`affected-entity-type-${type.value}`}
                                    className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-1 rounded"
                                    style={draft.submittingEntity.isParametersSet ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                                  >
                                    <input
                                      id={`affected-entity-type-${type.value}`}
                                      type="checkbox"
                                      checked={draft.submittingEntity.affectedEntityType?.includes(type.value)}
                                      onChange={() => {
                                        if (draft.submittingEntity.isParametersSet) return;

                                        const currentValues = draft.submittingEntity.affectedEntityType || [];
                                        const updatedValues = currentValues.includes(type.value)
                                          ? currentValues.filter(value => value !== type.value)
                                          : [...currentValues, type.value];

                                        // Mettre à jour uniquement la submittingEntity
                                        const updatedDraft = {
                                          ...draft,
                                          submittingEntity: {
                                            ...draft.submittingEntity,
                                            affectedEntityType: updatedValues
                                          }
                                        };

                                        setDraft(updatedDraft);
                                      }}
                                      className="rounded"
                                      disabled={draft.submittingEntity.isParametersSet || isFieldDisabled(role, draft.status)}
                                    />
                                    <span>{type.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                        </div>

                        <div className="mt-4">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-medium">Affected entities</h4>
                            <div className="relative group">
                              <div className="w-4 h-4 rounded-full bg-blue-400 flex items-center justify-center text-white text-xs ">
                                i
                              </div>

                              {/* Tooltip (cachée par défaut, visible au survol) */}
                              <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-64 px-3 py-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg shadow-lg">
                                A compléter si l'entité financière impactée par l'incident est différente de celle qui soumet le rapport
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2 mt-2">
                              {draft.affectedEntity.map((ae, idx) => (
                                <div key={`affected-entity-${idx}-${ae.name}`} className="p-3 rounded-lg border bg-white">
                                  <div className="flex gap-2">
                                    <input
                                      placeholder="Name"
                                      value={ae.name}
                                      onChange={e => updateAffectedEntity(idx, 'name', e.target.value)}
                                      className="flex-1 p-2 rounded-lg border"
                                      disabled={isFieldDisabled(role, draft.status)}
                                    />
                                    <input
                                      placeholder="Identification Code"
                                      value={ae.code}
                                      onChange={e => updateAffectedEntity(idx, 'code', e.target.value)}
                                      className="flex-1 p-2 rounded-lg border"
                                      disabled={isFieldDisabled(role, draft.status)}
                                    />
                                    <input
                                      placeholder="LEI Code"
                                      value={ae.LEI}
                                      onChange={e => updateAffectedEntity(idx, 'LEI', e.target.value)}
                                      className="flex-1 p-2 rounded-lg border"
                                      disabled={isFieldDisabled(role, draft.status)}
                                    />
                                    <button
                                      onClick={() => removeAffectedEntity(idx)}
                                      className="px-3 rounded-lg bg-red-50 text-red-700"
                                      disabled={isFieldDisabled(role, draft.status)}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        <div className="mt-2">
                          <button onClick={addAffectedEntity} className="px-3 py-2 rounded-lg bg-indigo-500 text-white" disabled={isFieldDisabled(role, draft.status)}>Add affected entity</button>
                        </div>
                      </div>

                        <div className="mt-6 flex justify-end">
                          <button onClick={() => setStep(1)} className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">Next → Contacts</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {!draft.skipContacts && step === 1 && (
                    <div>
                      <h2 className="text-2xl font-semibold mb-2">Contacts</h2>
                      <p className="text-sm opacity-70 mb-6">Primary and secondary contact information</p>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="primaryContactName" className="text-sm font-medium">Primary Contact Name</label>
                          <input id="primaryContactName" value={draft.primaryContact.name} onChange={e => updateDraft('primaryContact.name', e.target.value)} className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full" disabled={isFieldDisabled(role, draft.status)}/>
                        </div>
                        <div>
                          <label htmlFor="secondaryContactName" className="text-sm font-medium">Secondary Contact Name</label>
                          <input id="secondaryContactName" value={draft.secondaryContact.name} onChange={e => updateDraft('secondaryContact.name', e.target.value)} className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full" disabled={isFieldDisabled(role, draft.status)}/>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="primaryContactEmail" className="text-sm font-medium">Primary Contact Email</label>
                          <input id="primaryContactEmail" type="email" value={draft.primaryContact.email} onChange={e => updateDraft('primaryContact.email', e.target.value)} className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full" disabled={isFieldDisabled(role, draft.status)}/>
                        </div>
                        <div>
                          <label htmlFor="secondaryContactEmail" className="text-sm font-medium">Secondary Contact Email</label>
                          <input id="secondaryContactEmail" type="email" value={draft.secondaryContact.email} onChange={e => updateDraft('secondaryContact.email', e.target.value)} className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full" disabled={isFieldDisabled(role, draft.status)}/>
                        </div>
                      </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label htmlFor="primaryContactPhone" className="text-sm font-medium">Primary Contact Phone</label>
                            <div className="flex gap-2">
                              <select
                                  value={draft.secondaryContact.countryCode || '+33'}
                                  onChange={(e) => updateDraft('secondaryContact.countryCode', e.target.value)}
                                  className="p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-24"
                                  disabled={isFieldDisabled(role, draft.status)}
                                >
                                  {COUNTRY_CODES.map((code) => (
                                    <option key={code.value} value={code.value}>
                                      {code.label}
                                    </option>
                                  ))}
                                </select>

                              <input
                                id="primaryContactPhone"
                                type="tel"
                                value={draft.primaryContact.phone}
                                onChange={(e) => {
                                  const value = e.target.value.replaceAll(/\D/g, '');
                                  if (value.length <= 9) {
                                    updateDraft('primaryContact.phone', value);
                                  }
                                }}
                                pattern="[0-9]{9}"
                                title="9 chiffres requis"
                                placeholder="123456789"
                                className={`flex-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 ${
                                  draft.primaryContact.phone && draft.primaryContact.phone.length !== 9 ?
                                  'border-red-500 dark:border-red-400' : ''
                                }`}
                                disabled={isFieldDisabled(role, draft.status)}
                                required
                              />
                            </div>
                            {draft.primaryContact.phone && draft.primaryContact.phone.length !== 9 && draft.primaryContact.phone.length > 0 && (
                              <p className="text-xs text-red-500 mt-1">Veuillez saisir un numéro de téléphone valide (9 chiffres)</p>
                            )}
                          </div>
                          <div>
                            <label htmlFor="secondaryContactPhone" className="text-sm font-medium">Secondary Contact Phone</label>
                            <div className="flex gap-2">
                              <select
                                value={draft.secondaryContact.countryCode}
                                onChange={(e) => updateDraft('secondaryContact.countryCode', e.target.value)}
                                className="p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-24"
                                disabled={isFieldDisabled(role, draft.status)}
                              >
                                {COUNTRY_CODES.map((code) => (
                                  <option key={code.value} value={code.value}>
                                    {code.label}
                                  </option>
                                ))}
                              </select>
                              <input
                                id="secondaryContactPhone"
                                type="tel"
                                value={draft.secondaryContact.phone}
                                onChange={(e) => {
                                  const value = e.target.value.replaceAll(/\D/g, '');
                                  if (value.length <= 9) {
                                    updateDraft('secondaryContact.phone', value);
                                  }
                                }}
                                pattern="[0-9]{9}"
                                title="9 chiffres requis"
                                placeholder="123456789"
                                className={`flex-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 ${
                                  draft.secondaryContact.phone && draft.secondaryContact.phone.length !== 0 && draft.secondaryContact.phone.length !== 9 ?
                                  'border-red-500 dark:border-red-400' : ''
                                }`}
                                disabled={isFieldDisabled(role, draft.status)}
                              />
                            </div>
                            {draft.secondaryContact.phone && draft.secondaryContact.phone.length !== 0 && draft.secondaryContact.phone.length !== 9 && (
                              <p className="text-xs text-red-500 mt-1">Veuillez saisir un numéro de téléphone valide (9 chiffres)</p>
                            )}
                          </div>
                        </div>

                      <div className="mt-6 flex justify-between">
                          {!fromContinueButton && (
                            <button onClick={() => setStep(0)} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 transition-colors">
                              Back
                            </button>
                          )}
                          <div className="flex gap-2">
                            <button onClick={() => setStep(2)} className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                              Next → Incident
                            </button>
                          </div>
                        </div>
                    </div>
                    </div>
                  )}

                  {step === 2 && draft.incidentSubmission === "initial_notification" && (
                    <div>
                      <h2 className="text-2xl font-semibold mb-2">Incident Details</h2>
                      <p className="text-sm opacity-70 mb-6">Description and classification of the incident</p>

                        <div>
                          <label htmlFor="financialEntityCode" className="text-sm font-medium">Incident Reference Code Provided by the Financial Entity</label>
                          <input
                            id="financialEntityCode"
                            value={draft.incident.financialEntityCode}
                            onChange={e => updateDraft('incident.financialEntityCode', e.target.value)}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>

                      <div className="mt-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label htmlFor="detectionDateTime" className="text-sm font-medium">Detection Date/Time</label>
                              <input
                                id="detectionDateTime"
                                type="datetime-local"
                                value={draft.incident.detectionDateTime}
                                onChange={e => updateDraft('incident.detectionDateTime', e.target.value)}
                                className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                                disabled={isFieldDisabled(role, draft.status)}
                              />
                            </div>
                            <div>
                              <label htmlFor="classificationDateTime" className="text-sm font-medium">Classification Date/Time</label>
                              <input
                                id="classificationDateTime"
                                type="datetime-local"
                                value={draft.incident.classificationDateTime}
                                onChange={e => updateDraft('incident.classificationDateTime', e.target.value)}
                                className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                                disabled={isFieldDisabled(role, draft.status)}
                              />
                            </div>
                          </div>
                      </div>

                      <div className="mt-4">
                      <div className="space-y-4">
                        <div>
                          <label htmlFor="incidentDescription" className="text-sm font-medium">Incident Description</label>
                          <textarea
                            id="incidentDescription"
                            value={draft.incident.incidentDescription}
                            onChange={e => updateDraft('incident.incidentDescription', e.target.value)}
                            rows={3}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>
                      </div>

                      <div className="mt-4">
                          <p className="block text-sm font-medium mb-2">Classification Criteria</p>
                          <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto p-2 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                            {CLASSIFICATION_CRITERIA.map(criteria => (
                              <label
                                key={criteria.value}
                                className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-2 rounded"
                              >
                                <input
                                  type="checkbox"
                                  checked={draft.incident.classificationTypes[0]?.classificationCriterion?.includes(criteria.value)}
                                  onChange={() => {
                                    const currentValues = draft.incident.classificationTypes[0]?.classificationCriterion || [];
                                    const updatedValues = currentValues.includes(criteria.value)
                                      ? currentValues.filter(v => v !== criteria.value)
                                      : [...currentValues, criteria.value];

                                    // Si "geographical_spread" est décoché, réinitialiser "countryCodeMaterialityThresholds"
                                    if (criteria.value === 'geographical_spread' && !updatedValues.includes('geographical_spread')) {
                                      updateDraft('incident.classificationTypes.0.countryCodeMaterialityThresholds', []);
                                    }

                                    updateDraft('incident.classificationTypes.0.classificationCriterion', updatedValues);
                                  }}
                                  className="rounded"
                                  disabled={isFieldDisabled(role, draft.status)}
                                />
                                <span>{criteria.label}</span>
                              </label>
                            ))}
                          </div>
                      </div>

                        {/* Zone conditionnelle pour "geographical_spread" */}
                        {draft.incident.classificationTypes[0]?.classificationCriterion?.includes("geographical_spread") && (
                          <div className="mt-4 p-4 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                            <p className="text-sm font-medium">Country Code Materiality Thresholds</p>
                            <div className="grid grid-cols-3 gap-2 mt-2 max-h-48 overflow-y-auto">
                              {COUNTRY_OPTIONS.map(country => (
                                <label
                                  key={country.value}
                                  className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-1 rounded"
                                >
                                  <input
                                    type="checkbox"
                                    checked={draft.incident.classificationTypes[0]?.countryCodeMaterialityThresholds?.includes(country.value) || false}
                                    onChange={() => {
                                      const currentThresholds = draft.incident.classificationTypes[0]?.countryCodeMaterialityThresholds || [];
                                      const updatedThresholds = currentThresholds.includes(country.value)
                                        ? currentThresholds.filter(c => c !== country.value)
                                        : [...currentThresholds, country.value];
                                      updateDraft('incident.classificationTypes.0.countryCodeMaterialityThresholds', updatedThresholds);
                                    }}
                                    className="rounded"
                                    disabled={isFieldDisabled(role, draft.status)}
                                  />
                                  <span>{country.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="mt-6">
                          <label htmlFor="incidentDiscovery" className="text-sm font-medium">Incident Discovery</label>
                          <select
                            id="incidentDiscovery"
                            value={draft.incident.incidentDiscovery}
                            onChange={e => updateDraft('incident.incidentDiscovery', e.target.value)}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            disabled={isFieldDisabled(role, draft.status)}
                          >
                            <option value="">Select an option</option>
                            {INCIDENT_DISCOVERY_OPTIONS.map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="mt-4">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-medium">Incident originates from a third-party or financial entity</h4>
                            <div className="relative group">
                              <div className="w-4 h-4 rounded-full bg-blue-400 flex items-center justify-center text-white text-xs ">
                                i
                              </div>

                              {/* Tooltip (cachée par défaut, visible au survol) */}
                              <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-64 px-3 py-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg shadow-lg">
                                A compléter si l'incident provient d'un prestataire tiers ou d'une autre entité financière
                              </div>
                            </div>
                          </div>
                          <textarea
                            value={draft.incident.originatesFromThirdPartyProvider}
                            onChange={e => updateDraft('incident.originatesFromThirdPartyProvider', e.target.value)}
                            rows={2}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>

                        <div className="mt-4 flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="isBusinessContinuityActivated"
                            checked={draft.incident.isBusinessContinuityActivated}
                            onChange={e => updateDraft('incident.isBusinessContinuityActivated', e.target.checked)}
                            className="rounded w-5 h-5"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                          <label htmlFor="isBusinessContinuityActivated" className="text-sm font-medium">
                            Activation of business continuity plan, if activated</label>
                        </div>


                        <div className="mt-6">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-medium">Other Information</h4>
                            <div className="relative group">
                              <div className="w-4 h-4 rounded-full bg-blue-400 flex items-center justify-center text-white text-xs ">
                                i
                              </div>

                              {/* Tooltip (cachée par défaut, visible au survol) */}
                              <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-64 px-3 py-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg shadow-lg">
                                À compléter si l'incident a été reclassifié comme non-majeur ou pour toute information supplémentaire non couverte dans le modèle
                              </div>
                            </div>
                          </div>
                          <textarea
                            value={draft.incident.otherInformation}
                            onChange={e => updateDraft('incident.otherInformation', e.target.value)}
                            rows={3}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>

                        <div className="mt-6 flex justify-between">
                          {!fromContinueButton && (
                            <button
                            onClick={() => setStep(1)}
                            className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 transition-colors"
                          >
                            Back
                          </button>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => setStep(3)}
                              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                            >
                              Next → Review
                            </button>
                          </div>
                        </div>

                      </div>
                    </div>
                  )}

                  {step === 2 && draft.incidentSubmission === "intermediate_report" && (
                      <div>

                        <h2 className="text-2xl font-semibold mb-2">Incident Details</h2>
                      <p className="text-sm opacity-70 mb-6">Description and classification of the incident</p>

                      <div className="mt-6">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-medium">Incident Reference Code provided by the Competent Authority</h4>
                            <div className="relative group">
                              <div className="w-4 h-4 rounded-full bg-blue-400 flex items-center justify-center text-white text-xs">
                                i
                              </div>
                              {/* Tooltip */}
                              <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-64 px-3 py-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg shadow-lg">
                                Si applicable
                              </div>
                            </div>
                          </div>
                          <input
                            type="text"
                            value={draft.incident.competentAuthorityCode}
                            onChange={e => updateDraft('incident.competentAuthorityCode', e.target.value)}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            placeholder="Enter the unique reference code"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                      </div>

                      <div className="mt-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label htmlFor="incidentOccurrenceDateTime" className="text-sm font-medium">Occurrence Date/Time</label>
                              <input
                                id="incidentOccurrenceDateTime"
                                type="datetime-local"
                                value={draft.incident.incidentOccurrenceDateTime}
                                onChange={e => updateDraft('incident.incidentOccurrenceDateTime', e.target.value)}
                                className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                                disabled={isFieldDisabled(role, draft.status)}
                              />
                            </div>

                            <div>
                              <label htmlFor="serviceRestorationDateTime" className="text-sm font-medium">Services Restoration Date/Time</label>
                              <input
                                id="serviceRestorationDateTime"
                                type="datetime-local"
                                value={draft.impactAssessment.serviceImpact.serviceRestorationDateTime}
                                onChange={e => updateDraft('impactAssessment.serviceImpact.serviceRestorationDateTime', e.target.value)}
                                className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                                disabled={isFieldDisabled(role, draft.status)}
                              />
                            </div>

                          </div>
                      </div>

                      <div className="mt-4">
                        <div className="space-y-4">
                          {/* Clients affectés */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label htmlFor="affectedClientsNumber" className="text-sm font-medium">Number of Affected Clients</label>
                              <input
                                id="affectedClientsNumber"
                                type="number"
                                value={draft.impactAssessment.affectedAssets.affectedClients.number}
                                onChange={e => updateDraft('impactAssessment.affectedAssets.affectedClients.number', e.target.value)}
                                className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                                disabled={isFieldDisabled(role, draft.status)}
                              />
                            </div>
                            <div>
                              <label htmlFor="affectedClientsPercentage" className="text-sm font-medium">Percentage of Affected Clients (%)</label>
                              <input
                                id="affectedClientsPercentage"
                                type="number"
                                step="0.01"
                                value={draft.impactAssessment.affectedAssets.affectedClients.percentage}
                                onChange={e => updateDraft('impactAssessment.affectedAssets.affectedClients.percentage', e.target.value)}
                                className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                                disabled={isFieldDisabled(role, draft.status)}
                              />
                            </div>
                          </div>

                          {/* Financial Counterparts affectés */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label htmlFor="affectedFinancialCounterpartsNumber" className="text-sm font-medium">Number of Affected Financial Counterparts</label>
                              <input
                                id="affectedFinancialCounterpartsNumber"
                                type="number"
                                value={draft.impactAssessment.affectedAssets.affectedFinancialCounterparts.number}
                                onChange={e => updateDraft('impactAssessment.affectedAssets.affectedFinancialCounterparts.number', e.target.value)}
                                className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                                disabled={isFieldDisabled(role, draft.status)}
                              />
                            </div>
                            <div>
                              <label htmlFor="affectedFinancialCounterpartsPercentage" className="text-sm font-medium">Percentage of Affected Financial Counterparts (%)</label>
                              <input
                                id="affectedFinancialCounterpartsPercentage"
                                type="number"
                                step="0.01"
                                value={draft.impactAssessment.affectedAssets.affectedFinancialCounterparts.percentage}
                                onChange={e => updateDraft('impactAssessment.affectedAssets.affectedFinancialCounterparts.percentage', e.target.value)}
                                className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                                disabled={isFieldDisabled(role, draft.status)}
                              />
                            </div>

                            <div className="mt-4">
                              <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id="hasImpactOnRelevantClients"
                                    checked={draft.impactAssessment.hasImpactOnRelevantClients}
                                    onChange={e => updateDraft('impactAssessment.hasImpactOnRelevantClients', e.target.checked)}
                                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                    disabled={isFieldDisabled(role, draft.status)}
                                  />
                                  <label htmlFor="hasImpactOnRelevantClients" className="text-sm font-medium">
                                    Impact on relevant clients or financial counterparts
                                  </label>
                              </div>
                        </div>
                      </div> <br/>

                      {/* Transactions affectées */}
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label htmlFor="affectedTransactionsNumber" className="text-sm font-medium">Number of Affected Transactions</label>
                          <input
                            id="affectedTransactionsNumber"
                            type="number"
                            value={draft.impactAssessment.affectedAssets.affectedTransactions.number}
                            onChange={e => updateDraft('impactAssessment.affectedAssets.affectedTransactions.number', e.target.value)}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>
                        <div>
                          <label htmlFor="affectedTransactionsPercentage" className="text-sm font-medium">Percentage of Affected Transactions (%)</label>
                          <input
                            id="affectedTransactionsPercentage"
                            type="number"
                            step="0.01"
                            value={draft.impactAssessment.affectedAssets.affectedTransactions.percentage}
                            onChange={e => updateDraft('impactAssessment.affectedAssets.affectedTransactions.percentage', e.target.value)}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>

                        {/* Valeur des transactions affectées */}
                        <div>
                          <label htmlFor="valueOfAffectedTransactions" className="text-sm font-medium">Value of Affected Transactions</label>
                          <input
                            id="valueOfAffectedTransactions"
                            type="number"
                            value={draft.impactAssessment.affectedAssets.valueOfAffectedTransactions}
                            onChange={e => updateDraft('impactAssessment.affectedAssets.valueOfAffectedTransactions', e.target.value)}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>
                      </div>
                    </div>
                    </div>

                    <div className="mt-6">
                      <p className="block text-xs font-medium mb-2">Information whether the values are actual or estimates</p>
                      <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                        {NUMBERS_ACTUAL_ESTIMATE_OPTIONS.map(option => (
                          <label key={option.value} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={draft.impactAssessment.affectedAssets.numbersActualEstimate.includes(option.value)}
                              onChange={() => {
                                const currentValues = draft.impactAssessment.affectedAssets.numbersActualEstimate;
                                const updatedValues = currentValues.includes(option.value)
                                  ? currentValues.filter(value => value !== option.value)
                                  : [...currentValues, option.value];
                                updateDraft('impactAssessment.affectedAssets.numbersActualEstimate', updatedValues);
                              }}
                              className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                              disabled={isFieldDisabled(role, draft.status)}
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {draft.incident.classificationTypes[0]?.classificationCriterion?.includes("reputational_impact") && (
                      <div className="mt-6">
                        <p className="block text-xs font-medium mb-2">Reputational Impact Type</p>
                          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto p-2 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                            {REPUTATIONAL_IMPACT_OPTIONS.map(option => (
                              <label key={option.value} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-1 rounded">
                                <input
                                  type="checkbox"
                                  checked={draft.incident.classificationTypes[0]?.reputationalImpactType?.includes(option.value)}
                                  onChange={() => {
                                    const currentValues = draft.incident.classificationTypes[0]?.reputationalImpactType || [];
                                    const updatedValues = currentValues.includes(option.value)
                                      ? currentValues.filter(value => value !== option.value)
                                      : [...currentValues, option.value];
                                    updateDraft('incident.classificationTypes.0.reputationalImpactType', updatedValues);
                                  }}
                                  className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                                  disabled={isFieldDisabled(role, draft.status)}
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                          </div>

                        <div className="mt-6">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-medium">Contextual Information about the Reputational Impact</h4>
                            <div className="relative group">
                              <div className="w-4 h-4 rounded-full bg-blue-400 flex items-center justify-center text-white text-xs">
                                i
                              </div>
                              {/* Tooltip */}
                              <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-64 px-3 py-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg shadow-lg">
                                Décrivez comment l'incident lié aux TIC a affecté ou pourrait affecter la réputation de l'entité financière
                              </div>
                            </div>
                          </div>
                          <textarea
                            value={draft.incident.classificationTypes[0]?.reputationalImpactDescription || ''}
                            onChange={e => updateDraft('incident.classificationTypes.0.reputationalImpactDescription', e.target.value)}
                            rows={2}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            placeholder="Include details such as media coverage, client complaints, regulatory impact, etc"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-4">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Incident Duration */}
                        <div>
                          <label htmlFor="incidentDuration" className="text-sm font-medium">Incident Duration (DD:HH:MM)</label>
                          <input
                            id="incidentDuration"
                            type="text"
                            value={draft.incident.incidentDuration}
                            onChange={(e) => {
                              let value = e.target.value.replaceAll(/\D/g, '');
                              let formattedValue = '';
                              if (value.length > 0) {
                                formattedValue = value.substring(0, 2);
                                if (value.length > 2) {
                                  formattedValue += ':' + value.substring(2, 4);
                                  if (value.length > 4) {
                                    formattedValue += ':' + value.substring(4, 6);
                                  }
                                }
                              }
                              updateDraft('incident.incidentDuration', formattedValue);
                            }}
                            placeholder="DD:HH:MM"
                            maxLength={8}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>

                        {/* Service Downtime */}
                        <div>
                          <label htmlFor="serviceDowntime" className="text-sm font-medium">Service Downtime (DD:HH:MM)</label>
                          <input
                            id="serviceDowntime"
                            type="text"
                            value={draft.impactAssessment.serviceImpact.serviceDowntime}
                            onChange={(e) => {
                              let value = e.target.value.replaceAll(/\D/g, '');
                              let formattedValue = '';
                              if (value.length > 0) {
                                formattedValue = value.substring(0, 2);
                                if (value.length > 2) {
                                  formattedValue += ':' + value.substring(2, 4);
                                  if (value.length > 4) {
                                    formattedValue += ':' + value.substring(4, 6);
                                  }
                                }
                              }
                              updateDraft('impactAssessment.serviceImpact.serviceDowntime', formattedValue);
                            }}
                            placeholder="DD:HH:MM"
                            maxLength={8}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>
                      </div>
                    </div>

                    {draft.incident.classificationTypes[0]?.classificationCriterion?.includes("duration_and_service_downtime") && (
                    <div className="mt-4">
                      <label htmlFor="durationServiceDowntimeInfo" className="text-sm font-medium">
                        Information whether the values for duration and service downtime are actual or estimates
                      </label>
                      <select
                        id="durationServiceDowntimeInfo"
                        value={draft.informationDurationServiceDowntimeActualOrEstimate}
                        onChange={(e) => updateDraft('informationDurationServiceDowntimeActualOrEstimate', e.target.value)}
                        className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                        disabled={isFieldDisabled(role, draft.status)}
                      >
                        <option value="">Select an option</option>
                        {DURATION_SERVICE_DOWNTIME_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    )}


                    {draft.incident.classificationTypes[0]?.classificationCriterion?.includes("geographical_spread") && (
                      <>
                        <div className="mt-4">
                          <p className="block text-xs font-medium mb-2">Types of Impact in the Member States</p>
                          <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                            {MEMBER_STATES_IMPACT_TYPE_OPTIONS.map(option => (
                              <label key={option.value} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-1 rounded">
                                <input
                                  type="checkbox"
                                  checked={draft.incident.classificationTypes[0]?.memberStatesImpactType?.includes(option.value)}
                                  onChange={() => {
                                    const currentValues = draft.incident.classificationTypes[0]?.memberStatesImpactType || [];
                                    const updatedValues = currentValues.includes(option.value)
                                      ? currentValues.filter(value => value !== option.value)
                                      : [...currentValues, option.value];
                                    updateDraft('incident.classificationTypes.0.memberStatesImpactType', updatedValues);
                                  }}
                                  className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                                  disabled={isFieldDisabled(role, draft.status)}
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="mt-4">
                          <p className="block text-sm font-medium mb-2">
                            Description of the Impact and Severity in Each Affected Member State
                          </p>
                          <textarea
                            value={draft.incident.classificationTypes[0]?.memberStatesImpactTypeDescription || ''}
                            onChange={e => updateDraft('incident.classificationTypes.0.memberStatesImpactTypeDescription', e.target.value)}
                            rows={2}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            placeholder="Décrivez l'impact et la gravité de l'incident dans chaque État membre affecté"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>
                      </>
                    )}

                    {draft.incident.classificationTypes[0]?.classificationCriterion?.includes("data_losses") && (
                      <>
                        <div className="mt-4">
                          <p className="block text-xs font-medium mb-2">Type of Data Losses</p>
                          <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                            {DATA_LOSS_MATERIALITY_THRESHOLDS_OPTIONS.map(option => (
                              <label key={option.value} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-1 rounded">
                                <input
                                  type="checkbox"
                                  checked={draft.incident.classificationTypes[0]?.dataLosseMaterialityThresholds?.includes(option.value)}
                                  onChange={() => {
                                    const currentValues = draft.incident.classificationTypes[0]?.dataLosseMaterialityThresholds || [];
                                    const updatedValues = currentValues.includes(option.value)
                                      ? currentValues.filter(value => value !== option.value)
                                      : [...currentValues, option.value];
                                    updateDraft('incident.classificationTypes.0.dataLosseMaterialityThresholds', updatedValues);
                                  }}
                                  className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                                  disabled={isFieldDisabled(role, draft.status)}
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="mt-4">
                          <p className="block text-sm font-medium mb-2">
                            Description of the Data Losses
                          </p>
                          <textarea
                            value={draft.incident.classificationTypes[0]?.dataLossesDescription || ''}
                            onChange={e => updateDraft('incident.classificationTypes.0.dataLossesDescription', e.target.value)}
                            rows={2}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            placeholder="Décrivez l'impact sur la disponibilité, l'authenticité, l'intégrité et la confidentialité des données critiques"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>
                      </>
                    )}

                    <div className="mt-4">
                      <p className="block text-sm font-medium mb-2">
                        Critical Services Affected
                      </p>
                      <textarea
                        value={draft.impactAssessment.criticalServicesAffected || ''}
                        onChange={e => updateDraft('impactAssessment.criticalServicesAffected', e.target.value)}
                        rows={2}
                        className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                        placeholder="Décrivez les services critiques affectés, y compris ceux nécessitant une autorisation, une inscription ou une supervision par des autorités compétentes, ainsi que la nature de l'accès malveillant et non autorisé"
                        disabled={isFieldDisabled(role, draft.status)}
                      />
                    </div>

                    <div className="mt-4">
                      <p className="block text-xs font-medium mb-2">Incident Classification</p>
                      <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                        {INCIDENT_CLASSIFICATION_OPTIONS.map(option => (
                          <label key={option.value} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={draft.incident.incidentType.incidentClassification.includes(option.value)}
                              onChange={() => {
                                const currentValues = draft.incident.incidentType.incidentClassification;
                                let updatedValues;
                                if (option.value === "cybersecurity-related") {
                                  if (currentValues.includes(option.value)) {
                                    updatedValues = currentValues.filter(value => value !== option.value);
                                    updateDraft('incident.incidentType.threatTechniques', []);
                                    updateDraft('incident.incidentType.otherThreatTechniques', '');
                                  } else {
                                    updatedValues = [...currentValues, option.value];
                                  }
                                } else {
                                  updatedValues = currentValues.includes(option.value)
                                    ? currentValues.filter(value => value !== option.value)
                                    : [...currentValues, option.value];
                                }
                                updateDraft('incident.incidentType.incidentClassification', updatedValues);
                              }}
                              className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                              disabled={isFieldDisabled(role, draft.status)}
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                    {draft.incident.incidentType.incidentClassification.includes("other") && (
                      <div className="mt-4">
                          <p className="block text-sm font-medium mb-2">
                            Other Incident Classification
                          </p>
                          <textarea
                            value={draft.incident.incidentType.otherIncidentClassification || ''}
                            onChange={e => updateDraft('incident.incidentType.otherIncidentClassification', e.target.value)}
                            rows={2}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            placeholder="Please specify the other type of incident."
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                      </div>
                    )}
                    </div>

                    {draft.incident.incidentType.incidentClassification.includes("cybersecurity-related") && (
                      <div className="mt-4">
                          <p className="block text-xs font-medium mb-2">Threat Techniques</p>
                          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto p-2 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                            {THREAT_TECHNIQUES_OPTIONS.map(option => (
                              <label key={option.value} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-1 rounded">
                                <input
                                  type="checkbox"
                                  checked={draft.incident.incidentType.threatTechniques.includes(option.value)}
                                  onChange={() => {
                                    const currentValues = draft.incident.incidentType.threatTechniques;
                                    const updatedValues = currentValues.includes(option.value)
                                      ? currentValues.filter(value => value !== option.value)
                                      : [...currentValues, option.value];
                                    updateDraft('incident.incidentType.threatTechniques', updatedValues);
                                  }}
                                  className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                                  disabled={isFieldDisabled(role, draft.status)}
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                          </div>
                      </div>
                    )}

                    {draft.incident.incidentType.threatTechniques.includes("other") && (
                      <div className="mt-4">
                          <p className="block text-sm font-medium mb-2">
                            Other Threat Techniques
                          </p>
                          <textarea
                            value={draft.incident.incidentType.otherThreatTechniques || ''}
                            onChange={e => updateDraft('incident.incidentType.otherThreatTechniques', e.target.value)}
                            rows={2}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            placeholder="Please specify the other threat techniques."
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                      </div>

                    )}

                    <div className="mt-4">
                      <p className="block text-sm font-medium mb-2">
                        Information about Affected Functional Areas and Business Processes
                      </p>
                      <textarea
                        value={draft.impactAssessment.affectedFunctionalAreas || ''}
                        onChange={e => updateDraft('impactAssessment.affectedFunctionalAreas', e.target.value)}
                        rows={2}
                        className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                        placeholder="Indiquez les zones fonctionnelles et des processus métiers affectés par l'incident, y compris les produits et services."
                        disabled={isFieldDisabled(role, draft.status)}
                      />
                    </div>


                    <div className="mt-4">
                      <label htmlFor="isAffectedInfrastructureComponents" className="block text-sm font-medium mb-2">
                        Are Infrastructure Components Supporting Business Processes Affected ?
                      </label>
                      <select
                        id="isAffectedInfrastructureComponents"
                        value={draft.impactAssessment.isAffectedInfrastructureComponents}
                        onChange={e => updateDraft('impactAssessment.isAffectedInfrastructureComponents', e.target.value)}
                        className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                        disabled={isFieldDisabled(role, draft.status)}
                      >
                        <option value="">Select an option</option>
                        {IS_AFFECTED_INFRASTRUCTURE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {draft.impactAssessment.isAffectedInfrastructureComponents === "yes" && (
                      <div className="mt-4">
                          <p className="block text-sm font-medium mb-2">
                            Information about Affected Infrastructure Components
                          </p>
                          <textarea
                            value={draft.impactAssessment.affectedInfrastructureComponents || ''}
                            onChange={e => updateDraft('impactAssessment.affectedInfrastructureComponents', e.target.value)}
                            rows={2}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            placeholder="Describe the affected infrastructure components, including hardware (servers, computers, data centers, etc.) and software (operating systems, applications, databases, etc.)."
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                      </div>
                    )}

                    <div className="mt-4">
                      <label htmlFor="isImpactOnFinancialInterest" className="block text-sm font-medium mb-2">
                        Has the Incident Impacted the Financial Interest of Clients?
                      </label>
                      <select
                        id="isImpactOnFinancialInterest"
                        value={draft.impactAssessment.isImpactOnFinancialInterest}
                        onChange={e => updateDraft('impactAssessment.isImpactOnFinancialInterest', e.target.value)}
                        className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                        disabled={isFieldDisabled(role, draft.status)}
                      >
                        <option value="">Select an option</option>
                        {IS_IMPACT_ON_FINANCIAL_INTEREST_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mt-4">
                      <p className="block text-xs font-medium mb-2">Reporting to Other Authorities</p>
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                        {REPORTING_TO_OTHER_AUTHORITIES_OPTIONS.map(option => (
                          <label key={option.value} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={draft.reportingToOtherAuthorities.includes(option.value)}
                              onChange={() => {
                                const currentValues = draft.reportingToOtherAuthorities;
                                const updatedValues = currentValues.includes(option.value)
                                  ? currentValues.filter(value => value !== option.value)
                                  : [...currentValues, option.value];
                                updateDraft('reportingToOtherAuthorities', updatedValues);
                              }}
                              className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                              disabled={isFieldDisabled(role, draft.status)}
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {draft.reportingToOtherAuthorities.includes("other") && (
                      <div className="mt-4">
                          <p className="block text-sm font-medium mb-2">
                            Other Authorities Informed
                          </p>
                          <textarea
                            value={draft.reportingToOtherAuthoritiesOther || ''}
                            onChange={e => updateDraft('reportingToOtherAuthoritiesOther', e.target.value)}
                            rows={2}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            placeholder="Please specify the other authorities informed about the incident."
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                      </div>
                    )}

                    <div className="mt-5">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={draft.impactAssessment.serviceImpact.isTemporaryActionsMeasuresForRecovery || false}
                          onChange={e => updateDraft('impactAssessment.serviceImpact.isTemporaryActionsMeasuresForRecovery', e.target.checked)}
                          className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                          disabled={isFieldDisabled(role, draft.status)}
                        />
                        <span>Have Temporary Actions/Measures Been Taken or Planned to Recover from the Incident?</span>
                      </label>
                    </div>

                    {draft.impactAssessment.serviceImpact.isTemporaryActionsMeasuresForRecovery && (
                      <div className="mt-4">
                          <p className="block text-sm font-medium mb-2">
                            Description of Temporary Actions/Measures for Recovery
                          </p>
                          <textarea
                            id="descriptionOfTemporaryActionsMeasuresForRecovery"
                            value={draft.impactAssessment.serviceImpact.descriptionOfTemporaryActionsMeasuresForRecovery || ''}
                            onChange={e => updateDraft('impactAssessment.serviceImpact.descriptionOfTemporaryActionsMeasuresForRecovery', e.target.value)}
                            rows={2}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            placeholder="Describe the immediate actions taken such as isolation of the incident at the network level, workarounds, USB ports blocked, Disaster Recovery site activation, etc."
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                      </div>
                    )}

                    {draft.incident.incidentType.incidentClassification.includes("cybersecurity-related") && (
                      <div className="mt-4">
                          <p className="block text-sm font-medium mb-2">
                            Indicators of Compromise (IoC)
                          </p>
                          <textarea
                            value={draft.incident.incidentType.indicatorsOfCompromise || ''}
                            onChange={e => updateDraft('incident.incidentType.indicatorsOfCompromise', e.target.value)}
                            rows={2}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            placeholder="Provide indicators of compromise such as IP addresses, URLs, domains, file hashes, malware data, network activity data, email message data, DNS requests, user account activities, database traffic, etc."
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                      </div>
                    )}

                        <div className="mt-6 flex justify-between">
                          {!fromContinueButton && (
                            <button
                            onClick={() => setStep(1)}
                            className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 transition-colors"
                          >
                            Back
                          </button>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => setStep(3)}
                              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                            >
                              Next → Review
                            </button>
                          </div>
                        </div>

                    </div>
                  )}


                  {step === 2 && draft.incidentSubmission === "final_report" && (
                      <div>
                          <h2 className="text-2xl font-semibold mb-2">Incident Details</h2>
                          <p className="text-sm opacity-70 mb-6">Description and classification of the incident</p>

                        <div className="mt-4">
                          <p className="block text-xs font-medium mb-2">High-Level Classification of Root Cause of the Incident</p>
                          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                            {ROOT_CAUSE_HL_CLASSIFICATION_OPTIONS.map(option => (
                              <label key={option.value} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-1 rounded">
                                <input
                                  type="checkbox"
                                  checked={draft.incident.rootCauseHLClassification.includes(option.value)}
                                  onChange={() => {
                                    const currentValues = draft.incident.rootCauseHLClassification;
                                    const updatedValues = currentValues.includes(option.value)
                                      ? currentValues.filter(value => value !== option.value)
                                      : [...currentValues, option.value];
                                    updateDraft('incident.rootCauseHLClassification', updatedValues);
                                  }}
                                  className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                                  disabled={isFieldDisabled(role, draft.status)}
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="mt-4">
                          <p className="block text-xs font-medium mb-2">Detailed Classification of Root Causes of the Incident</p>
                          <div className="grid grid-cols-2 gap-4 max-h-56 overflow-y-auto p-2 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">

                            {/* Malicious Actions */}
                            {draft.incident.rootCauseHLClassification.includes("malicious_actions") && (
                              <div className="flex flex-col gap-2">
                                  <p className="block text-xs font-medium mb-2">Malicious Actions</p>
                                  {ROOT_CAUSES_DETAILED_CLASSIFICATION_OPTIONS
                                    .filter(option => option.value.startsWith("malicious_actions_"))
                                    .map(option => (
                                      <label key={option.value} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-1 rounded">
                                        <input
                                          type="checkbox"
                                          checked={draft.incident.rootCausesDetailedClassification.includes(option.value)}
                                          onChange={() => {
                                            const currentValues = draft.incident.rootCausesDetailedClassification;
                                            const updatedValues = currentValues.includes(option.value)
                                              ? currentValues.filter(value => value !== option.value)
                                              : [...currentValues, option.value];
                                            updateDraft('incident.rootCausesDetailedClassification', updatedValues);
                                          }}
                                          className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                                          disabled={isFieldDisabled(role, draft.status)}
                                        />
                                        <span>{option.label.replace("Malicious actions: ", "")}</span>
                                      </label>
                                    ))}
                              </div>
                            )}

                            {/* Process Failure */}
                            {draft.incident.rootCauseHLClassification.includes("process_failure") && (
                                <div className="flex flex-col gap-2">
                                  <p className="block text-xs font-medium mb-2">Process Failure</p>
                                  {ROOT_CAUSES_DETAILED_CLASSIFICATION_OPTIONS
                                    .filter(option => option.value.startsWith("process_failure_"))
                                    .map(option => (
                                      <label key={option.value} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-1 rounded">
                                        <input
                                          type="checkbox"
                                          checked={draft.incident.rootCausesDetailedClassification.includes(option.value)}
                                          onChange={() => {
                                            const currentValues = draft.incident.rootCausesDetailedClassification;
                                            const updatedValues = currentValues.includes(option.value)
                                              ? currentValues.filter(value => value !== option.value)
                                              : [...currentValues, option.value];
                                            updateDraft('incident.rootCausesDetailedClassification', updatedValues);
                                          }}
                                          className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                                          disabled={isFieldDisabled(role, draft.status)}
                                        />
                                        <span>{option.label.replace("Process failure: ", "")}</span>
                                      </label>
                                    ))}
                                </div>
                            )}

                            {/* System Failure */}
                            {draft.incident.rootCauseHLClassification.includes("system_failure_malfunction") && (
                                <div className="flex flex-col gap-2">
                                  <p className="block text-xs font-medium mb-2">System Failure</p>
                                  {ROOT_CAUSES_DETAILED_CLASSIFICATION_OPTIONS
                                    .filter(option => option.value.startsWith("system_failure_"))
                                    .map(option => (
                                      <label key={option.value} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-1 rounded">
                                        <input
                                          type="checkbox"
                                          checked={draft.incident.rootCausesDetailedClassification.includes(option.value)}
                                          onChange={() => {
                                            const currentValues = draft.incident.rootCausesDetailedClassification;
                                            const updatedValues = currentValues.includes(option.value)
                                              ? currentValues.filter(value => value !== option.value)
                                              : [...currentValues, option.value];
                                            updateDraft('incident.rootCausesDetailedClassification', updatedValues);
                                          }}
                                          className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                                          disabled={isFieldDisabled(role, draft.status)}
                                        />
                                        <span>{option.label.replace("System failure: ", "")}</span>
                                      </label>
                                    ))}
                                </div>
                            )}

                            {/* Human Error */}
                            {draft.incident.rootCauseHLClassification.includes("human_error") && (
                                <div className="flex flex-col gap-2">
                                  <p className="block text-xs font-medium mb-2">Human Error</p>
                                  {ROOT_CAUSES_DETAILED_CLASSIFICATION_OPTIONS
                                    .filter(option => option.value.startsWith("human_error_"))
                                    .map(option => (
                                      <label key={option.value} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-1 rounded">
                                        <input
                                          type="checkbox"
                                          checked={draft.incident.rootCausesDetailedClassification.includes(option.value)}
                                          onChange={() => {
                                            const currentValues = draft.incident.rootCausesDetailedClassification;
                                            const updatedValues = currentValues.includes(option.value)
                                              ? currentValues.filter(value => value !== option.value)
                                              : [...currentValues, option.value];
                                            updateDraft('incident.rootCausesDetailedClassification', updatedValues);
                                          }}
                                          className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                                          disabled={isFieldDisabled(role, draft.status)}
                                        />
                                        <span>{option.label.replace("Human error: ", "")}</span>
                                      </label>
                                    ))}
                                </div>
                            )}

                            {/* External Event */}
                            {draft.incident.rootCauseHLClassification.includes("external_event") && (
                                <div className="flex flex-col gap-2">
                                  <p className="block text-xs font-medium mb-2">External Event</p>
                                  {ROOT_CAUSES_DETAILED_CLASSIFICATION_OPTIONS
                                    .filter(option => option.value.startsWith("external_event_"))
                                    .map(option => (
                                      <label key={option.value} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-1 rounded">
                                        <input
                                          type="checkbox"
                                          checked={draft.incident.rootCausesDetailedClassification.includes(option.value)}
                                          onChange={() => {
                                            const currentValues = draft.incident.rootCausesDetailedClassification;
                                            const updatedValues = currentValues.includes(option.value)
                                              ? currentValues.filter(value => value !== option.value)
                                              : [...currentValues, option.value];
                                            updateDraft('incident.rootCausesDetailedClassification', updatedValues);
                                          }}
                                          className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                                          disabled={isFieldDisabled(role, draft.status)}
                                        />
                                        <span>{option.label.replace("External event: ", "")}</span>
                                      </label>
                                    ))}
                                </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-4">
                          <p className="block text-xs font-medium mb-2">Additional Classification of Root Causes of the Incident</p>
                          <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                            {ROOT_CAUSES_ADDITIONAL_CLASSIFICATION_OPTIONS.map(option => (
                              <label key={option.value} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-1 rounded">
                                <input
                                  type="checkbox"
                                  checked={draft.incident.rootCausesAdditionalClassification.includes(option.value)}
                                  onChange={() => {
                                    const currentValues = draft.incident.rootCausesAdditionalClassification;
                                    const updatedValues = currentValues.includes(option.value)
                                      ? currentValues.filter(value => value !== option.value)
                                      : [...currentValues, option.value];
                                    updateDraft('incident.rootCausesAdditionalClassification', updatedValues);
                                  }}
                                  className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                                  disabled={isFieldDisabled(role, draft.status)}
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {draft.incident.rootCausesDetailedClassification.some(value => value.includes("other")) && (
                            <div className="mt-4">
                              <p className="block text-sm font-medium mb-2">Other Types of Root Causes</p>
                              <textarea
                                value={draft.incident.rootCausesOther || ''}
                                onChange={e => updateDraft('incident.rootCausesOther', e.target.value)}
                                rows={2}
                                className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                                placeholder="Specify other types of root causes if applicable."
                                disabled={isFieldDisabled(role, draft.status)}
                              />
                            </div>
                        )}

                        <div className="mt-4">
                          <p className="block text-sm font-medium mb-2">
                            Information about the Root Causes of the Incident
                          </p>
                          <textarea
                            value={draft.incident.rootCausesInformation || ''}
                            onChange={e => updateDraft('incident.rootCausesInformation', e.target.value)}
                            rows={2}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            placeholder="Décrivez la séquence des événements qui ont conduit à l'incident et comment l'incident semble avoir une cause racine similaire s'il s'agit d'un incident récurrent"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>

                        <div className="mt-4">
                          <p className="block text-sm font-medium mb-2">
                            Incident Resolution Summary
                          </p>
                          <textarea
                            value={draft.incident.incidentResolutionSummary || ''}
                            onChange={e => updateDraft('incident.incidentResolutionSummary', e.target.value)}
                            rows={3}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            placeholder="Décrivez les actions/mesures prises ou planifiées pour résoudre définitivement l'incident et pour prévenir que cet incident ne se reproduise à l'avenir. Incluez les leçons tirées de l'incident et les problèmes potentiels identifiés concernant la robustesse des systèmes informatiques affectés"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-4">
                            <div className="mt-4">
                              <label htmlFor="rootCauseAddressingDateTime" className="block text-sm font-medium mb-2">
                                Date and Time When the Incident Root Cause Was Addressed
                              </label>
                              <input
                                id="rootCauseAddressingDateTime"
                                type="datetime-local"
                                value={draft.incident.rootCauseAddressingDateTime || ''}
                                onChange={e => updateDraft('incident.rootCauseAddressingDateTime', e.target.value)}
                                className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                                disabled={isFieldDisabled(role, draft.status)}
                              />
                            </div>
                            <div className="mt-4">
                              <label htmlFor="incidentResolutionDateTime" className="block text-sm font-medium mb-2">
                                Date and Time When the Incident Was Resolved
                              </label>
                              <input
                                id="incidentResolutionDateTime"
                                type="datetime-local"
                                value={draft.incident.incidentResolutionDateTime || ''}
                                onChange={e => updateDraft('incident.incidentResolutionDateTime', e.target.value)}
                                className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                                disabled={isFieldDisabled(role, draft.status)}
                              />
                            </div>
                        </div>

                        <div className="mt-4">
                          <p className="block text-sm font-medium mb-2">
                            Reason for the Difference Between Permanent Resolution Date and Initially Planned Implementation Date
                          </p>
                          <textarea
                            value={draft.incident.incidentResolutionVsPlannedImplementation || ''}
                            onChange={e => updateDraft('incident.incidentResolutionVsPlannedImplementation', e.target.value)}
                            rows={2}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            placeholder="Décrivez la raison pour laquelle la date de résolution définitive des incidents diffère de la date de mise en œuvre initialement prévue, le cas échéant"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>

                        <div className="mt-4">
                          <p className="block text-sm font-medium mb-2">
                            Assessment of risk to critical functions for resolution purposes
                          </p>
                          <textarea
                            value={draft.incident.assessmentOfRiskToCriticalFunctions || ''}
                            onChange={e => updateDraft('incident.assessmentOfRiskToCriticalFunctions', e.target.value)}
                            rows={3}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            placeholder="Indiquez si l'incident représente un risque pour les fonctions critiques au sens de l'article 2, paragraphe 1, point 35, de la directive 2014/59/UE."
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>

                        <div className="mt-4">
                          <p className="block text-sm font-medium mb-2">
                            Information Relevant for Resolution Authorities
                          </p>
                          <textarea
                            value={draft.incident.informationRelevantToResolutionAuthorities || ''}
                            onChange={e => updateDraft('incident.informationRelevantToResolutionAuthorities', e.target.value)}
                            rows={4}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            placeholder="Décrivez l'impact de l'incident ICT majeur sur la résolvabilité de l'entité ou du groupe, incluant la continuité opérationnelle, les coûts, les pertes, la position financière et la robustesse des accords contractuels ICT en cas de résolution"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>

                        <div className="mt-4">
                          <p className="block text-sm font-medium mb-2">
                            Materiality Threshold for the Classification Criterion "Economic Impact"
                          </p>
                          <textarea
                            value={draft.incident.classificationTypes[0].economicImpactMaterialityThreshold || ''}
                            onChange={e => {
                              const updatedClassificationTypes = [...draft.incident.classificationTypes];
                              updatedClassificationTypes[0].economicImpactMaterialityThreshold = e.target.value;
                              updateDraft('incident.classificationTypes', updatedClassificationTypes);
                            }}
                            rows={3}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            placeholder="Détaillez les seuils atteints par l'incident pour le critère 'Impact économique' (articles 7 et 14 du Règlement (UE) 2022/2554)."
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-6">
                          <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-medium">Amount of gross direct and indirect costs and losses (en {draft.reportCurrency})</h4>
                                <div className="relative group">
                                  <div className="w-4 h-4 rounded-full bg-blue-400 flex items-center justify-center text-white text-xs">
                                    i
                                  </div>
                                  {/* Tooltip */}
                                  <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-64 px-3 py-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg shadow-lg">
                                    Inclure les coûts de remplacement, les amendes, les pertes financières, les frais de conseil, les coûts opérationnels, etc.
                                  </div>
                                </div>
                              </div>
                            <input
                              type="number"
                              value={draft.incident.grossAmountIndirectDirectCosts || ''}
                              onChange={e => updateDraft('incident.grossAmountIndirectDirectCosts', e.target.value)}
                              className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                              placeholder="Exemple : 50000"
                              disabled={isFieldDisabled(role, draft.status)}
                            />
                          </div>

                          <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-medium">Amount of Financial Recoveries (en {draft.reportCurrency})</h4>
                                <div className="relative group">
                                  <div className="w-4 h-4 rounded-full bg-blue-400 flex items-center justify-center text-white text-xs">
                                    i
                                  </div>
                                  {/* Tooltip */}
                                  <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-64 px-3 py-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg shadow-lg">
                                    Inclure les fonds ou bénéfices économiques reçus de premières ou tierces parties, indépendamment de la perte initiale.
                                  </div>
                                </div>
                              </div>
                            <input
                              type="number"
                              value={draft.incident.financialRecoveriesAmount || ''}
                              onChange={e => updateDraft('incident.financialRecoveriesAmount', e.target.value)}
                              className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                              placeholder="Exemple : 50000"
                              disabled={isFieldDisabled(role, draft.status)}
                            />
                          </div>
                        </div>

                        <div className="mt-4">
                          <p className="block text-sm font-medium mb-2">
                            Information whether the non-major incidents have been recurring
                          </p>
                          <textarea
                            value={draft.incident.recurringNonMajorIncidentsDescription || ''}
                            onChange={e => updateDraft('incident.recurringNonMajorIncidentsDescription', e.target.value)}
                            rows={2}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            placeholder="Indiquer si plusieurs incidents non majeurs sont récurrents et considérés comme un incident majeur, ainsi que le nombre d'occurrences."
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>

                        <div className="mt-4">
                          <label htmlFor="recurringIncidentDate" className="block text-sm font-medium mb-2">
                            Date and time of occurrence of recurring incidents
                          </label>
                          <input
                            id="recurringIncidentDate"
                            type="datetime-local"
                            value={draft.incident.recurringIncidentDate || ''}
                            onChange={e => updateDraft('incident.recurringIncidentDate', e.target.value)}
                            className="mt-1 p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 w-full"
                            disabled={isFieldDisabled(role, draft.status)}
                          />
                        </div>

                        <div className="mt-6 flex justify-between">
                          {!fromContinueButton && (
                            <button
                            onClick={() => setStep(1)}
                            className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 transition-colors"
                          >
                            Back
                          </button>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => setStep(3)}
                              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                            >
                              Next → Review
                            </button>
                          </div>
                        </div>

                      </div>
                    )}



                  {step === 3 && (
                    <div>
                      <h2 className="text-2xl font-semibold mb-2">Review & Export</h2>
                      <p className="text-sm opacity-70 mb-6">Validate and export your JSON report</p>

                      <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                        <h4 className="font-medium">Validation</h4>
                          {Array.isArray(errors) && errors.length === 0 ? (
                            <div className="mt-2 text-sm text-green-700 dark:text-green-400">No validation errors detected</div>
                          ) : (
                            <ul className="mt-2 text-sm text-red-700 dark:text-red-400 list-disc pl-4">
                              {Array.isArray(errors) && errors.map((e) => <li key={e}>{e}</li>)}
                            </ul>
                          )}

                        <div className="mt-4">
                          <h4 className="font-medium">Preview JSON</h4>
                          <pre className="mt-2 max-h-64 overflow-auto text-xs bg-black/5 dark:bg-black/30 p-3 rounded">{JSON.stringify(draft, null, 2)}</pre>
                        </div>

                        <div className="mt-4 flex gap-2">
                          {role !== 'validateur' && role !== 'auditeur' && draft.status !== 'validated' && (
                              <button
                                onClick={async () => {
                                  const result = await saveReport(true);
                                  if (result.ok) {
                                    alert('Saved to Dashboard');
                                  } else {
                                    console.error('Erreurs lors de la sauvegarde:', result.errors);
                                    setErrors(result.errors);
                                  }
                                }}
                                className="px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                              >
                                Save to Dashboard
                              </button>
                          )}

                        </div>
                      </div>

                      <div className="mt-6 flex justify-between">
                        <button onClick={() => setStep(2)} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 transition-colors">Back</button>
                        <button onClick={() => {
                          setView('dashboard');
                          setFromContinueButton(false); // Réinitialiser fromContinueButton à false
                          globalThis.location.reload();
                        }} className="px-4 py-2 rounded-lg bg-indigo-700 text-white hover:bg-indigo-800 transition-colors">
                          Go to Dashboard
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </motion.div>
          )}
            {!isReportView && (
              <>
                {view === 'dashboard' && (
                    <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="p-6 rounded-2xl bg-white/90 dark:bg-white/5 shadow">
                      <h2 className="text-xl font-semibold">Dashboard</h2>
                      <p className="text-sm opacity-70 mb-4">Manage your saved DORA reports</p>

                      <div className="grid grid-cols-3 gap-2 mb-6">
                          {/* Incidents Status */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 col-span-2">
                              {/* Total Incidents */}
                          <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
                            <div className="text-sm">Total Incidents</div>
                            <div className="text-2xl font-bold">{incidentStats.totalIncidents}</div>
                          </div>
                            {/* Closed Incidents */}
                            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/30">
                              <div className="text-sm">Incidents Fermés</div>
                              <div className="text-2xl font-bold">{incidentStats.closedIncidents}</div>
                            </div>

                            {/* Open Incidents */}
                            <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/30">
                              <div className="text-sm">Incidents En Cours</div>
                              <div className="text-2xl font-bold">{incidentStats.openIncidents}</div>
                            </div>
                          </div>

                        <div className="p-4 rounded-lg bg-white/80 dark:bg-gray-800">
                          <div className="text-sm">Actions</div>
                          <div className="mt-2 flex flex-col gap-2">
                            <button
                              onClick={async () => {
                                const allReports = await fetchReportsFromSupabase();
                                niceDownload('dora-all-reports.json', allReports.map(r => cleanReportForExport({ ...emptyDraft(r.incidentId), ...r })));
                              }}
                              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors"
                            >
                              Export All JSON
                            </button>

                          </div>
                        </div>
                      </div>

                        <div>
                          {/* Barre de recherche et filtres */}
                          <div className="mb-6">
                            <div className="flex items-center gap-2 mb-4">
                              <div className="relative flex-1">
                                <input
                                  type="text"
                                  value={filters.searchTerm}
                                  onChange={(e) => setFilters({...filters, searchTerm: e.target.value})}
                                  placeholder="Rechercher un incident..."
                                  className="w-full p-2 pl-10 rounded-full border dark:border-gray-600 bg-white dark:bg-gray-800"
                                />
                                <div className="absolute left-3 top-2.5 text-gray-400">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                  </svg>
                                </div>
                              </div>
                              <button
                                onClick={() => setFilters({...filters, showFilters: !filters.showFilters})}
                                className="px-4 py-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 transition-colors flex items-center gap-2"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                </svg>
                                Filtres
                              </button>
                            </div>
                            {/* Filtres avancés (masquables) */}
                            {filters.showFilters && (
                              <div className="p-4 rounded-lg bg-white/80 dark:bg-gray-800">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

                                  {/* Filtre par type de rapport */}
                                    <div>
                                      <label htmlFor="incidentSubmission" className="block text-sm font-medium mb-1">
                                        Type de rapport
                                      </label>
                                      <select
                                        id="incidentSubmission"
                                        value={filters.incidentSubmission}
                                        onChange={(e) => setFilters({ ...filters, incidentSubmission: e.target.value })}
                                        className="w-full p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800"
                                      >
                                        <option value="">Tous</option>
                                        <option value="initial_notification">Initial Notification</option>
                                        <option value="intermediate_report">Intermediate Report</option>
                                        <option value="final_report">Final Report</option>
                                      </select>
                                    </div>

                                    {/* Filtre par statut de l'incident */}
                                    <div>
                                      <label htmlFor="incidentStatus" className="block text-sm font-medium mb-1">
                                        Statut de l'incident
                                      </label>
                                      <select
                                        id="incidentStatus"
                                        value={filters.incidentStatus}
                                        onChange={(e) => setFilters({ ...filters, incidentStatus: e.target.value })}
                                        className="w-full p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800"
                                      >
                                        <option value="">Tous</option>
                                        <option value="open">Incident en cours</option>
                                        <option value="closed">Incident fermé</option>
                                      </select>
                                    </div>

                                    {/* Filtre par critères de classification */}
                                    <fieldset className="p-2 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                      <legend className="block text-sm font-medium mb-1">Critères de classification</legend>
                                      {CLASSIFICATION_CRITERIA.map(criteria => (
                                        <label key={criteria.value} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-1 rounded">
                                          <input
                                            type="checkbox"
                                            checked={filters.classificationCriterion.includes(criteria.value)}
                                            onChange={() => {
                                              const updatedCriteria = filters.classificationCriterion.includes(criteria.value)
                                                ? filters.classificationCriterion.filter(v => v !== criteria.value)
                                                : [...filters.classificationCriterion, criteria.value];
                                              setFilters({ ...filters, classificationCriterion: updatedCriteria });
                                            }}
                                            className="rounded"
                                          />
                                          <span>{criteria.label}</span>
                                        </label>
                                      ))}
                                    </fieldset>

                                  {/* Filtre par plage de dates */}
                                    <fieldset className="grid grid-cols-1 gap-2">
                                      <legend className="block text-sm font-medium mb-1">Plage de dates</legend>
                                      <input
                                        id="startDate"
                                        type="date"
                                        value={filters.dateRange.start}
                                        onChange={(e) => setFilters({ ...filters, dateRange: { ...filters.dateRange, start: e.target.value } })}
                                        className="w-full p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800"
                                      />
                                      <input
                                        id="endDate"
                                        type="date"
                                        value={filters.dateRange.end}
                                        onChange={(e) => setFilters({ ...filters, dateRange: { ...filters.dateRange, end: e.target.value } })}
                                        className="w-full p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800"
                                      />
                                    </fieldset>
                                </div>

                                {/* Bouton pour réinitialiser les filtres */}
                                <div className="mt-4 flex justify-end">
                                  <button
                                    onClick={() => setFilters({
                                      searchTerm: '',
                                      incidentSubmission: '',
                                      incidentStatus: '',
                                      classificationCriterion: [],
                                      dateRange: { start: '', end: '' },
                                      showFilters: true
                                    })}
                                    className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 transition-colors"
                                  >
                                    Réinitialiser les filtres
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Liste des incidents */}
                          <div>
                            <h3 className="font-medium mb-3">Incidents</h3>
                            <div className="space-y-4">
                              {Object.keys(filteredIncidents).length === 0 && (
                                <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                                  {Object.keys(groupedIncidents).length === 0
                                    ? 'Aucun incident trouvé - créez-en un depuis l\'onglet Rapport'
                                    : 'Aucun incident ne correspond à vos critères de recherche'}
                                </div>
                              )}
                              {Object.entries(filteredIncidents).map(([financialEntityCode, incident]) => (
                                <div key={financialEntityCode} className="p-4 rounded-lg bg-white/80 dark:bg-gray-800">
                                  <div className="flex justify-between items-center mb-4">
                                    <h4 className="font-medium text-lg">
                                      Incident: {financialEntityCode}
                                      {incident.isClosed && <span className="ml-2 text-sm text-green-600 bg-green-100 px-2 py-1 rounded-full">Fermé</span>}
                                      {!incident.isClosed && <span className="ml-2 text-sm text-yellow-600 bg-yellow-100 px-2 py-1 rounded-full">En cours</span>}
                                    </h4>
                                  </div>
                                  <div className="space-y-3">
                                    {/* Filtrer les rapports affichés en fonction du type de rapport sélectionné */}
                                    {incident.reports
                                      .filter(r => !filters.incidentSubmission || r.incidentSubmission === filters.incidentSubmission)
                                      .map(r => (
                                        <div key={r.id} className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700 flex justify-between">
                                          {/* Première colonne : informations du rapport */}
                                          <div className="flex-1">
                                            <div className="text-sm font-medium">
                                              {r.incidentSubmission?.replaceAll('_', ' ') || '-'}
                                            </div>
                                            <div className="text-xs opacity-70 mt-1">
                                              <strong>Description:</strong> {r.incident?.incidentDescription?.slice(0, 100) || '—'}
                                            </div>
                                            <div className="text-xs opacity-60 mt-2">
                                              Saved: {new Date(r.savedAt).toLocaleString()}
                                            </div>
                                          </div>

                                          {/* Deuxième colonne : commentaires */}
                                          {r.status !== 'validated' && r.comments && r.comments.length > 0 && (
                                            <div className="flex-1 ml-4">
                                              <h4 className="font-medium">Commentaires :</h4>
                                              <ul className="mt-2 text-sm list-disc pl-4">
                                                {r.comments.map((comment, index) => (
                                                  <li key={comment.id} className="mb-1 p-2 bg-gray-100 dark:bg-gray-700 rounded">
                                                    {comment.comment}
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}


                                            {/* Troisième colonne : boutons */}
                                            <div className="flex flex-col gap-2 ml-4">
                                              <button
                                                onClick={() => loadReportIntoDraft(r.id)}
                                                className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm"
                                              >
                                                {getButtonLabel(role, r.status)}
                                              </button>
                                              <button
                                                onClick={() => exportReportJSON(r)}
                                                className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm"
                                              >
                                                Download
                                              </button>

                                              {/* Les boutons suivants sont **complètement masqués** pour les auditeurs */}
                                              {role !== 'auditeur' && (
                                                <>
                                                  {role === 'validateur' && r.status === 'draft' && (
                                                    <button
                                                      onClick={() => validateReport(r.id)}
                                                      className="px-3 py-2 rounded-lg bg-green-600 text-white text-sm"
                                                    >
                                                      Validate
                                                    </button>
                                                  )}
                                                  {role === 'validateur' && r.status !== 'validated' && (
                                                    <button
                                                      onClick={() => {
                                                        const comment = prompt('Ajouter un commentaire:');
                                                        if (comment !== null) {
                                                          addComment(r.id, comment);
                                                        }
                                                      }}
                                                      className="px-3 py-2 rounded-lg bg-yellow-600 text-white text-sm"
                                                    >
                                                      Add Comment
                                                    </button>
                                                  )}
                                                  {role === 'saisisseur' && r.status === 'validated' && (
                                                    <>
                                                      {r.incidentSubmission === 'initial_notification' && r.nextSubmissionType === 'intermediate_report' && !hasReportOfTypeForIncident(r.incidentId, 'intermediate_report') && (
                                                        <button
                                                          onClick={() => continueReport(r.id, 'intermediate_report')}
                                                          className="px-3 py-2 rounded-lg bg-purple-600 text-white text-sm"
                                                        >
                                                          Déclarer un rapport intermédiaire
                                                        </button>
                                                      )}
                                                      {r.incidentSubmission === 'intermediate_report' && r.nextSubmissionType === 'final_report' && !hasReportOfTypeForIncident(r.incidentId, 'final_report') && (
                                                        <button
                                                          onClick={() => continueReport(r.id, 'final_report')}
                                                          className="px-3 py-2 rounded-lg bg-purple-600 text-white text-sm"
                                                        >
                                                          Déclarer un rapport final
                                                        </button>
                                                      )}
                                                    </>
                                                  )}
                                                </>
                                              )}
                                            </div>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                      {role !== 'validateur' && role !== 'auditeur' && (
                          <div className="mt-6 flex justify-end">
                            <button onClick={() =>{
                            setView('report');
                            }}className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 transition-colors">
                              Create or Update Report
                            </button>
                          </div>
                      )}
                    </motion.div>
                )}

                {view === 'settings' && (
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-6 rounded-2xl bg-white/90 dark:bg-white/5 shadow"
                  >
                    <h2 className="text-2xl font-semibold mb-6">Paramètres</h2>

                    {/* Section pour le profil "saisisseur" */}
                    {role === 'saisisseur' && (
                      <div>
                        <h3 className="text-lg font-medium mb-4">Configuration de l'entité soumise</h3>

                        {/* Nom de l'entité - TOUJOURS MODIFIABLE */}
                        <div className="mb-4">
                          <label htmlFor="submittingEntityName" className="block text-sm font-medium mb-1">
                            Nom de l'entité soumise
                          </label>
                          <input
                            id="submittingEntityName"
                            type="text"
                            value={submittingEntitySettings.name}
                            onChange={(e) => setSubmittingEntitySettings({ ...submittingEntitySettings, name: e.target.value })}
                            className="w-full p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800"
                          />
                        </div>

                        {/* Code de l'entité - TOUJOURS MODIFIABLE */}
                        <div className="mb-4">
                          <label htmlFor="submittingEntityCode" className="block text-sm font-medium mb-1">
                            Code de l'entité soumise
                          </label>
                          <input
                            id="submittingEntityCode"
                            type="text"
                            value={submittingEntitySettings.code}
                            onChange={(e) => setSubmittingEntitySettings({ ...submittingEntitySettings, code: e.target.value })}
                            className="w-full p-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800"
                          />
                        </div>

                        {/* Types d'entités affectées - TOUJOURS MODIFIABLES */}
                        <div className="mb-6">
                          <label htmlFor="affectedEntityTypes" className="block text-sm font-medium mb-2">Types d'entités affectées</label>
                          <div id="affectedEntityTypes" className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                            {ENTITY_TYPES.map(type => (
                              <label
                                key={type.value}
                                className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white dark:hover:bg-gray-700 p-1 rounded"
                              >
                                <input
                                  type="checkbox"
                                  checked={submittingEntitySettings.affectedEntityType?.includes(type.value)}
                                  onChange={() => {
                                    const currentValues = submittingEntitySettings.affectedEntityType || [];
                                    const updatedValues = currentValues.includes(type.value)
                                      ? currentValues.filter(value => value !== type.value)
                                      : [...currentValues, type.value];
                                    setSubmittingEntitySettings({ ...submittingEntitySettings, affectedEntityType: updatedValues });
                                  }}
                                  className="rounded"
                                />
                                <span>{type.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* Boutons d'action */}
                        <div className="flex justify-end gap-2 mt-6">
                          <button
                              onClick={handleSaveSettings}
                              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                          >
                              Enregistrer les paramètres
                          </button>

                          <button
                            onClick={() => setView('dashboard')}
                            className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 transition-colors"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Section pour les profils "validateur" ou "auditeur" */}
                    {['validateur', 'auditeur'].includes(role) && (
                      <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/30">
                        <p className="text-sm mb-4">
                          {role === 'validateur'
                            ? 'Fonctionnalités spécifiques aux valideurs à venir'
                            : 'Fonctionnalités spécifiques aux auditeurs à venir'}
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-7xl mx-auto mt-6 text-center text-xs opacity-60">
        C'est DIEU qui donne mdr
      </footer>
    </div>
  )
}