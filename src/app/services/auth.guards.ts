import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Blocks the app shell until a known user is signed in. */
export function authenticatedGuard() {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAuthenticated() ? true : router.createUrlTree(['/login']);
}

/** Keeps signed-in users away from the login page. */
export function guestGuard() {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAuthenticated()
    ? router.createUrlTree([auth.isAdmin() ? '/admin' : '/dashboard'])
    : true;
}

/** Only the admin account can enter the admin area. */
export function adminGuard() {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  if (!auth.isAdmin())       return router.createUrlTree(['/dashboard']);
  return true;
}
