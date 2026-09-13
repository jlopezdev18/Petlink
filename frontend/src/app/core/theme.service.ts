import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'petlink-theme';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly modeState = signal<ThemeMode>(this.getInitialMode());

  readonly mode = this.modeState.asReadonly();
  readonly isDarkMode = computed(() => this.modeState() === 'dark');

  constructor() {
    effect(() => {
      this.applyMode(this.modeState());
    });
  }

  setMode(mode: ThemeMode): void {
    this.modeState.set(mode);
  }

  toggleMode(): void {
    this.modeState.update((mode) => (mode === 'dark' ? 'light' : 'dark'));
  }

  private getInitialMode(): ThemeMode {
    if (typeof window === 'undefined') {
      return 'dark';
    }

    try {
      const storedMode = window.localStorage.getItem(THEME_STORAGE_KEY);
      return storedMode === 'light' || storedMode === 'dark' ? storedMode : 'dark';
    } catch {
      return 'dark';
    }
  }

  private applyMode(mode: ThemeMode): void {
    const root = this.document.documentElement;
    root.classList.toggle('theme-dark', mode === 'dark');
    root.classList.toggle('theme-light', mode === 'light');
    root.style.colorScheme = mode;

    const themeColor = mode === 'dark' ? '#0f131d' : '#f7f9fd';
    this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      return;
    }
  }
}
