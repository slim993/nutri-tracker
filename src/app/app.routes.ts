import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'journal' },
  {
    path: 'journal',
    title: 'Journal',
    loadComponent: () => import('./journal/journal.page').then((m) => m.JournalPage),
  },
  {
    path: 'aliments',
    title: 'Aliments',
    loadComponent: () => import('./foods/foods.page').then((m) => m.FoodsPage),
  },
  {
    path: 'repas',
    title: 'Repas types',
    loadComponent: () => import('./meals/meals.page').then((m) => m.MealsPage),
  },
  {
    path: 'poids',
    title: 'Poids',
    loadComponent: () => import('./weight/weight.page').then((m) => m.WeightPage),
  },
  {
    path: 'entrainement',
    title: 'Entraînement',
    loadComponent: () => import('./workouts/workouts.page').then((m) => m.WorkoutsPage),
  },
  {
    path: 'stats',
    title: 'Statistiques',
    loadComponent: () => import('./stats/stats.page').then((m) => m.StatsPage),
  },
  {
    path: 'reglages',
    title: 'Réglages',
    loadComponent: () => import('./settings/settings.page').then((m) => m.SettingsPage),
  },
  { path: '**', redirectTo: 'journal' },
];
