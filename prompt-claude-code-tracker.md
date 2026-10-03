# Prompt Claude Code — PWA de suivi nutrition & poids

> Copie tout le bloc ci-dessous dans Claude Code depuis un dossier vide. Il est autoportant.

---

Crée une **PWA Angular standalone** de suivi nutritionnel et de poids, 100 % locale (aucun backend, aucune API externe, aucun compte). Toutes les données sont persistées dans le navigateur via **IndexedDB** (utilise la lib `idb` pour simplifier). L'app doit être installable sur iPhone (ajout à l'écran d'accueil) et fonctionner hors ligne.

## Stack & contraintes techniques

- Angular standalone components (dernière version stable), routing intégré.
- Aucune dépendance de backend. Aucune requête réseau au runtime.
- Persistance : IndexedDB via `idb`. Prévois une fonction d'export/import JSON de toutes les données (backup manuel).
- Graphiques : `ng2-charts` + `chart.js` (ou Chart.js directement).
- PWA : manifest complet (nom, icônes 192/512, `display: standalone`, thème sombre), service worker Angular (`@angular/pwa`) pour le offline.
- Responsive mobile-first, pensé pour un usage à une main sur iPhone. Dark mode par défaut.
- Code en français pour les libellés UI, anglais pour le code.

## Modèle de données (IndexedDB stores)

1. **foods** — aliments personnalisés. Champs : `id`, `name`, `kcal`, `protein`, `carbs`, `fat` (tous pour 100 g), `unit` ('g' par défaut), `isFavorite` (bool).
2. **meals** — repas types = groupes d'aliments avec quantités. Champs : `id`, `name`, `items[]` (chaque item = `{foodId, grams}`).
3. **logEntries** — entrées journalières. Champs : `id`, `date` (YYYY-MM-DD), `foodId` (ou `mealId`), `grams`, calcul des macros dérivé.
4. **weightEntries** — pesées. Champs : `id`, `date`, `weightKg`.
5. **settings** — cibles : `kcalTarget`, `proteinTarget`, `carbsTarget`, `fatTarget`, `weightGoalKg`, `startWeightKg`.

## Fonctionnalités (toutes)

### Écran Journal (accueil)
- Sélecteur de date (défaut = aujourd'hui), navigation jour précédent/suivant.
- Anneaux ou barres de progression du jour : kcal, protéines, glucides, lipides — consommé / cible + restant.
- Liste des entrées du jour, groupées par repas (Petit-déj / Déjeuner / Collation / Dîner / Autre). Swipe ou bouton pour supprimer/éditer.
- Bouton « + » pour ajouter : soit un aliment favori (accès rapide), soit un repas type (1 tap logge tout), soit recherche dans mes aliments, soit création rapide.
- Saisie de quantité en grammes, macros calculées en direct.

### Écran Aliments
- Liste de mes aliments personnalisés, favoris en haut.
- Créer / éditer / supprimer un aliment (valeurs pour 100 g).
- Marquer favori.

### Écran Repas types
- Créer un repas type en assemblant plusieurs aliments avec quantités.
- Voir le total kcal/macros du repas.
- Logger un repas entier en un tap depuis le journal.

### Écran Poids
- Ajouter une pesée (date + poids).
- Courbe d'évolution du poids dans le temps, avec **ligne pointillée horizontale sur l'objectif (poids cible)**.
- Affichage : poids actuel, variation depuis le début, écart restant jusqu'à l'objectif.

### Écran Stats / Historique
- Graphique kcal moyennes par semaine (barres).
- Graphique adhérence : jours où la cible protéines a été atteinte.
- Moyenne mobile 7 jours du poids (pour lisser le bruit).
- Résumé : perte totale, rythme moyen (kg/semaine), projection date d'atteinte de l'objectif au rythme actuel.

### Écran Réglages
- Éditer les cibles (kcal, macros, poids objectif, poids de départ).
- Export JSON / Import JSON.
- Reset des données (avec confirmation).

## Données de seed (à pré-remplir au premier lancement)

### Cibles par défaut
Aucune valeur personnelle n'est pré-remplie : le poids actuel, le poids objectif et les cibles
sont demandés à l'utilisateur au premier lancement (cibles proposées par défaut : 2000 kcal,
120 g de protéines, 220 g de glucides, 70 g de lipides).

### Aliments favoris (valeurs pour 100 g)
| Nom | kcal | P | G | L |
|---|---|---|---|---|
| Œuf entier | 143 | 13 | 1 | 10 |
| Flocons d'avoine | 380 | 13 | 60 | 7 |
| Poulet (blanc, cru) | 120 | 23 | 0 | 2.5 |
| Riz basmati (cru) | 350 | 7 | 78 | 1 |
| Fromage blanc 0% | 47 | 8 | 4 | 0.2 |
| Amandes | 600 | 21 | 6 | 53 |
| Saumon (cru) | 200 | 20 | 0 | 13 |
| Bœuf maigre 5% (cru) | 130 | 21 | 0 | 5 |
| Pommes de terre (crues) | 80 | 2 | 17 | 0.1 |
| Pain complet | 250 | 9 | 45 | 3 |
| Whey (pour 100 g) | 400 | 80 | 8 | 6 |

### Repas types pré-assemblés (à créer au seed)
- **Petit-déjeuner** : Œuf entier 220 g + Flocons d'avoine 60 g + (banane — crée un aliment "Banane" 89/1.1/23/0.3 pour 100 g, 120 g)
- **Déjeuner** : Poulet 180 g + Riz basmati 80 g + huile d'olive (crée "Huile d'olive" 900/0/0/100 pour 100 g, 10 g)
- **Collation** : Fromage blanc 0% 200 g + Amandes 30 g + Banane 120 g
- **Dîner** : Saumon 200 g + Pommes de terre 300 g
- **Avant-coucher** : Whey 30 g

## Qualité attendue
- Code propre, composants séparés, un service par store.
- Gestion d'erreurs sur IndexedDB.
- UX fluide : ajouter un repas doit prendre 2 taps max.
- Fournis un README avec : commandes (`npm install`, `ng serve`, build PWA), et comment l'installer sur iPhone (Safari → Partager → Sur l'écran d'accueil).

Commence par scaffolder le projet, mets en place le modèle de données et le seed, puis construis les écrans dans cet ordre : Journal, Aliments, Repas, Poids, Stats, Réglages.
