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
  doseIntervalHours: number | null;
  nextDoseAt: string | null;
}

export interface DueMedication extends Medication {
  petName: string;
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
  doseIntervalHours: number | null;
  nextDoseAt: string | null;
}

export interface MedicationAdministration {
  id: string;
  medicationId: string;
  administeredAt: string;
  status: string;
  notes: string;
  nextDoseAt: string | null;
}

export interface MedicationAdministrationHistory {
  id: string;
  medicationId: string;
  scheduledFor: string;
  administeredAt: string | null;
  status: string;
  notes: string;
  createdAt: string;
}

interface MedicationListResponse {
  medications: Medication[];
}

interface DueMedicationListResponse {
  medications: DueMedication[];
}

interface MedicationAdministrationHistoryResponse {
  administrations: MedicationAdministrationHistory[];
}

@Injectable({ providedIn: 'root' })
export class MedicationsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/medications`;
  private readonly medicationsRequests = new Map<string, Observable<Medication[]>>();
  private readonly administrationRequests = new Map<
    string,
    Observable<MedicationAdministrationHistory[]>
  >();

  listMedications(petId: string): Observable<Medication[]> {
    const cachedRequest = this.medicationsRequests.get(petId);

    if (cachedRequest) {
      return cachedRequest;
    }

    const params = new HttpParams().set('petId', petId);
    const request$ = this.http.get<MedicationListResponse>(this.baseUrl, { params }).pipe(
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
    return this.http
      .post<Medication>(this.baseUrl, payload)
      .pipe(tap(() => this.clearCache(payload.petId)));
  }

  listDueMedications(): Observable<DueMedication[]> {
    return this.http
      .get<DueMedicationListResponse>(`${this.baseUrl}/due`)
      .pipe(map((response) => response.medications));
  }

  updateMedication(medicationId: string, payload: MedicationPayload): Observable<Medication> {
    return this.http
      .put<Medication>(`${this.baseUrl}/${medicationId}`, payload)
      .pipe(tap(() => this.clearCache(payload.petId)));
  }

  deleteMedication(medication: Medication): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${medication.id}`).pipe(
      tap(() => {
        this.clearCache(medication.petId);
        this.administrationRequests.delete(medication.id);
      }),
    );
  }

  administerMedication(medication: Medication, notes = ''): Observable<MedicationAdministration> {
    return this.http
      .post<MedicationAdministration>(`${this.baseUrl}/${medication.id}/administer`, { notes })
      .pipe(
        tap(() => {
          this.clearCache(medication.petId);
          this.administrationRequests.delete(medication.id);
        }),
      );
  }

  listMedicationAdministrations(
    medicationId: string,
  ): Observable<MedicationAdministrationHistory[]> {
    const cachedRequest = this.administrationRequests.get(medicationId);

    if (cachedRequest) {
      return cachedRequest;
    }

    const request$ = this.http
      .get<MedicationAdministrationHistoryResponse>(
        `${this.baseUrl}/${medicationId}/administrations`,
      )
      .pipe(
        map((response) => response.administrations),
        shareReplay({ bufferSize: 1, refCount: false }),
        catchError((error: unknown) => {
          this.administrationRequests.delete(medicationId);
          return throwError(() => error);
        }),
      );

    this.administrationRequests.set(medicationId, request$);
    return request$;
  }

  clearCache(petId?: string): void {
    if (petId) {
      this.medicationsRequests.delete(petId);
      return;
    }

    this.medicationsRequests.clear();
    this.administrationRequests.clear();
  }
}
