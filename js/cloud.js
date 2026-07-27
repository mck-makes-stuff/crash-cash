/*
 * cloud.js
 * Optional account and cloud-save layer, wrapped around Supabase.
 *
 * Design rules, in order of importance:
 *  1. The app must work with no account and no network. Local storage stays
 *     the source of truth; the cloud is a backup and a way to move between
 *     devices, never a requirement.
 *  2. Nothing here loads until a player actually uses a cloud feature. The
 *     Supabase client is fetched lazily from a CDN, so a player who never
 *     signs in downloads nothing extra.
 *  3. Every failure is soft. If the CDN is blocked, the project is paused,
 *     or the network is down, the app keeps running on local saves and says
 *     so plainly.
 *
 * Storage shape: one row per user in the `saves` table, holding the whole
 * save as JSON. Row Level Security in the database restricts every row to
 * its owner, so a leaked publishable key still exposes nobody's data.
 */

import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_CDN, cloudEnabled } from './config.js';

let clientPromise = null;
let cachedSession = null;
const listeners = new Set();

/* Lazily create the Supabase client. Returns null when cloud is off or the
   library cannot be reached. */
async function getClient() {
  if (!cloudEnabled()) return null;
  if (!clientPromise) {
    clientPromise = import(/* @vite-ignore */ SUPABASE_CDN)
      .then((mod) => mod.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      }))
      .catch((err) => {
        console.warn('Crash Cash: cloud sync unavailable.', err);
        clientPromise = null;
        return null;
      });
  }
  return clientPromise;
}

/* Human-readable error text. Supabase messages are usually fine to show. */
function friendly(error, fallback) {
  if (!error) return fallback;
  const msg = String(error.message || error);
  if (/Failed to fetch|NetworkError/i.test(msg)) {
    return 'Could not reach the server. Your run is safe on this device; try syncing later.';
  }
  if (/rate limit/i.test(msg)) return 'Too many attempts just now. Wait a minute and try again.';
  return msg;
}

/* 1. Session and auth state */

/*
 * Start listening for sign-in and sign-out. Safe to call once at boot: it
 * does nothing at all when cloud sync is switched off.
 */
export async function initAuth() {
  const client = await getClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  cachedSession = data.session || null;
  client.auth.onAuthStateChange((_event, session) => {
    cachedSession = session || null;
    for (const fn of listeners) fn(cachedSession);
  });
  return cachedSession;
}

/* Subscribe to sign-in state changes. Returns an unsubscribe function. */
export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* The signed-in user, or null. Reads the cached session, so it is sync. */
export function currentUser() {
  return cachedSession ? cachedSession.user : null;
}

/* 2. Signing in and out */

/*
 * Email magic link: no passwords ever. Supabase mails a one-tap link that
 * returns the player to this exact page, signed in.
 */
export async function signInWithEmail(email) {
  const client = await getClient();
  if (!client) return { ok: false, error: 'Cloud sync is not available right now.' };
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectUrl() },
  });
  return error
    ? { ok: false, error: friendly(error, 'Could not send that link.') }
    : { ok: true };
}

/* Google sign-in. Requires the Google provider to be enabled in Supabase. */
export async function signInWithGoogle() {
  const client = await getClient();
  if (!client) return { ok: false, error: 'Cloud sync is not available right now.' };
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectUrl() },
  });
  return error
    ? { ok: false, error: friendly(error, 'Could not start Google sign-in.') }
    : { ok: true };
}

export async function signOut() {
  const client = await getClient();
  if (client) await client.auth.signOut();
  cachedSession = null;
}

/* Where auth links come back to: this page, without any query junk. */
function redirectUrl() {
  const { origin, pathname } = window.location;
  return origin + pathname;
}

/* 3. Reading and writing the save */

/*
 * Fetch this user's cloud save.
 * Returns { ok, state, updatedAt } where state is null when they have
 * never synced before.
 */
export async function pullSave() {
  const client = await getClient();
  const user = currentUser();
  if (!client || !user) return { ok: false, error: 'Not signed in.' };
  const { data, error } = await client
    .from('saves')
    .select('data, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return { ok: false, error: friendly(error, 'Could not load your cloud save.') };
  return {
    ok: true,
    state: data ? data.data : null,
    updatedAt: data ? data.updated_at : null,
  };
}

/* Write the current save to the cloud, replacing whatever was there. */
export async function pushSave(state) {
  const client = await getClient();
  const user = currentUser();
  if (!client || !user) return { ok: false, error: 'Not signed in.' };
  const { error } = await client
    .from('saves')
    .upsert(
      { user_id: user.id, data: state, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  return error
    ? { ok: false, error: friendly(error, 'Could not save to the cloud.') }
    : { ok: true, at: new Date().toISOString() };
}

/*
 * Delete this player's cloud save and sign them out. The account row itself
 * is removed by the database when the user is deleted; this at minimum
 * clears every scrap of their game data immediately.
 */
export async function deleteCloudData() {
  const client = await getClient();
  const user = currentUser();
  if (!client || !user) return { ok: false, error: 'Not signed in.' };
  const { error } = await client.from('saves').delete().eq('user_id', user.id);
  if (error) return { ok: false, error: friendly(error, 'Could not delete your data.') };
  await signOut();
  return { ok: true };
}

/* 4. Sync helper */

/*
 * Decide what to do when a player signs in on a device that already has a
 * run going. Returns one of:
 *   'use-cloud'  the cloud save is the only one worth keeping
 *   'use-local'  this device is the only one with a run
 *   'conflict'   both exist and differ, so the player has to choose
 *   'none'       nothing anywhere
 */
export function compareSaves(localState, cloudState) {
  const hasLocal = !!localState && localState.time.monthIndex >= 0;
  const hasCloud = !!cloudState && cloudState.time && cloudState.time.monthIndex >= 0;
  if (!hasLocal && !hasCloud) return 'none';
  if (!hasLocal) return 'use-cloud';
  if (!hasCloud) return 'use-local';
  /* Same run, untouched since the last sync: nothing to ask about. */
  if (JSON.stringify(localState) === JSON.stringify(cloudState)) return 'use-local';
  return 'conflict';
}

/* A one-line description of a save, for the conflict prompt. */
export function describeSave(state, monthLabelFn) {
  if (!state || !state.time) return 'empty run';
  const who = state.profile ? state.profile.name : 'Someone';
  const when = monthLabelFn
    ? monthLabelFn(state.time.monthIndex, state.time.startYear, state.time.startMonth)
    : 'month ' + state.time.monthIndex;
  const jobs = (state.jobs || []).length;
  return who + ', ' + when + ', ' + jobs + (jobs === 1 ? ' job' : ' jobs');
}
