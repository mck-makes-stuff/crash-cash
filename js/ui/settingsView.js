/*
 * settingsView.js
 * Profile, mode switching, life-event frequency, the rates lab,
 * sandbox tools, save data (export/import/reset), and about.
 */

import { el, segmented, pill, openModal, closeBtn, flash } from './components.js';
import { icon } from './icons.js';
import { guideBanner, toolsStepButton } from './guide.js';
import { renderAccountCard } from './accountCard.js';
import { DIFFICULTIES, exportState, importState, currentAge } from '../state.js';
import { challengesForAge, startChallenge, CHALLENGES } from '../engine/goals.js';
import { toCents, MONTH_NAMES } from '../engine/format.js';

export function renderSettingsView(ctx) {
  return el('div', {},
    guideBanner(ctx),
    renderProfile(ctx),
    renderTiming(ctx),
    renderEvents(ctx),
    renderRatesLab(ctx),
    renderSandboxTools(ctx),
    renderSaveData(ctx),
    renderAccountCard(ctx),
    toolsStepButton(ctx),
    renderAbout(),
  );
}

/* 1. Profile and mode. */

function renderProfile(ctx) {
  const state = ctx.state;
  const nameIn = el('input', {
    type: 'text', value: state.profile.name,
    onchange: (e) => ctx.update((d) => { d.profile.name = e.target.value.trim() || d.profile.name; }),
  });
  return el('div', { class: 'card' },
    el('h3', {}, icon('user', 18), ' Profile'),
    el('div', { class: 'grid cols-2' },
      el('label', { class: 'field' }, el('span', {}, 'Name'), nameIn),
      el('label', { class: 'field' }, el('span', {}, 'Age'),
        el('input', { type: 'text', value: currentAge(state) + ' (started at ' + state.profile.age + ')', disabled: true })),
    ),
    el('p', { class: 'tiny' }, 'You age one year every 12 simulated months, which unlocks jobs and credit as you go. To start from a different age, begin a new run below.'),
    el('div', { class: 'mt' },
      el('span', { class: 'tiny', style: 'display:block; margin-bottom:6px' }, 'Mode'),
      segmented([
        { value: 'explore', label: 'Explore' },
        { value: 'challenge', label: 'Challenge' },
      ], state.profile.mode, (v) => {
        if (v === state.profile.mode) return;
        if (v === 'explore') {
          ctx.update((d) => { d.profile.mode = 'explore'; d.goal = null; });
        } else {
          pickChallenge(ctx);
        }
      }),
      el('p', { class: 'tiny mt' }, state.profile.mode === 'explore'
        ? 'Explore is the free sandbox: no goals, nothing to lose, change anything whenever. Challenge picks a target (pay off a loan, hit a 700 score) and tracks your progress toward it while life throws surprises.'
        : 'Chasing: ' + (CHALLENGES.find((c) => state.goal && c.id === state.goal.id) || { title: 'no goal picked yet' }).title + '. Switch to Explore to free-play.'),
    ),
  );
}

function pickChallenge(ctx) {
  const available = challengesForAge(currentAge(ctx.state));
  openModal((close) => [
    closeBtn(close),
    el('h2', {}, 'Pick your challenge'),
    el('div', { class: 'choices' },
      available.map((c) => el('button', {
        class: 'choice',
        onclick: () => {
          ctx.update((d) => {
            d.profile.mode = 'challenge';
            startChallenge(d, c.id);
            if (d.profile.difficulty === 'peaceful') d.profile.difficulty = 'normal';
          });
          close();
        },
      },
        el('div', { class: 't' }, icon(c.icon), ' ' + c.title),
        el('div', { class: 'd' }, c.blurb)))),
  ]);
}

/* 1.5 Timing: where the calendar starts. */

