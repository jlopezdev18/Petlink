import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';

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

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenKey = 'petlink_access_token';
  private readonly refreshTokenKey = 'petlink_refresh_token';

  readonly isAuthenticated = signal(Boolean(this.accessToken));

  get accessToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(tap((response) => this.storeSession(response)));
  }

  register(fullName: string, email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/register`, {
        full_name: fullName,
        email,
        password,
      })
      .pipe(tap((response) => this.storeSession(response)));
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    this.isAuthenticated.set(false);
  }

  private storeSession(response: AuthResponse): void {
    const accessToken = response.data.access_token ?? response.data.session?.access_token;
    const refreshToken = response.data.refresh_token ?? response.data.session?.refresh_token;

    if (accessToken) {
      localStorage.setItem(this.tokenKey, accessToken);
      this.isAuthenticated.set(true);
    }

    if (refreshToken) {
      localStorage.setItem(this.refreshTokenKey, refreshToken);
    }
  }
}
