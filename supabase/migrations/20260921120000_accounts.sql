-- GOAT Métavers — comptes et profils.
--
-- Ce que fait cette migration :
--   * `sports`          : catalogue des sports (mêmes ids que l'app : web/src/core/sports.ts et GOATCore/Sport.swift).
--   * `profiles`        : un profil par compte (prénom, bio, photo, réglages de visibilité).
--   * `profile_sports`  : sports pratiqués, dont un seul « principal ».
--   * un déclencheur qui crée le profil dès l'inscription (Supabase Auth → auth.users).
--   * `save_my_profile()` : enregistre profil + sports en une seule transaction.
--   * `delete_own_account()` : suppression du compte et de toutes ses données (RGPD).
--
-- Sécurité : RLS activé partout ; chaque utilisateur ne voit et ne modifie QUE son profil.
-- La lecture des profils des autres (mini-profils, Echos) viendra avec les règles de visibilité côté serveur.
--
-- À exécuter une fois dans « SQL Editor » de Supabase (ou avec `supabase db push`).

-- ───────────────────────── Catalogue des sports ─────────────────────────

create table public.sports (
  id       text primary key,
  name     text not null,
  category text not null check (category in ('glisse', 'course', 'ballon', 'salle', 'nature', 'eau'))
);

insert into public.sports (id, name, category) values
  ('ski',         'Ski',           'glisse'),
  ('snowboard',   'Snowboard',     'glisse'),
  ('surf',        'Surf',          'glisse'),
  ('running',     'Course à pied', 'course'),
  ('trail',       'Trail',         'course'),
  ('velo',        'Vélo',          'course'),
  ('football',    'Football',      'ballon'),
  ('basket',      'Basket',        'ballon'),
  ('tennis',      'Tennis',        'ballon'),
  ('musculation', 'Musculation',   'salle'),
  ('yoga',        'Yoga',          'salle'),
  ('randonnee',   'Randonnée',     'nature'),
  ('escalade',    'Escalade',      'nature'),
  ('natation',    'Natation',      'eau');

alter table public.sports enable row level security;
revoke all on public.sports from anon, authenticated;
grant select on public.sports to anon, authenticated;
create policy "sports_lecture_publique" on public.sports for select to anon, authenticated using (true);

-- ───────────────────────── Profils ─────────────────────────

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  first_name       text        not null check (char_length(btrim(first_name)) between 1 and 30),
  bio              text        not null default '' check (char_length(bio) <= 140),
  -- Photo réduite (JPEG ~400 px) sous forme de data URL. À terme : Supabase Storage.
  photo_data       text        check (photo_data is null or char_length(photo_data) <= 200000),
  visibility_scope text        not null default 'everyone' check (visibility_scope in ('everyone', 'mySports', 'myAlliances')),
  is_invisible     boolean     not null default false,
  linger_minutes   integer     not null default 15 check (linger_minutes in (0, 5, 15, 30)),
  joined_at        timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Privilèges par colonne : `joined_at` (ancienneté) n'est jamais modifiable par le client.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, first_name, bio, photo_data, visibility_scope, is_invisible, linger_minutes) on public.profiles to authenticated;
grant update (first_name, bio, photo_data, visibility_scope, is_invisible, linger_minutes, updated_at) on public.profiles to authenticated;

create policy "profils_lecture_du_sien" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profils_creation_du_sien" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "profils_modification_du_sien" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Pas de policy DELETE : la suppression passe par delete_own_account().

-- ───────────────────────── Sports pratiqués ─────────────────────────

create table public.profile_sports (
  user_id    uuid    not null references public.profiles (id) on delete cascade,
  sport_id   text    not null references public.sports (id),
  is_primary boolean not null default false,
  primary key (user_id, sport_id)
);

-- Au plus un sport principal par utilisateur.
create unique index profile_sports_un_seul_principal on public.profile_sports (user_id) where is_primary;

alter table public.profile_sports enable row level security;
revoke all on public.profile_sports from anon, authenticated;
grant select, insert, update, delete on public.profile_sports to authenticated;

create policy "sports_pratiques_lecture_des_siens" on public.profile_sports
  for select to authenticated using (user_id = (select auth.uid()));
create policy "sports_pratiques_ajout_des_siens" on public.profile_sports
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "sports_pratiques_modification_des_siens" on public.profile_sports
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "sports_pratiques_suppression_des_siens" on public.profile_sports
  for delete to authenticated using (user_id = (select auth.uid()));

-- ───────────────────────── Création du profil à l'inscription ─────────────────────────

-- Le prénom vient des métadonnées d'inscription (`options.data.first_name` côté client). La fonction ne doit
-- JAMAIS échouer (sinon l'inscription entière échouerait) : repli sur le début de l'email, puis sur « Sportif ».
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Sportif'
      ),
      30
    )
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── Enregistrer son profil (atomique) ─────────────────────────

-- `security invoker` : les règles RLS ci-dessus s'appliquent (on ne peut écrire que son propre profil).
-- p_sports : [{ "sport_id": "ski", "is_primary": true }, ...]
create function public.save_my_profile(
  p_first_name     text,
  p_bio            text,
  p_photo_data     text,
  p_scope          text,
  p_is_invisible   boolean,
  p_linger_minutes integer,
  p_sports         jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.profiles (id, first_name, bio, photo_data, visibility_scope, is_invisible, linger_minutes)
  values (uid, btrim(p_first_name), p_bio, p_photo_data, p_scope, p_is_invisible, p_linger_minutes)
  on conflict (id) do update set
    first_name       = excluded.first_name,
    bio              = excluded.bio,
    photo_data       = excluded.photo_data,
    visibility_scope = excluded.visibility_scope,
    is_invisible     = excluded.is_invisible,
    linger_minutes   = excluded.linger_minutes,
    updated_at       = now();

  delete from public.profile_sports where user_id = uid;

  insert into public.profile_sports (user_id, sport_id, is_primary)
  select uid, s.sport_id, coalesce(s.is_primary, false)
  from jsonb_to_recordset(coalesce(p_sports, '[]'::jsonb)) as s(sport_id text, is_primary boolean);
end;
$$;

revoke execute on function public.save_my_profile(text, text, text, text, boolean, integer, jsonb) from public, anon;
grant execute on function public.save_my_profile(text, text, text, text, boolean, integer, jsonb) to authenticated;

-- ───────────────────────── Supprimer son compte ─────────────────────────

-- `security definer` : seul moyen, côté client, de supprimer sa propre ligne dans auth.users.
-- La suppression se propage (on delete cascade) au profil et aux sports pratiqués.
create function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = (select auth.uid());
end;
$$;

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
