/*
 * main.js
 * Boot, the tiny store, view routing, guided-setup gating, the HUD, and
 * the app shell.
 *
 * View contract: every view module exports render(ctx) returning a DOM node.
 * ctx = {
 *   state,                  the current (read-only by convention) state
 *   update(fn),             fn(draft) mutates a clone; then persist + rerender
 *   replaceState(next),     swap the whole state (import, reset, onboarding)
 *   go(viewId),             navigate to another view
 *   refresh(),              re-render the current view
 *   advance(months),        simulate N months, then show the Month Report
 * }
 */

import { loadState, saveState, clearState, isUnlocked } from './state.js';
import { advanceMonth } from './engine/engine.js';
import { EVENTS } from '../data/events.js';
import { OFFERS } from '../data/offers.js';
import { monthLabel } from './engine/format.js';
import { el, mount, setLearnNavigator } from './ui/components.js';
import { icon } from './ui/icons.js';
import { renderOnboarding } from './ui/onboarding.js';
import { renderDashboard } from './ui/dashboard.js';
import { renderJobView } from './ui/jobView.js';
import { renderBudgetView } from './ui/budgetView.js';
import { renderBankView } from './ui/bankView.js';
import { renderMailboxView, unreadCount } from './ui/mailboxView.js';
import { renderLearnView } from './ui/learnView.js';
import { renderSettingsView } from './ui/settingsView.js';
import { showMonthReport } from './ui/reportModal.js';
import { showOffer } from './ui/offerModal.js';
import { renderHud } from './ui/hud.js';
import { completeStep } from './ui/guide.js';
import { cloudEnabled } from './config.js';
import { initAuth, onAuthChange, currentUser, pullSave, pushSave, compareSaves } from './cloud.js';
import { resolveConflict, noteSynced } from './ui/accountCard.js';

const VIEWS = [
  { id: 'dashboard', label: 'Home', ic: 'home', render: renderDashboard },
  { id: 'job', label: 'Job', ic: 'briefcase', render: renderJobView },
  { id: 'budget', label: 'Budget', ic: 'sliders', render: renderBudgetView },
  { id: 'bank', label: 'Bank', ic: 'bank', render: renderBankView },
  { id: 'mailbox', label: 'Mailbox', ic: 'mail', render: renderMailboxView },
  { id: 'learn', label: 'Learn', ic: 'book', render: renderLearnView },
  { id: 'settings', label: 'Settings', ic: 'gear', render: renderSettingsView },
];

/*
 * Which view a save should open on. Setup steps map to their view; the
 * 'first-month' step has no view of its own (it happens on the dashboard).
 */
function setupViewFor(s) {
  const step = s && s.flags ? s.flags.setupStep : 'done';
  const byStep = { job: 'job', budget: 'budget', bank: 'bank' };
  return byStep[step] || 'dashboard';
}

let state = loadState();
let currentView = setupViewFor(state);
const appRoot = document.getElementById('app');

/* Restore the player's theme choice before first paint settles. */
const savedTheme = typeof localStorage !== 'undefined' ? localStorage.getItem('crash-cash-theme') : null;
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

/*
 * Cloud sync, when a player has chosen to sign in. Local storage is always
 * written first and stays the source of truth; the cloud copy trails it by
 * a few seconds so a burst of clicks is one upload, not twenty.
 */
let syncTimer = null;
function scheduleSync() {
  if (!cloudEnabled() || !currentUser() || !state) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    const res = await pushSave(state);
    if (res.ok) { noteSynced(res.at); renderApp(); }
  }, 3000);
}

const ctx = {
  get state() { return state; },
  update(fn) {
    const draft = structuredClone(state);
    fn(draft);
    state = draft;
    saveState(state);
    scheduleSync();
    renderApp();
  },
  replaceState(next) {
    state = next;
    if (next) saveState(next); else clearState();
    currentView = next && next.flags.setupStep !== 'done' ? 'job' : 'dashboard';
    renderApp();
  },
  go(viewId) {
    if (state && !isUnlocked(state, viewId)) return;
    currentView = viewId;
    renderApp();
    window.scrollTo({ top: 0 });
  },
  refresh() { renderApp(); },
  advance(months = 1) {
    const wasFirstMonth = state.flags.setupStep === 'first-month';
    let lastReport = null;
    let goalCelebration = null;
    for (let i = 0; i < months; i++) {
      const res = advanceMonth(state, EVENTS, Math.random, OFFERS);
      state = res.state;
      lastReport = res.report;
      if (res.report.goal && res.report.goal.justCompleted) goalCelebration = res.report.goal;
    }
    saveState(state);
    scheduleSync();
    renderApp();
    if (!lastReport) return;

    /* After the report closes: finish guided setup, or let a pushy offer
       interrupt, exactly like real junk mail would. */
    const pushy = lastReport.newOffer && lastReport.newOffer.pushy ? lastReport.newOffer.instanceId : null;
    showMonthReport(ctx, lastReport, {
      fastForwarded: months > 1 ? months : 0,
      goalCelebration,
      onClose: () => {
        if (wasFirstMonth) completeStep(ctx, 'first-month');
        else if (pushy && state.flags.setupStep === 'done') showOffer(ctx, pushy);
      },
    });
  },
};

