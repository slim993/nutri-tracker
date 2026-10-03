# Nutri-Tracker

PWA Angular de suivi nutritionnel et de poids, **locale d'abord** : toutes les données vivent dans
l'IndexedDB du navigateur et l'app fonctionne hors ligne une fois installée. Un compte optionnel
(Supabase) synchronise ces données entre appareils ; sans compte, rien ne quitte l'appareil.

## Fonctionnalités

- **Journal** — navigation par jour, progression kcal/protéines/glucides/lipides vs cibles,
  entrées groupées par repas, ajout en 2 taps (favoris, repas type, recherche, création rapide).
- **Aliments** — CRUD des aliments perso (valeurs pour 100 g), favoris épinglés en haut.
- **Repas types** — assemblage d'aliments avec quantités, total macros, log en un tap.
- **Poids** — saisie des pesées, courbe d'évolution avec ligne pointillée sur l'objectif,
  écarts depuis le départ et jusqu'à la cible.
- **Stats** — kcal moyennes par semaine, adhérence à la cible protéines, moyenne mobile 7 jours
  du poids, rythme moyen (kg/semaine) et projection de la date d'atteinte de l'objectif.
- **Réglages** — édition des cibles, compte et synchronisation, export/import JSON,
  réinitialisation.

## Commandes

```bash
npm install       # dépendances
npm start         # serveur de dev sur http://localhost:4200
npm test          # tests unitaires (vitest)
npm run build     # build de production dans dist/nutri-tracker
```

Le service worker n'est **actif qu'en build de production** (`isDevMode()` le désactive en
`ng serve`). Pour tester le mode hors ligne :

```bash
npm run build
npx http-server dist/nutri-tracker/browser -p 8080
```

## Installer sur iPhone

1. Servir l'app en HTTPS (ou `http://localhost`) et l'ouvrir dans **Safari** — pas Chrome,
   iOS ne permet l'installation que depuis Safari.
2. Bouton **Partager** (carré avec flèche) → **Sur l'écran d'accueil**.
3. Valider : l'icône apparaît sur l'écran d'accueil et l'app s'ouvre en plein écran, sans barre
   d'adresse, y compris sans connexion.

## Données

Au premier lancement, un écran de bienvenue demande le poids actuel, le poids objectif et les
cibles quotidiennes : aucune valeur personnelle n'est livrée avec l'app. Seul un catalogue de
départ (13 aliments, 5 repas types) est pré-rempli ; il ne se rejoue jamais tant qu'un aliment
existe.

⚠️ Sans compte connecté, les données sont dans **ce navigateur uniquement**. Vider les données de
site ou désinstaller l'app les efface. Utilise **Réglages → Exporter en JSON** comme sauvegarde.

## Compte et synchronisation (optionnel)

La synchronisation passe par un projet [Supabase](https://supabase.com) :

1. Créer un projet Supabase, puis exécuter `supabase/schema.sql` dans son éditeur SQL.
2. Dans **Authentication → URL Configuration**, mettre l'URL du site en « Site URL ».
3. Renseigner l'URL du projet et la clé `anon` dans `src/app/core/supabase.config.ts`.

Tant que ce fichier est vide, l'app reste 100 % locale et n'affiche aucune interface de compte.
Chaque utilisateur ne peut lire et écrire que ses propres lignes (row-level security). En cas de
modification du même élément sur deux appareils, la modification envoyée en dernier l'emporte.

## Architecture

```
src/app/
  core/       modèle de données, accès IndexedDB (idb), un service par store, seed, backup
  shared/     composants et styles réutilisés (barres de macros, chrome des sheets, chart defaults)
  journal/ foods/ meals/ weight/ stats/ settings/    un dossier par écran (routes lazy-loaded)
```

Les services exposent des **signals** ; chaque store est chargé en mémoire au démarrage par
`DataService.init()`, puis les mutations écrivent en base et mettent le signal à jour.
