-- GOAT Métavers — profil élargi : âge, style de sportif, et grand catalogue de sports.
--
-- Ce que fait cette migration :
--   * `sports`   : 10 catégories (au lieu de 6) et une centaine de sports, inspirés des activités des montres Garmin et COROS.
--                  Les 14 sports d'origine gardent leur id et leur nom ; `velo` passe en catégorie « velo », `tennis` en « raquette ».
--   * `profiles` : deux colonnes facultatives, `age` (âge déclaré à l'inscription, jamais montré aux autres) et
--                  `athlete_style` (badge « style de sportif »).
--   * `save_my_profile()` : deux paramètres facultatifs de plus (`p_age`, `p_athlete_style`). Les anciens appels à 7 paramètres
--                  fonctionnent toujours : une app déjà en ligne continue de marcher pendant la mise à jour.
--
-- À exécuter une fois dans « SQL Editor » de Supabase (ou avec `supabase db push`), après 20260921200000_oauth_first_name.sql.
-- Le catalogue doit rester identique à web/src/core/sports.ts (un test le vérifie).

-- ───────────────────────── Catalogue des sports ─────────────────────────

alter table public.sports drop constraint sports_category_check;
alter table public.sports add constraint sports_category_check
  check (category in ('glisse', 'course', 'velo', 'ballon', 'raquette', 'salle', 'nature', 'eau', 'combat', 'multi'));

update public.sports set category = 'velo' where id = 'velo';
update public.sports set category = 'raquette' where id = 'tennis';

-- Nouveaux sports (90), dans l'ordre du catalogue de l'app.
insert into public.sports (id, name, category) values
  ('ski-fond', 'Ski de fond', 'glisse'),
  ('ski-rando', 'Ski de randonnée', 'glisse'),
  ('snowboard-rando', 'Snowboard de randonnée', 'glisse'),
  ('raquettes', 'Raquettes à neige', 'glisse'),
  ('patinage', 'Patinage sur glace', 'glisse'),
  ('roller', 'Roller', 'glisse'),
  ('skateboard', 'Skateboard', 'glisse'),
  ('windsurf', 'Planche à voile', 'glisse'),
  ('kitesurf', 'Kitesurf', 'glisse'),
  ('speedsurf', 'Speedsurf', 'glisse'),
  ('wakeboard', 'Wakeboard', 'glisse'),
  ('wakesurf', 'Wakesurf', 'glisse'),
  ('ski-nautique', 'Ski nautique', 'glisse'),
  ('piste', 'Course sur piste', 'course'),
  ('tapis', 'Tapis de course', 'course'),
  ('obstacles', 'Course d''obstacles', 'course'),
  ('marche', 'Marche', 'course'),
  ('marche-lestee', 'Marche lestée', 'course'),
  ('vtt', 'VTT', 'velo'),
  ('gravel', 'Gravel', 'velo'),
  ('cyclocross', 'Cyclo-cross', 'velo'),
  ('velo-electrique', 'Vélo électrique', 'velo'),
  ('vtt-electrique', 'VTT électrique', 'velo'),
  ('bmx', 'BMX', 'velo'),
  ('velo-salle', 'Vélo d''appartement', 'velo'),
  ('cyclotourisme', 'Cyclotourisme', 'velo'),
  ('velotaf', 'Vélotaf', 'velo'),
  ('futsal', 'Futsal', 'ballon'),
  ('volleyball', 'Volley-ball', 'ballon'),
  ('beach-volley', 'Beach-volley', 'ballon'),
  ('handball', 'Handball', 'ballon'),
  ('rugby', 'Rugby', 'ballon'),
  ('football-americain', 'Football américain', 'ballon'),
  ('baseball', 'Baseball', 'ballon'),
  ('softball', 'Softball', 'ballon'),
  ('cricket', 'Cricket', 'ballon'),
  ('hockey-gazon', 'Hockey sur gazon', 'ballon'),
  ('hockey-glace', 'Hockey sur glace', 'ballon'),
  ('lacrosse', 'Crosse (lacrosse)', 'ballon'),
  ('ultimate', 'Ultimate', 'ballon'),
  ('padel', 'Padel', 'raquette'),
  ('pickleball', 'Pickleball', 'raquette'),
  ('badminton', 'Badminton', 'raquette'),
  ('squash', 'Squash', 'raquette'),
  ('tennis-de-table', 'Tennis de table', 'raquette'),
  ('racquetball', 'Racquetball', 'raquette'),
  ('crossfit', 'CrossFit', 'salle'),
  ('hiit', 'HIIT', 'salle'),
  ('cardio', 'Cardio training', 'salle'),
  ('elliptique', 'Vélo elliptique', 'salle'),
  ('stepper', 'Stepper', 'salle'),
  ('escaliers', 'Montée d''escaliers', 'salle'),
  ('corde', 'Corde à sauter', 'salle'),
  ('pilates', 'Pilates', 'salle'),
  ('mobilite', 'Mobilité & étirements', 'salle'),
  ('respiration', 'Respiration (breathwork)', 'salle'),
  ('meditation', 'Méditation', 'salle'),
  ('danse', 'Danse', 'salle'),
  ('gymnastique', 'Gymnastique', 'salle'),
  ('alpinisme', 'Alpinisme', 'nature'),
  ('bloc', 'Bloc', 'nature'),
  ('escalade-salle', 'Escalade en salle', 'nature'),
  ('equitation', 'Équitation', 'nature'),
  ('golf', 'Golf', 'nature'),
  ('disc-golf', 'Disc golf', 'nature'),
  ('tir-arc', 'Tir à l''arc', 'nature'),
  ('eau-libre', 'Natation en eau libre', 'eau'),
  ('aviron', 'Aviron', 'eau'),
  ('aviron-salle', 'Aviron en salle', 'eau'),
  ('kayak', 'Kayak & canoë', 'eau'),
  ('eau-vive', 'Eau vive', 'eau'),
  ('paddle', 'Paddle', 'eau'),
  ('voile', 'Voile', 'eau'),
  ('plongee', 'Plongée', 'eau'),
  ('apnee', 'Apnée', 'eau'),
  ('snorkeling', 'Snorkeling', 'eau'),
  ('water-polo', 'Water-polo', 'eau'),
  ('boxe', 'Boxe', 'combat'),
  ('mma', 'MMA', 'combat'),
  ('judo', 'Judo', 'combat'),
  ('karate', 'Karaté', 'combat'),
  ('taekwondo', 'Taekwondo', 'combat'),
  ('jiu-jitsu', 'Jiu-jitsu', 'combat'),
  ('lutte', 'Lutte', 'combat'),
  ('escrime', 'Escrime', 'combat'),
  ('triathlon', 'Triathlon', 'multi'),
  ('duathlon', 'Duathlon', 'multi'),
  ('swimrun', 'Swimrun', 'multi'),
  ('course-aventure', 'Course d''aventure', 'multi'),
  ('multisport', 'Multisport', 'multi');

-- ───────────────────────── Profil : âge et style de sportif ─────────────────────────

-- Bornes larges : le minimum de 16 ans est appliqué par l'app (l'âge est déclaratif).
alter table public.profiles
  add column age           smallint check (age is null or age between 13 and 120),
  add column athlete_style text check (athlete_style is null or athlete_style in ('adventurer', 'competitor', 'fun', 'team', 'wellbeing', 'regular'));