/* Deep links from "?" explainers into the Learn glossary. */
setLearnNavigator((term) => {
  window.__learnSearch = term;
  currentView = 'learn';
  renderApp();
  window.scrollTo({ top: 0 });
});

/* Render the whole app: onboarding when there is no save, else the shell. */
function renderApp() {
  if (!state) {
    mount(appRoot, renderOnboarding(ctx));
    return;
  }
  const view = VIEWS.find((v) => v.id === currentView) || VIEWS[0];
  const mailBadge = unreadCount(state);
  const inSetup = state.flags.setupStep !== 'done';

  const navButtons = () => VIEWS.map((v) => {
    const unlocked = isUnlocked(state, v.id);
    return el('button', {
      class: 'navbtn' + (v.id === view.id ? ' active' : '') + (unlocked ? '' : ' locked'),
      onclick: () => unlocked && ctx.go(v.id),
      title: unlocked ? v.label : 'Unlocks as you finish setup',
      'aria-disabled': String(!unlocked),
    },
      el('span', { class: 'ico' }, icon(unlocked ? v.ic : 'lock')),
      el('span', {}, v.label),
      v.id === 'mailbox' && mailBadge > 0 && unlocked ? el('span', { class: 'nav-badge' }, mailBadge) : null,
    );
  });

  const sidenav = el('nav', { class: 'sidenav' },
    el('a', { class: 'logo', href: '#', onclick: (e) => { e.preventDefault(); ctx.go(setupViewFor(state)); } },
      el('span', { class: 'burst', style: 'color: var(--brand-text)' }, icon('coins', 26)),
      el('span', {},
        el('span', { class: 'word' }, 'Crash Cash'),
        el('span', { class: 'slogan' }, 'Crash-test your money'),
      )),
    el('div', { class: 'tiny', style: 'padding: 2px 12px 8px; letter-spacing: .08em; font-weight: 700' }, 'MENU'),
    ...navButtons(),
    el('div', { class: 'nav-spacer' }),
    el('div', { class: 'tiny', style: 'padding: 0 12px 6px' },
      'A simulation. No real money anywhere.'),
  );

  const topbar = el('div', { class: 'topbar' },
    el('div', {},
      el('div', { class: 'when' }, view.label === 'Home'
        ? monthLabel(state.time.monthIndex, state.time.startYear, state.time.startMonth)
        : view.label),
      el('div', { class: 'who' }, (view.id === 'dashboard'
        ? ''
        : monthLabel(state.time.monthIndex, state.time.startYear, state.time.startMonth) + ' · ')
        + (state.profile.mode === 'challenge' ? 'Challenge' : 'Explore') + ' mode'),
    ),
  );

  /*
   * Time controls, always within reach: one month, or a jump ahead.
   * Skipping is how you see compound interest and debt actually bite, so it
   * lives next to the main button instead of hiding in Settings.
   */
  const timeLocked = inSetup && state.flags.setupStep !== 'first-month' && state.flags.setupStep !== 'tools';
  const nextMonthFab = el('div', { class: 'fab-stack' },
    el('div', { class: 'skip-row' },
      el('button', {
        class: 'btn small skip-btn', title: 'Simulate the next 6 months',
        disabled: timeLocked ? true : null,
        onclick: () => ctx.advance(6),
      }, icon('fastforward', 14), ' 6 months'),
      el('button', {
        class: 'btn small skip-btn', title: 'Simulate the next 12 months',
        disabled: timeLocked ? true : null,
        onclick: () => ctx.advance(12),
      }, icon('fastforward', 14), ' 1 year'),
    ),
    el('button', {
      class: 'next-month',
      onclick: () => ctx.advance(1),
      title: 'Simulate one month',
      disabled: timeLocked ? true : null,
    }, icon('play', 18), 'Next Month'),
  );

  const main = el('div', { class: 'main' }, renderHud(ctx), topbar, view.render(ctx));
  const bottomnav = el('nav', { class: 'bottomnav' }, ...navButtons());

  mount(appRoot,
    el('div', { class: 'shell' }, sidenav, el('div', {}, main)),
    nextMonthFab,
    bottomnav);
}

renderApp();

/*
 * Optional cloud sync. None of this runs (or downloads anything) unless the
 * deployment has cloud enabled in config.js, and a signed-out player is
 * completely unaffected either way.
 */
if (cloudEnabled()) {
  initAuth().then((session) => {
    if (session) renderApp();
    onAuthChange(async (next) => {
      renderApp();
      if (!next) return;
      /* Just signed in: reconcile the run here with the one in the cloud. */
      const res = await pullSave();
      if (!res.ok) return;
      const verdict = compareSaves(state, res.state);
      if (verdict === 'use-cloud') {
        ctx.replaceState(res.state);
      } else if (verdict === 'use-local' && state) {
        const push = await pushSave(state);
        if (push.ok) { noteSynced(push.at); renderApp(); }
      } else if (verdict === 'conflict') {
        resolveConflict(ctx, res.state, res.updatedAt);
      }
    });
  });
}
