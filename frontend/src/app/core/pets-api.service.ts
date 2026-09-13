import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, tap, throwError } from 'rxjs';

import { environment } from '../../environments/environment';

export interface Pet {
  id: string;
  ownerId: string;
  name: string;
  species: string;
  breed: string;
  sex: string;
  color: string;
  birthDate: string | null;
  weightKg: number | null;
  notes: string;
  photoUrl: string | null;
  photoPath: string | null;
  isOwner: boolean;
  canUpdatePet: boolean;
  canManageMedications: boolean;
}

export interface PetFormPayload {
  name: string;
  species: string;
  breed: string;
  sex: string;
  color: string;
  birthDate: string;
  weightKg: number | null;
  notes: string;
  photo?: File | null;
  removePhoto?: boolean;
}

interface PetListResponse {
  pets: Pet[];
}

@Injectable({ providedIn: 'root' })
export class PetsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/pets`;
  private petsRequest$?: Observable<Pet[]>;

  listPets(): Observable<Pet[]> {
    this.petsRequest$ ??= this.http.get<PetListResponse>(this.baseUrl).pipe(
      map((response) => response.pets),
      shareReplay({ bufferSize: 1, refCount: false }),
      catchError((error: unknown) => {
        this.petsRequest$ = undefined;
        return throwError(() => error);
      }),
    );

    return this.petsRequest$;
  }

  createPet(payload: PetFormPayload): Observable<Pet> {
    return this.http.post<Pet>(this.baseUrl, this.toFormData(payload)).pipe(tap(() => this.clearCache()));
  }

  updatePet(petId: string, payload: PetFormPayload): Observable<Pet> {
    return this.http.put<Pet>(`${this.baseUrl}/${petId}`, this.toFormData(payload)).pipe(tap(() => this.clearCache()));
  }

  deletePet(petId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${petId}`).pipe(tap(() => this.clearCache()));
  }

  clearCache(): void {
    this.petsRequest$ = undefined;
  }

  private toFormData(payload: PetFormPayload): FormData {
    const formData = new FormData();

    formData.append('name', payload.name);
    formData.append('species', payload.species);

    this.appendOptional(formData, 'breed', payload.breed);
    this.appendOptional(formData, 'sex', payload.sex);
    this.appendOptional(formData, 'color', payload.color);
    this.appendOptional(formData, 'birthDate', payload.birthDate);
    this.appendOptional(formData, 'notes', payload.notes);

    if (payload.weightKg !== null && payload.weightKg > 0) {
      formData.append('weightKg', String(payload.weightKg));
    }

    if (payload.removePhoto) {
      formData.append('removePhoto', 'true');
    }

    if (payload.photo) {
      formData.append('photo', payload.photo);
    }

    return formData;
  }

  private appendOptional(formData: FormData, field: string, value: string): void {
    const normalizedValue = value.trim();

    if (normalizedValue) {
      formData.append(field, normalizedValue);
    }
  }
}
