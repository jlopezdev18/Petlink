import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, shareReplay, tap, throwError } from 'rxjs';

import { environment } from '../../environments/environment';

export type CaregiverPreset = 'caregiver';

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
  notes: string;
}

export interface AccessCode {
  id: string;
  petId: string;
  petName: string;
  purpose: 'caregiver' | 'veterinarian';
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  isActive: boolean;
}

export interface CreatedAccessCode extends AccessCode {
  code: string;
}

@Injectable({ providedIn: 'root' })
export class CaregiversApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/caregivers`;
  private caregiversRequest$?: Observable<CaregiverAccess[]>;
  private accessCodesRequest$?: Observable<AccessCode[]>;

  listCaregivers(): Observable<CaregiverAccess[]> {
    this.caregiversRequest$ ??= this.http.get<CaregiverAccess[]>(this.baseUrl).pipe(
      shareReplay({ bufferSize: 1, refCount: false }),
      catchError((error: unknown) => {
        this.caregiversRequest$ = undefined;
        return throwError(() => error);
      }),
    );

    return this.caregiversRequest$;
  }

  refreshCaregivers(): Observable<CaregiverAccess[]> {
    this.caregiversRequest$ = undefined;
    return this.listCaregivers();
  }

  createCaregiver(payload: CaregiverPayload): Observable<CaregiverAccess> {
    return this.http
      .post<CaregiverAccess>(this.baseUrl, payload)
      .pipe(tap(() => this.clearCache()));
  }

  updateCaregiver(
    caregiverId: string,
    payload: Pick<CaregiverPayload, 'notes'>,
  ): Observable<CaregiverAccess> {
    return this.http
      .put<CaregiverAccess>(`${this.baseUrl}/${caregiverId}`, payload)
      .pipe(tap(() => this.clearCache()));
  }

  deleteCaregiver(caregiverId: string): Observable<void> {
    return this.http
      .delete<void>(`${this.baseUrl}/${caregiverId}`)
      .pipe(tap(() => this.clearCache()));
  }

  listAccessCodes(): Observable<AccessCode[]> {
    this.accessCodesRequest$ ??= this.http.get<AccessCode[]>(`${this.baseUrl}/access-codes`).pipe(
      shareReplay({ bufferSize: 1, refCount: false }),
      catchError((error: unknown) => {
        this.accessCodesRequest$ = undefined;
        return throwError(() => error);
      }),
    );

    return this.accessCodesRequest$;
  }

  createAccessCode(
    petId: string,
    expiresAt: string,
    purpose: AccessCode['purpose'],
  ): Observable<CreatedAccessCode> {
    return this.http
      .post<CreatedAccessCode>(`${this.baseUrl}/access-codes`, { petId, expiresAt, purpose })
      .pipe(tap(() => this.clearAccessCodeCache()));
  }

  revokeAccessCode(accessCodeId: string): Observable<void> {
    return this.http
      .delete<void>(`${this.baseUrl}/access-codes/${accessCodeId}`)
      .pipe(tap(() => this.clearAccessCodeCache()));
  }

  clearCache(): void {
    this.caregiversRequest$ = undefined;
    this.clearAccessCodeCache();
  }

  private clearAccessCodeCache(): void {
    this.accessCodesRequest$ = undefined;
  }
}
