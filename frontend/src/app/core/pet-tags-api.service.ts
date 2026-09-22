import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';

export type SightingReportStatus = 'pending' | 'reviewed' | 'dismissed';

export interface PetQrTag {
  id: string;
  petId: string;
  token: string;
  isLost: boolean;
  lostMessage: string;
  showOwnerPhone: boolean;
  pendingReportCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PetQrTagSettings {
  isLost: boolean;
  lostMessage: string;
  showOwnerPhone: boolean;
}

export interface PublicQrPet {
  name: string;
  species: string;
  breed: string;
  sex: string;
  color: string;
  photoUrl: string | null;
}

export interface PublicPetQrTag {
  pet: PublicQrPet;
  isLost: boolean;
  lostMessage: string;
  ownerPhone: string | null;
}

export interface SightingReportPayload {
  reporterName: string;
  reporterPhone: string;
  message: string;
  locationDescription: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
}

export interface SightingReport {
  id: string;
  petId: string;
  status: SightingReportStatus;
  reporterName: string;
  reporterPhone: string;
  message: string;
  locationDescription: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  createdAt: string;
  updatedAt: string;
}

interface SightingReportListResponse {
  reports: SightingReport[];
}

@Injectable({ providedIn: 'root' })
export class PetTagsApiService {
  private readonly http = inject(HttpClient);
  private readonly petsUrl = `${environment.apiUrl}/pets`;
  private readonly publicUrl = `${environment.apiUrl}/pet-tags`;

  getOrCreateTag(petId: string): Observable<PetQrTag> {
    return this.http.post<PetQrTag>(`${this.petsUrl}/${petId}/qr-tag`, {});
  }

  updateTag(petId: string, settings: PetQrTagSettings): Observable<PetQrTag> {
    return this.http.put<PetQrTag>(`${this.petsUrl}/${petId}/qr-tag`, settings);
  }

  listReports(petId: string, limit = 50, offset = 0): Observable<SightingReport[]> {
    const params = new HttpParams().set('limit', limit).set('offset', offset);
    return this.http
      .get<SightingReportListResponse>(`${this.petsUrl}/${petId}/sighting-reports`, { params })
      .pipe(map((response) => response.reports));
  }

  updateReportStatus(
    petId: string,
    reportId: string,
    status: SightingReportStatus,
  ): Observable<SightingReport> {
    return this.http.patch<SightingReport>(
      `${this.petsUrl}/${petId}/sighting-reports/${reportId}`,
      { status },
    );
  }

  getPublicTag(token: string): Observable<PublicPetQrTag> {
    return this.http.get<PublicPetQrTag>(`${this.publicUrl}/${encodeURIComponent(token)}`);
  }

  createReport(token: string, payload: SightingReportPayload): Observable<SightingReport> {
    return this.http.post<SightingReport>(
      `${this.publicUrl}/${encodeURIComponent(token)}/reports`,
      payload,
    );
  }
}
