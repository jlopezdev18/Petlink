import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';

import {
  AccessCode,
  CaregiverAccess,
  CaregiverPreset,
  CaregiversApiService,
  CreatedAccessCode,
} from '../../core/caregivers-api.service';
import { AuthService } from '../../core/auth.service';
import { Pet, PetsApiService } from '../../core/pets-api.service';
import { Sidebar } from '../../shared/sidebar/sidebar';

@Component({
  selector: 'app-caregivers-page',
  imports: [
    Sidebar,
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './caregivers.html',
  styleUrl: './caregivers.css',
})
export class CaregiversPage implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly petsApiService = inject(PetsApiService);
  private readonly caregiversApiService = inject(CaregiversApiService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly feedback = signal('');
  protected readonly pets = signal<Pet[]>([]);
  protected readonly caregivers = signal<CaregiverAccess[]>([]);
  protected readonly accessCodes = signal<AccessCode[]>([]);
  protected readonly createdAccessCode = signal<CreatedAccessCode | null>(null);
  protected readonly editingCaregiver = signal<CaregiverAccess | null>(null);

  protected readonly ownerPets = computed(() => this.pets().filter((pet) => pet.isOwner));
  protected readonly receivedAccess = computed(() => this.caregivers().filter((caregiver) => !caregiver.isOwner));
  protected readonly ownedAccess = computed(() => this.caregivers().filter((caregiver) => caregiver.isOwner));
  protected readonly isOwnerMode = computed(() => this.authService.accountType === 'owner');

  protected readonly form = this.formBuilder.nonNullable.group({
    petId: ['', Validators.required],
    caregiverEmail: ['', [Validators.required, Validators.email]],
    preset: ['caregiver' as CaregiverPreset, Validators.required],
    notes: [''],
  });
  protected readonly accessCodeForm = this.formBuilder.nonNullable.group({
    petId: ['', Validators.required],
    duration: ['24h', Validators.required],
    purpose: ['caregiver' as AccessCode['purpose'], Validators.required],
  });

  ngOnInit(): void {
    void this.loadData();
  }

  protected editCaregiver(caregiver: CaregiverAccess): void {
    this.editingCaregiver.set(caregiver);
    this.feedback.set('');
    this.form.reset({
      petId: caregiver.petId,
      caregiverEmail: caregiver.caregiverEmail ?? '',
      preset: caregiver.preset,
      notes: caregiver.notes,
    });
    this.form.controls.petId.disable();
    this.form.controls.caregiverEmail.disable();
  }

  protected cancelEdit(): void {
    this.editingCaregiver.set(null);
    this.resetForm();
  }

  protected async submit(): Promise<void> {
    this.feedback.set('');
    this.form.markAllAsTouched();

    if (this.form.invalid || this.submitting()) {
      return;
    }

    const rawAccess = this.form.getRawValue();
    this.submitting.set(true);

    try {
      const editingCaregiver = this.editingCaregiver();

      if (editingCaregiver) {
        const updatedAccess = await firstValueFrom(
          this.caregiversApiService.updateCaregiver(editingCaregiver.id, {
            preset: rawAccess.preset,
            notes: rawAccess.notes.trim(),
          }),
        );
        this.caregivers.update((caregivers) =>
          caregivers.map((caregiver) => (caregiver.id === updatedAccess.id ? updatedAccess : caregiver)),
        );
        this.feedback.set('Permisos del cuidador actualizados.');
      } else {
        const createdAccess = await firstValueFrom(
          this.caregiversApiService.createCaregiver({
            petId: rawAccess.petId,
            caregiverEmail: rawAccess.caregiverEmail.trim().toLowerCase(),
            preset: rawAccess.preset,
            notes: rawAccess.notes.trim(),
          }),
        );
        this.caregivers.update((caregivers) => [createdAccess, ...caregivers]);
        this.feedback.set('Cuidador autorizado correctamente.');
      }

      this.editingCaregiver.set(null);
      this.resetForm();
    } catch {
      this.feedback.set('No pudimos guardar el cuidador. Verifica que el email pertenezca a un usuario registrado.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected async revokeCaregiver(caregiver: CaregiverAccess): Promise<void> {
    if (this.submitting()) {
      return;
    }

    this.feedback.set('');
    this.submitting.set(true);

    try {
      await firstValueFrom(this.caregiversApiService.deleteCaregiver(caregiver.id));
      this.caregivers.update((caregivers) => caregivers.filter((currentCaregiver) => currentCaregiver.id !== caregiver.id));
      this.feedback.set(caregiver.isOwner ? 'Acceso revocado.' : 'Saliste de este acceso compartido.');
    } catch {
      this.feedback.set('No pudimos revocar este acceso. Intenta de nuevo.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected async createAccessCode(): Promise<void> {
    this.feedback.set('');
    this.accessCodeForm.markAllAsTouched();

    if (this.accessCodeForm.invalid || this.submitting()) {
      return;
    }

    const rawAccessCode = this.accessCodeForm.getRawValue();
    this.submitting.set(true);

    try {
      const createdAccessCode = await firstValueFrom(
        this.caregiversApiService.createAccessCode(
          rawAccessCode.petId,
          this.expiresAtFor(rawAccessCode.duration),
          rawAccessCode.purpose,
        ),
      );
      this.createdAccessCode.set(createdAccessCode);
      this.accessCodes.update((accessCodes) => [createdAccessCode, ...accessCodes]);
      this.feedback.set('Codigo temporal creado.');
    } catch {
      this.feedback.set('No pudimos crear el codigo temporal.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected async revokeAccessCode(accessCode: AccessCode): Promise<void> {
    if (this.submitting()) {
      return;
    }

    this.feedback.set('');
    this.submitting.set(true);

    try {
      await firstValueFrom(this.caregiversApiService.revokeAccessCode(accessCode.id));
      this.accessCodes.update((accessCodes) =>
        accessCodes.map((currentAccessCode) =>
          currentAccessCode.id === accessCode.id
            ? { ...currentAccessCode, isActive: false, revokedAt: new Date().toISOString() }
            : currentAccessCode,
        ),
      );
      this.feedback.set('Codigo temporal revocado.');
    } catch {
      this.feedback.set('No pudimos revocar el codigo temporal.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected copyCreatedCode(): void {
    const code = this.createdAccessCode()?.code;
    if (!code) {
      return;
    }

    void navigator.clipboard?.writeText(code);
    this.feedback.set('Codigo copiado.');
  }

  protected guestAccessUrl(accessCode: CreatedAccessCode): string {
    return `${window.location.origin}/#/acceso-cuidador?code=${encodeURIComponent(accessCode.code)}`;
  }

  protected qrCodeUrl(accessCode: CreatedAccessCode): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(this.guestAccessUrl(accessCode))}`;
  }

  protected accessCodePurposeLabel(purpose: AccessCode['purpose']): string {
    return purpose === 'veterinarian' ? 'Veterinario' : 'Cuidador';
  }

  protected accessCodeStatusLabel(accessCode: AccessCode): string {
    if (accessCode.isActive) {
      return 'Activo';
    }

    return accessCode.revokedAt ? 'Revocado' : 'Vencido';
  }

  protected presetLabel(preset: CaregiverPreset): string {
    return {
      viewer: 'Solo ver',
      caregiver: 'Cuidador',
      veterinarian: 'Veterinario',
    }[preset];
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);

    try {
      const [pets, caregivers, accessCodes] = await Promise.all([
        firstValueFrom(this.petsApiService.listPets()),
        firstValueFrom(this.caregiversApiService.listCaregivers()),
        this.isOwnerMode() ? firstValueFrom(this.caregiversApiService.listAccessCodes()) : Promise.resolve([]),
      ]);
      this.pets.set(pets);
      this.caregivers.set(caregivers);
      this.accessCodes.set(accessCodes);
      this.resetForm();
    } catch {
      this.feedback.set('No pudimos cargar cuidadores.');
    } finally {
      this.loading.set(false);
    }
  }

  private resetForm(): void {
    this.form.controls.petId.enable();
    this.form.controls.caregiverEmail.enable();
    this.form.reset({
      petId: this.ownerPets()[0]?.id ?? '',
      caregiverEmail: '',
      preset: 'caregiver',
      notes: '',
    });
    this.accessCodeForm.reset({
      petId: this.ownerPets()[0]?.id ?? '',
      duration: '24h',
      purpose: 'caregiver',
    });
  }

  private expiresAtFor(duration: string): string {
    const expiresAt = new Date();
    const hoursByDuration: Record<string, number> = {
      '1h': 1,
      '24h': 24,
      '3d': 72,
      '7d': 168,
    };
    expiresAt.setHours(expiresAt.getHours() + (hoursByDuration[duration] ?? 24));
    return expiresAt.toISOString();
  }
}
