import { Routes } from '@angular/router';

import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((page) => page.LoginPage),
  },
  {
    path: 'registro',
    loadComponent: () => import('./pages/register/register').then((page) => page.RegisterPage),
  },
  {
    path: 'acceso-cuidador',
    loadComponent: () => import('./pages/guest-access/guest-access').then((page) => page.GuestAccessPage),
  },
  {
    path: 'inicio',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/home/home').then((page) => page.HomePage),
  },
  {
    path: 'mascotas',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/pets/pets').then((page) => page.Pets),
  },
  {
    path: 'cuidadores',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/caregivers/caregivers').then((page) => page.CaregiversPage),
  },
  {
    path: 'medicamentos',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/medications/medications').then((page) => page.MedicationsPage),
  },
  {
    path: 'recetas',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/prescriptions/prescriptions').then((page) => page.PrescriptionsPage),
  },
  {
    path: 'perfil',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/profile/profile').then((page) => page.ProfilePage),
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
];
