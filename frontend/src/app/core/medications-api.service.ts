import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, tap, throwError } from 'rxjs';

import { environment } from '../../environments/environment';

export interface Medication {
  id: string;
  petId: string;
  name: string;
  dosage: string;
  frequency: string;
  startDate: string;
  endDate: string | null;
  prescribingVet: string;
  instructions: string;
  isActive: boolean;
}

export interface MedicationPayload {
  petId: string;
  name: string;
  dosage: string;
  frequency: string;
  startDate: string;
  endDate: string | null;
  prescribingVet: string;
  instructions: string;
  isActive: boolean;
}

interface MedicationListResponse {
  medications: Medication[];
}

@Injectable({ providedIn: 'root' })
export class MedicationsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/medications`;
  private readonly medicationsRequests = new Map<string, Observable<Medication[]>>();

  listMedications(petId: string): Observable<Medication[]> {
    const cachedRequest = this.medicationsRequests.get(petId);

    if (cachedRequest) {
      return cachedRequest;
    }

    const params = new HttpParams().set('petId', petId);
    const request$ = this.http
      .get<MedicationListResponse>(this.baseUrl, { params })
      .pipe(
        map((response) => response.medications),
        shareReplay({ bufferSize: 1, refCount: false }),
        catchError((error: unknown) => {
          this.medicationsRequests.delete(petId);
          return throwError(() => error);
        }),
      );

    this.medicationsRequests.set(petId, request$);
    return request$;
  }

  createMedication(payload: MedicationPayload): Observable<Medication> {
    return this.http.post<Medication>(this.baseUrl, payload).pipe(tap(() => this.clearCache(payload.petId)));
  }

  updateMedication(medicationId: string, payload: MedicationPayload): Observable<Medication> {
    return this.http
      .put<Medication>(`${this.baseUrl}/${medicationId}`, payload)
      .pipe(tap(() => this.clearCache(payload.petId)));
  }

  clearCache(petId?: string): void {
    if (petId) {
      this.medicationsRequests.delete(petId);
      return;
    }

    this.medicationsRequests.clear();
  }
}
