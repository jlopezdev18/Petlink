import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { GuestAccessApiService, GuestAccessResponse } from '../../core/guest-access-api.service';
import { Medication } from '../../core/medications-api.service';

@Component({
  selector: 'app-guest-access-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './guest-access.html',
  styleUrl: './guest-access.css',
})
export class GuestAccessPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly guestAccessApiService = inject(GuestAccessApiService);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = signal(false);
  protected readonly submittingMedicationId = signal<string | null>(null);
  protected readonly submittingVetForm = signal(false);
  protected readonly feedback = signal('');
  protected readonly access = signal<GuestAccessResponse | null>(null);
  protected readonly administeredMedicationIds = signal<Set<string>>(new Set<string>());
  protected readonly prescriptionFile = signal<File | null>(null);

  protected readonly pet = computed(() => this.access()?.pet ?? null);
  protected readonly medications = computed(() => this.access()?.medications ?? []);
  protected readonly prescriptions = computed(() => this.access()?.prescriptions ?? []);
  protected readonly isVeterinarianAccess = computed(() => this.access()?.purpose === 'veterinarian');

  protected readonly accessForm = this.formBuilder.nonNullable.group({
    code: ['', Validators.required],
    guestName: [''],
  });
  protected readonly notesForm = this.formBuilder.nonNullable.group({
    notes: [''],
  });
  protected readonly medicationForm = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
    dosage: ['', Validators.required],
    frequency: ['', Validators.required],
    startDate: [new Date().toISOString().slice(0, 10), Validators.required],
    endDate: [''],
    prescribingVet: [''],
    instructions: [''],
  });
  protected readonly prescriptionForm = this.formBuilder.nonNullable.group({
    title: ['', Validators.required],
    prescribedBy: [''],
    issuedOn: [new Date().toISOString().slice(0, 10), Validators.required],
    medicationId: [''],
    notes: [''],
  });

  constructor() {
    const code = this.route.snapshot.queryParamMap.get('code');
    if (code) {
      this.accessForm.patchValue({ code });
    }
  }

  protected async validateAccess(): Promise<void> {
    this.feedback.set('');
    this.accessForm.markAllAsTouched();

    if (this.accessForm.invalid || this.loading()) {
      return;
    }

    const rawAccess = this.accessForm.getRawValue();
    this.loading.set(true);

    try {
      const access = await firstValueFrom(
        this.guestAccessApiService.validateAccess(rawAccess.code.trim(), rawAccess.guestName.trim()),
      );
      this.access.set(access);
      this.administeredMedicationIds.set(new Set<string>());
      this.prescriptionFile.set(null);
      this.feedback.set('Acceso validado.');
    } catch (error) {
      this.handleInactiveAccess(error, 'Codigo invalido, vencido o revocado.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async administerMedication(medication: Medication): Promise<void> {
    if (this.submittingMedicationId()) {
      return;
    }

    const rawAccess = this.accessForm.getRawValue();
    const rawNotes = this.notesForm.getRawValue();
    this.submittingMedicationId.set(medication.id);
    this.feedback.set('');

    try {
      await firstValueFrom(
        this.guestAccessApiService.administerMedication(
          medication.id,
          rawAccess.code.trim(),
          rawAccess.guestName.trim(),
          rawNotes.notes.trim(),
        ),
      );
      this.administeredMedicationIds.update((medicationIds) => new Set(medicationIds).add(medication.id));
      this.feedback.set(`${medication.name} marcado como administrado.`);
      this.notesForm.reset({ notes: '' });
    } catch (error) {
      this.handleGuestActionError(error, 'No pudimos registrar esta administracion.');
    } finally {
      this.submittingMedicationId.set(null);
    }
  }

  protected isAdministered(medication: Medication): boolean {
    return this.administeredMedicationIds().has(medication.id);
  }

  protected selectPrescriptionFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.prescriptionFile.set(file);
  }

  protected async createMedication(): Promise<void> {
    this.feedback.set('');
    this.medicationForm.markAllAsTouched();

    if (this.medicationForm.invalid || this.submittingVetForm() || !this.isVeterinarianAccess()) {
      return;
    }

    const rawAccess = this.accessForm.getRawValue();
    const rawMedication = this.medicationForm.getRawValue();
    this.submittingVetForm.set(true);

    try {
      const medication = await firstValueFrom(
        this.guestAccessApiService.createMedication(rawAccess.code.trim(), rawAccess.guestName.trim(), {
          name: rawMedication.name.trim(),
          dosage: rawMedication.dosage.trim(),
          frequency: rawMedication.frequency.trim(),
          startDate: rawMedication.startDate,
          endDate: rawMedication.endDate || null,
          prescribingVet: rawMedication.prescribingVet.trim(),
          instructions: rawMedication.instructions.trim(),
        }),
      );
      this.access.update((access) =>
        access ? { ...access, medications: [medication, ...access.medications] } : access,
      );
      this.medicationForm.reset({
        name: '',
        dosage: '',
        frequency: '',
        startDate: new Date().toISOString().slice(0, 10),
        endDate: '',
        prescribingVet: rawAccess.guestName.trim(),
        instructions: '',
      });
      this.feedback.set('Medicamento creado.');
    } catch (error) {
      this.handleGuestActionError(error, 'No pudimos crear el medicamento.');
    } finally {
      this.submittingVetForm.set(false);
    }
  }

  protected async createPrescription(fileInput: HTMLInputElement): Promise<void> {
    this.feedback.set('');
    this.prescriptionForm.markAllAsTouched();

    if (this.prescriptionForm.invalid || this.submittingVetForm() || !this.isVeterinarianAccess() || !this.prescriptionFile()) {
      this.feedback.set('Completa la receta y selecciona un archivo.');
      return;
    }

    const rawAccess = this.accessForm.getRawValue();
    const rawPrescription = this.prescriptionForm.getRawValue();
    this.submittingVetForm.set(true);

    try {
      const prescription = await firstValueFrom(
        this.guestAccessApiService.createPrescription(rawAccess.code.trim(), rawAccess.guestName.trim(), {
          title: rawPrescription.title.trim(),
          prescribedBy: rawPrescription.prescribedBy.trim(),
          issuedOn: rawPrescription.issuedOn,
          medicationId: rawPrescription.medicationId || null,
          notes: rawPrescription.notes.trim(),
          file: this.prescriptionFile()!,
        }),
      );
      this.access.update((access) =>
        access ? { ...access, prescriptions: [prescription, ...access.prescriptions] } : access,
      );
      this.prescriptionFile.set(null);
      fileInput.value = '';
      this.prescriptionForm.reset({
        title: '',
        prescribedBy: rawAccess.guestName.trim(),
        issuedOn: new Date().toISOString().slice(0, 10),
        medicationId: '',
        notes: '',
      });
      this.feedback.set('Receta subida.');
    } catch (error) {
      this.handleGuestActionError(error, 'No pudimos subir la receta.');
    } finally {
      this.submittingVetForm.set(false);
    }
  }

  private handleGuestActionError(error: unknown, fallbackMessage: string): void {
    if (this.isInactiveAccessError(error)) {
      this.handleInactiveAccess(error, fallbackMessage);
      return;
    }

    this.feedback.set(fallbackMessage);
  }

  private handleInactiveAccess(error: unknown, fallbackMessage: string): void {
    this.clearValidatedAccess();
    this.feedback.set(this.inactiveAccessMessage(error, fallbackMessage));
  }

  private clearValidatedAccess(): void {
    this.access.set(null);
    this.administeredMedicationIds.set(new Set<string>());
    this.prescriptionFile.set(null);
    this.notesForm.reset({ notes: '' });
  }

  private isInactiveAccessError(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 401;
  }

  private inactiveAccessMessage(error: unknown, fallbackMessage: string): string {
    const detail = error instanceof HttpErrorResponse ? String(error.error?.detail ?? '').toLowerCase() : '';

    if (detail.includes('revoked')) {
      return 'Este acceso fue revocado. Solicita un nuevo codigo al propietario.';
    }

    if (detail.includes('expired')) {
      return 'Este acceso ya vencio. Solicita un nuevo codigo al propietario.';
    }

    return fallbackMessage;
  }
}
