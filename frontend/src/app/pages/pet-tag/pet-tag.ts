import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import {
  PetTagsApiService,
  PublicPetQrTag,
  SightingReportPayload,
} from '../../core/pet-tags-api.service';

interface SharedLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

@Component({
  selector: 'app-pet-tag-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './pet-tag.html',
  styleUrl: './pet-tag.css',
})
export class PetTagPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(FormBuilder);
  private readonly petTagsApi = inject(PetTagsApiService);
  private token = '';

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly locating = signal(false);
  protected readonly feedback = signal('');
  protected readonly locationFeedback = signal('');
  protected readonly tag = signal<PublicPetQrTag | null>(null);
  protected readonly sharedLocation = signal<SharedLocation | null>(null);
  protected readonly reportSent = signal(false);
  protected readonly pet = computed(() => this.tag()?.pet ?? null);

  protected readonly form = this.formBuilder.nonNullable.group({
    reporterName: ['', [Validators.maxLength(100)]],
    reporterPhone: ['', [Validators.maxLength(30)]],
    message: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(1000)]],
    locationDescription: ['', [Validators.maxLength(300)]],
  });

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    void this.loadTag();
  }

  protected shareLocation(): void {
    if (this.locating()) {
      return;
    }

    if (!window.isSecureContext || !navigator.geolocation) {
      this.locationFeedback.set(
        'La ubicación GPS no está disponible. Puedes escribir una referencia.',
      );
      return;
    }

    this.locating.set(true);
    this.locationFeedback.set('Solicitando permiso de ubicación...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location: SharedLocation = {
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          accuracyMeters: Number(position.coords.accuracy.toFixed(2)),
        };
        this.sharedLocation.set(location);
        this.locationFeedback.set(
          `Ubicación lista, precisión aproximada de ${Math.round(location.accuracyMeters)} m.`,
        );
        this.locating.set(false);
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'No se compartió la ubicación. Puedes escribir una referencia.'
            : 'No pudimos obtener la ubicación. Intenta otra vez o escribe una referencia.';
        this.locationFeedback.set(message);
        this.locating.set(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  protected clearLocation(): void {
    this.sharedLocation.set(null);
    this.locationFeedback.set('Ubicación eliminada del reporte.');
  }

  protected async submitReport(): Promise<void> {
    this.feedback.set('');
    this.form.markAllAsTouched();

    if (this.form.invalid || this.submitting() || !this.token) {
      return;
    }

    const rawReport = this.form.getRawValue();
    const location = this.sharedLocation();
    const payload: SightingReportPayload = {
      reporterName: rawReport.reporterName.trim(),
      reporterPhone: rawReport.reporterPhone.trim(),
      message: rawReport.message.trim(),
      locationDescription: rawReport.locationDescription.trim(),
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      accuracyMeters: location?.accuracyMeters ?? null,
    };

    this.submitting.set(true);
    try {
      await firstValueFrom(this.petTagsApi.createReport(this.token, payload));
      this.reportSent.set(true);
      this.form.disable();
    } catch {
      this.feedback.set('No pudimos enviar el reporte. Revisa tu conexión e intenta de nuevo.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected phoneHref(phone: string): string {
    return `tel:${phone.replace(/[^\d+]/g, '')}`;
  }

  private async loadTag(): Promise<void> {
    if (!this.token) {
      this.feedback.set('Este código QR no es válido.');
      this.loading.set(false);
      return;
    }

    try {
      this.tag.set(await firstValueFrom(this.petTagsApi.getPublicTag(this.token)));
    } catch {
      this.feedback.set('No encontramos una mascota asociada a este código QR.');
    } finally {
      this.loading.set(false);
    }
  }
}
