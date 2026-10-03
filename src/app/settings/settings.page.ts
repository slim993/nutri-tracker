import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DataService } from '../core/data.service';
import { SettingsService } from '../core/settings.service';
import { toDateKey } from '../core/models';
import type { Settings } from '../core/models';
import { AccountPanel } from '../shared/account-panel';
import { LanguageSelect } from '../shared/language-select';
import { t } from '../core/i18n';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, AccountPanel, RouterLink, LanguageSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {
  protected readonly t = t;
  private readonly settingsService = inject(SettingsService);
  private readonly data = inject(DataService);

  protected readonly draft = signal<Settings>({ ...this.settingsService.settings() });
  protected readonly message = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected patch<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected async save(): Promise<void> {
    const d = this.draft();
    await this.run(t('Cibles enregistrées.'), () =>
      this.settingsService.save({
        ...d,
        id: 'settings',
        kcalTarget: Number(d.kcalTarget) || 0,
        proteinTarget: Number(d.proteinTarget) || 0,
        carbsTarget: Number(d.carbsTarget) || 0,
        fatTarget: Number(d.fatTarget) || 0,
        weightGoalKg: Number(d.weightGoalKg) || 0,
        startWeightKg: Number(d.startWeightKg) || 0,
      }),
    );
  }

  /** Downloads the whole database as a JSON file the user can keep anywhere. */
  protected async exportJson(): Promise<void> {
    await this.run(t('Sauvegarde exportée.'), async () => {
      const json = await this.data.exportJson();
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `nutri-tracker-${toDateKey(new Date())}.json`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  protected async importJson(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!confirm(t('L’import remplace toutes les données actuelles. Continuer ?'))) {
      input.value = '';
      return;
    }
    await this.run(t('Données importées.'), async () => {
      await this.data.importJson(await file.text());
      this.draft.set({ ...this.settingsService.settings() });
    });
    input.value = '';
  }

  protected async reset(): Promise<void> {
    if (!confirm(t('Effacer toutes les données et repartir des valeurs par défaut ?'))) return;
    if (!confirm(t('Dernière confirmation : cette action est irréversible.'))) return;
    await this.run(t('Données réinitialisées.'), async () => {
      await this.data.reset();
      this.draft.set({ ...this.settingsService.settings() });
    });
  }

  private async run(success: string, op: () => Promise<void>): Promise<void> {
    this.message.set(null);
    this.error.set(null);
    try {
      await op();
      this.message.set(success);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : t('Une erreur est survenue.'));
    }
  }
}
