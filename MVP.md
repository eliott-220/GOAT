# GOAT Métavers — Spec produit MVP

> Piste distincte du volet ski/RunCards : un MVP multi-sport, couche sociale de présence en direct, dérivée du concept des "Echos" de GOAT mais découplée de l'économie RunCards/NEEV. Spec complète tenue à jour dans un doc Claude ([lien](https://claude.ai/artifact/436xwUeUzCUApiKdb6KsJS)) ; ce fichier en est le résumé, à re-synchroniser si le doc évolue.

## Objectif et problème
- Les apps sportives actuelles (Strava, Komoot) sont des journaux a posteriori : pas de couche sociale en direct montrant qui pratique quoi, maintenant, à proximité.
- GOAT Métavers = carte vivante où chaque utilisateur apparaît pendant sa pratique sportive, pour créer des rencontres plutôt que du suivi de perf.
- Cible : sportifs multi-sport (extérieur ou salle) qui veulent croiser d'autres pratiquants proches plutôt que comparer des chronos.
- C'est la brique sociale de GOAT, généralisée à tous les sports, détachée de la couche économique RunCards/NEEV (spécifique au ski, greffable plus tard).

## Scope MVP
**Inclus :**
- Carte interactive avec présence live des utilisateurs actifs
- Profil avec un ou plusieurs sports pratiqués
- Statut "actif maintenant" par session de pratique
- Filtrage de la carte par sport / catégorie
- Alliances : réseau social choisi (ajout, groupes)
- Echos : suggestions automatiques par proximité de pratique
- Zone de lancement unique (une ville/station), pas de déploiement national

**Exclu (V2+) :** RunCards / monnaie virtuelle (NEEV/G-coins) / marketplace, classements de performance, système de records, multi-station / scalabilité nationale.

## Parcours utilisateur
1. **Onboarding** (le compte n'est créé qu'à la fin) : email + mot de passe + confirmation (ou « Continuer avec Google ») → prénom, âge (16 ans minimum) et style de sportif (badge : aventurier, compétiteur, pour le plaisir…) → choix du/des sports parmi un catalogue d'une centaine (un "principal") → géolocalisation en opt-in explicite (expliqué avant la demande système).
2. **Démarrer une session** : lancement sur un sport du profil → apparition sur la carte "actif maintenant" (position approximative) → reste visible pendant la session + court délai après (~15 min) avant de redevenir invisible.
3. **Explorer la carte** : carte centrée sur la zone de lancement → filtrage par sport → tap sur un pin = mini-profil (prénom, sport, ancienneté), jamais la position exacte.
4. **Interagir** : demande d'Alliance depuis un profil ou une suggestion Echo, consultation des Echos, rejoindre/créer un groupe (tribu).
5. **Gérer sa visibilité** : bascule invisible à tout moment (même en session active), choix de qui peut voir (tout le monde / mes sports / mes Alliances).

## Écrans principaux
| Écran | Contenu |
|---|---|
| Carte (accueil) | Pins des utilisateurs actifs, filtre par sport, bouton "démarrer une session", switch visible/invisible |
| Mini-profil (pin tappé) | Prénom, photo, sport en cours, sports pratiqués, bouton "Alliance" |
| Profil personnel | Photo, bio courte, sports pratiqués + principal, historique de sessions (sans perf chiffrée) |
| Session active | Sport en cours, durée, bouton arrêter/mettre en pause la visibilité |
| Alliances | Liste des contacts, demandes en attente, groupes (tribus) |
| Echos | Profils suggérés par proximité de pratique, avec le sport en commun |
| Réglages de visibilité | Qui peut me voir, délai avant invisibilité |

