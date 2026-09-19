import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { MedicationNotificationsService } from './core/medication-notifications.service';
import { PetAccessSyncService } from './core/pet-access-sync.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly medicationNotificationsService = inject(MedicationNotificationsService);
  private readonly petAccessSyncService = inject(PetAccessSyncService);

  ngOnInit(): void {
    this.medicationNotificationsService.start();
    this.petAccessSyncService.start();
  }
}
