import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import type { Macros } from '../core/models';

interface Bar {
  key: string;
  label: string;
  unit: string;
  consumed: number;
  target: number;
  ratio: number;
  remaining: number;
}

/** Consumed / target progress for kcal + the three macros. */
@Component({
  selector: 'app-macro-progress',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bars">
      @for (bar of bars(); track bar.key) {
        <div class="bar" [style.--color]="'var(--' + bar.key + ')'">
          <div class="head">
            <span class="label">{{ bar.label }}</span>
            <span class="values">
              <strong>{{ bar.consumed | number: '1.0-0' }}</strong>
              <span class="muted">/ {{ bar.target | number: '1.0-0' }}{{ bar.unit }}</span>
            </span>
          </div>
          <div class="track"><div class="fill" [style.width.%]="bar.ratio * 100"></div></div>
          <div class="foot muted">
            @if (bar.remaining >= 0) {
              reste {{ bar.remaining | number: '1.0-0' }}{{ bar.unit }}
            } @else {
              dépassé de {{ -bar.remaining | number: '1.0-0' }}{{ bar.unit }}
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .bars {
      display: grid;
      gap: 14px;
    }
    .head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 0.85rem;
      margin-bottom: 5px;
    }
    .label {
      color: var(--color);
      font-weight: 600;
    }
    .values .muted {
      font-size: 0.78rem;
    }
    .track {
      height: 8px;
      border-radius: 99px;
      background: var(--surface-2);
      overflow: hidden;
    }
    .fill {
      height: 100%;
      border-radius: 99px;
      background: var(--color);
      transition: width 0.25s ease;
    }
    .foot {
      font-size: 0.72rem;
      margin-top: 4px;
    }
  `,
})
export class MacroProgress {
  readonly consumed = input.required<Macros>();
  readonly targets = input.required<Macros>();

  protected readonly bars = computed<Bar[]>(() => {
    const c = this.consumed();
    const t = this.targets();
    const defs: [string, string, string, number, number][] = [
      ['kcal', 'Calories', ' kcal', c.kcal, t.kcal],
      ['protein', 'Protéines', ' g', c.protein, t.protein],
      ['carbs', 'Glucides', ' g', c.carbs, t.carbs],
      ['fat', 'Lipides', ' g', c.fat, t.fat],
    ];
    return defs.map(([key, label, unit, consumed, target]) => ({
      key,
      label,
      unit,
      consumed,
      target,
      ratio: target > 0 ? Math.min(consumed / target, 1) : 0,
      remaining: target - consumed,
    }));
  });
}
