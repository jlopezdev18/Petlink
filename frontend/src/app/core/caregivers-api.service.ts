import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export type CaregiverPreset = 'viewer' | 'caregiver' | 'veterinarian';

export interface CaregiverAccess {
  id: string;
  petId: string;
  petName: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string | null;
  caregiverId: string;
  caregiverName: string;
  caregiverEmail: string | null;
  preset: CaregiverPreset;
  status: string;
  notes: string;
  isOwner: boolean;
  createdAt: string;
}

export interface CaregiverPayload {
  petId: string;
  caregiverEmail: string;
  preset: CaregiverPreset;
  notes: string;
}

@Injectable({ providedIn: 'root' })
export class CaregiversApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/caregivers`;

  listCaregivers(): Observable<CaregiverAccess[]> {
    return this.http.get<CaregiverAccess[]>(this.baseUrl);
  }

  createCaregiver(payload: CaregiverPayload): Observable<CaregiverAccess> {
    return this.http.post<CaregiverAccess>(this.baseUrl, payload);
  }

  updateCaregiver(caregiverId: string, payload: Pick<CaregiverPayload, 'preset' | 'notes'>): Observable<CaregiverAccess> {
    return this.http.put<CaregiverAccess>(`${this.baseUrl}/${caregiverId}`, payload);
  }

  deleteCaregiver(caregiverId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${caregiverId}`);
  }
}
