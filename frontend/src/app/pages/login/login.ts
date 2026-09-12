import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { AuthLayout } from '../../layouts/auth-layout/auth-layout';

@Component({
  selector: 'app-login-page',
  imports: [
    AuthLayout,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    RouterLink,
  ],
  templateUrl: './login.html',
  styleUrl: '../auth-form.css',
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  protected readonly hidePassword = signal(true);
  protected readonly feedback = signal('');
  protected readonly submitting = signal(false);
  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    remember: [false],
  });

  protected async submit(): Promise<void> {
    this.feedback.set('');
    this.form.markAllAsTouched();

    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);

    try {
      const credentials = this.form.getRawValue();
      await firstValueFrom(this.authService.login(credentials.email, credentials.password));
      await this.router.navigate(['/inicio']);
    } catch {
      this.feedback.set('No pudimos iniciar sesion. Revisa tu correo y contrasena.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected showRecoveryMessage(): void {
    this.feedback.set('La recuperacion de contrasena se habilitara al conectar Supabase.');
  }
}
