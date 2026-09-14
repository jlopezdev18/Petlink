import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { AuthLayout } from '../../layouts/auth-layout/auth-layout';

const passwordsMatch: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const password = control.get('password')?.value;
  const confirmation = control.get('confirmation')?.value;
  return password === confirmation ? null : { passwordMismatch: true };
};

@Component({
  selector: 'app-register-page',
  imports: [
    AuthLayout,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    RouterLink,
  ],
  templateUrl: './register.html',
  styleUrl: '../auth-form.css',
})
export class RegisterPage {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  protected readonly hidePassword = signal(true);
  protected readonly hideConfirmation = signal(true);
  protected readonly feedback = signal('');
  protected readonly submitting = signal(false);
  protected readonly form = this.formBuilder.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmation: ['', Validators.required],
      accountType: ['owner'],
      acceptTerms: [false, Validators.requiredTrue],
    },
    { validators: passwordsMatch },
  );

  protected async submit(): Promise<void> {
    this.feedback.set('');
    this.form.markAllAsTouched();

    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);

    try {
      const account = this.form.getRawValue();
      await firstValueFrom(this.authService.register(account.name, account.email, account.password, account.accountType));

      if (this.authService.accessToken) {
        await this.router.navigate([account.accountType === 'caregiver' ? '/medicamentos' : '/inicio']);
      } else {
        this.feedback.set('Cuenta creada. Revisa tu correo para confirmar el registro antes de iniciar sesion.');
      }
    } catch {
      this.feedback.set('No pudimos crear la cuenta. Revisa los datos e intenta de nuevo.');
    } finally {
      this.submitting.set(false);
    }
  }
}
