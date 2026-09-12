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
import { Prescription, PrescriptionsApiService } from '../../core/prescriptions-api.service';
import { Sidebar } from '../../shared/sidebar/sidebar';

@Component({
  selector: 'app-prescriptions-page',
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
  templateUrl: './prescriptions.html',
  styleUrl: './prescriptions.css',
})
export class PrescriptionsPage implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly petsApiService = inject(PetsApiService);
  private readonly medicationsApiService = inject(MedicationsApiService);
  private readonly prescriptionsApiService = inject(PrescriptionsApiService);

  protected readonly loading = signal(true);
  protected readonly loadingPrescriptions = signal(false);
  protected readonly submitting = signal(false);
  protected readonly feedback = signal('');
  protected readonly pets = signal<Pet[]>([]);
  protected readonly selectedPetId = signal('');
  protected readonly medications = signal<Medication[]>([]);
  protected readonly prescriptions = signal<Prescription[]>([]);
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly editingPrescription = signal<Prescription | null>(null);

  protected readonly ownerPets = computed(() => this.pets().filter((pet) => pet.isOwner));

  protected readonly form = this.formBuilder.nonNullable.group({
    title: ['', Validators.required],
    prescribedBy: [''],
    issuedOn: ['', Validators.required],
    medicationId: [''],
    notes: [''],
  });

  ngOnInit(): void {
    void this.loadPets();
  }

  protected async changePet(petId: string): Promise<void> {
    this.selectedPetId.set(petId);
    this.cancelEdit();
    await Promise.all([this.loadMedications(), this.loadPrescriptions()]);
  }

  protected selectFile(event: Event): void {
    this.feedback.set('');
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      this.selectedFile.set(null);
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
      this.feedback.set('Selecciona una receta en PDF o imagen.');
      input.value = '';
      this.selectedFile.set(null);
      return;
    }

    this.selectedFile.set(file);
  }

  protected editPrescription(prescription: Prescription): void {
    this.editingPrescription.set(prescription);
    this.selectedFile.set(null);
    this.feedback.set('');
    this.form.reset({
      title: prescription.title,
      prescribedBy: prescription.prescribedBy,
      issuedOn: prescription.issuedOn,
      medicationId: prescription.medicationId ?? '',
      notes: prescription.notes,
    });
  }

  protected cancelEdit(fileInput?: HTMLInputElement): void {
    this.editingPrescription.set(null);
    this.selectedFile.set(null);
    this.resetForm();

    if (fileInput) {
      fileInput.value = '';
    }
  }

  protected async submit(fileInput: HTMLInputElement): Promise<void> {
    this.feedback.set('');
    this.form.markAllAsTouched();

    if (this.form.invalid || this.submitting()) {
      return;
    }

    if (!this.editingPrescription() && !this.selectedFile()) {
      this.feedback.set('Selecciona el archivo de la receta.');
      return;
    }

    const rawPrescription = this.form.getRawValue();
    const payload = {
      petId: this.selectedPetId(),
      medicationId: rawPrescription.medicationId || null,
      title: rawPrescription.title.trim(),
      prescribedBy: rawPrescription.prescribedBy.trim(),
      issuedOn: rawPrescription.issuedOn,
      notes: rawPrescription.notes.trim(),
      file: this.selectedFile(),
    };

    this.submitting.set(true);

    try {
      const editingPrescription = this.editingPrescription();

      if (editingPrescription) {
        const updatedPrescription = await firstValueFrom(
          this.prescriptionsApiService.updatePrescription(editingPrescription.id, payload),
        );
        this.prescriptions.update((prescriptions) =>
          prescriptions.map((prescription) =>
            prescription.id === updatedPrescription.id ? updatedPrescription : prescription,
          ),
        );
        this.feedback.set('Receta actualizada.');
      } else {
        const createdPrescription = await firstValueFrom(this.prescriptionsApiService.createPrescription(payload));
        this.prescriptions.update((prescriptions) => [createdPrescription, ...prescriptions]);
        this.feedback.set('Receta digital subida.');
      }

      this.cancelEdit(fileInput);
    } catch {
      this.feedback.set('No pudimos guardar la receta. Revisa el archivo y los datos.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected async deletePrescription(prescription: Prescription): Promise<void> {
    if (this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.feedback.set('');

    try {
      await firstValueFrom(this.prescriptionsApiService.deletePrescription(prescription.id));
      this.prescriptions.update((prescriptions) =>
        prescriptions.filter((currentPrescription) => currentPrescription.id !== prescription.id),
      );
      this.feedback.set('Receta eliminada.');
    } catch {
      this.feedback.set('No pudimos eliminar la receta.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected fileLabel(prescription: Prescription): string {
    if (prescription.mimeType === 'application/pdf') {
      return 'PDF';
    }

    return 'Imagen';
  }

  private async loadPets(): Promise<void> {
    this.loading.set(true);

    try {
      const pets = await firstValueFrom(this.petsApiService.listPets());
      this.pets.set(pets);
      this.selectedPetId.set(this.ownerPets()[0]?.id ?? '');

      if (this.selectedPetId()) {
        await Promise.all([this.loadMedications(), this.loadPrescriptions()]);
      }
    } catch {
      this.feedback.set('No pudimos cargar recetas.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadMedications(): Promise<void> {
    if (!this.selectedPetId()) {
      this.medications.set([]);
      return;
    }

    try {
      const medications = await firstValueFrom(this.medicationsApiService.listMedications(this.selectedPetId()));
      this.medications.set(medications);
    } catch {
      this.medications.set([]);
    }
  }

  private async loadPrescriptions(): Promise<void> {
    if (!this.selectedPetId()) {
      this.prescriptions.set([]);
      return;
    }

    this.loadingPrescriptions.set(true);

    try {
      const prescriptions = await firstValueFrom(this.prescriptionsApiService.listPrescriptions(this.selectedPetId()));
      this.prescriptions.set(prescriptions);
    } catch {
      this.prescriptions.set([]);
      this.feedback.set('No pudimos cargar recetas para esta mascota.');
    } finally {
      this.loadingPrescriptions.set(false);
    }
  }

  private resetForm(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.form.reset({
      title: '',
      prescribedBy: '',
      issuedOn: today,
      medicationId: '',
      notes: '',
    });
  }
}
