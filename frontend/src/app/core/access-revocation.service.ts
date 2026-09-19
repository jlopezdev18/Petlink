import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AccessRevocationService {
  private readonly revoked = new Subject<void>();

  readonly revoked$: Observable<void> = this.revoked.asObservable();

  report(): void {
    this.revoked.next();
  }
}
