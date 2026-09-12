import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';

import { Profile, ProfileApiService } from '../../core/profile-api.service';
import { Sidebar } from '../../shared/sidebar/sidebar';

@Component({
  selector: 'app-profile-page',
  imports: [
    Sidebar,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class ProfilePage implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly profileApiService = inject(ProfileApiService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly feedback = signal('');
  protected readonly profile = signal<Profile | null>(null);

  protected readonly initials = computed(() => {
    const fullName = this.profile()?.fullName || this.form.controls.fullName.value;
    const initials = fullName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');

    return initials || 'PL';
  });

  protected readonly form = this.formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    phone: [''],
    avatarUrl: [''],
  });

  ngOnInit(): void {
    void this.loadProfile();
  }

  protected async submit(): Promise<void> {
    this.feedback.set('');
    this.form.markAllAsTouched();

    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);

    try {
      const rawProfile = this.form.getRawValue();
      const profile = await firstValueFrom(
        this.profileApiService.updateProfile({
          fullName: rawProfile.fullName.trim(),
          phone: rawProfile.phone.trim(),
          avatarUrl: rawProfile.avatarUrl.trim(),
        }),
      );
      this.profile.set(profile);
      this.fillForm(profile);
      this.feedback.set('Perfil actualizado correctamente.');
    } catch {
      this.feedback.set('No pudimos guardar tu perfil. Revisa los datos e intenta de nuevo.');
    } finally {
      this.submitting.set(false);
    }
  }

  private async loadProfile(): Promise<void> {
    this.loading.set(true);

    try {
      const profile = await firstValueFrom(this.profileApiService.getProfile());
      this.profile.set(profile);
      this.fillForm(profile);
    } catch {
      this.feedback.set('No pudimos cargar tu perfil. Inicia sesion de nuevo si el token expiro.');
    } finally {
      this.loading.set(false);
    }
  }

  private fillForm(profile: Profile): void {
    this.form.reset({
      fullName: profile.fullName,
      phone: profile.phone,
      avatarUrl: profile.avatarUrl ?? '',
    });
  }
}