function renderTiming(ctx) {
  const t = ctx.state.time;
  /* The starting month drives December archiving, the January year-to-date
     reset, and April tax season, so it locks once a month has been played.
     The year is only a label, so it stays editable forever. */
  const started = t.monthIndex > 0;
  return el('div', { class: 'card mt' },
    el('h3', {}, icon('calendar', 18), ' Timing'),
    el('p', { class: 'tiny' }, started
      ? 'Your run started in ' + MONTH_NAMES[t.startMonth] + ' ' + t.startYear + '. The starting month is locked now that time is moving, because tax season and the yearly reset are counted from it. Start a new run to pick a different month.'
      : 'New runs start in the real current month. Change it here before your first Next Month if you want your simulation to live somewhere else on the calendar.'),
    el('div', { class: 'grid cols-2' },
      el('label', { class: 'field' }, el('span', {}, 'Start month'),
        el('select', {
          disabled: started ? true : null,
          onchange: (e) => ctx.update((d) => { d.time.startMonth = Number(e.target.value); }),
        }, MONTH_NAMES.map((m, i) => el('option', { value: i, selected: i === t.startMonth }, m)))),
      el('label', { class: 'field' }, el('span', {}, 'Start year'),
        el('input', {
          type: 'number', min: 2000, max: 2100, step: 1, value: t.startYear,
          onchange: (e) => {
            const y = Math.round(Number(e.target.value));
            if (y >= 2000 && y <= 2100) ctx.update((d) => { d.time.startYear = y; });
          },
        })),
    ),
  );
}

/* 2. Life events frequency. */

function renderEvents(ctx) {
  const current = DIFFICULTIES.find((d) => d.id === ctx.state.profile.difficulty) || DIFFICULTIES[0];
  return el('div', { class: 'card mt' },
    el('h3', {}, icon('dice', 18), ' How often does life happen?'),
    segmented(
      DIFFICULTIES.map((d) => ({ value: d.id, label: d.label })),
      ctx.state.profile.difficulty,
      (v) => ctx.update((d) => { d.profile.difficulty = v; })),
    el('p', { class: 'tiny mt' }, current.blurb
      + ' Life events are the random costs and windfalls that hit between paychecks: a cracked phone, a car repair, birthday cash. Turn them up when you want to test whether your budget survives surprises.'),
  );
}

/* 3. Rates lab. */

function renderRatesLab(ctx) {
  const rates = ctx.state.rates;
  const dial = (key, label, min, max, step, hint) => {
    const out = el('b', {}, rates[key] + '%');
    return el('label', { class: 'field' },
      el('span', {}, label, ' ', out),
      el('input', {
        type: 'range', min, max, step, value: rates[key],
        oninput: (e) => { out.textContent = e.target.value + '%'; },
        onchange: (e) => ctx.update((d) => { d.rates[key] = Number(e.target.value); }),
      }),
      el('span', { class: 'tiny' }, hint),
    );
  };
  return el('div', { class: 'card mt' },
    el('div', { class: 'row between' }, el('h3', {}, icon('flask', 18), ' Rates lab'), pill('sandbox', 'brand')),
    el('p', { class: 'tiny' }, 'These four dials set how fast money grows (or how fast debt does). They are the levers real banks pull on you, so here you get to pull them yourself: halve the high-yield rate, or push the card APR to 36%, then skip a year and see what it did. You can also change savings rates straight from the Bank tab, next to each balance.'),
    el('div', { class: 'grid cols-2' },
      dial('savingsApy', 'Savings APY', 0, 2, 0.05, 'Big banks pay almost nothing.'),
      dial('hysaApy', 'High-yield APY', 0, 6, 0.1, 'Online banks pay real interest.'),
      dial('retirementReturn', 'Retirement return', 0, 12, 0.5, 'Long-run stock averages sit near 7 to 10%.'),
      dial('cardApr', 'Credit card APR', 10, 36, 0.5, 'The average card charges over 20%.'),
    ),
  );
}

/* 4. Sandbox tools. */

