import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

const directPath = window.location.pathname.replace(/\/$/, '');

if (directPath === '/restablecer-contrasena') {
  const recoveryParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const accessToken = recoveryParams.get('access_token');
  const recoveryType = recoveryParams.get('type');
  const query = new URLSearchParams();

  if (accessToken) {
    query.set('access_token', accessToken);
  }
  if (recoveryType) {
    query.set('type', recoveryType);
  }

  const queryString = query.toString();
  window.location.replace(
    `${window.location.origin}/#/restablecer-contrasena${queryString ? `?${queryString}` : ''}`,
  );
} else if (directPath === '/acceso-cuidador') {
  window.location.replace(`${window.location.origin}/#/acceso-cuidador${window.location.search}`);
} else {
  bootstrapApplication(App, appConfig).catch((err) => console.error(err));
}
