# AGENTS.md

Instructions for AI coding agents working on this repository. Humans: start with `README.md`
(what the tools do) and `CONTRIBUTING.md` (how to contribute). This file is the operating manual
for an agent: architecture, the rules that must not break, and how to verify a change.

## What this project is

Agile Toolbox is a set of nine team tools (retros, standups, health checks, capacity and flow
forecasting, working agreements, delegation, task briefs, decision logs) that run **entirely in the
browser**, from `file://` or any static host. There is no backend, no build, no package manager and
no runtime dependency. Every user's data lives in their own browser's `localStorage`.

## Hard rules (never break these)

1. **No build step.** Plain HTML, CSS and JavaScript loaded with classic `<script>` tags. Do not add
   bundlers, transpilers, TypeScript, frameworks, `package.json` or a `node_modules` folder.
2. **No dependencies.** No npm packages, no CDN links, no web fonts, no external images. Charts are
   hand-drawn on `<canvas>` or inline SVG.
3. **Must work from `file://`.** No ES modules (`type="module"`), no `import`/`export`, no `fetch()`
   of local files, no `XMLHttpRequest`. The only `fetch` allowed is the one in `sw.js`.
4. **No network calls of any kind.** No analytics, telemetry, error reporting or remote config.
5. **Never measure an individual.** Do not store per-person timings, counts, scores or votes. Do not
   add leaderboards, "by assignee" breakdowns or anything that attributes an answer to a person.
   Live facilitation aids may show a person's turn on screen; they must not be persisted. Votes
   (Delegation Poker, Fist of Five, dot voting) persist only as aggregates.
6. **Everything exports.** Any stored data must export as JSON that re-imports, and preferably as
   Markdown. Imports validate shape and fail with a toast, never an uncaught exception.
7. **User data is precious.** People have real data in `localStorage` under existing keys. Never
   rename a namespace or key, and never change a stored shape without making the tool's
   `normalize*` function accept the old shape (see *Storage* below).

## Code style

- ES5-flavoured JavaScript: `var`, `function`, string concatenation. **No** arrow functions,
  `let`/`const`, classes, template literals, optional chaining, spread, or `async`/`await` in
  shipped code. (`tests/smoke.mjs` is Node-only and may use modern syntax.)
- Each tool's script is one IIFE starting with `"use strict";` and `var NS = "<namespace>";`.
- Build DOM with `UI.el(tag, props, children)`. **Never** pass user-entered text through `innerHTML`
  or the `html` prop; use `text`, `textContent` or `UI.escape`.
- When a `change`/`blur` handler re-renders the container holding the element being edited, wrap
  the re-render in `UI.defer(fn)` so focus is not lost and the browser does not throw.
- Update the in-memory model on every keystroke; debounce only the `Store.write`. (Debouncing the
  model update caused several data-loss bugs that are now fixed; do not reintroduce the pattern.)
- Dates are **local calendar days**: use `UI.isoDate(date)` and `UI.parseDate("YYYY-MM-DD")`, never
  `new Date("YYYY-MM-DD")` (UTC parsing shifts the day) and never `toISOString().slice(0, 10)`.
- Colours come from CSS custom properties in `assets/css/app.css`. Never write a literal colour in a
  tool; if a new colour is needed, add a token in both the light and the two dark blocks.
- Canvas charts read colours with `getComputedStyle(...).getPropertyValue("--token")`, scale by
  `devicePixelRatio`, and redraw on resize, on the `prefers-color-scheme` change and when the
  `data-theme` attribute changes (see `tools/capacity/capacity.js` or `tools/flow/flow.js`).
- Match the comment density of the surrounding code: comments explain *why*, not *what*.

## Writing style for user-visible text

- English, plain, direct, second person. Short sentences.
- **Do not use em-dashes (—) in user-visible text or docs.** Use a comma, colon, parentheses or a
  full stop. The lone `"—"` placeholder for an empty value is the only exception.
- Name the practice a feature comes from (Delegation Poker, MADR, INVEST, Little's Law, Fist of
  Five) so a facilitator can look it up. Do not invent statistics or cite studies in the UI.

## Architecture

```
index.html                hub: tool cards (3 groups), backup / restore / erase, storage stats
manifest.json, sw.js      PWA manifest and offline app-shell cache
assets/css/app.css        design system: tokens (light + dark), components, utilities
assets/js/store.js        Store: the only persistence layer (localStorage, "atbx:" prefix)
assets/js/ui.js           UI: DOM, dates, toasts, downloads, clipboard, theme, top bar
tools/<slug>/index.html   markup + a <style> block for tool-specific CSS (tokens only)
tools/<slug>/<name>.js    behaviour, one IIFE
templates/dod-dor/        Markdown Definition of Done / Ready checklists (not code)
tests/smoke.mjs           headless-Chrome test runner (dev only, zero dependencies)
tests/scenarios/*.js      one scripted UI walk per tool, evaluated inside the page
```

Every tool page loads, in order: `assets/js/store.js`, `assets/js/ui.js`, then its own script. Its
`<body>` has `data-title="<Tool name>"` and `data-root="../../"`; `UI.initChrome()` builds the top
bar from those, applies the theme and registers the service worker (skipped on `file://`).

### Shared layer contracts

`Store` (`assets/js/store.js`): `read(ns, key, fallback)`, `write(ns, key, value)` (returns `false`
on quota errors), `remove`, `keys(ns)`, `exportAll()`, `importAll(payload, "merge" | "replace")`,
`clearAll()`, `usage()`, `isPersistent`. It falls back to memory when storage is blocked. Never call
`localStorage` directly.

