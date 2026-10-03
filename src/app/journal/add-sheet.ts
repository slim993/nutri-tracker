import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FoodsService } from '../core/foods.service';
import { LogService } from '../core/log.service';
import { MealsService } from '../core/meals.service';
import { MEAL_SLOTS, macrosFor, type Food, type MealSlot } from '../core/models';
import { t } from '../core/i18n';

type Tab = 'favorites' | 'meals' | 'search' | 'create';

/** Bottom sheet used to add food or a whole meal to the journal. */
@Component({
  selector: 'app-add-sheet',
  imports: [FormsModule, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <div class="sheet">
      <header>
        <select [(ngModel)]="slot" [attr.aria-label]="t('Repas')">
          @for (s of slots; track s.id) {
            <option [value]="s.id">{{ s.label }}</option>
          }
        </select>
        <button class="btn" (click)="closed.emit()">{{ t('Fermer') }}</button>
      </header>

      @if (picked(); as food) {
        <div class="picked">
          <h2>{{ food.name }}</h2>
          <div class="field">
            <label for="grams">{{ t('Quantité (g)') }}</label>
            <input id="grams" type="number" inputmode="numeric" min="1" [(ngModel)]="grams" />
          </div>
          <p class="preview muted">
            {{ preview().kcal | number: '1.0-0' }} kcal · P
            {{ preview().protein | number: '1.0-1' }} · {{ t('G') }}
            {{ preview().carbs | number: '1.0-1' }} · {{ t('L') }}
            {{ preview().fat | number: '1.0-1' }}
          </p>
          <div class="row">
            <button class="btn" (click)="picked.set(null)">{{ t('Retour') }}</button>
            <button class="btn btn-primary" style="flex:1" (click)="confirm(food)">
              {{ t('Ajouter') }}
            </button>
          </div>
        </div>
      } @else {
        <nav class="tabs">
          @for (t of tabs; track t.id) {
            <button [class.active]="tab() === t.id" (click)="tab.set(t.id)">{{ t.label }}</button>
          }
        </nav>

        @switch (tab()) {
          @case ('favorites') {
            @for (food of foods.favorites(); track food.id) {
              <button class="item" (click)="pick(food)">
                <span>{{ food.name }}</span>
                <span class="muted">{{ food.kcal | number: '1.0-0' }} kcal/100 g</span>
              </button>
            } @empty {
              <p class="empty">
                {{ t('Aucun favori. Marque des aliments en favori depuis l’onglet Aliments.') }}
              </p>
            }
          }
          @case ('meals') {
            @for (meal of meals.meals(); track meal.id) {
              <button class="item" (click)="logMeal(meal.id)">
                <span>{{ meal.name }}</span>
                <span class="muted">{{ meals.totals(meal).kcal | number: '1.0-0' }} kcal</span>
              </button>
            } @empty {
              <p class="empty">{{ t('Aucun repas type.') }}</p>
            }
          }
          @case ('search') {
            <input
              type="search"
              [placeholder]="t('Rechercher un aliment…')"
              [ngModel]="query()"
              (ngModelChange)="query.set($event)"
            />
            @for (food of results(); track food.id) {
              <button class="item" (click)="pick(food)">
                <span>{{ food.name }}</span>
                <span class="muted">{{ food.kcal | number: '1.0-0' }} kcal/100 g</span>
              </button>
            } @empty {
              <p class="empty">{{ t('Aucun résultat.') }}</p>
            }
          }
          @case ('create') {
            <div class="field">
              <label for="n">{{ t('Nom') }}</label>
              <input id="n" [(ngModel)]="draftName" />
            </div>
            <div class="grid">
              <div class="field">
                <label for="k">{{ t('kcal /100 g') }}</label>
                <input id="k" type="number" inputmode="decimal" [(ngModel)]="draftKcal" />
              </div>
              <div class="field">
                <label for="p">{{ t('Protéines') }}</label>
                <input id="p" type="number" inputmode="decimal" [(ngModel)]="draftProtein" />
              </div>
              <div class="field">
                <label for="c">{{ t('Glucides') }}</label>
                <input id="c" type="number" inputmode="decimal" [(ngModel)]="draftCarbs" />
              </div>
              <div class="field">
                <label for="f">{{ t('Lipides') }}</label>
                <input id="f" type="number" inputmode="decimal" [(ngModel)]="draftFat" />
              </div>
            </div>
            <button
              class="btn btn-primary"
              style="width:100%"
              [disabled]="!draftName().trim()"
              (click)="createFood()"
            >
              {{ t('Créer et ajouter') }}
            </button>
          }
        }
      }
    </div>
  `,
  styleUrl: './add-sheet.scss',
})
export class AddSheet {
  protected readonly t = t;
  protected readonly foods = inject(FoodsService);
  protected readonly meals = inject(MealsService);
  private readonly log = inject(LogService);

  readonly date = input.required<string>();
  readonly initialSlot = input.required<MealSlot>();
  readonly closed = output<void>();

  protected readonly slots = MEAL_SLOTS;
  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'favorites', label: t('Favoris') },
    { id: 'meals', label: t('Repas') },
    { id: 'search', label: t('Recherche') },
    { id: 'create', label: t('Nouveau') },
  ];

  protected readonly tab = signal<Tab>('favorites');
  /** Starts at the slot the sheet was opened from; the user can change it. */
  protected readonly slot = linkedSignal(() => this.initialSlot());
  protected readonly picked = signal<Food | null>(null);
  protected readonly grams = signal(100);
  protected readonly query = signal('');

  protected readonly draftName = signal('');
  protected readonly draftKcal = signal(0);
  protected readonly draftProtein = signal(0);
  protected readonly draftCarbs = signal(0);
  protected readonly draftFat = signal(0);

  protected readonly results = computed(() => this.foods.search(this.query()));
  protected readonly preview = computed(() => {
    const food = this.picked();
    return macrosFor(food ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 }, this.grams() || 0);
  });

  protected pick(food: Food): void {
    this.grams.set(100);
    this.picked.set(food);
  }

  protected async confirm(food: Food): Promise<void> {
    const grams = Number(this.grams());
    if (!grams || grams <= 0) return;
    await this.log.add({ date: this.date(), slot: this.slot(), foodId: food.id, grams });
    this.closed.emit();
  }

  protected async logMeal(mealId: string): Promise<void> {
    await this.log.addMeal(mealId, this.date(), this.slot());
    this.closed.emit();
  }

  protected async createFood(): Promise<void> {
    const food = await this.foods.create({
      name: this.draftName().trim(),
      kcal: Number(this.draftKcal()) || 0,
      protein: Number(this.draftProtein()) || 0,
      carbs: Number(this.draftCarbs()) || 0,
      fat: Number(this.draftFat()) || 0,
      isFavorite: false,
    });
    this.pick(food);
  }
}
