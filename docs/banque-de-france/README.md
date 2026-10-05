# Documents de la Banque de France / ACPR (collecte DORA)

Source : eSurfi Banque, « États et notices banque et assurance DORA »
(https://esurfi.banque-france.fr/fr/esurfi-banque/etats-et-notices/etats-et-notices-banque-et-assurance-dora),
téléchargés le 2 octobre 2026. Les maquettes sont identiques pour la banque et l'assurance.

| Fichier | Usage |
|---|---|
| `DORA_IR_Schema_v1.3.json` | Schéma JSON des déclarations d'incident majeur (initiale, intermédiaire, finale, reclassement en non majeur), version du 21/05/2026 |
| `DORA_IR_final_report_sample_v1.3.json` | Exemple officiel de rapport final conforme |
| `Reglement_execution_UE_2025-302_JO.pdf` | Règlement d'exécution (UE) 2025/302 publié au JO (annexe II : champs et caractère obligatoire) |
| `DORA_CYB_Schema_v1.2.json`, `DORA_CYB_sample_v1.2.json` | Notification volontaire des cybermenaces importantes (non gérée par l'application) |
| `Instruction_2025-I-09_Formulaire_annexe.xlsx` | Instruction 2025-I-09 : déclaration du prestataire tiers qui notifie les incidents pour le compte de l'entité |
| `Instruction_2025-I-11_annexe.xlsx` | Instruction 2025-I-11 : adhésion / cessation à un dispositif de partage d'informations (art. 45.3 DORA) |

| `ACPR_2025-08_Explication_remplissage_maquette_incident.pdf` | Guide ACPR champ par champ et erreurs fréquentes (26/08/2025) |
| `Instruction_2025-I-09.pdf`, `Instruction_2025-I-11.pdf`, `Instruction_2025-I-12.pdf` | Textes des instructions (acpr.banque-france.fr) |
| `ESA_JC2024-33_RTS_ITS_declaration_incidents.pdf` | Rapport final des autorités européennes (EBA) : projets du règlement délégué 2025/301 (délais, article 5) et du règlement d'exécution 2025/302 (annexe II : caractère obligatoire de chaque champ par type de rapport) |
| `ESA_2026-09_DORA_IR_instructions_operationnelles.pdf` | Instructions opérationnelles des autorités européennes (16/09/2026) : montants en milliers, critère « services critiques » toujours déclaré, pays d'origine exclu de la propagation géographique, format du champ 2.8, champ 3.17 attendu dans tous les rapports intermédiaires et finaux |
| `20250407_RoI_Tableaux_Recapitulatifs_ACPR.pdf` | Remise du registre : base individuelle ou consolidée selon la situation du groupe |

Registre d'information (instruction 2025-I-12) : remise annuelle, date de référence au 31 décembre
de l'année précédente, au plus tard le 31 mars, sur base individuelle ou consolidée selon les cas de
l'article 3 et du tableau récapitulatif.

## Contrôles ACPR avant téléchargement d'une déclaration

`src/utils/controlesAcpr.js` reprend les erreurs relevées par le guide de l'ACPR : code d'incident
(lettres, chiffres, tirets), LEI brut, code ACPR de l'incident (AAAA + I/M + 7 chiffres) dès le
rapport intermédiaire, critères de classification d'un incident majeur, formats de durée et de
pourcentage, montants en milliers, réponses « autre » à préciser, « none » pour les autres
autorités, une réponse par catégorie de chiffres réels / estimés, cohérence des causes, champs
obligatoires du rapport final. Les constats s'affichent au téléchargement du fichier JSON.

## Format des dates

Le guide de l'ACPR (août 2025) montre des dates `2001-12-17T09:30:47.0` (classification :
`…47.0Z`). Le schéma v1.3 et son exemple, plus récents (mai 2026), indiquent
`AAAA-MM-JJThh:mm:ssZ` pour toutes les dates : c'est ce format, explicite sur le fuseau (UTC), qui
est utilisé à l'export.

## Contrôle de l'export des déclarations d'incident

L'export JSON de l'application a été validé avec ce schéma (validateur JSON Schema 2020-12) :
l'exemple officiel ressaisi et une notification initiale minimale sont conformes. Points imposés
par le schéma et appliqués à l'export :
- dates au format `AAAA-MM-JJThh:mm:ssZ` (UTC) ;
- champs non renseignés omis (le schéma refuse les chaînes et listes vides) ;
- seuil `economicImpactMaterialityThreshold` transmis avec le critère « impact économique ».

À refaire à chaque nouvelle version du schéma publiée sur eSurfi.

## Règles appliquées (vérifiées le 2 octobre 2026)

Validation à l'enregistrement : champs obligatoires de l'annexe II du règlement 2025/302 pour chaque
type de rapport, y compris les champs conditionnels 2.6, 3.3, 3.13-3.14, 3.17, 3.18-3.21, 3.24-3.26,
3.29, 3.32, 3.34, 3.35, 4.3, 4.4 et 4.12. Ajouts du 2 octobre 2026 : code de l'entité déclarante = son
LEI (1.3) ; nom et LEI de l'entreprise mère ultime ensemble (1.13/1.14) ; critère « services critiques
affectés » toujours présent avec au moins un autre critère (2.5) ; montant des recouvrements dans le
rapport final (4.14) ; description et date des incidents récurrents ensemble (4.15/4.16). Avertissements
ajoutés : France citée dans la propagation géographique. Nombre, pourcentage et valeur des transactions
(3.9 à 3.11) exigés si des transactions sont déclarées affectées. Comparaison faite champ par champ avec le texte publié au Journal
officiel (`Reglement_execution_UE_2025-302_JO.pdf`, JO L du 20/02/2025). Écarts volontaires, plus stricts
que le texte, conformes aux attentes des autorités : 3.1 (code ACPR) et 3.17 (réel ou estimé) exigés
dans tout rapport intermédiaire ou final. Description des actions temporaires (3.34) : exigée à partir
du rapport intermédiaire ; sans action temporaire (3.33 non coché), la raison est demandée, comme
l'indique le guide de remplissage de l'ACPR (« nécessaire de remplir ce champ même si aucune action
n'a été prise »). Champ 4.12 (seuil d'impact économique) :
« oui » dans le tableau, mais le schéma de la Banque de France ne permet de le transmettre qu'avec le
critère « impact économique » ; il est exigé dans ce cas (instructions ESA du 16/09/2026). Champs 4.10
et 4.11 (résolution) : non contrôlés automatiquement, leur condition dépend d'une appréciation.

Délais (règlement 2025/301, article 5) : 4 h après la classification et au plus tard 24 h après la
détection ; 4 h après la classification si elle intervient plus de 24 h après la détection ; 72 h après
la notification initiale ; 1 mois après le dernier rapport intermédiaire ; report au jour ouvré suivant
à midi (paragraphes 4 et 5) pour le rapport final seulement, Action Logement étant un établissement de
crédit : la notification initiale et le rapport intermédiaire restent dus à l'heure exacte, y compris
le week-end et les jours fériés. Type d'entité « credit_institution » proposé par défaut.
