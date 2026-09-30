-- Retour arrière de la migration 20261001000000_rapport_anomalies.sql
-- Supprime uniquement la fonction de rapport : aucune donnée n'est touchée.
drop function if exists public.ri_anomalies();
