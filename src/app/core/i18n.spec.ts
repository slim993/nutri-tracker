import { describe, expect, it } from 'vitest';
import { translate } from './i18n';

describe('translate', () => {
  it('returns the French source as is in French', () => {
    expect(translate('fr', 'Enregistrer')).toBe('Enregistrer');
  });

  it('looks the French source up in the English dictionary', () => {
    expect(translate('en', 'Enregistrer')).toBe('Save');
  });

  it('falls back to French when there is no English entry', () => {
    expect(translate('en', 'Texte jamais traduit')).toBe('Texte jamais traduit');
  });

  it('fills placeholders in both languages', () => {
    expect(translate('fr', '{n} séance(s) importée(s).', { n: 3 })).toBe(
      '3 séance(s) importée(s).',
    );
    expect(translate('en', '{n} séance(s) importée(s).', { n: 3 })).toBe('3 session(s) imported.');
  });
});
