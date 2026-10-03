import { Routes } from '@angular/router';
import { t } from './core/i18n';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'journal' },
  {
    path: 'journal',
    title: t('Journal'),
    loadComponent: () => import('./journal/journal.page').then((m) => m.JournalPage),
  },
  {
    path: 'aliments',
    title: t('Aliments'),
    loadComponent: () => import('./foods/foods.page').then((m) => m.FoodsPage),
  },
  {
    path: 'repas',
    title: t('Repas types'),
    loadComponent: () => import('./meals/meals.page').then((m) => m.MealsPage),
  },
  {
    path: 'poids',
    title: t('Poids'),
    loadComponent: () => import('./weight/weight.page').then((m) => m.WeightPage),
  },
  {
    path: 'entrainement',
    title: t('Entraînement'),
    loadComponent: () => import('./workouts/workouts.page').then((m) => m.WorkoutsPage),
  },
  {
    path: 'stats',
    title: t('Statistiques'),
    loadComponent: () => import('./stats/stats.page').then((m) => m.StatsPage),
  },
  {
    path: 'reglages',
    title: t('Réglages'),
    loadComponent: () => import('./settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    // Not in the tab bar: reached from Réglages to redo the questionnaire.
    path: 'objectif',
    title: t('Mon objectif'),
    loadComponent: () => import('./welcome/welcome.page').then((m) => m.WelcomePage),
  },
  { path: '**', redirectTo: 'journal' },
];
