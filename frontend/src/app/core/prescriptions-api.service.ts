import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';

export interface Prescription {
  id: string;
  petId: string;
  ownerId: string;
  medicationId: string | null;
  medicationName: string | null;
  title: string;
  prescribedBy: string;
  issuedOn: string;
  notes: string;
  fileUrl: string | null;
  filePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
}

export interface PrescriptionPayload {
  petId: string;
  medicationId: string | null;
  title: string;
  prescribedBy: string;
  issuedOn: string;
  notes: string;
  file?: File | null;
}

interface PrescriptionListResponse {
  prescriptions: Prescription[];
}

@Injectable({ providedIn: 'root' })
export class PrescriptionsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/prescriptions`;

  listPrescriptions(petId: string): Observable<Prescription[]> {
    const params = new HttpParams().set('petId', petId);
    return this.http
      .get<PrescriptionListResponse>(this.baseUrl, { params })
      .pipe(map((response) => response.prescriptions));
  }

  createPrescription(payload: PrescriptionPayload): Observable<Prescription> {
    return this.http.post<Prescription>(this.baseUrl, this.toFormData(payload));
  }

  updatePrescription(prescriptionId: string, payload: PrescriptionPayload): Observable<Prescription> {
    return this.http.put<Prescription>(`${this.baseUrl}/${prescriptionId}`, this.toFormData(payload));
  }

  deletePrescription(prescriptionId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${prescriptionId}`);
  }

  private toFormData(payload: PrescriptionPayload): FormData {
    const formData = new FormData();
    formData.append('petId', payload.petId);
    formData.append('title', payload.title);
    formData.append('issuedOn', payload.issuedOn);
    formData.append('prescribedBy', payload.prescribedBy);
    formData.append('notes', payload.notes);

    if (payload.medicationId) {
      formData.append('medicationId', payload.medicationId);
    }

    if (payload.file) {
      formData.append('file', payload.file);
    }

    return formData;
  }
}
