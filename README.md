# 💥 Crash Cash

**Crash-test your money.**

Crash Cash is a safe, fully simulated sandbox for learning everything money by
doing: jobs and paychecks, taxes, banking, budgeting, credit cards and credit
scores, debt, high-yield savings, and retirement. Make great decisions or
terrible ones; here, the mistakes are free and the lessons stick.

No real money. No servers to run. Your run lives in your browser's local
storage by default; an optional account (email link or Google) syncs it
across devices. See [privacy.html](privacy.html) for exactly what that
stores, which is your email and your game save, and nothing else.

## Two ways to play

* **Explore mode** (default): a pure sandbox. Take any job, change your hours,
  open accounts, crank interest-rate dials, fast-forward a year, and watch
  cause and effect. No goals, no fail states.
  A guided walkthrough unlocks the app one clear step at a time on your first
  run (job, budget, bank, first month), and can be skipped by returning players.
* **Challenge mode**: pick a goal (pay off a student loan, reach a 700 credit
  score, build an emergency fund, grow a retirement balance) and chase it while
  life throws surprises at you. Difficulty ranges from Peaceful to Hard Mode.

## What the simulation covers

* **Jobs**: 38 real-world roles with average pay, hourly and salaried, from
  babysitting to software development, searchable in a clean picker, plus
  fully custom jobs. Commitment (hours per week), benefits, health premiums.
* **Time and age**: the simulation starts in the real current month, and your
  character ages one year for every twelve simulated months. Start at 17 and
  credit unlocks mid-run the month you turn 18. Starting ages run 12 to 26+.
* **Offers**: fictional companies pitch you credit cards, bank accounts, and
  investments by mail (and the pushy ones interrupt you). Some are great,
  some are traps, one is a Ponzi scheme. The fine print always tells the
  truth; deciding reveals the verdict and the lesson.
* **Taxes**: 2025 federal brackets, the standard deduction, FICA (Social
  Security and Medicare with the wage cap), optional flat state tax, paycheck
  withholding, and a real April tax season that reconciles the year into a
  refund or a bill.
* **Retirement**: pre-tax 401k/403b contributions, employer matching, and
  monthly compounded growth.
* **Banking**: checking, savings vs high-yield savings (the APY gap is the
  lesson), transfers, overdrafts and their fees.
* **Credit**: a starter credit card with a real grace period, statements,
  minimum payments, late fees, utilization, and a FICO-style score built from
  the published factor weights. Under 18, credit is locked, which is also
  the lesson.
* **Debt**: student loans, auto loans, medical bills, and family loans
  (0% interest, still owed), with interest-first amortization.
* **Life**: 30 random events, from cracked phones to birthday cash, gated by
  the age your run started at.

Every number in the app has a small **?** that explains, in plain language and
with your own numbers, where it came from. A 50-term glossary and a monthly
plain-language report do the teaching; there are no lectures.

## Running it locally

It is a static site; any web server works, and opening `index.html` directly
works in most browsers too.

```
python3 tools/serve.py        # serves http://localhost:8000 with no caching
```

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. In the repo: Settings, then Pages, then under "Build and deployment" choose
   Source: Deploy from a branch, Branch: `main`, folder `/ (root)`.
3. Your site appears at `https://<username>.github.io/<repo>/`.

No build step, no dependencies, nothing else to configure.

## Development

The runtime is pure HTML/CSS/JavaScript (ES modules, zero dependencies).
Python is used only for optional dev tooling.

```
npm test                                  # engine unit tests (node --test)
python3 tools/validate_data.py            # dataset integrity checks
python3 -m pytest tests/python -q         # 55 data/tooling tests (needs pytest)
```

Project layout:

```
index.html            app shell
privacy.html          privacy policy (required by the optional accounts)
css/styles.css        design system (light/dark, responsive)
js/engine/            pure simulation logic, no DOM, fully unit tested
js/ui/                views (dashboard, job, budget, bank, learn, settings)
js/state.js           state shape + localStorage persistence
js/config.js          optional cloud-sync keys (safe to publish)
js/cloud.js           optional Supabase auth + save sync, lazily loaded
data/                 jobs, life events, glossary (browser ES modules)
tests/js/             engine unit tests (node:test)
tests/python/         data integrity tests (pytest)
tools/                dev server + data validator (Python, dev-only)
docs/                 architecture notes and task tracker
```

See [PLAN.md](PLAN.md) for the product plan and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for technical details.

## Honesty box

Crash Cash simplifies on purpose: single filer, 2025 tax rules every year,
flat state tax, one statement a month, a simplified score model, steady
investment returns. The Learn tab discloses all of it in-app. Nothing here is
financial advice; it is a place to build intuition safely.

## License

MIT