## Modèle de données
- **User** : id, prénom, âge (jamais montré aux autres), style de sportif (badge), photo, bio, sports[] (avec flag "principal"), visibilité (tout le monde / mes sports / mes alliances)
- **Sport** : id, nom, catégorie (glisse, course, vélo, sports de balle, raquette, salle, nature, eau, combat, multisport) ; catalogue d'une centaine de sports, inspiré des activités des montres Garmin et COROS
- **ActivitySession** : id, user_id, sport_id, position (géohash arrondi, jamais de coordonnées exactes en clair), started_at, ended_at (ou null), statut (actif / récemment actif / terminé)
- **Alliance** : id, user_id_a, user_id_b, statut (en attente / acceptée), tribu_id (optionnel)
- **Tribu** : id, nom, membres[]
- **Echo** : id, user_id_a, user_id_b, score_proximité (calculé, jamais stocké en clair côté client), sport_commun_id, généré automatiquement (jamais sur demande explicite)

## Règles métier
- **Statut actif** : actif pendant la session → "récemment actif" 15 min après l'arrêt → invisible.
- **Position affichée** : jamais exacte, géohash arrondi (~200m) pour préserver l'anonymat de localisation.
- **Visibilité** : réglable à tout moment y compris en session active (tout le monde / mes sports / mes Alliances).
- **Génération d'un Echo** : automatique quand deux utilisateurs partagent un sport + une zone de pratique récurrente ; propose seulement, aucune connexion automatique.
- **Alliance** : nécessite demande + acceptation, jamais unilatérale.
- **Modération** : signalement/blocage possible à tout moment ; un profil bloqué disparaît de la carte et des Echos pour les deux utilisateurs.

## Contraintes techniques et non-fonctionnelles
- **Backend temps réel léger** : Supabase Realtime ou Firebase plutôt qu'une stack lourde ; géo-index type geohash pour les requêtes "utilisateurs proches".
- **Batterie** : pas de tracking GPS continu en tâche de fond — mise à jour de position toutes les 10-15 secondes plutôt qu'en flux continu, coupure automatique en fin de session.
- **Vie privée** : position toujours arrondie côté serveur avant diffusion, jamais stockée en clair côté client des autres utilisateurs.
- **Plateformes** : iOS et Android — **décision prise : iOS d'abord** (natif ou cross-platform à trancher selon compétences dispo).
- **Zone de lancement** : carte restreinte à une seule zone géographique au démarrage pour garantir une densité d'utilisateurs suffisante.
- **Montre connectée** : reportée en V2. Le téléphone reste la source de vérité au MVP. En V2 : streaming en direct via app compagnon native, **Apple Watch + WorkoutKit en premier** (une seule marque à la fois, pas de multi-support Garmin/Wear OS/Polar dès le départ). Marque prioritaire pour l'intégration V2 : **COROS**.

## Questions ouvertes / décisions prises
- Zone de lancement précise : **carte de la France en 3D pour le moment**.
- iOS ou React Native/Flutter : **iOS**.
- Plusieurs sports actifs en même temps ou une seule session à la fois : **oui, plusieurs possibles**.
- Système de "stories" (photo/vidéo de session) au MVP : **plus tard**.
- Comment amorcer la densité d'utilisateurs au lancement (invitations ciblées, partenariat local...) : **à définir plus tard**.
- Marque de montre à prioriser pour l'intégration V2 : **COROS**.
- Décisions du 2026-09-21 (⚠ pas encore dans le doc Claude d'origine, à y reporter) :
  - Inscription en étapes, **compte créé seulement à la fin** (décision d'Eliott) : email + mot de passe + confirmation → prénom + âge + style de sportif → sports → localisation.
  - Styles de sportif (badge, un seul choix) : **aventurier, compétiteur, pour le plaisir, esprit d'équipe, bien-être, assidu** (noms proposés par Claude, à valider).
  - Âge minimum : **16 ans** (choix de Claude, à valider avec NEEV / le juridique) ; l'âge n'est jamais montré aux autres.
  - Catalogue de sports : une centaine, inspiré des listes Garmin (fēnix 8) et COROS, sans les activités motorisées ni non sportives.
  - Connexion avec Google : prévue (code prêt, à activer). Apple : plus tard (compte Apple Developer payant requis).
