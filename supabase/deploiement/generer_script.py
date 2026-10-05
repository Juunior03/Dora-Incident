"""Regénère 2026-10_registre_self_hosted.sql à partir des migrations (python3 generer_script.py)."""
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
MIGRATIONS = [
    '20260930000000_registre_information',
    '20261001000000_rapport_anomalies',
    '20261002000000_lignes_en_attente',
    '20261003000000_messages_anomalies',
    '20261004000000_conformite_its',
    '20261005000000_comptes_moindre_privilege',
    '20261006000000_roles_registre',
    '20261007000000_suppression_comptes',
    '20261008000000_horodatage_validation',
    '20261009000000_journal_activite',
]

ENTETE = """-- =============================================================================
-- Déploiement du registre d'information DORA sur le Supabase self-hosted (octobre 2026)
--
-- Contenu : les migrations 20260930000000 à 20261009000000, dans l'ordre (chacune dans sa
-- propre transaction). La migration 20260928000000 (durcissement RLS) doit déjà être appliquée.
-- Le script est rejouable : le relancer après un incident ne crée pas de doublon.
-- Aucune déclaration d'incident ni aucun commentaire n'est modifié ; les comptes existants
-- gardent leur rôle et reçoivent un rôle sur le registre équivalent à leurs droits actuels.
--
-- Utilisation : SQL Editor du Studio, nouvelle requête, coller TOUT le fichier, Run.
-- Ensuite : exécuter supabase/deploiement/verification.sql.
-- Généré par supabase/deploiement/generer_script.py : ne pas modifier à la main.
-- =============================================================================

-- Contrôle des prérequis : arrêt immédiat si la base n'est pas dans l'état attendu
do $$
begin
  if to_regclass('auth.users') is null or to_regclass('public.users') is null then
    raise exception 'Base inattendue : tables auth.users / public.users introuvables. Vérifiez que vous êtes sur le bon projet.';
  end if;
  if to_regprocedure('public.current_user_role()') is null then
    raise exception 'Prérequis manquant : appliquez d''abord supabase/migrations/20260928000000_durcissement_rls.sql.';
  end if;
end;
$$;
"""

# ri_anomalies() change de signature en 20261002 : à retirer avant de rejouer 20261001
REJEU_20261001 = """-- Ré-exécution : ri_anomalies() a changé de signature en 20261002 ; on la retire pour la recréer
do $$
begin
  if to_regprocedure('public.ri_anomalies_registre()') is not null then
    drop function if exists public.ri_anomalies();
  end if;
end;
$$;

"""

morceaux = [ENTETE]
for nom in MIGRATIONS:
    texte = (RACINE / 'migrations' / f'{nom}.sql').read_text(encoding='utf-8').rstrip() + '\n'
    bloc = f'\n-- {"=" * 77}\n-- {nom}\n-- {"=" * 77}\n'
    if nom.startswith('20261001'):
        bloc += REJEU_20261001
    morceaux.append(bloc + texte)
(RACINE / 'deploiement' / '2026-10_registre_self_hosted.sql').write_text(''.join(morceaux), encoding='utf-8')
print('2026-10_registre_self_hosted.sql regénéré')
