import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

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

  listMedications(petId: string): Observable<Medication[]> {
    const params = new HttpParams().set('petId', petId);
    return this.http
      .get<MedicationListResponse>(this.baseUrl, { params })
      .pipe(map((response) => response.medications));
  }

  createMedication(payload: MedicationPayload): Observable<Medication> {
    return this.http.post<Medication>(this.baseUrl, payload);
  }

  updateMedication(medicationId: string, payload: MedicationPayload): Observable<Medication> {
    return this.http.put<Medication>(`${this.baseUrl}/${medicationId}`, payload);
  }
}
