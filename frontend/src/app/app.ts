import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { MedicationNotificationsService } from './core/medication-notifications.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly medicationNotificationsService = inject(MedicationNotificationsService);

  ngOnInit(): void {
    this.medicationNotificationsService.start();
  }
}
