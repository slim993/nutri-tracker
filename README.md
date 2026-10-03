# Nutri-Tracker

PWA Angular de suivi nutritionnel et de poids, **100 % locale** : aucun backend, aucun compte,
aucune requête réseau au runtime. Toutes les données vivent dans l'IndexedDB du navigateur et
l'app fonctionne hors ligne une fois installée.

## Fonctionnalités

- **Journal** — navigation par jour, progression kcal/protéines/glucides/lipides vs cibles,
  entrées groupées par repas, ajout en 2 taps (favoris, repas type, recherche, création rapide).
- **Aliments** — CRUD des aliments perso (valeurs pour 100 g), favoris épinglés en haut.
- **Repas types** — assemblage d'aliments avec quantités, total macros, log en un tap.
- **Poids** — saisie des pesées, courbe d'évolution avec ligne pointillée sur l'objectif,
  écarts depuis le départ et jusqu'à la cible.
- **Stats** — kcal moyennes par semaine, adhérence à la cible protéines, moyenne mobile 7 jours
  du poids, rythme moyen (kg/semaine) et projection de la date d'atteinte de l'objectif.
- **Réglages** — édition des cibles, export/import JSON, réinitialisation.

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

Au premier lancement, la base est pré-remplie : cibles (2300 kcal / 195 P / 215 G / 75 L),
poids de départ 106,7 kg, objectif 85 kg, une première pesée à 97 kg, 13 aliments et 5 repas types.
Le seed ne se rejoue jamais tant qu'un aliment existe.

⚠️ Les données sont dans **ce navigateur uniquement**. Vider les données de site ou désinstaller
l'app les efface. Utilise **Réglages → Exporter en JSON** régulièrement comme sauvegarde.

## Architecture

```
src/app/
  core/       modèle de données, accès IndexedDB (idb), un service par store, seed, backup
  shared/     composants et styles réutilisés (barres de macros, chrome des sheets, chart defaults)
  journal/ foods/ meals/ weight/ stats/ settings/    un dossier par écran (routes lazy-loaded)
```

Les services exposent des **signals** ; chaque store est chargé en mémoire au démarrage par
`DataService.init()`, puis les mutations écrivent en base et mettent le signal à jour.
