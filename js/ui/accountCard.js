/*
 * accountCard.js
 * The optional account panel in Settings: sign in with an email link or
 * Google, see when your run last synced, sync on demand, and delete
 * everything stored about you.
 *
 * Everything here is additive. With no account, the app behaves exactly as
 * it always has, and this card just explains what signing in would buy you.
 */

import { el, mount, pill, openModal, closeBtn } from './components.js';
import { icon } from './icons.js';
import { monthLabel } from '../engine/format.js';
import { cloudEnabled, AUTH_METHODS, MIN_ACCOUNT_AGE } from '../config.js';
import {
  currentUser, signInWithEmail, signInWithGoogle, signOut,
  pullSave, pushSave, deleteCloudData, compareSaves, describeSave,
} from '../cloud.js';

/* When this device last pushed to the cloud, for the "last synced" line. */
let lastSynced = null;
export function noteSynced(at) { lastSynced = at || new Date().toISOString(); }
export function getLastSynced() { return lastSynced; }

export function renderAccountCard(ctx) {
  if (!cloudEnabled()) return null;
  const user = currentUser();
  return user ? signedInCard(ctx, user) : signedOutCard(ctx);
}

/* 1. Signed out: the pitch, the age gate, and the two sign-in methods. */

function signedOutCard(ctx) {
  const body = el('div', {});
  const note = el('p', { class: 'tiny', style: 'min-height:1em' });
  let ageOk = false;

  const emailInput = el('input', {
    type: 'email', placeholder: 'you@example.com', autocomplete: 'email',
  });

  function setBusy(on, msg) {
    note.className = 'tiny' + (on ? '' : ' bad-text');
    note.textContent = msg || '';
  }

  function render() {
    mount(body,
      el('p', { class: 'muted' },
        'Your run already saves automatically on this device. An account is only for keeping it if you switch browsers or devices, or clear your history.'),
      el('label', { class: 'row', style: 'cursor:pointer; margin: 10px 0' },
        el('input', {
          type: 'checkbox',
          onchange: (e) => { ageOk = e.target.checked; render(); },
          checked: ageOk ? true : null,
        }),
        el('span', { class: 'tiny' },
          'I am ' + MIN_ACCOUNT_AGE + ' or older. (Younger than that, keep playing without an account: everything works, your run just stays on this device.)')),

      AUTH_METHODS.email ? el('div', { class: 'mt' },
        el('label', { class: 'field' },
          el('span', {}, 'Sign in with an email link'),
          emailInput),
        el('button', {
          class: 'btn primary', disabled: ageOk ? null : true,
          onclick: async (e) => {
            const email = emailInput.value.trim();
            if (!email || !email.includes('@')) { setBusy(false, 'Enter an email address first.'); return; }
            e.target.disabled = true;
            setBusy(true, 'Sending your link...');
            const res = await signInWithEmail(email);
            e.target.disabled = false;
            if (res.ok) {
              setBusy(true, 'Check ' + email + ' for a sign-in link. It opens Crash Cash already signed in.');
            } else {
              setBusy(false, res.error);
            }
          },
        }, icon('mail', 16), ' Email me a link'),
        el('p', { class: 'tiny' }, 'No password to make or forget. The link signs you in once, then this browser stays signed in.'),
      ) : null,

      AUTH_METHODS.google ? el('div', { class: 'mt' },
        el('button', {
          class: 'btn', disabled: ageOk ? null : true,
          onclick: async () => {
            setBusy(true, 'Opening Google...');
            const res = await signInWithGoogle();
            if (!res.ok) setBusy(false, res.error);
          },
        }, icon('user', 16), ' Continue with Google'),
      ) : null,

      note,
      el('p', { class: 'tiny mt' },
        'We store your email and your game save. Nothing else, ever, and nothing is sold or shared. ',
        el('a', { href: 'privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy'),
        '.'),
    );
  }

  render();
  return el('div', { class: 'card mt' },
    el('div', { class: 'row between' },
      el('h3', {}, icon('user', 18), ' Account and cloud save'),
      pill('optional', 'brand')),
    body,
  );
}

/* 2. Signed in: status, manual sync, sign out, delete. */

function signedInCard(ctx, user) {
  const note = el('p', { class: 'tiny', style: 'min-height:1em' });
  const synced = getLastSynced();

  return el('div', { class: 'card mt' },
    el('div', { class: 'row between' },
      el('h3', {}, icon('user', 18), ' Account'),
      pill('signed in', 'good')),
    el('p', { class: 'muted' }, user.email || 'Signed in'),
    el('p', { class: 'tiny' }, synced
      ? 'Last synced ' + timeAgo(synced) + '. Your run syncs automatically after each month.'
      : 'Your run will sync automatically after your next month.'),
    el('div', { class: 'row mt' },
      el('button', {
        class: 'btn',
        onclick: async (e) => {
          e.target.disabled = true;
          note.className = 'tiny';
          note.textContent = 'Syncing...';
          const res = await pushSave(ctx.state);
          e.target.disabled = false;
          if (res.ok) { noteSynced(res.at); note.textContent = 'Synced just now.'; ctx.refresh(); }
          else { note.className = 'tiny bad-text'; note.textContent = res.error; }
        },
      }, icon('upload', 16), ' Sync now'),
      el('button', {
        class: 'btn',
        onclick: async (e) => {
          e.target.disabled = true;
          note.className = 'tiny';
          note.textContent = 'Fetching your cloud save...';
          const res = await pullSave();
          e.target.disabled = false;
          if (!res.ok) { note.className = 'tiny bad-text'; note.textContent = res.error; return; }
          if (!res.state) { note.textContent = 'Nothing saved in the cloud yet.'; return; }
          confirmRestore(ctx, res.state, res.updatedAt);
        },
      }, icon('download', 16), ' Restore from cloud'),
      el('button', { class: 'btn ghost', onclick: async () => { await signOut(); ctx.refresh(); } }, 'Sign out'),
    ),
    note,
    el('div', { class: 'mt' },
      el('button', { class: 'btn danger small', onclick: () => confirmDelete(ctx) },
        icon('trash', 14), ' Delete my account data'),
      el('p', { class: 'tiny' }, 'Removes your cloud save immediately and signs you out. The run on this device stays until you clear it yourself.')),
  );
}

/* 3. Prompts */

function confirmRestore(ctx, cloudState, updatedAt) {
  openModal((close) => [
    closeBtn(close),
    el('h2', {}, 'Replace this run with your cloud save?'),
    el('p', { class: 'muted' }, 'Cloud: ' + describeSave(cloudState, monthLabel)
      + (updatedAt ? ', saved ' + timeAgo(updatedAt) : '')),
    el('p', { class: 'muted' }, 'This device: ' + describeSave(ctx.state, monthLabel)),
    el('p', { class: 'tiny' }, 'Whichever you do not keep is gone, so export first from Save data below if you want both.'),
    el('div', { class: 'row mt' },
      el('button', { class: 'btn', onclick: close }, 'Keep this device'),
      el('button', {
        class: 'btn primary',
        onclick: () => { close(); ctx.replaceState(cloudState); },
      }, 'Use the cloud save'),
    ),
  ]);
}

function confirmDelete(ctx) {
  openModal((close) => [
    closeBtn(close),
    el('h2', {}, 'Delete everything stored about you?'),
    el('p', { class: 'muted' }, 'Your cloud save is deleted right away and you are signed out. This cannot be undone.'),
    el('div', { class: 'row mt' },
      el('button', { class: 'btn', onclick: close }, 'Cancel'),
      el('button', {
        class: 'btn danger',
        onclick: async () => {
          const res = await deleteCloudData();
          close();
          if (res.ok) ctx.refresh();
        },
      }, 'Delete it all'),
    ),
  ]);
}

/*
 * Offer to merge when a fresh sign-in finds a run in both places.
 * Called from main.js right after the auth state settles.
 */
export function resolveConflict(ctx, cloudState, updatedAt) {
  openModal((close) => [
    closeBtn(close),
    el('h2', {}, 'Two runs, one account'),
    el('p', { class: 'muted' }, 'You have a run on this device and a different one saved in the cloud. Pick the one to keep playing; the other is replaced.'),
    el('div', { class: 'choices' },
      el('button', {
        class: 'choice',
        onclick: async () => { close(); const r = await pushSave(ctx.state); if (r.ok) noteSynced(r.at); ctx.refresh(); },
      },
        el('div', { class: 't' }, 'This device'),
        el('div', { class: 'd' }, describeSave(ctx.state, monthLabel))),
      el('button', {
        class: 'choice',
        onclick: () => { close(); ctx.replaceState(cloudState); },
      },
        el('div', { class: 't' }, 'The cloud save' + (updatedAt ? ' (' + timeAgo(updatedAt) + ')' : '')),
        el('div', { class: 'd' }, describeSave(cloudState, monthLabel))),
    ),
  ], { sticky: true });
}

/* "3 minutes ago" style relative time. */
function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (!then) return 'recently';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
  const days = Math.round(hrs / 24);
  return days + (days === 1 ? ' day ago' : ' days ago');
}

export { compareSaves };
