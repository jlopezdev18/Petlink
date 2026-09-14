import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

let nextModalId = 0;

@Component({
  selector: 'app-entity-modal',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './entity-modal.html',
  styleUrl: './entity-modal.css',
})
export class EntityModal {
  @Input({ required: true }) title = '';
  @Input() description = '';
  @Output() closed = new EventEmitter<void>();

  protected readonly titleId = `entity-modal-title-${nextModalId++}`;
  protected readonly descriptionId = `entity-modal-description-${nextModalId++}`;

  @HostListener('document:keydown.escape')
  protected closeFromEscape(): void {
    this.close();
  }

  protected close(): void {
    this.closed.emit();
  }
}
