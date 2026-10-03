import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DataService } from './core/data.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly data = inject(DataService);

  protected readonly tabs = [
    { path: '/journal', label: 'Journal', icon: '📓' },
    { path: '/aliments', label: 'Aliments', icon: '🥗' },
    { path: '/repas', label: 'Repas', icon: '🍽️' },
    { path: '/poids', label: 'Poids', icon: '⚖️' },
    { path: '/entrainement', label: 'Sport', icon: '🏋️' },
    { path: '/stats', label: 'Stats', icon: '📈' },
    { path: '/reglages', label: 'Réglages', icon: '⚙️' },
  ];

  constructor() {
    void this.data.init();
  }
}
