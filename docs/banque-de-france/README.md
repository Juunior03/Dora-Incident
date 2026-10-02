# Documents de la Banque de France / ACPR (collecte DORA)

Source : eSurfi Banque, « États et notices banque et assurance DORA »
(https://esurfi.banque-france.fr/fr/esurfi-banque/etats-et-notices/etats-et-notices-banque-et-assurance-dora),
téléchargés le 2 octobre 2026. Les maquettes sont identiques pour la banque et l'assurance.

| Fichier | Usage |
|---|---|
| `DORA_IR_Schema_v1.3.json` | Schéma JSON des déclarations d'incident majeur (initiale, intermédiaire, finale, reclassement en non majeur), version du 21/05/2026 |
| `DORA_IR_final_report_sample_v1.3.json` | Exemple officiel de rapport final conforme |
| `DORA_CYB_Schema_v1.2.json`, `DORA_CYB_sample_v1.2.json` | Notification volontaire des cybermenaces importantes (non gérée par l'application) |
| `Instruction_2025-I-09_Formulaire_annexe.xlsx` | Instruction 2025-I-09 : déclaration du prestataire tiers qui notifie les incidents pour le compte de l'entité |
| `Instruction_2025-I-11_annexe.xlsx` | Instruction 2025-I-11 : adhésion / cessation à un dispositif de partage d'informations (art. 45.3 DORA) |

| `ACPR_2025-08_Explication_remplissage_maquette_incident.pdf` | Guide ACPR champ par champ et erreurs fréquentes (26/08/2025) |
| `Instruction_2025-I-09.pdf`, `Instruction_2025-I-11.pdf`, `Instruction_2025-I-12.pdf` | Textes des instructions (acpr.banque-france.fr) |
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
