import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';

import { DueMedication, MedicationsApiService } from '../../core/medications-api.service';
import { Pet, PetsApiService } from '../../core/pets-api.service';
import { Profile, ProfileApiService } from '../../core/profile-api.service';
import { Sidebar } from '../../shared/sidebar/sidebar';

@Component({
  selector: 'app-home-page',
  imports: [Sidebar, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomePage implements OnInit {
  private readonly profileApiService = inject(ProfileApiService);
  private readonly petsApiService = inject(PetsApiService);
  private readonly medicationsApiService = inject(MedicationsApiService);

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly profile = signal<Profile | null>(null);
  protected readonly pets = signal<Pet[]>([]);
  protected readonly dueMedications = signal<DueMedication[]>([]);
  protected readonly accessUpdated = signal(Boolean(window.history.state?.accessUpdated));

  protected readonly firstName = computed(() => {
    const fullName = this.profile()?.fullName.trim();
    return fullName ? fullName.split(/\s+/)[0] : 'PetLover';
  });
  protected readonly pendingReportCount = computed(() =>
    this.pets().reduce((total, pet) => total + pet.pendingSightingReports, 0),
  );
  protected readonly petsWithPendingReports = computed(() =>
    this.pets().filter((pet) => pet.pendingSightingReports > 0),
  );
  protected readonly petsPreview = computed(() => this.pets().slice(0, 4));
  protected readonly hasAttentionItems = computed(
    () => this.pendingReportCount() > 0 || this.dueMedications().length > 0,
  );
  protected readonly todayLabel = this.formatToday();

  ngOnInit(): void {
    void this.loadDashboard();
  }

  protected speciesIcon(species: string): string {
    return species === 'Gato' ? 'cruelty_free' : 'pets';
  }

  protected formatDoseTime(value: string | null): string {
    if (!value) {
      return 'Sin hora registrada';
    }

    return new Intl.DateTimeFormat('es-HN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  private async loadDashboard(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);

    const [profileResult, petsResult, medicationsResult] = await Promise.allSettled([
      firstValueFrom(this.profileApiService.getProfile()),
      firstValueFrom(this.petsApiService.listPets()),
      firstValueFrom(this.medicationsApiService.listDueMedications()),
    ]);

    if (profileResult.status === 'fulfilled') {
      this.profile.set(profileResult.value);
    }

    if (petsResult.status === 'fulfilled') {
      this.pets.set(petsResult.value);
    }

    if (medicationsResult.status === 'fulfilled') {
      this.dueMedications.set(medicationsResult.value);
    }

    this.loadError.set(
      profileResult.status === 'rejected' ||
        petsResult.status === 'rejected' ||
        medicationsResult.status === 'rejected',
    );
    this.loading.set(false);
  }

  private formatToday(): string {
    const value = new Intl.DateTimeFormat('es-HN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date());

    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
