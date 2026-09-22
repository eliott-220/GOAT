# Supabase — comptes GOAT

Ce dossier contient la base de données des comptes (Postgres + Auth de Supabase). L'app web fonctionne **sans** Supabase
(mode démo local) ; elle passe en « vrais comptes » dès que les deux variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont définies.

## Ce qui est enregistré

| Table | Contenu | Qui peut la lire / l'écrire |
|---|---|---|
| `auth.users` (géré par Supabase) | email, mot de passe (haché), confirmation | personne côté client |
| `profiles` | prénom, âge, style de sportif (badge), bio, photo, visibilité (qui me voit, invisible, délai), date d'inscription | **uniquement son propre profil** |
| `profile_sports` | sports pratiqués, dont un « principal » | **uniquement les siens** |
| `sports` | catalogue de 104 sports en 10 catégories (inspiré des activités des montres Garmin et COROS) | lecture publique, écriture interdite |

Le profil est créé automatiquement à l'inscription (déclencheur `handle_new_user`). Le client enregistre tout d'un coup avec
`save_my_profile()` (atomique) et supprime son compte avec `delete_own_account()` (efface aussi le profil et les sports).
Ce qui n'est **pas** encore dans Supabase : la présence live, les Alliances, tribus, Echos, blocages (toujours simulés dans l'app).

## Mise en place (une seule fois, ~10 minutes)

1. **Créer le projet** — https://supabase.com/dashboard → *New project* : nom `goat`, région **Europe** (Paris ou Frankfurt : tes utilisateurs sont en France),
   un mot de passe de base de données (à garder dans ton gestionnaire de mots de passe ; l'app n'en a pas besoin).
2. **Créer les tables** — *SQL Editor* → *New query* → colle le contenu de chaque fichier de `migrations/`, **dans l'ordre**, un à la fois, puis *Run* :
   `20260921120000_accounts.sql` (tables, sécurité, inscription), `20260921200000_oauth_first_name.sql` (prénom des comptes Google),
   `20260921210000_profile_age_style_sports.sql` (âge, style de sportif, catalogue de 104 sports).
   Chaque script est exécuté d'un bloc : en cas d'erreur, rien n'est appliqué ; corrige et relance. À ne lancer qu'une fois chacun.
   Vérifie dans *Table Editor* : `profiles`, `profile_sports`, `sports` (104 lignes) existent, avec le badge « RLS enabled ».
3. **Réglages d'authentification** — *Authentication* :
   - *Sign In / Providers* → **Email** activé ; longueur minimale du mot de passe : **8**.
   - **Désactive « Confirm email »** tant que tu n'as pas configuré un serveur d'envoi (SMTP) à toi : le service d'emails par défaut de Supabase
     n'écrit qu'aux membres de ton équipe et très peu par heure. Sans cela, personne d'autre que toi ne pourrait s'inscrire.
     (La réinitialisation de mot de passe par email a la même limite.)
   - *URL Configuration* → **Site URL** : `https://goat-web-gold.vercel.app` ; **Redirect URLs** : ajoute `https://goat-web-gold.vercel.app/**` et `http://localhost:5173/**`.
4. **Récupérer les clés** — *Project Settings* → *API* (ou *API Keys*) : copie l'**URL du projet** et la clé **anon** (ou **publishable**).
   ⚠️ **Jamais** la clé `service_role` / *secret* : elle donne un accès total à la base. L'app et le build refusent de démarrer si on la met par erreur.
5. **Brancher l'app** :
   - en local : copie `web/.env.example` en `web/.env.local` et remplis les deux valeurs, puis `npm run dev` ;
   - en production : `cd web`, puis `npx vercel env add VITE_SUPABASE_URL production` et `npx vercel env add VITE_SUPABASE_ANON_KEY production`, puis `npx vercel deploy --prod`.

## Connexion avec Google (optionnelle)

