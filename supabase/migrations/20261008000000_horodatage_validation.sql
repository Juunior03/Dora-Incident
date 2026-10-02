-- Horodatage de la validation des déclarations d'incident
--
-- Le suivi des délais de notification (règlement délégué (UE) 2025/301, article 5) part de la
-- date de transmission de chaque rapport : la date de validation en tient lieu, l'export vers
-- l'autorité suivant la validation. Elle est fixée par la base au passage « draft » ->
-- « validated » et ne peut être ni saisie ni modifiée par un utilisateur.
-- Les déclarations déjà validées n'ont pas de date connue (colonne vide).
-- Retour arrière : supabase/rollback/20261008000000_horodatage_validation_rollback.sql

begin;

set local client_min_messages = warning;

alter table public.reports add column if not exists validated_at timestamptz;

comment on column public.reports.validated_at is
  'Date et heure de validation (fixées par la base), base du calcul des délais de notification';

create or replace function public.horodater_validation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.validated_at := case when new.status = 'validated' then now() end;
  elsif new.status = 'validated' and old.status is distinct from 'validated' then
    new.validated_at := now();
  else
    new.validated_at := old.validated_at;
  end if;
  return new;
end;
$$;

revoke all on function public.horodater_validation() from public, anon, authenticated;

drop trigger if exists horodater_validation on public.reports;
create trigger horodater_validation
  before insert or update on public.reports
  for each row execute function public.horodater_validation();

commit;
