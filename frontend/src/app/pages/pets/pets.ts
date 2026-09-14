import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { Pet, PetFormPayload, PetsApiService } from '../../core/pets-api.service';
import { EntityModal } from '../../shared/entity-modal/entity-modal';
import { Sidebar } from '../../shared/sidebar/sidebar';

type PetModalMode = 'create' | 'edit' | 'view' | null;

interface PetFormValue {
  name: string;
  species: string;
  breed: string;
  sex: string;
  color: string;
  birthDate: string;
  weightKg: number;
  notes: string;
}

interface PetFormSnapshot {
  formValue: PetFormValue;
  photoUrl: string | null;
}

const DEFAULT_PET_FORM_VALUE: PetFormValue = {
  name: '',
  species: 'Perro',
  breed: '',
  sex: '',
  color: '',
  birthDate: '',
  weightKg: 0,
  notes: '',
};

const createDefaultPetFormValue = (): PetFormValue => ({ ...DEFAULT_PET_FORM_VALUE });

@Component({
  selector: 'app-pets',
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
  templateUrl: './pets.html',
  styleUrl: './pets.css',
})
export class Pets implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly petsApiService = inject(PetsApiService);

  protected readonly modalMode = signal<PetModalMode>(null);
  protected readonly feedback = signal('');
  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly photoPreview = signal<string | null>(null);
  protected readonly selectedPhoto = signal<File | null>(null);
  protected readonly loadingPhotoIds = signal<Set<string>>(new Set());
  protected readonly removePhotoRequested = signal(false);
  protected readonly editingPetId = signal<string | null>(null);
  protected readonly selectedPet = signal<Pet | null>(null);
  protected readonly petPendingDelete = signal<Pet | null>(null);
  protected readonly pets = signal<Pet[]>([]);
  private readonly initialFormSnapshot = signal<PetFormSnapshot>({
    formValue: createDefaultPetFormValue(),
    photoUrl: null,
  });

  protected readonly petCountLabel = computed(() => {
    const total = this.pets().length;
    return total === 1 ? '1 mascota registrada' : `${total} mascotas registradas`;
  });
  protected readonly isEditing = computed(() => this.modalMode() === 'edit');
  protected readonly isPetFormOpen = computed(() => this.modalMode() === 'create' || this.modalMode() === 'edit');
  protected readonly viewingPet = computed(() => (this.modalMode() === 'view' ? this.selectedPet() : null));
  protected readonly isOwnerMode = computed(() => this.authService.accountType === 'owner');
  protected readonly formTitle = computed(() => (this.isEditing() ? 'Editar mascota' : 'Agregar mascota'));
  protected readonly saveButtonLabel = computed(() =>
    this.isEditing() ? 'Guardar cambios' : 'Guardar mascota',
  );

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    species: [DEFAULT_PET_FORM_VALUE.species, Validators.required],
    breed: [''],
    sex: [''],
    color: [''],
    birthDate: [''],
    weightKg: [0, [Validators.min(0)]],
    notes: [''],
  });

  ngOnInit(): void {
    void this.loadPets();
  }

  protected openCreateForm(): void {
    if (!this.isOwnerMode()) {
      return;
    }

    this.feedback.set('');
    this.selectedPet.set(null);
    this.editingPetId.set(null);
    this.resetForm();
    this.modalMode.set('create');
  }

  protected cancelForm(): void {
    this.closeModal();
  }

  protected closeModal(): void {
    this.modalMode.set(null);
    this.selectedPet.set(null);
    this.editingPetId.set(null);
    this.resetForm();
  }

  protected editPet(pet: Pet): void {
    if (!this.isOwnerMode() || !pet.canUpdatePet) {
      return;
    }

    this.feedback.set('');
    this.selectedPet.set(pet);
    this.editingPetId.set(pet.id);
    this.selectedPhoto.set(null);
    this.removePhotoRequested.set(false);
    const formValue = this.toPetFormValue(pet);
    this.form.reset(formValue);
    this.initialFormSnapshot.set({
      formValue: this.normalizeFormValue(formValue),
      photoUrl: pet.photoUrl,
    });
    this.photoPreview.set(pet.photoUrl);
    this.modalMode.set('edit');
  }

  protected viewPet(pet: Pet): void {
    this.feedback.set('');
    this.selectedPet.set(pet);
    this.editingPetId.set(null);
    this.modalMode.set('view');
  }

  protected hasNewChanges(): boolean {
    const initialSnapshot = this.initialFormSnapshot();
    const photoChanged =
      this.selectedPhoto() !== null ||
      this.removePhotoRequested() ||
      this.photoPreview() !== initialSnapshot.photoUrl;

    return !this.areFormValuesEqual(this.getNormalizedFormValue(), initialSnapshot.formValue) || photoChanged;
  }

  protected selectPhoto(event: Event): void {
    this.feedback.set('');

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.feedback.set('Selecciona un archivo de imagen para la foto de tu mascota.');
      input.value = '';
      return;
    }

    this.selectedPhoto.set(file);
    this.removePhotoRequested.set(false);

    const reader = new FileReader();
    reader.onload = () => {
      this.photoPreview.set(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.readAsDataURL(file);
  }

  protected removePhoto(photoInput?: HTMLInputElement): void {
    this.selectedPhoto.set(null);
    this.photoPreview.set(null);

    if (this.isEditing()) {
      this.removePhotoRequested.set(true);
    }

    if (photoInput) {
      photoInput.value = '';
    }
  }

  protected requestDelete(pet: Pet): void {
    if (!this.isOwnerMode() || !pet.isOwner) {
      return;
    }

    this.petPendingDelete.set(pet);
  }

  protected isPhotoLoading(pet: Pet): boolean {
    return this.loadingPhotoIds().has(pet.id);
  }

  protected finishPhotoLoad(pet: Pet): void {
    this.loadingPhotoIds.update((loadingPhotoIds) => {
      const nextLoadingPhotoIds = new Set(loadingPhotoIds);
      nextLoadingPhotoIds.delete(pet.id);
      return nextLoadingPhotoIds;
    });
  }

  protected cancelDelete(): void {
    if (!this.deleting()) {
      this.petPendingDelete.set(null);
    }
  }

  protected async confirmDelete(): Promise<void> {
    const pet = this.petPendingDelete();

    if (!pet || this.deleting()) {
      return;
    }

    this.deleting.set(true);

    try {
      await firstValueFrom(this.petsApiService.deletePet(pet.id));
      this.pets.update((pets) => pets.filter((currentPet) => currentPet.id !== pet.id));
      this.finishPhotoLoad(pet);
      this.petPendingDelete.set(null);

      if (this.selectedPet()?.id === pet.id || this.editingPetId() === pet.id) {
        this.closeModal();
      }

      this.feedback.set(`${pet.name} se elimino de Mascotas.`);
    } catch {
      this.feedback.set(`No pudimos eliminar a ${pet.name}. Intenta de nuevo.`);
    } finally {
      this.deleting.set(false);
    }
  }

  protected async submit(): Promise<void> {
    this.feedback.set('');
    this.form.markAllAsTouched();

    if (this.form.invalid || this.submitting() || !this.hasNewChanges() || !this.isOwnerMode()) {
      return;
    }

    const rawPet = this.form.getRawValue();
    const editingPetId = this.editingPetId();
    const payload: PetFormPayload = {
      name: rawPet.name.trim(),
      species: rawPet.species,
      breed: rawPet.breed.trim(),
      sex: rawPet.sex,
      color: rawPet.color.trim(),
      birthDate: rawPet.birthDate,
      weightKg: rawPet.weightKg > 0 ? rawPet.weightKg : null,
      notes: rawPet.notes.trim(),
      photo: this.selectedPhoto(),
      removePhoto: this.removePhotoRequested(),
    };

    this.submitting.set(true);

    try {
      if (editingPetId) {
        const pet = await firstValueFrom(this.petsApiService.updatePet(editingPetId, payload));
        this.pets.update((pets) =>
          pets.map((currentPet) => (currentPet.id === editingPetId ? pet : currentPet)),
        );
        this.trackPhotoLoad(pet);
        this.feedback.set(`${pet.name} se actualizo correctamente.`);
      } else {
        const pet = await firstValueFrom(this.petsApiService.createPet(payload));
        this.pets.update((pets) => [pet, ...pets]);
        this.trackPhotoLoad(pet);
        this.feedback.set(`${pet.name} se agrego a Mascotas.`);
      }

      this.closeModal();
    } catch {
      this.feedback.set('No pudimos guardar la mascota. Revisa los datos e intenta de nuevo.');
    } finally {
      this.submitting.set(false);
    }
  }

  private async loadPets(): Promise<void> {
    this.loading.set(true);

    try {
      const pets = await firstValueFrom(this.petsApiService.listPets());
      this.pets.set(pets);
      this.loadingPhotoIds.set(new Set(pets.filter((pet) => pet.photoUrl).map((pet) => pet.id)));
    } catch {
      this.feedback.set('No pudimos cargar tus mascotas. Inicia sesion de nuevo si el token expiro.');
    } finally {
      this.loading.set(false);
    }
  }

  private resetForm(): void {
    const formValue = createDefaultPetFormValue();
    this.form.reset(formValue);
    this.selectedPhoto.set(null);
    this.photoPreview.set(null);
    this.removePhotoRequested.set(false);
    this.initialFormSnapshot.set({
      formValue: this.normalizeFormValue(formValue),
      photoUrl: null,
    });
  }

  private toPetFormValue(pet: Pet): PetFormValue {
    return {
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      sex: pet.sex,
      color: pet.color,
      birthDate: pet.birthDate ?? '',
      weightKg: pet.weightKg ?? 0,
      notes: pet.notes,
    };
  }

  private getNormalizedFormValue(): PetFormValue {
    const rawPet = this.form.getRawValue();

    return this.normalizeFormValue({
      name: rawPet.name,
      species: rawPet.species,
      breed: rawPet.breed,
      sex: rawPet.sex,
      color: rawPet.color,
      birthDate: rawPet.birthDate,
      weightKg: rawPet.weightKg,
      notes: rawPet.notes,
    });
  }

  private normalizeFormValue(formValue: PetFormValue): PetFormValue {
    return {
      name: formValue.name.trim(),
      species: formValue.species,
      breed: formValue.breed.trim(),
      sex: formValue.sex,
      color: formValue.color.trim(),
      birthDate: formValue.birthDate,
      weightKg: this.normalizeWeight(formValue.weightKg),
      notes: formValue.notes.trim(),
    };
  }

  private normalizeWeight(weightKg: number | null | undefined): number {
    return typeof weightKg === 'number' && Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 0;
  }

  private areFormValuesEqual(firstValue: PetFormValue, secondValue: PetFormValue): boolean {
    return (
      firstValue.name === secondValue.name &&
      firstValue.species === secondValue.species &&
      firstValue.breed === secondValue.breed &&
      firstValue.sex === secondValue.sex &&
      firstValue.color === secondValue.color &&
      firstValue.birthDate === secondValue.birthDate &&
      firstValue.weightKg === secondValue.weightKg &&
      firstValue.notes === secondValue.notes
    );
  }

  private trackPhotoLoad(pet: Pet): void {
    this.loadingPhotoIds.update((loadingPhotoIds) => {
      const nextLoadingPhotoIds = new Set(loadingPhotoIds);

      if (pet.photoUrl) {
        nextLoadingPhotoIds.add(pet.id);
      } else {
        nextLoadingPhotoIds.delete(pet.id);
      }

      return nextLoadingPhotoIds;
    });
  }
}
