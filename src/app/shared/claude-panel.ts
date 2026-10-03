import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * The copy/paste bridge UI: "copy context" + "import plan" around a prompt
 * builder and an import callback supplied by the host page. No network.
 */
@Component({
  selector: 'app-claude-panel',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (flash(); as f) {
      <p class="flash" [class.ok]="f.ok" [class.ko]="!f.ok">{{ f.text }}</p>
    }
    <section class="card">
      <h2>{{ title() }}</h2>
      <p class="muted hint">
        1. Copie ton contexte · 2. Colle-le dans l'app Claude · 3. Importe le JSON de sa réponse.
      </p>
      <div class="row">
        <button class="btn" style="flex: 1" (click)="copyContext()">📋 Copier le contexte</button>
        <button class="btn" style="flex: 1" (click)="importOpen.set(true)">
          📥 Importer le plan
        </button>
      </div>
    </section>

    @if (importOpen()) {
      <div class="backdrop" (click)="importOpen.set(false)"></div>
      <div class="sheet">
        <h2>Importer le plan de Claude</h2>
        <p class="muted hint">Colle ici la réponse de Claude (avec son bloc JSON).</p>
        <textarea
          rows="8"
          [ngModel]="importText()"
          (ngModelChange)="importText.set($event)"
        ></textarea>
        <div class="row">
          <button class="btn" (click)="importOpen.set(false)">Annuler</button>
          <button
            class="btn btn-primary"
            style="flex: 1"
            [disabled]="!importText().trim() || busy()"
            (click)="runImport()"
          >
            {{ busy() ? 'Import…' : 'Importer' }}
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    .card {
      margin-bottom: 14px;

      h2 {
        margin-bottom: 6px;
      }
    }

    .hint {
      font-size: 0.8rem;
      margin: 0 0 12px;
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

    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      z-index: 20;
    }

    .sheet {
      position: fixed;
      inset: auto 0 0 0;
      z-index: 21;
      max-height: 85dvh;
      overflow-y: auto;
      background: var(--surface);
      border-top: 1px solid var(--border);
      border-radius: 20px 20px 0 0;
      padding: var(--pad) var(--pad) calc(env(safe-area-inset-bottom) + var(--pad));
      max-width: 640px;
      margin: 0 auto;

      h2 {
        margin-bottom: 8px;
      }
    }

    textarea {
      width: 100%;
      font: inherit;
      font-size: 16px;
      color: var(--text);
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 14px;
      resize: vertical;
    }
  `,
})
export class ClaudePanel {
  readonly title = input('Programmer avec Claude');
  readonly buildPrompt = input.required<() => string>();
  /** Runs the import; resolves to a success message, throws a user-readable error. */
  readonly doImport = input.required<(text: string) => Promise<string>>();

  protected readonly importOpen = signal(false);
  protected readonly importText = signal('');
  protected readonly busy = signal(false);
  protected readonly flash = signal<{ ok: boolean; text: string } | null>(null);

  protected async copyContext(): Promise<void> {
    const prompt = this.buildPrompt()();
    try {
      await navigator.clipboard.writeText(prompt);
      this.notify(true, 'Contexte copié. Colle-le dans Claude, puis importe le JSON reçu.');
    } catch {
      // Clipboard can be denied — surface the text for manual copy instead.
      this.importText.set(prompt);
      this.importOpen.set(true);
      this.notify(false, 'Copie refusée par le navigateur : copie le texte ci-dessous à la main.');
    }
  }

  protected async runImport(): Promise<void> {
    this.busy.set(true);
    try {
      const message = await this.doImport()(this.importText());
      this.importOpen.set(false);
      this.importText.set('');
      this.notify(true, message);
    } catch (err) {
      this.notify(false, err instanceof Error ? err.message : 'Import impossible.');
    } finally {
      this.busy.set(false);
    }
  }

  private notify(ok: boolean, text: string): void {
    this.flash.set({ ok, text });
    setTimeout(() => this.flash.set(null), 6000);
  }
}
