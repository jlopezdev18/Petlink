import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, shareReplay, tap, throwError } from 'rxjs';

import { environment } from '../../environments/environment';

export interface Profile {
  id: string;
  email: string | null;
  fullName: string;
  phone: string;
  avatarUrl: string | null;
}

export interface ProfileUpdatePayload {
  fullName: string;
  phone: string;
  avatarUrl: string;
}

@Injectable({ providedIn: 'root' })
export class ProfileApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/profile`;
  private profileRequest$?: Observable<Profile>;

  getProfile(): Observable<Profile> {
    this.profileRequest$ ??= this.http.get<Profile>(this.baseUrl).pipe(
      shareReplay({ bufferSize: 1, refCount: false }),
      catchError((error: unknown) => {
        this.profileRequest$ = undefined;
        return throwError(() => error);
      }),
    );

    return this.profileRequest$;
  }

  updateProfile(payload: ProfileUpdatePayload): Observable<Profile> {
    return this.http.put<Profile>(this.baseUrl, payload).pipe(tap(() => this.clearCache()));
  }

  clearCache(): void {
    this.profileRequest$ = undefined;
  }
}
