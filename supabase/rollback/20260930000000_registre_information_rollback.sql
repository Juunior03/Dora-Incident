-- Retour arrière de la migration 20260930000000_registre_information.sql
-- ATTENTION : supprime les tables du registre d'information ET LEUR CONTENU.
-- Si des données ont déjà été saisies, faire une copie avant (voir la procédure
-- utilisée pour la migration RLS : create table ... as table ...).

begin;

drop table if exists public.ri_definitions;
drop table if exists public.ri_evaluations;
drop table if exists public.ri_sous_traitance;
drop table if exists public.ri_signataires_fourniture;
drop table if exists public.ri_signataires_reception;
drop table if exists public.ri_accords_intragroupe;
drop table if exists public.ri_contrats_services;
drop table if exists public.ri_contrats;
drop table if exists public.ri_fonctions;
drop table if exists public.ri_prestataires;
drop table if exists public.ri_succursales;
drop table if exists public.ri_entites;
drop table if exists public.ri_teneur_registre;

drop function if exists public.ri_horodatage();
drop function if exists public.ri_codes_pays_valides(text[]);
drop function if exists public.ri_lei_valide(text);

commit;
