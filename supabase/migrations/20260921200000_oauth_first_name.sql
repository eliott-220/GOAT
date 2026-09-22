-- GOAT Métavers — prénom du profil pour les connexions avec Google.
--
-- Pourquoi : avec le formulaire d'inscription, le prénom arrive dans `first_name` (métadonnées d'inscription). Avec Google,
-- Supabase ne reçoit pas ce champ mais les infos du compte Google : `given_name` (prénom) et/ou `full_name` / `name` (nom complet).
-- Sans cette migration, un compte Google aurait pour prénom le début de son adresse email.
--
-- Le déclencheur `handle_new_user()` cherche maintenant, dans l'ordre :
--   first_name → given_name → premier mot de full_name → premier mot de name → début de l'email → « Sportif ».
-- Il ne doit JAMAIS échouer (sinon l'inscription entière échouerait) : aucune de ces étapes ne peut lever d'erreur.
--
-- Seule la fonction est remplacée : le déclencheur `on_auth_user_created`, les droits et les données ne changent pas.
--
-- À exécuter une fois dans « SQL Editor » de Supabase (ou avec `supabase db push`), après 20260921120000_accounts.sql.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, first_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(meta ->> 'first_name'), ''),
        nullif(btrim(meta ->> 'given_name'), ''),
        nullif(split_part(btrim(meta ->> 'full_name'), ' ', 1), ''),
        nullif(split_part(btrim(meta ->> 'name'), ' ', 1), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Sportif'
      ),
      30
    )
  );
  return new;
end;
$$;

-- Par précaution (les droits sont conservés par `create or replace`) : aucun rôle de l'API ne peut l'appeler.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