Dès qu'il est activé, l'app propose « Continuer avec Google » en plus de l'email + mot de passe. C'est gratuit et prend une vingtaine de minutes.
*(Apple : plus tard. « Sign in with Apple » exige un compte Apple Developer payant, et un secret à régénérer tous les 6 mois.)*

1. **Google Cloud** — https://console.cloud.google.com → crée un projet « GOAT », puis *Google Auth Platform* :
   - *Branding* : nom de l'app « GOAT » et email d'assistance.
   - *Audience* : type **Externe**, puis **Publier l'application** (statut « En production »). Sinon, seuls les testeurs déclarés peuvent se connecter.
   - *Data Access (Scopes)* : `openid`, `…/auth/userinfo.email`, `…/auth/userinfo.profile` (les scopes de base : aucune validation longue).
   - *Clients* → *Créer un client* de type **Application Web** :
     - *Origines JavaScript autorisées* : `https://goat-web-gold.vercel.app` et `http://localhost:5173`.
     - *URI de redirection autorisées* : `https://<réf-du-projet>.supabase.co/auth/v1/callback` (l'adresse exacte est affichée par Supabase, page du fournisseur Google).
   - Note l'**ID client** et le **Code secret du client**.
2. **Supabase** — *Authentication → Sign In / Providers → Google* : active-le et colle l'ID client et le secret. Le secret ne va **jamais** dans l'app ni dans le dépôt : il reste dans Supabase.
   Vérifie aussi *Authentication → URL Configuration* : `https://goat-web-gold.vercel.app/**` et `http://localhost:5173/**` dans *Redirect URLs* (indispensable pour revenir dans l'app après Google).
3. **Base** — applique la migration `20260921200000_oauth_first_name.sql` si ce n'est pas fait : le prénom du profil vient alors de Google (sinon ce serait le début de l'email).
4. **Brancher l'app** — définis `VITE_AUTH_PROVIDERS=google` : en local dans `web/.env.local`, en production avec `npx vercel env add VITE_AUTH_PROVIDERS production` puis un redéploiement.
   Sans cette variable, le bouton n'apparaît pas (il mènerait à une page d'erreur de Supabase tant que le fournisseur n'est pas activé).
5. **Vérifier** — « Continuer avec Google » → choisis un compte → tu arrives sur « Parle-nous de toi » avec ton prénom, puis la suite. Dans *Table Editor → profiles*, ta ligne est là.

Bon à savoir : un même email côté Google et côté mot de passe donne **un seul compte** (liaison automatique par Supabase, et une inscription par mot de passe jamais confirmée est
supprimée à la liaison, pour empêcher qu'on s'inscrive d'avance avec l'email d'autrui). L'écran de consentement de Google affiche l'adresse du projet Supabase tant qu'il n'y a ni
domaine personnalisé ni validation de marque : c'est cosmétique.

## Vérifier que tout marche

Ouvre l'app, crée un compte, choisis tes sports, puis dans Supabase → *Table Editor* → `profiles` : ta ligne est là. Déconnecte-toi puis reconnecte-toi :
ton profil est retrouvé. Dans *Authentication → Users*, le compte apparaît.

Si le message « Could not find the table 'public.profiles' » apparaît, la migration n'a pas été exécutée (étape 2).

## Tests

`cd web && npm test` : les tests de `web/tests/sql` appliquent toutes les migrations sur un vrai Postgres embarqué (PGlite) et vérifient les règles d'accès
(un utilisateur ne peut ni lire ni modifier le profil d'un autre, l'ancienneté n'est pas modifiable, la suppression en cascade…), et
`web/tests/supabaseAdapter.test.ts` recoupe le code de l'app avec ces tables et fonctions (noms de colonnes et de paramètres).

## Ajouter une migration

Nouveau fichier `migrations/AAAAMMJJHHMMSS_description.sql` (ordre alphabétique = ordre d'application), appliqué à la main dans le *SQL Editor*
ou avec la CLI Supabase (`supabase link` puis `supabase db push`). Les tests appliquent automatiquement tous les fichiers du dossier.
