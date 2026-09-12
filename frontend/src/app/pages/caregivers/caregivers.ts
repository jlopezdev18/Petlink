import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';

import { CaregiverAccess, CaregiverPreset, CaregiversApiService } from '../../core/caregivers-api.service';
import { Pet, PetsApiService } from '../../core/pets-api.service';
import { Sidebar } from '../../shared/sidebar/sidebar';

@Component({
  selector: 'app-caregivers-page',
  imports: [
    Sidebar,
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
  private readonly petsApiService = inject(PetsApiService);
  private readonly caregiversApiService = inject(CaregiversApiService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly feedback = signal('');
  protected readonly pets = signal<Pet[]>([]);
  protected readonly caregivers = signal<CaregiverAccess[]>([]);
  protected readonly editingCaregiver = signal<CaregiverAccess | null>(null);

  protected readonly ownerPets = computed(() => this.pets().filter((pet) => pet.isOwner));
  protected readonly receivedAccess = computed(() => this.caregivers().filter((caregiver) => !caregiver.isOwner));
  protected readonly ownedAccess = computed(() => this.caregivers().filter((caregiver) => caregiver.isOwner));

  protected readonly form = this.formBuilder.nonNullable.group({
    petId: ['', Validators.required],
    caregiverEmail: ['', [Validators.required, Validators.email]],
    preset: ['caregiver' as CaregiverPreset, Validators.required],
    notes: [''],
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
      const [pets, caregivers] = await Promise.all([
        firstValueFrom(this.petsApiService.listPets()),
        firstValueFrom(this.caregiversApiService.listCaregivers()),
      ]);
      this.pets.set(pets);
      this.caregivers.set(caregivers);
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
  }
}
