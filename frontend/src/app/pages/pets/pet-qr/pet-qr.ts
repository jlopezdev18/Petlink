import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { toDataURL } from 'qrcode';
import { firstValueFrom } from 'rxjs';

import {
  PetQrTag,
  PetTagsApiService,
  SightingReport,
  SightingReportStatus,
} from '../../../core/pet-tags-api.service';
import { Pet } from '../../../core/pets-api.service';
import { EntityModal } from '../../../shared/entity-modal/entity-modal';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-pet-qr',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    EntityModal,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTabsModule,
  ],
  templateUrl: './pet-qr.html',
  styleUrl: './pet-qr.css',
})
export class PetQr implements OnInit {
  readonly pet = input.required<Pet>();
  readonly initialTab = input<'qr' | 'reports'>('qr');
  readonly closed = output<void>();
  readonly pendingCountChanged = output<number>();

  private readonly formBuilder = inject(FormBuilder);
  private readonly petTagsApi = inject(PetTagsApiService);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly reportUpdatingId = signal<string | null>(null);
  protected readonly feedback = signal('');
  protected readonly tag = signal<PetQrTag | null>(null);
  protected readonly reports = signal<SightingReport[]>([]);
  protected readonly qrImageUrl = signal('');
  protected readonly scanUrl = signal('');
  protected readonly pendingReportCount = computed(
    () => this.reports().filter((report) => report.status === 'pending').length,
  );
  protected readonly initialTabIndex = computed(() => (this.initialTab() === 'reports' ? 1 : 0));

  protected readonly settingsForm = this.formBuilder.nonNullable.group({
    isLost: false,
    lostMessage: ['', [Validators.maxLength(500)]],
    showOwnerPhone: false,
  });

  ngOnInit(): void {
    void this.load();
  }

  protected requestClose(): void {
    if (!this.saving() && !this.reportUpdatingId()) {
      this.closed.emit();
    }
  }

  protected async saveSettings(): Promise<void> {
    this.settingsForm.markAllAsTouched();
    if (this.settingsForm.invalid || this.saving()) {
      return;
    }

    const value = this.settingsForm.getRawValue();
    this.saving.set(true);
    this.feedback.set('');
    try {
      const updated = await firstValueFrom(
        this.petTagsApi.updateTag(this.pet().id, {
          isLost: value.isLost,
          lostMessage: value.lostMessage.trim(),
          showOwnerPhone: value.showOwnerPhone,
        }),
      );
      this.tag.set(updated);
      this.settingsForm.markAsPristine();
      this.feedback.set(
        value.isLost
          ? 'La mascota quedó marcada como extraviada.'
          : 'La información pública se actualizó.',
      );
    } catch {
      this.feedback.set('No pudimos actualizar la configuración del QR.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async updateReportStatus(
    report: SightingReport,
    status: SightingReportStatus,
  ): Promise<void> {
    if (this.reportUpdatingId()) {
      return;
    }

    this.reportUpdatingId.set(report.id);
    this.feedback.set('');
    try {
      const updated = await firstValueFrom(
        this.petTagsApi.updateReportStatus(this.pet().id, report.id, status),
      );
      this.reports.update((reports) =>
        this.sortReports(reports.map((current) => (current.id === updated.id ? updated : current))),
      );
      this.emitPendingCount();
    } catch {
      this.feedback.set('No pudimos actualizar el reporte.');
    } finally {
      this.reportUpdatingId.set(null);
    }
  }

  protected downloadQr(): void {
    const imageUrl = this.qrImageUrl();
    if (!imageUrl) {
      return;
    }

    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `qr-${this.fileSafeName(this.pet().name)}.png`;
    link.click();
  }

  protected printQr(): void {
    const imageUrl = this.qrImageUrl();
    const url = this.scanUrl();
    if (!imageUrl || !url) {
      return;
    }

    const printWindow = window.open('', '_blank', 'width=440,height=650');
    if (!printWindow) {
      this.feedback.set('El navegador bloqueó la ventana de impresión.');
      return;
    }

    const petName = this.escapeHtml(this.pet().name);
    printWindow.document.write(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>QR de ${petName}</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 24px; font-family: Arial, sans-serif; color: #17202a; text-align: center; }
            .tag { width: 320px; margin: 0 auto; padding: 18px; border: 2px solid #17202a; border-radius: 8px; }
            h1 { margin: 4px 0; font-size: 28px; }
            p { margin: 6px 0; font-size: 14px; }
            img { width: 230px; height: 230px; margin: 12px auto; display: block; }
            .url { overflow-wrap: anywhere; font-size: 10px; }
          </style>
        </head>
        <body>
          <section class="tag">
            <p>PetLink</p>
            <h1>${petName}</h1>
            <img src="${imageUrl}" alt="QR de ${petName}" />
            <p>¿Me encontraste? Escanea para avisar a mi propietario.</p>
            <p class="url">${this.escapeHtml(url)}</p>
          </section>
          <script>window.addEventListener('load', () => { window.print(); window.close(); });</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  protected phoneHref(phone: string): string {
    return `tel:${phone.replace(/[^\d+]/g, '')}`;
  }

  protected mapHref(report: SightingReport): string {
    return `https://www.google.com/maps?q=${report.latitude},${report.longitude}`;
  }

  protected statusLabel(status: SightingReportStatus): string {
    return { pending: 'Pendiente', reviewed: 'Revisado', dismissed: 'Descartado' }[status];
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const tag = await firstValueFrom(this.petTagsApi.getOrCreateTag(this.pet().id));
      const reports = await firstValueFrom(this.petTagsApi.listReports(this.pet().id));
      const scanUrl = this.buildScanUrl(tag.token);
      const qrImage = await toDataURL(scanUrl, {
        errorCorrectionLevel: 'H',
        margin: 2,
        scale: 8,
        color: { dark: '#17202a', light: '#ffffff' },
      });

      this.tag.set(tag);
      this.reports.set(this.sortReports(reports));
      this.scanUrl.set(scanUrl);
      this.qrImageUrl.set(qrImage);
      this.settingsForm.reset({
        isLost: tag.isLost,
        lostMessage: tag.lostMessage,
        showOwnerPhone: tag.showOwnerPhone,
      });
      this.emitPendingCount();
    } catch {
      this.feedback.set('No pudimos cargar el QR y sus reportes.');
    } finally {
      this.loading.set(false);
    }
  }

  private buildScanUrl(token: string): string {
    const configuredBase = environment.publicAppUrl.trim();
    const baseUrl = (configuredBase || window.location.origin).replace(/\/+$/, '');
    return `${baseUrl}/#/qr-mascota/${encodeURIComponent(token)}`;
  }

  private emitPendingCount(): void {
    this.pendingCountChanged.emit(this.pendingReportCount());
  }

  private sortReports(reports: SightingReport[]): SightingReport[] {
    const priority: Record<SightingReportStatus, number> = {
      pending: 0,
      reviewed: 1,
      dismissed: 2,
    };
    return [...reports].sort(
      (first, second) =>
        priority[first.status] - priority[second.status] ||
        new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
    );
  }

  private fileSafeName(value: string): string {
    return (
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'mascota'
    );
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}
