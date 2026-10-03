import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LANG, LANGUAGES, setLang, t, type Lang } from '../core/i18n';

/** Language picker. Choosing a language reloads the app — see `setLang()`. */
@Component({
  selector: 'app-language-select',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select [attr.aria-label]="t('Langue')" [ngModel]="lang" (ngModelChange)="change($event)">
      @for (language of languages; track language.id) {
        <option [value]="language.id">{{ language.label }}</option>
      }
    </select>
  `,
})
export class LanguageSelect {
  protected readonly t = t;
  protected readonly languages = LANGUAGES;
  protected readonly lang = LANG;

  protected change(lang: Lang): void {
    if (lang !== LANG) setLang(lang);
  }
}
