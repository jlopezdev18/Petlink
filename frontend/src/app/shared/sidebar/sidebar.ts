import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { ThemeService } from '../../core/theme.service';

@Component({
  selector: 'app-sidebar',
  imports: [MatButtonModule, MatIconModule, MatSlideToggleModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);

  protected readonly mobileMenuOpen = signal(false);
  protected readonly isDarkMode = this.themeService.isDarkMode;
  protected readonly isCaregiverMode = () => this.authService.accountType === 'caregiver';

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((isOpen) => !isOpen);
  }

  protected closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  protected setDarkMode(isDark: boolean): void {
    this.themeService.setMode(isDark ? 'dark' : 'light');
  }

  protected logout(): void {
    this.authService.logout();
    this.closeMobileMenu();
    void this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
