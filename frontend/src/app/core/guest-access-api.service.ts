import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Medication } from './medications-api.service';
import { Prescription } from './prescriptions-api.service';
import { environment } from '../../environments/environment';

export interface GuestPet {
  id: string;
  name: string;
  species: string;
  breed: string;
  sex: string;
  color: string;
  birthDate: string | null;
  weightKg: number | null;
  notes: string;
  photoUrl: string | null;
}

export interface GuestAccessResponse {
  pet: GuestPet;
  medications: Medication[];
  prescriptions: Prescription[];
  purpose: 'caregiver' | 'veterinarian';
  expiresAt: string;
}

export interface GuestMedicationPayload {
  name: string;
  dosage: string;
  frequency: string;
  startDate: string;
  endDate: string | null;
  prescribingVet: string;
  instructions: string;
}

export interface GuestPrescriptionPayload {
  title: string;
  prescribedBy: string;
  issuedOn: string;
  medicationId: string | null;
  notes: string;
  file: File;
}

export interface GuestAdministrationResponse {
  id: string;
  medicationId: string;
  administeredAt: string;
  status: string;
  notes: string;
}

@Injectable({ providedIn: 'root' })
export class GuestAccessApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/guest-access`;

  validateAccess(code: string, guestName: string): Observable<GuestAccessResponse> {
    return this.http.post<GuestAccessResponse>(`${this.baseUrl}/validate`, { code, guestName });
  }

  administerMedication(
    medicationId: string,
    code: string,
    guestName: string,
    notes: string,
  ): Observable<GuestAdministrationResponse> {
    return this.http.post<GuestAdministrationResponse>(`${this.baseUrl}/medications/${medicationId}/administer`, {
      code,
      guestName,
      notes,
    });
  }

  createMedication(code: string, guestName: string, payload: GuestMedicationPayload): Observable<Medication> {
    return this.http.post<Medication>(`${this.baseUrl}/medications`, { code, guestName, ...payload });
  }

  createPrescription(code: string, guestName: string, payload: GuestPrescriptionPayload): Observable<Prescription> {
    const formData = new FormData();
    formData.append('code', code);
    formData.append('guestName', guestName);
    formData.append('title', payload.title);
    formData.append('prescribedBy', payload.prescribedBy);
    formData.append('issuedOn', payload.issuedOn);
    formData.append('notes', payload.notes);
    if (payload.medicationId) {
      formData.append('medicationId', payload.medicationId);
    }
    formData.append('file', payload.file);
    return this.http.post<Prescription>(`${this.baseUrl}/prescriptions`, formData);
  }
}
