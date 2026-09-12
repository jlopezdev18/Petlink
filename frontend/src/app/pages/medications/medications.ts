import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';

import { Medication, MedicationsApiService } from '../../core/medications-api.service';
import { Pet, PetsApiService } from '../../core/pets-api.service';
import { Sidebar } from '../../shared/sidebar/sidebar';

@Component({
  selector: 'app-medications-page',
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
  templateUrl: './medications.html',
  styleUrl: './medications.css',
})
export class MedicationsPage implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly petsApiService = inject(PetsApiService);
  private readonly medicationsApiService = inject(MedicationsApiService);

  protected readonly loading = signal(true);
  protected readonly loadingMedications = signal(false);
  protected readonly submitting = signal(false);
  protected readonly feedback = signal('');
  protected readonly pets = signal<Pet[]>([]);
  protected readonly selectedPetId = signal('');
  protected readonly medications = signal<Medication[]>([]);
  protected readonly editingMedication = signal<Medication | null>(null);

  protected readonly selectedPet = computed(() =>
    this.pets().find((pet) => pet.id === this.selectedPetId()) ?? null,
  );
  protected readonly canManageSelectedPet = computed(() => this.selectedPet()?.canManageMedications ?? false);

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
    dosage: ['', Validators.required],
    frequency: ['', Validators.required],
    startDate: ['', Validators.required],
    endDate: [''],
    prescribingVet: [''],
    instructions: [''],
  });

  ngOnInit(): void {
    void this.loadPets();
  }

  protected async changePet(petId: string): Promise<void> {
    this.selectedPetId.set(petId);
    this.cancelEdit();
    await this.loadMedications();
  }

  protected editMedication(medication: Medication): void {
    this.editingMedication.set(medication);
    this.feedback.set('');
    this.form.reset({
      name: medication.name,
      dosage: medication.dosage,
      frequency: medication.frequency,
      startDate: medication.startDate,
      endDate: medication.endDate ?? '',
      prescribingVet: medication.prescribingVet,
      instructions: medication.instructions,
    });
  }

  protected cancelEdit(): void {
    this.editingMedication.set(null);
    this.resetForm();
  }

  protected async submit(): Promise<void> {
    this.feedback.set('');
    this.form.markAllAsTouched();

    if (this.form.invalid || this.submitting() || !this.canManageSelectedPet()) {
      return;
    }

    const rawMedication = this.form.getRawValue();
    const editingMedication = this.editingMedication();
    const payload = {
      petId: this.selectedPetId(),
      name: rawMedication.name.trim(),
      dosage: rawMedication.dosage.trim(),
      frequency: rawMedication.frequency.trim(),
      startDate: rawMedication.startDate,
      endDate: rawMedication.endDate || null,
      prescribingVet: rawMedication.prescribingVet.trim(),
      instructions: rawMedication.instructions.trim(),
      isActive: editingMedication?.isActive ?? true,
    };

    this.submitting.set(true);

    try {
      if (editingMedication) {
        const updatedMedication = await firstValueFrom(
          this.medicationsApiService.updateMedication(editingMedication.id, payload),
        );
        this.medications.update((medications) =>
          medications.map((medication) => (medication.id === updatedMedication.id ? updatedMedication : medication)),
        );
        this.feedback.set('Medicamento actualizado.');
      } else {
        const createdMedication = await firstValueFrom(this.medicationsApiService.createMedication(payload));
        this.medications.update((medications) => [createdMedication, ...medications]);
        this.feedback.set('Medicamento agregado.');
      }

      this.cancelEdit();
    } catch {
      this.feedback.set('No pudimos guardar el medicamento. Revisa los datos e intenta de nuevo.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected async toggleMedication(medication: Medication): Promise<void> {
    if (this.submitting() || !this.canManageSelectedPet()) {
      return;
    }

    this.submitting.set(true);
    this.feedback.set('');

    try {
      const updatedMedication = await firstValueFrom(
        this.medicationsApiService.updateMedication(medication.id, {
          petId: medication.petId,
          name: medication.name,
          dosage: medication.dosage,
          frequency: medication.frequency,
          startDate: medication.startDate,
          endDate: medication.endDate,
          prescribingVet: medication.prescribingVet,
          instructions: medication.instructions,
          isActive: !medication.isActive,
        }),
      );
      this.medications.update((medications) =>
        medications.map((currentMedication) =>
          currentMedication.id === updatedMedication.id ? updatedMedication : currentMedication,
        ),
      );
      this.feedback.set(updatedMedication.isActive ? 'Tratamiento reactivado.' : 'Tratamiento desactivado.');
    } catch {
      this.feedback.set('No pudimos cambiar el estado del medicamento.');
    } finally {
      this.submitting.set(false);
    }
  }

  private async loadPets(): Promise<void> {
    this.loading.set(true);

    try {
      const pets = await firstValueFrom(this.petsApiService.listPets());
      this.pets.set(pets);
      this.selectedPetId.set(pets[0]?.id ?? '');

      if (this.selectedPetId()) {
        await this.loadMedications();
      }
    } catch {
      this.feedback.set('No pudimos cargar mascotas.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadMedications(): Promise<void> {
    if (!this.selectedPetId()) {
      this.medications.set([]);
      return;
    }

    this.loadingMedications.set(true);

    try {
      const medications = await firstValueFrom(this.medicationsApiService.listMedications(this.selectedPetId()));
      this.medications.set(medications);
    } catch {
      this.medications.set([]);
      this.feedback.set('No pudimos cargar medicamentos para esta mascota.');
    } finally {
      this.loadingMedications.set(false);
    }
  }

  private resetForm(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.form.reset({
      name: '',
      dosage: '',
      frequency: '',
      startDate: today,
      endDate: '',
      prescribingVet: '',
      instructions: '',
    });
  }
}
