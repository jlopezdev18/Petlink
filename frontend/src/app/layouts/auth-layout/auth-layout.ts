import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';

import { ThemeService } from '../../core/theme.service';

@Component({
  selector: 'app-auth-layout',
  imports: [MatIconModule, MatSlideToggleModule, RouterLink],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.css',
})
export class AuthLayout {
  private readonly themeService = inject(ThemeService);

  protected readonly isDarkMode = this.themeService.isDarkMode;

  protected setDarkMode(isDark: boolean): void {
    this.themeService.setMode(isDark ? 'dark' : 'light');
  }
}
