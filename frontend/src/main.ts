import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

if (window.location.pathname === '/acceso-cuidador' || window.location.pathname === '/acceso-cuidador/') {
  window.location.replace(`${window.location.origin}/#/acceso-cuidador${window.location.search}`);
} else {
  bootstrapApplication(App, appConfig)
    .catch((err) => console.error(err));
}
