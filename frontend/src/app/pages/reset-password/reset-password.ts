import { Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { AuthLayout } from '../../layouts/auth-layout/auth-layout';

const passwordsMatch: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const password = control.get('password')?.value;
  const confirmation = control.get('confirmation')?.value;
  return password === confirmation ? null : { passwordMismatch: true };
};

@Component({
  selector: 'app-reset-password-page',
  imports: [
    AuthLayout,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    RouterLink,
  ],
  templateUrl: './reset-password.html',
  styleUrls: ['../auth-form.css', './reset-password.css'],
})
export class ResetPasswordPage {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly recoveryToken = signal(
    this.route.snapshot.queryParamMap.get('access_token') ?? '',
  );
  private readonly recoveryType = this.route.snapshot.queryParamMap.get('type');

  protected readonly hidePassword = signal(true);
  protected readonly hideConfirmation = signal(true);
  protected readonly submitting = signal(false);
  protected readonly success = signal(false);
  protected readonly feedback = signal('');
  protected readonly hasValidRecoveryToken = computed(
    () => Boolean(this.recoveryToken()) && this.recoveryType === 'recovery',
  );
  protected readonly form = this.formBuilder.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmation: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  constructor() {
    if (this.recoveryToken()) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {},
        replaceUrl: true,
      });
    }
  }

  protected async submit(): Promise<void> {
    this.feedback.set('');
    this.form.markAllAsTouched();

    if (this.form.invalid || this.submitting() || !this.hasValidRecoveryToken()) {
      return;
    }

    this.submitting.set(true);

    try {
      await firstValueFrom(
        this.authService.updatePassword(this.recoveryToken(), this.form.getRawValue().password),
      );
      this.recoveryToken.set('');
      this.success.set(true);
    } catch {
      this.feedback.set(
        'El enlace vencio o ya fue utilizado. Solicita uno nuevo desde el inicio de sesion.',
      );
    } finally {
      this.submitting.set(false);
    }
  }
}
