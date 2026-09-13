import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, tap, throwError } from 'rxjs';

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
  private readonly prescriptionsRequests = new Map<string, Observable<Prescription[]>>();

  listPrescriptions(petId: string): Observable<Prescription[]> {
    const cachedRequest = this.prescriptionsRequests.get(petId);

    if (cachedRequest) {
      return cachedRequest;
    }

    const params = new HttpParams().set('petId', petId);
    const request$ = this.http
      .get<PrescriptionListResponse>(this.baseUrl, { params })
      .pipe(
        map((response) => response.prescriptions),
        shareReplay({ bufferSize: 1, refCount: false }),
        catchError((error: unknown) => {
          this.prescriptionsRequests.delete(petId);
          return throwError(() => error);
        }),
      );

    this.prescriptionsRequests.set(petId, request$);
    return request$;
  }

  createPrescription(payload: PrescriptionPayload): Observable<Prescription> {
    return this.http
      .post<Prescription>(this.baseUrl, this.toFormData(payload))
      .pipe(tap(() => this.clearCache(payload.petId)));
  }

  updatePrescription(prescriptionId: string, payload: PrescriptionPayload): Observable<Prescription> {
    return this.http
      .put<Prescription>(`${this.baseUrl}/${prescriptionId}`, this.toFormData(payload))
      .pipe(tap(() => this.clearCache(payload.petId)));
  }

  deletePrescription(prescriptionId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${prescriptionId}`).pipe(tap(() => this.clearCache()));
  }

  clearCache(petId?: string): void {
    if (petId) {
      this.prescriptionsRequests.delete(petId);
      return;
    }

    this.prescriptionsRequests.clear();
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
