import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, timer } from 'rxjs';

import { AuthService } from './auth.service';
import { DueMedication, MedicationsApiService } from './medications-api.service';

const POLL_INTERVAL_MS = 60_000;
const NOTIFICATION_KEY_PREFIX = 'petlink:medication-dose:';
const NOTIFICATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type MedicationNotificationPermission = NotificationPermission | 'unsupported';

@Injectable({ providedIn: 'root' })
export class MedicationNotificationsService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly medicationsApiService = inject(MedicationsApiService);
  private readonly authService = inject(AuthService);
  private started = false;
  private checking = false;

  readonly permission = signal<MedicationNotificationPermission>(this.readPermission());

  start(): void {
    if (this.started || this.permission() === 'unsupported') {
      return;
    }

    this.started = true;
    this.cleanOldNotificationKeys();
    timer(0, POLL_INTERVAL_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.checkDueMedications());
  }

  async requestPermission(): Promise<MedicationNotificationPermission> {
    if (this.permission() === 'unsupported') {
      return 'unsupported';
    }

    const permission = await Notification.requestPermission();
    this.permission.set(permission);

    if (permission === 'granted') {
      await this.checkDueMedications();
    }

    return permission;
  }

  async checkDueMedications(): Promise<void> {
    if (this.checking || this.permission() !== 'granted' || !this.authService.accessToken) {
      return;
    }

    this.checking = true;

    try {
      const medications = await firstValueFrom(this.medicationsApiService.listDueMedications());

      for (const medication of medications) {
        await this.notifyMedication(medication);
      }
    } catch {
      // Polling failures are retried on the next interval without interrupting the app.
    } finally {
      this.checking = false;
    }
  }

  private async notifyMedication(medication: DueMedication): Promise<void> {
    if (!medication.nextDoseAt) {
      return;
    }

    const occurrenceKey = `${medication.id}:${medication.nextDoseAt}`;
    const storageKey = `${NOTIFICATION_KEY_PREFIX}${occurrenceKey}`;

    if (localStorage.getItem(storageKey)) {
      return;
    }

    const options: NotificationOptions = {
      body: `Es hora de administrar ${medication.dosage} a ${medication.petName}.`,
      icon: 'icons/icon-192x192.png',
      badge: 'icons/icon-96x96.png',
      tag: occurrenceKey,
    };

    const registration =
      'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;

    if (registration) {
      await registration.showNotification(`Dosis de ${medication.name}`, options);
    } else {
      new Notification(`Dosis de ${medication.name}`, options);
    }

    localStorage.setItem(storageKey, Date.now().toString());
  }

  private readPermission(): MedicationNotificationPermission {
    return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  }

  private cleanOldNotificationKeys(): void {
    const expiration = Date.now() - NOTIFICATION_RETENTION_MS;

    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);

      if (!key?.startsWith(NOTIFICATION_KEY_PREFIX)) {
        continue;
      }

      const notifiedAt = Number(localStorage.getItem(key));

      if (!Number.isFinite(notifiedAt) || notifiedAt < expiration) {
        localStorage.removeItem(key);
      }
    }
  }
}
