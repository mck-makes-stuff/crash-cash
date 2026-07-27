/*
 * config.js
 * Optional cloud-sync settings. Crash Cash works completely without this:
 * leave the values empty and the app stays a pure offline static site with
 * local saves only.
 *
 * These two values are meant to be public. The publishable key identifies
 * the project, it does not grant access to anyone's data. Row Level
 * Security in the database is what protects each player's save, so this
 * file is safe to commit and safe to serve from GitHub Pages.
 */

export const SUPABASE_URL = 'https://aodwaioxjgeusnvjwxou.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_COtNmF3SofGk2IKLDwofOg_AWUKy7ss';

/* Which sign-in methods to offer. Google also has to be enabled in the
   Supabase dashboard under Authentication, Providers. */
export const AUTH_METHODS = { email: true, google: true };

/* The minimum age to create an account. Younger players can still use
   everything in the app, they just keep their save on their own device. */
export const MIN_ACCOUNT_AGE = 13;

/* Where the CDN copy of the Supabase client comes from. Loaded lazily, and
   only when a player actually uses a cloud feature. */
export const SUPABASE_CDN = 'https://esm.sh/@supabase/supabase-js@2';

/* True when cloud sync is switched on for this deployment. */
export function cloudEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}
