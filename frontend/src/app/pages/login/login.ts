import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { AuthLayout } from '../../layouts/auth-layout/auth-layout';
import { EntityModal } from '../../shared/entity-modal/entity-modal';

@Component({
  selector: 'app-login-page',
  imports: [
    AuthLayout,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    RouterLink,
    EntityModal,
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
  protected readonly recoveryOpen = signal(false);
  protected readonly recoverySubmitting = signal(false);
  protected readonly recoverySent = signal(false);
  protected readonly recoveryFeedback = signal('');
  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    accountType: ['owner'],
  });
  protected readonly recoveryForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
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
      await firstValueFrom(
        this.authService.login(credentials.email, credentials.password, credentials.accountType),
      );
      await this.router.navigate([
        credentials.accountType === 'caregiver' ? '/medicamentos' : '/inicio',
      ]);
    } catch {
      this.feedback.set('No pudimos iniciar sesion. Revisa tu correo y contrasena.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected openRecovery(): void {
    this.recoveryForm.reset({ email: this.form.controls.email.value });
    this.recoveryFeedback.set('');
    this.recoverySent.set(false);
    this.recoveryOpen.set(true);
  }

  protected closeRecovery(): void {
    if (this.recoverySubmitting()) {
      return;
    }

    this.recoveryOpen.set(false);
    this.recoveryFeedback.set('');
  }

  protected async submitRecovery(): Promise<void> {
    this.recoveryFeedback.set('');
    this.recoveryForm.markAllAsTouched();

    if (this.recoveryForm.invalid || this.recoverySubmitting()) {
      return;
    }

    this.recoverySubmitting.set(true);

    try {
      await firstValueFrom(
        this.authService.requestPasswordRecovery(
          this.recoveryForm.getRawValue().email.trim().toLowerCase(),
        ),
      );
      this.recoverySent.set(true);
    } catch {
      this.recoveryFeedback.set('No pudimos enviar el correo. Intenta de nuevo mas tarde.');
    } finally {
      this.recoverySubmitting.set(false);
    }
  }
}
