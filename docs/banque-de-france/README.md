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

Le registre d'information se remet selon l'instruction 2025-I-12 et les normes de l'EBA
(voir `docs/eba`).

## Contrôle de l'export des déclarations d'incident

L'export JSON de l'application a été validé avec ce schéma (validateur JSON Schema 2020-12) :
l'exemple officiel ressaisi et une notification initiale minimale sont conformes. Points imposés
par le schéma et appliqués à l'export :
- dates au format `AAAA-MM-JJThh:mm:ssZ` (UTC) ;
- champs non renseignés omis (le schéma refuse les chaînes et listes vides) ;
- seuil `economicImpactMaterialityThreshold` transmis avec le critère « impact économique ».

À refaire à chaque nouvelle version du schéma publiée sur eSurfi.
