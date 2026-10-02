-- Retour arrière de la migration 20261008000000_horodatage_validation.sql
-- (les dates de validation enregistrées sont perdues)

begin;

drop trigger if exists horodater_validation on public.reports;
drop function if exists public.horodater_validation();
alter table public.reports drop column if exists validated_at;

commit;
