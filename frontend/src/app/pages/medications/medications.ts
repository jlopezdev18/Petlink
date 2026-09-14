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
import { EntityModal } from '../../shared/entity-modal/entity-modal';
import { Sidebar } from '../../shared/sidebar/sidebar';

type MedicationModalMode = 'create' | 'edit' | 'view' | null;

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
    EntityModal,
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
  protected readonly modalMode = signal<MedicationModalMode>(null);
  protected readonly selectedMedication = signal<Medication | null>(null);
  protected readonly medicationPendingDelete = signal<Medication | null>(null);
  protected readonly administeredMedicationIds = signal<Set<string>>(new Set<string>());

  protected readonly selectedPet = computed(() =>
    this.pets().find((pet) => pet.id === this.selectedPetId()) ?? null,
  );
  protected readonly canManageSelectedPet = computed(() => this.selectedPet()?.canManageMedications ?? false);
  protected readonly canAdministerSelectedPet = computed(() => Boolean(this.selectedPet()));
  protected readonly editingMedication = computed(() =>
    this.modalMode() === 'edit' ? this.selectedMedication() : null,
  );
  protected readonly viewingMedication = computed(() =>
    this.modalMode() === 'view' ? this.selectedMedication() : null,
  );
  protected readonly isMedicationFormOpen = computed(() =>
    this.modalMode() === 'create' || this.modalMode() === 'edit',
  );
  protected readonly modalTitle = computed(() =>
    this.editingMedication() ? 'Editar medicamento' : 'Agregar medicamento',
  );

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
    this.closeMedicationModal();
    await this.loadMedications();
  }

  protected openCreateMedication(): void {
    if (!this.canManageSelectedPet()) {
      return;
    }

    this.feedback.set('');
    this.selectedMedication.set(null);
    this.resetForm();
    this.modalMode.set('create');
  }

  protected editMedication(medication: Medication): void {
    if (!this.canManageSelectedPet()) {
      return;
    }

    this.selectedMedication.set(medication);
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
    this.modalMode.set('edit');
  }

  protected cancelEdit(): void {
    this.closeMedicationModal();
  }

  protected closeMedicationModal(): void {
    this.modalMode.set(null);
    this.selectedMedication.set(null);
    this.resetForm();
  }

  protected viewMedication(medication: Medication): void {
    this.feedback.set('');
    this.selectedMedication.set(medication);
    this.modalMode.set('view');
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

  protected async administerMedication(medication: Medication): Promise<void> {
    if (this.submitting() || !this.canAdministerSelectedPet()) {
      return;
    }

    this.submitting.set(true);
    this.feedback.set('');

    try {
      await firstValueFrom(this.medicationsApiService.administerMedication(medication.id));
      this.administeredMedicationIds.update((medicationIds) => new Set(medicationIds).add(medication.id));
      this.feedback.set(`${medication.name} marcado como administrado.`);
    } catch {
      this.feedback.set('No pudimos registrar la administracion.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected isAdministered(medication: Medication): boolean {
    return this.administeredMedicationIds().has(medication.id);
  }

  protected requestDeleteMedication(medication: Medication): void {
    if (!this.canManageSelectedPet() || medication.isActive) {
      return;
    }

    this.feedback.set('');
    this.medicationPendingDelete.set(medication);
  }

  protected cancelDeleteMedication(): void {
    if (!this.submitting()) {
      this.medicationPendingDelete.set(null);
    }
  }

  protected async confirmDeleteMedication(): Promise<void> {
    const medication = this.medicationPendingDelete();

    if (!medication || medication.isActive || this.submitting() || !this.canManageSelectedPet()) {
      return;
    }

    this.submitting.set(true);
    this.feedback.set('');

    try {
      await firstValueFrom(this.medicationsApiService.deleteMedication(medication));
      this.medications.update((medications) =>
        medications.filter((currentMedication) => currentMedication.id !== medication.id),
      );
      this.medicationPendingDelete.set(null);

      if (this.selectedMedication()?.id === medication.id) {
        this.closeMedicationModal();
      }

      this.feedback.set(`${medication.name} eliminado.`);
    } catch {
      this.feedback.set('No pudimos eliminar el medicamento.');
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
      this.administeredMedicationIds.set(new Set<string>());
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
