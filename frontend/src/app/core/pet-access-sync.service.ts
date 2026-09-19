import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { filter, firstValueFrom, forkJoin, fromEvent, merge, timer } from 'rxjs';

import { AccessRevocationService } from './access-revocation.service';
import { AuthService } from './auth.service';
import { CaregiverAccess, CaregiversApiService } from './caregivers-api.service';
import { MedicationsApiService } from './medications-api.service';
import { Pet, PetsApiService } from './pets-api.service';
import { PrescriptionsApiService } from './prescriptions-api.service';

const ACCESS_CHECK_INTERVAL_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class PetAccessSyncService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly accessRevocationService = inject(AccessRevocationService);
  private readonly caregiversApiService = inject(CaregiversApiService);
  private readonly medicationsApiService = inject(MedicationsApiService);
  private readonly petsApiService = inject(PetsApiService);
  private readonly prescriptionsApiService = inject(PrescriptionsApiService);
  private started = false;
  private checking = false;
  private handlingRevocation = false;
  private sessionToken: string | null = null;
  private accessSnapshot: string | null = null;

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;

    merge(
      timer(0, ACCESS_CHECK_INTERVAL_MS),
      fromEvent(document, 'visibilitychange').pipe(
        filter(() => document.visibilityState === 'visible'),
      ),
      fromEvent(window, 'focus'),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.checkAccess());

    this.accessRevocationService.revoked$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.handleRevokedAccess());
  }

  async checkAccess(): Promise<void> {
    const token = this.authService.accessToken;

    if (!token || this.authService.accountType !== 'caregiver') {
      this.resetSession();
      return;
    }

    if (this.checking) {
      return;
    }

    if (this.sessionToken !== token) {
      this.sessionToken = token;
      this.accessSnapshot = null;
    }

    this.checking = true;

    try {
      const { pets, caregivers } = await firstValueFrom(
        forkJoin({
          pets: this.petsApiService.refreshPets(),
          caregivers: this.caregiversApiService.refreshCaregivers(),
        }),
      );
      const nextSnapshot = createAccessSnapshot(pets, caregivers);

      if (this.accessSnapshot !== null && this.accessSnapshot !== nextSnapshot) {
        this.accessSnapshot = nextSnapshot;
        this.accessRevocationService.report();
        return;
      }

      this.accessSnapshot = nextSnapshot;
    } catch {
      // Access-specific failures are reported by the interceptor. Network failures retry later.
    } finally {
      this.checking = false;
    }
  }

  private async handleRevokedAccess(): Promise<void> {
    if (this.handlingRevocation || this.authService.accountType !== 'caregiver') {
      return;
    }

    this.handlingRevocation = true;
    this.accessSnapshot = null;
    this.caregiversApiService.clearCache();
    this.medicationsApiService.clearCache();
    this.petsApiService.clearCache();
    this.prescriptionsApiService.clearCache();

    try {
      await this.router.navigate(['/inicio'], {
        state: { accessUpdated: true },
      });
    } finally {
      this.handlingRevocation = false;
    }
  }

  private resetSession(): void {
    this.sessionToken = null;
    this.accessSnapshot = null;
  }
}

function createAccessSnapshot(pets: Pet[], caregivers: CaregiverAccess[]): string {
  const petIds = pets.map((pet) => pet.id).sort();
  const permissions = caregivers
    .map(
      (caregiver) => `${caregiver.id}:${caregiver.petId}:${caregiver.preset}:${caregiver.status}`,
    )
    .sort();

  return JSON.stringify({ petIds, permissions });
}
