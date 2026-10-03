import { Component, Injector, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DataService } from './core/data.service';
import { SettingsService } from './core/settings.service';
import { SUPABASE_CONFIGURED } from './core/supabase.config';
import { WelcomePage } from './welcome/welcome.page';
import { t } from './core/i18n';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, WelcomePage],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly t = t;
  protected readonly data = inject(DataService);
  protected readonly settings = inject(SettingsService);
  private readonly injector = inject(Injector);

  protected readonly tabs = [
    { path: '/journal', label: t('Journal'), icon: '📓' },
    { path: '/aliments', label: t('Aliments'), icon: '🥗' },
    { path: '/repas', label: t('Repas'), icon: '🍽️' },
    { path: '/poids', label: t('Poids'), icon: '⚖️' },
    { path: '/entrainement', label: t('Sport'), icon: '🏋️' },
    { path: '/stats', label: t('Stats'), icon: '📈' },
    { path: '/reglages', label: t('Réglages'), icon: '⚙️' },
  ];

  constructor() {
    void this.data.init().then(() => this.startSync());
  }

  /** Sync diffs against the in-memory stores, so it starts only once they are loaded. */
  private async startSync(): Promise<void> {
    if (!SUPABASE_CONFIGURED) return;
    const { SyncService } = await import('./core/sync.service');
    await this.injector.get(SyncService).start();
  }
}
