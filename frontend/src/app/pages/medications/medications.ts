import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';

import {
  Medication,
  MedicationAdministrationHistory,
  MedicationsApiService,
} from '../../core/medications-api.service';
import { MedicationNotificationsService } from '../../core/medication-notifications.service';
import { Pet, PetsApiService } from '../../core/pets-api.service';
import { EntityModal } from '../../shared/entity-modal/entity-modal';
import { Sidebar } from '../../shared/sidebar/sidebar';

type MedicationModalMode = 'create' | 'edit' | 'view' | null;

function medicationScheduleValidator(control: AbstractControl): ValidationErrors | null {
  const hasInterval = control.get('doseIntervalHours')?.value !== null;
  const hasNextDose = Boolean(control.get('nextDoseAt')?.value);
  return hasInterval === hasNextDose ? null : { scheduleIncomplete: true };
}

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
  private readonly medicationNotificationsService = inject(MedicationNotificationsService);

  protected readonly loading = signal(true);
  protected readonly loadingMedications = signal(false);
  protected readonly loadingAdministrationHistory = signal(false);
  protected readonly submitting = signal(false);
  protected readonly feedback = signal('');
  protected readonly pets = signal<Pet[]>([]);
  protected readonly selectedPetId = signal('');
  protected readonly medications = signal<Medication[]>([]);
  protected readonly administrationHistory = signal<MedicationAdministrationHistory[]>([]);
  protected readonly modalMode = signal<MedicationModalMode>(null);
  protected readonly selectedMedication = signal<Medication | null>(null);
  protected readonly medicationPendingDelete = signal<Medication | null>(null);
  protected readonly administeredMedicationIds = signal<Set<string>>(new Set<string>());
  protected readonly notificationPermission = this.medicationNotificationsService.permission;

  protected readonly selectedPet = computed(
    () => this.pets().find((pet) => pet.id === this.selectedPetId()) ?? null,
  );
  protected readonly canManageSelectedPet = computed(
    () => this.selectedPet()?.canManageMedications ?? false,
  );
  protected readonly canAdministerSelectedPet = computed(() => Boolean(this.selectedPet()));
  protected readonly editingMedication = computed(() =>
    this.modalMode() === 'edit' ? this.selectedMedication() : null,
  );
  protected readonly viewingMedication = computed(() =>
    this.modalMode() === 'view' ? this.selectedMedication() : null,
  );
  protected readonly isMedicationFormOpen = computed(
    () => this.modalMode() === 'create' || this.modalMode() === 'edit',
  );
  protected readonly modalTitle = computed(() =>
    this.editingMedication() ? 'Editar medicamento' : 'Agregar medicamento',
  );

  protected readonly form = this.formBuilder.nonNullable.group(
    {
      name: ['', Validators.required],
      dosage: ['', Validators.required],
      frequency: ['', Validators.required],
      startDate: ['', Validators.required],
      endDate: [''],
      prescribingVet: [''],
      instructions: [''],
      doseIntervalHours: this.formBuilder.control<number | null>(null, [
        Validators.min(1),
        Validators.max(8760),
      ]),
      nextDoseAt: [''],
    },
    { validators: medicationScheduleValidator },
  );

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
      doseIntervalHours: medication.doseIntervalHours,
      nextDoseAt: this.toDateTimeLocal(medication.nextDoseAt),
    });
    this.modalMode.set('edit');
  }

  protected cancelEdit(): void {
    this.closeMedicationModal();
  }

  protected closeMedicationModal(): void {
    this.modalMode.set(null);
    this.selectedMedication.set(null);
    this.administrationHistory.set([]);
    this.loadingAdministrationHistory.set(false);
    this.resetForm();
  }

  protected viewMedication(medication: Medication): void {
    this.feedback.set('');
    this.selectedMedication.set(medication);
    this.modalMode.set('view');
    void this.loadAdministrationHistory(medication.id);
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
      doseIntervalHours: rawMedication.doseIntervalHours,
      nextDoseAt: this.toIsoDateTime(rawMedication.nextDoseAt),
    };

    this.submitting.set(true);

    try {
      if (editingMedication) {
        const updatedMedication = await firstValueFrom(
          this.medicationsApiService.updateMedication(editingMedication.id, payload),
        );
        this.medications.update((medications) =>
          medications.map((medication) =>
            medication.id === updatedMedication.id ? updatedMedication : medication,
          ),
        );
        this.feedback.set('Medicamento actualizado.');
      } else {
        const createdMedication = await firstValueFrom(
          this.medicationsApiService.createMedication(payload),
        );
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
          doseIntervalHours: medication.doseIntervalHours,
          nextDoseAt: medication.nextDoseAt,
        }),
      );
      this.medications.update((medications) =>
        medications.map((currentMedication) =>
          currentMedication.id === updatedMedication.id ? updatedMedication : currentMedication,
        ),
      );
      this.feedback.set(
        updatedMedication.isActive ? 'Tratamiento reactivado.' : 'Tratamiento desactivado.',
      );
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
      const administration = await firstValueFrom(
        this.medicationsApiService.administerMedication(medication),
      );
      this.medications.update((medications) =>
        medications.map((currentMedication) =>
          currentMedication.id === medication.id
            ? { ...currentMedication, nextDoseAt: administration.nextDoseAt }
            : currentMedication,
        ),
      );
      this.administeredMedicationIds.update((medicationIds) =>
        new Set(medicationIds).add(medication.id),
      );
      if (this.viewingMedication()?.id === medication.id) {
        await this.loadAdministrationHistory(medication.id);
      }
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

  protected isDoseDue(medication: Medication): boolean {
    return (
      medication.isActive &&
      Boolean(medication.nextDoseAt) &&
      new Date(medication.nextDoseAt!).getTime() <= Date.now()
    );
  }

  protected doseStatusLabel(medication: Medication): string {
    if (!medication.nextDoseAt || !medication.doseIntervalHours) {
      return 'Sin programar';
    }

    return this.isDoseDue(medication) ? 'Dosis pendiente' : 'Programada';
  }

  protected async enableNotifications(): Promise<void> {
    const permission = await this.medicationNotificationsService.requestPermission();

    if (permission === 'granted') {
      this.feedback.set('Avisos de medicamentos activados.');
    } else if (permission === 'denied') {
      this.feedback.set('El navegador bloqueo los avisos de medicamentos.');
    } else if (permission === 'unsupported') {
      this.feedback.set('Este navegador no admite notificaciones.');
    }
  }

  protected formatDateTime(value: string | null): string {
    if (!value) {
      return 'Sin registrar';
    }

    return new Intl.DateTimeFormat('es-HN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  protected statusLabel(status: string): string {
    const labels: Record<string, string> = {
      given: 'Administrado',
      missed: 'Perdido',
      scheduled: 'Programado',
      skipped: 'Omitido',
    };

    return labels[status] ?? status;
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
      const medications = await firstValueFrom(
        this.medicationsApiService.listMedications(this.selectedPetId()),
      );
      this.medications.set(medications);
      this.administeredMedicationIds.set(new Set<string>());
      this.administrationHistory.set([]);
    } catch {
      this.medications.set([]);
      this.feedback.set('No pudimos cargar medicamentos para esta mascota.');
    } finally {
      this.loadingMedications.set(false);
    }
  }

  private async loadAdministrationHistory(medicationId: string): Promise<void> {
    this.loadingAdministrationHistory.set(true);
    this.administrationHistory.set([]);

    try {
      const administrations = await firstValueFrom(
        this.medicationsApiService.listMedicationAdministrations(medicationId),
      );

      if (this.selectedMedication()?.id === medicationId) {
        this.administrationHistory.set(administrations);
      }
    } catch {
      this.feedback.set('No pudimos cargar el historial de administraciones.');
    } finally {
      if (this.selectedMedication()?.id === medicationId) {
        this.loadingAdministrationHistory.set(false);
      }
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
      doseIntervalHours: null,
      nextDoseAt: '',
    });
  }

  private toIsoDateTime(value: string): string | null {
    return value ? new Date(value).toISOString() : null;
  }

  private toDateTimeLocal(value: string | null): string {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 16);
  }
}
