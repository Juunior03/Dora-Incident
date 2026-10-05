-- Retour arrière de 20261009000000_journal_activite.sql
-- Supprime le journal d'activité et son historique (irréversible : exporter le journal avant si besoin).

begin;

set local client_min_messages = warning;

drop trigger if exists journaliser_rapport on public.reports;
drop trigger if exists journaliser_commentaire on public.comments;

do $$
declare
  t text;
begin
  foreach t in array array['ri_teneur_registre', 'ri_entites', 'ri_succursales', 'ri_prestataires',
                           'ri_fonctions', 'ri_contrats', 'ri_contrats_services', 'ri_accords_intragroupe',
                           'ri_signataires_reception', 'ri_signataires_fourniture', 'ri_sous_traitance',
                           'ri_evaluations', 'ri_definitions', 'ri_import_rejets'] loop
    execute format('drop trigger if exists journal_ajout on public.%I', t);
    execute format('drop trigger if exists journal_modification on public.%I', t);
    execute format('drop trigger if exists journal_suppression on public.%I', t);
  end loop;
end;
$$;

drop function if exists public.journaliser_rapport();
drop function if exists public.journaliser_commentaire();
drop function if exists public.journaliser_registre();
drop function if exists public.journal_nb_differences(jsonb, jsonb);
drop function if exists public.journal_auteur();
drop table if exists public.journal_activite;

commit;