`UI` (`assets/js/ui.js`): `el`, `qs`, `qsa`, `clear`, `defer`, `escape`, `uid`, `clamp`, `round`,
`isoDate`, `parseDate`, `addDays`, `prettyDate`, `mmss`, `toast(msg, "ok" | "danger", ms)`,
`confirmDanger`, `download`, `downloadJSON`, `copy`, `pickJSON`, `slug`, `shuffle`, `debounce`,
`autoGrow`, `initChrome`, `addBarButton`, `guardUnload`, `theme.*`. `UI.toast` moves its host into
an open modal `<dialog>` so toasts stay visible above dialogs.

Changing a shared file affects all nine tools: run the whole smoke test afterwards.

### Tools and their storage

| Folder | Script | Namespace | Main keys | Test hook |
|---|---|---|---|---|
| `tools/retro/` | `retro.js` | `retro` | `index`, `active`, `board:<id>`, `mine:<id>` | none |
| `tools/standup/` | `standup.js` | `standup` | `teams`, `activeTeam`, `sessions`, `async:<team>:<date>`, `lastDigest` | none |
| `tools/health-radar/` | `radar.js` | `radar` | `rounds`, `activeRound`, `dims` (Classic set), `dims:<set>`, `set`, `role`, `draft` | none |
| `tools/capacity/` | `capacity.js` | `capacity` | `plans`, `active` | none |
| `tools/flow/` | `flow.js` | `flow` | `datasets`, `active` | `window.__flow` |
| `tools/agreements/` | `agreements.js` | `agreements` | `docs`, `active`, `tab` | `window.__agreements` |
| `tools/delegation/` | `delegation.js` | `delegation` | `boards`, `active`, `view` | `window.__delegation` |
| `tools/brief/` | `brief.js` | `brief` | `briefs`, `active`, `ui` | `window.__brief` |
| `tools/decisions/` | `decisions.js` | `decisions` | `logs`, `active` | `window.__decisions` |

Stored objects pass through the tool's `normalize*` function on load and on import (for example
`normalizeBoard` in retro and delegation, `normalizeDoc` in agreements, `normalize` in flow, brief
and capacity, `normalizeLog`/`normalizeRecord` in decisions). When you add a field, give it a
default there so older saved data and older exports keep loading. The `window.__<tool>` hooks expose
pure helpers for scenarios; keep them side-effect free and do not use them from other tools.

Domain notes worth knowing before editing:

- **Health Radar** answer codes encode scores, a signature of the question set and a checksum. Any
  change to dimensions or encoding must keep old codes decodable or rejected with a clear reason.
  Results stay hidden below three responses (`MIN_RESPONSES`); do not lower it.
- **Flow** cycle time is inclusive calendar days; percentiles are nearest-rank; "how many by date"
  at 85% confidence is the 15th percentile of simulated totals. Person columns are dropped by
  `isPersonColumn` and never offered for mapping.
- **Capacity** and **Flow** forecasts are Monte Carlo over the team's own history. Never replace a
  range with a single number.
- **Delegation** and **Working Agreements** both export AGENTS.md content; the delegation export is
  a `## Autonomy and approvals` section designed to paste under the agreements file's
  `## Boundaries`. Keep the two consistent if you change either.

## Adding a tool

1. Create `tools/<slug>/index.html` and `tools/<slug>/<slug>.js` from the skeleton in
   `CONTRIBUTING.md`. Include an empty state with "Load an example", a `<details>` "How to use this",
   JSON export/import and a Markdown export.
2. Register it everywhere, in the same change:
   - `index.html`: a card in the right group, and its namespace in the `TOOLS` array (usage panel).
   - `sw.js`: both files in `SHELL`, and **bump `CACHE`** (for example `agile-toolbox-v3`).
   - `manifest.json`: a shortcut only if it is a top-level daily tool (browsers show about four).
   - `README.md`: a section in the same shape as its neighbours (human-facing copy).
   - `AGENTS.md`: a row in the tools table above.
   - `tests/scenarios/<slug>.js`: a scenario (see below).

Whenever you change any file listed in `sw.js`, bump `CACHE`, or returning users keep the old copy.

## Verifying a change

Requires Node 22+ and a Chrome or Chromium binary (found automatically, including the Playwright
cache; otherwise set `CHROME=/path/to/chrome`). Nothing is installed.

```bash
node tests/smoke.mjs                 # every page; must end with "N/N pages clean"
node tests/smoke.mjs flow decisions  # only pages whose path contains these words
SHOTS=1 node tests/smoke.mjs brief   # also write light, dark and 360px PNGs to tests/shots/
```

The runner fails a page on any console error or warning, uncaught exception, horizontal scroll at
360px (before and after the scenario), a failing scenario, or an error after reload.

A scenario is a script body evaluated in the page with the helpers from
`tests/scenarios/_helpers.js` in scope (`$`, `$$`, `type`, `click`, `byText`, `assert`, `sleep`;
`confirm` and `prompt` are stubbed). It must clear its own namespace first, drive the real UI through
the tool's core value path, assert on visible output (and on computed numbers where the maths is
checkable), and end with `return "ok"`. Every bug fix adds the assertion that would have caught it.

Before reporting a UI change as done, look at the `SHOTS=1` screenshots in both themes and at
360px, then delete `tests/shots/` (it is git-ignored). Also open the page from `file://` once.

## Before you finish

- [ ] `node tests/smoke.mjs` prints all pages clean.
- [ ] No new dependency, build file, network call, ES module or modern-only syntax in shipped code.
- [ ] No user text reaches `innerHTML`.
- [ ] No per-person data is persisted.
- [ ] Old saved data and old JSON exports still load (defaults added in `normalize*`).
- [ ] `sw.js` `CACHE` bumped if any cached file changed.
- [ ] README, CONTRIBUTING and this file updated if behaviour, layout or rules changed.
- [ ] No em-dashes in new user-visible text.