function renderSandboxTools(ctx) {
  return el('div', { class: 'card mt' },
    el('div', { class: 'row between' }, el('h3', {}, icon('flask', 18), ' Sandbox tools'), pill('sandbox', 'brand')),
    el('div', { class: 'row' },
      el('button', { class: 'btn', onclick: () => ctx.advance(6) }, icon('fastforward', 16), ' Fast-forward 6 months'),
      el('button', { class: 'btn', onclick: () => ctx.advance(12) }, icon('fastforward', 16), ' Fast-forward 12 months'),
      el('button', {
        class: 'btn',
        onclick: (e) => {
          ctx.update((d) => { d.accounts.checking = toCents(d.accounts.checking + 100); });
        },
      }, icon('gift', 16), ' Conjure $100'),
    ),
    el('p', { class: 'tiny mt' }, 'Skipping time is the fastest way to see the slow stuff: compound interest building, a loan shrinking, a credit score climbing, a card balance snowballing. Every skipped month is simulated in full (pay, taxes, interest, life events) and you get the final month\'s report at the end. The same buttons sit next to Next Month at the bottom right of every screen. The $100 is pure sandbox magic; real life does not have this button.'),
    el('div', { class: 'mt' },
      el('span', { class: 'tiny', style: 'display:block; margin-bottom:6px' }, 'Theme'),
      segmented([
        { value: '', label: 'System' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ], document.documentElement.dataset.theme || '', (v) => {
        if (v) {
          document.documentElement.dataset.theme = v;
          localStorage.setItem('crash-cash-theme', v);
        } else {
          delete document.documentElement.dataset.theme;
          localStorage.removeItem('crash-cash-theme');
        }
        ctx.refresh();
      })),
  );
}

/* 5. Save data. */

function renderSaveData(ctx) {
  const err = el('p', { class: 'tiny bad-text' });
  const fileIn = el('input', {
    type: 'file', accept: '.json,application/json', style: 'display:none',
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const next = importState(await file.text());
        ctx.replaceState(next);
      } catch (ex) {
        err.textContent = ex.message;
      }
    },
  });
  return el('div', { class: 'card mt' },
    el('h3', {}, icon('save', 18), ' Save data'),
    el('p', { class: 'tiny' }, 'Your run lives only in this browser, so clearing site data would wipe it. Export saves it as a file you can keep or move to another device; Import loads one back. Start over wipes this run and returns you to the very beginning.'),
    el('div', { class: 'row' },
      el('button', {
        class: 'btn',
        onclick: (e) => {
          const blob = new Blob([exportState(ctx.state)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'crash-cash-save.json';
          a.click();
          URL.revokeObjectURL(a.href);
          flash(e.target, 'Exported!');
        },
      }, icon('download', 16), ' Export save'),
      el('button', { class: 'btn', onclick: () => fileIn.click() }, icon('upload', 16), ' Import save'),
      el('button', {
        class: 'btn danger',
        onclick: () => openModal((close) => [
          closeBtn(close),
          el('h2', {}, 'Start a brand new run?'),
          el('p', { class: 'muted' }, 'This wipes the current run: job, accounts, history, everything. Export first if you want to keep it.'),
          el('div', { class: 'row' },
            el('button', { class: 'btn', onclick: close }, 'Keep playing'),
            el('button', { class: 'btn danger', onclick: () => { close(); ctx.replaceState(null); } }, 'Wipe and restart')),
        ]),
      }, icon('trash', 16), ' Start over'),
      fileIn),
    err,
  );
}

/* 6. About. */

function renderAbout() {
  return el('div', { class: 'card mt' },
    el('h3', {}, icon('coins', 18), ' Crash Cash'),
    el('p', { class: 'muted' }, 'Crash-test your money. A simulation for learning by doing: jobs, taxes, banking, credit, debt, and retirement with zero real-world risk.'),
    el('p', { class: 'tiny' }, 'Everything is simulated. Nothing here is financial advice, and no data ever leaves your browser. Open source under the MIT license.'),
  );
}