-- Les privilèges sont donnés colonne par colonne (voir 20260921120000_accounts.sql) : les nouvelles colonnes aussi.
grant insert (age, athlete_style) on public.profiles to authenticated;
grant update (age, athlete_style) on public.profiles to authenticated;

-- ───────────────────────── Enregistrer son profil (atomique) ─────────────────────────

-- On remplace la fonction : mêmes 7 paramètres, plus `p_age` et `p_athlete_style` (facultatifs, donc l'ancien appel marche encore).
drop function public.save_my_profile(text, text, text, text, boolean, integer, jsonb);

-- `security invoker` : les règles RLS s'appliquent (on ne peut écrire que son propre profil).
-- p_sports : [{ "sport_id": "ski", "is_primary": true }, ...]
create function public.save_my_profile(
  p_first_name     text,
  p_bio            text,
  p_photo_data     text,
  p_scope          text,
  p_is_invisible   boolean,
  p_linger_minutes integer,
  p_sports         jsonb,
  p_age            smallint default null,
  p_athlete_style  text default null
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

  insert into public.profiles (id, first_name, bio, photo_data, visibility_scope, is_invisible, linger_minutes, age, athlete_style)
  values (uid, btrim(p_first_name), p_bio, p_photo_data, p_scope, p_is_invisible, p_linger_minutes, p_age, p_athlete_style)
  on conflict (id) do update set
    first_name       = excluded.first_name,
    bio              = excluded.bio,
    photo_data       = excluded.photo_data,
    visibility_scope = excluded.visibility_scope,
    is_invisible     = excluded.is_invisible,
    linger_minutes   = excluded.linger_minutes,
    age              = excluded.age,
    athlete_style    = excluded.athlete_style,
    updated_at       = now();

  delete from public.profile_sports where user_id = uid;

  insert into public.profile_sports (user_id, sport_id, is_primary)
  select uid, s.sport_id, coalesce(s.is_primary, false)
  from jsonb_to_recordset(coalesce(p_sports, '[]'::jsonb)) as s(sport_id text, is_primary boolean);
end;
$$;

revoke execute on function public.save_my_profile(text, text, text, text, boolean, integer, jsonb, smallint, text) from public, anon;
grant execute on function public.save_my_profile(text, text, text, text, boolean, integer, jsonb, smallint, text) to authenticated;
