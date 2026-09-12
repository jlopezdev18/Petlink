import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

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

  getProfile(): Observable<Profile> {
    return this.http.get<Profile>(this.baseUrl);
  }

  updateProfile(payload: ProfileUpdatePayload): Observable<Profile> {
    return this.http.put<Profile>(this.baseUrl, payload);
  }
}
