import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { Profile, ProfileApiService } from '../../core/profile-api.service';
import { Sidebar } from '../../shared/sidebar/sidebar';

@Component({
  selector: 'app-home-page',
  imports: [Sidebar, MatButtonModule, MatIconModule, MatProgressSpinnerModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomePage implements OnInit {
  private readonly profileApiService = inject(ProfileApiService);

  protected readonly loading = signal(true);
  protected readonly profile = signal<Profile | null>(null);

  protected readonly firstName = computed(() => {
    const fullName = this.profile()?.fullName.trim();

    if (!fullName) {
      return 'PetLover';
    }

    return fullName.split(/\s+/)[0];
  });

  ngOnInit(): void {
    void this.loadProfile();
  }

  private async loadProfile(): Promise<void> {
    this.loading.set(true);

    try {
      const profile = await firstValueFrom(this.profileApiService.getProfile());
      this.profile.set(profile);
    } catch {
      this.profile.set(null);
    } finally {
      this.loading.set(false);
    }
  }
}
