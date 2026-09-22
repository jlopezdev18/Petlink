import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { CaregiversApiService } from './caregivers-api.service';
import { MedicationsApiService } from './medications-api.service';
import { PetsApiService } from './pets-api.service';
import { PrescriptionsApiService } from './prescriptions-api.service';
import { ProfileApiService } from './profile-api.service';

interface AuthResponse {
  message: string;
  data: {
    access_token?: string;
    refresh_token?: string;
    session?: {
      access_token?: string;
      refresh_token?: string;
    };
  };
}

interface AuthMessageResponse {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly caregiversApiService = inject(CaregiversApiService);
  private readonly medicationsApiService = inject(MedicationsApiService);
  private readonly petsApiService = inject(PetsApiService);
  private readonly prescriptionsApiService = inject(PrescriptionsApiService);
  private readonly profileApiService = inject(ProfileApiService);
  private readonly tokenKey = 'petlink_access_token';
  private readonly refreshTokenKey = 'petlink_refresh_token';
  private readonly accountTypeKey = 'petlink_account_type';

  readonly isAuthenticated = signal(Boolean(this.accessToken));

  get accessToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  get accountType(): string {
    return localStorage.getItem(this.accountTypeKey) ?? 'owner';
  }

  login(email: string, password: string, accountType: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/login`, {
        email,
        password,
        account_type: accountType,
      })
      .pipe(tap((response) => this.storeSession(response, accountType)));
  }

  register(
    fullName: string,
    email: string,
    password: string,
    accountType: string,
  ): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/register`, {
        full_name: fullName,
        email,
        password,
        account_type: accountType,
      })
      .pipe(tap((response) => this.storeSession(response, accountType)));
  }

  requestPasswordRecovery(email: string): Observable<AuthMessageResponse> {
    return this.http.post<AuthMessageResponse>(`${environment.apiUrl}/auth/password-recovery`, {
      email,
    });
  }

  updatePassword(accessToken: string, password: string): Observable<AuthMessageResponse> {
    return this.http.put<AuthMessageResponse>(`${environment.apiUrl}/auth/password`, {
      accessToken,
      password,
    });
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem(this.accountTypeKey);
    this.clearApiCaches();
    this.isAuthenticated.set(false);
  }

  private storeSession(response: AuthResponse, accountType: string): void {
    this.clearApiCaches();

    const accessToken = response.data.access_token ?? response.data.session?.access_token;
    const refreshToken = response.data.refresh_token ?? response.data.session?.refresh_token;

    if (accessToken) {
      localStorage.setItem(this.tokenKey, accessToken);
      localStorage.setItem(this.accountTypeKey, accountType);
      this.isAuthenticated.set(true);
    }

    if (refreshToken) {
      localStorage.setItem(this.refreshTokenKey, refreshToken);
    }
  }

  private clearApiCaches(): void {
    this.caregiversApiService.clearCache();
    this.medicationsApiService.clearCache();
    this.petsApiService.clearCache();
    this.prescriptionsApiService.clearCache();
    this.profileApiService.clearCache();
  }
}
