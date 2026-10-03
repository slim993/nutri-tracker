import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SyncService } from '../core/sync.service';

/**
 * Sign-in / sign-up form and sync status. Renders nothing when no Supabase
 * project is configured, so local-only builds show no account UI at all.
 */
@Component({
  selector: 'app-account-panel',
  imports: [FormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sync.available) {
      <section class="card">
        <h2>Compte</h2>
        @if (flash(); as f) {
          <p class="flash" [class.ok]="f.ok" [class.ko]="!f.ok">{{ f.text }}</p>
        }

        @if (sync.email(); as email) {
          <p class="muted hint">Connecté : {{ email }}</p>

          @if (sync.needsReplace()) {
            <p class="hint">
              Cet appareil contient déjà des données qui ne viennent pas de ce compte. Les
              synchroniser les remplacera par celles du compte — exporte-les d'abord si tu veux les
              garder.
            </p>
            <button class="btn btn-danger full" [disabled]="busy()" (click)="replace()">
              Remplacer par les données du compte
            </button>
          } @else {
            <p class="muted hint">
              @switch (sync.status()) {
                @case ('syncing') {
                  Synchronisation…
                }
                @case ('offline') {
                  Hors ligne — la synchronisation reprendra avec le réseau.
                }
                @case ('error') {
                  {{ sync.error() }}
                }
                @default {
                  @if (sync.lastSyncAt(); as at) {
                    Synchronisé à {{ at | date: 'HH:mm' }}.
                  } @else {
                    En attente de synchronisation.
                  }
                }
              }
            </p>
            <button class="btn full" [disabled]="busy()" (click)="syncNow()">
              Synchroniser maintenant
            </button>
          }
          <button class="btn full" [disabled]="busy()" (click)="signOut()">Se déconnecter</button>
        } @else {
          <p class="muted hint">
            Connecte-toi pour retrouver tes données sur tous tes appareils. Sans compte, tout reste
            sur cet appareil.
          </p>
          <div class="field">
            <label for="account-email">E-mail</label>
            <input
              id="account-email"
              type="email"
              autocomplete="email"
              [ngModel]="emailInput()"
              (ngModelChange)="emailInput.set($event)"
            />
          </div>
          <div class="field">
            <label for="account-password">Mot de passe</label>
            <input
              id="account-password"
              type="password"
              autocomplete="current-password"
              [ngModel]="password()"
              (ngModelChange)="password.set($event)"
            />
          </div>
          <button class="btn btn-primary full" [disabled]="!canSubmit()" (click)="signIn()">
            Se connecter
          </button>
          <button class="btn full" [disabled]="!canSubmit()" (click)="signUp()">
            Créer un compte
          </button>
        }
      </section>
    }
  `,
  styles: `
    .card {
      margin-bottom: 14px;

      h2 {
        margin-bottom: 12px;
      }
    }

    .hint {
      font-size: 0.82rem;
      margin: -4px 0 12px;
    }

    .full {
      width: 100%;

      & + .full {
        margin-top: 10px;
      }
    }

    .flash {
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 0.85rem;
      margin: 0 0 12px;

      &.ok {
        background: color-mix(in srgb, var(--accent) 18%, transparent);
        color: var(--accent);
      }

      &.ko {
        background: color-mix(in srgb, var(--danger) 18%, transparent);
        color: var(--danger);
      }
    }
  `,
})
export class AccountPanel {
  protected readonly sync = inject(SyncService);

  protected readonly emailInput = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly flash = signal<{ ok: boolean; text: string } | null>(null);

  protected canSubmit(): boolean {
    return !this.busy() && this.emailInput().trim() !== '' && this.password().length >= 6;
  }

  protected signIn(): Promise<void> {
    return this.run(async () => {
      await this.sync.signIn(this.emailInput().trim(), this.password());
      this.password.set('');
      return null;
    });
  }

  protected signUp(): Promise<void> {
    return this.run(async () => {
      const signedIn = await this.sync.signUp(this.emailInput().trim(), this.password());
      this.password.set('');
      return signedIn
        ? 'Compte créé.'
        : 'Compte créé. Confirme ton e-mail avec le lien reçu, puis connecte-toi.';
    });
  }

  protected signOut(): Promise<void> {
    return this.run(async () => {
      await this.sync.signOut();
      return null;
    });
  }

  protected syncNow(): Promise<void> {
    return this.run(async () => {
      await this.sync.syncNow();
      return null;
    });
  }

  protected replace(): Promise<void> {
    return this.run(async () => {
      await this.sync.confirmReplace();
      return null;
    });
  }

  private async run(op: () => Promise<string | null>): Promise<void> {
    this.busy.set(true);
    this.flash.set(null);
    try {
      const text = await op();
      if (text) this.flash.set({ ok: true, text });
    } catch (err) {
      this.flash.set({
        ok: false,
        text: err instanceof Error ? err.message : 'Une erreur est survenue.',
      });
    } finally {
      this.busy.set(false);
    }
  }
}
