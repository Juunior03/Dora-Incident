-- Retour arrière de la migration 20261002000000_lignes_en_attente.sql
-- Rétablit la fonction de rapport d'origine et supprime les lignes en attente
-- (les tables du registre ne sont pas touchées).
begin;
drop function if exists public.ri_anomalies();
alter function public.ri_anomalies_registre() rename to ri_anomalies;
drop table if exists public.ri_import_rejets;
commit;
