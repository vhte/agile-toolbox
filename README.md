<div align="center">

<img src="assets/icons/icon.svg" width="88" height="88" alt="">

# Agile Toolbox

**Team tools that run entirely in your browser.**
For scrum masters, agile coaches, managers, developers, QA, and any team that now includes AI agents.
No account, no backend, no install, no data leaving the machine.

[![License: MIT](https://img.shields.io/badge/License-MIT-4f46e5.svg)](LICENSE)
![Dependencies: none](https://img.shields.io/badge/dependencies-none-128a5b.svg)
![Install: none](https://img.shields.io/badge/install-none-128a5b.svg)
![Works offline](https://img.shields.io/badge/works-offline-1f6feb.svg)

[Why this exists](#why-this-exists) · [The tools](#the-tools) · [Quick start](#quick-start) · [Privacy](#your-data-stays-with-you) · [Contributing](CONTRIBUTING.md)

</div>

---

## Why this exists

Most of what a team needs to organise itself is either a paid SaaS seat, a spreadsheet someone
hacked together, or a wiki table that went stale the week it was written. This repository is nine of
those tools, done properly, as plain web pages. Open `index.html` and they work: from a file on
disk, from GitHub Pages, from your intranet, from a USB stick in a meeting room with no wifi.

The newer half of the toolbox responds to a specific shift. Teams in 2026 work alongside AI
assistants and coding agents, and the research so far says the hard part is no longer writing code:

- **The bottleneck moved to review and coordination.** A study of 718 companies found coding agents
  raised pull requests by about 23% while the rate of resolved issues did not move, and the time to
  merge a pull request rose by roughly half.
  ([summary](https://complexdiscovery.com/harvard-researchers-find-ai-coding-agents-shifted-the-bottleneck-to-code-review/))
  Measuring finished work, not activity, is what tells you whether anything improved.
- **AI amplifies what is already there.** Google's DORA 2025 research describes AI as an amplifier
  of a team's existing strengths and dysfunctions, and lists *a clear and communicated AI stance*
  first among the capabilities that make it pay off.
  ([DORA AI Capabilities Model](https://cloud.google.com/blog/products/ai-machine-learning/introducing-doras-inaugural-ai-capabilities-model))
- **Individuals speed up faster than teams can coordinate.** Atlassian's *State of Teams 2026* calls
  this the "fragmentation tax" and names shared context as one of its main remedies.
  ([report](https://www.atlassian.com/blog/state-of-teams-2026))
- **Delegation has to be recalibrated.** The author of Delegation Poker argues that agents force
  teams to "start from scratch in calibrating delegation levels".
  ([essay](https://jurgenappelo.com/blogs/news/the-revenge-of-command-and-control))
- **Most practitioners are figuring it out alone.** In Scrum.org's 2026 practitioner survey, 83% use
  AI but only 15% have had any training on using it in an agile context.
  ([report](https://www.scrum.org/resources/blog/ai4agile-practitioners-report-2026))

So the toolbox covers both: the ceremonies every team still runs, and the things that now need
writing down because half the "team" cannot read minds: who may decide what, what "ready" means
for a task an agent will pick up, why a decision was made, and what the rules for AI actually are.

## The tools

### Run the ceremonies

#### 🔁 Retro Board · [`tools/retro/`](tools/retro/)

Run the whole retrospective in one tab: collect, reveal, vote, discuss.

- **Five formats**: Start / Stop / Continue, 4 Ls, Sailboat, Mad / Sad / Glad, and **Humans + Agents**
  (AI helped · AI cost us · Trust calibration · Try next).
- **Masked collection**: while collecting, everyone sees their own cards and `•••` for everyone else's.
- **Dot voting** with a per-person budget, and grouping of duplicates with their votes combined.
- **Action items with carry-over**: one click pulls every unfinished action from the last retro into
  this one, so retros compound instead of repeating.
- Built-in timer, drag and drop, export to Markdown or JSON.

#### ⏱️ Standup Facilitator · [`tools/standup/`](tools/standup/)

- **Randomized speaking order** that never opens with the same person twice in a row.
- **Per-person timebox** with a countdown ring, optional auto-advance and a total meeting budget.
- **Blocker capture** during the meeting, by category, including *Waiting on review* and
  *Waiting on AI/agent output*, compiled into a digest you can paste into your channel.
- **Async mode** for distributed teams: collect written updates and generate one digest.
- **Blocker heatmap** by category across weeks: which part of the system keeps generating friction.

#### 🩺 Team Health Radar · [`tools/health-radar/`](tools/health-radar/)

An anonymous survey that is anonymous **because there is no service in the middle**.

- Two question sets: **Classic** (psychological safety, delivery confidence, technical quality and
  more) and **Humans + AI** (clear AI stance, trust in AI output, review load, shared context, skill
  growth and more). Both are editable. Share a link ending in `#set=ai` to preselect the second one.
- Each person answers on their own device and gets a short code like `ATBX-1A2B-4352-3415-7`
  that contains the scores, a signature of the question set and a checksum. Nothing else.
- Results **stay hidden until three people have answered**, so a small round cannot be read back
  to an individual.
- Radar chart with the spread of answers, the previous round overlaid, and a trend across rounds.
  Disagreement is the interesting signal.

### Plan and forecast

#### 📐 Sprint Capacity Planner · [`tools/capacity/`](tools/capacity/)

- Working days from a real calendar: your working week, holidays, time off, part-time allocation,
  and in-team duties (on-call, interrupt rota) that were never free.
- **10,000-run Monte Carlo** over your own sprint history, scaled to this sprint's capacity.
- Output is a **range with a confidence attached**: what you can promise at 85%, the coin-flip
  midpoint, and the stretch nobody should commit to. It answers *"what are the odds we finish 34
  points?"*
- Clone a plan into the next sprint and it carries the team and the history forward.

#### 🌊 Flow Forecaster · [`tools/flow/`](tools/flow/)

Paste a CSV export from Jira, Linear, GitHub, Azure DevOps or a spreadsheet and see where work waits.

- Columns are mapped automatically by header name, and most date formats are understood. Rows that
  cannot be read are listed with the reason, never silently dropped.
- **Cycle time** percentiles (50/70/85/95), a scatterplot, weekly throughput, WIP over time and a
  Little's Law check.
- **Aging work in progress**: items already older than 85% of everything you finished are flagged
  while there is still time to act.
- **Segments**: tag items (for example `agent-assisted` and `human`) and compare them end to end.
  This is how a team finds out whether AI shortened delivery or just shortened typing.
- **Forecasts** by Monte Carlo over your daily throughput: *how many items by this date?* and
  *when will these N items be done?*, each at 50/85/95% confidence.
- Assignee columns are ignored on purpose. It never breaks data down by person.

### Make the rules explicit

#### 🤝 Working Agreements · [`tools/agreements/`](tools/agreements/)

The team's rules, including the ones for AI, written by the team.

- Guided sections (communication, meetings, work in progress, code review, **AI use and agents**,
  feedback, learning and on-call, Definition of Done), each with facilitation questions and a library
  of suggested agreements to adopt or rewrite.
- **Fist of Five consent check** per agreement, recorded as anonymous counts, with a configurable
  rule. Anything that fails it is marked *Needs discussion*.
- **AGENTS.md builder**: setup and test commands, conventions and *Always / Ask first / Never*
  boundaries filled from what the team agreed. [AGENTS.md](https://agents.md) is the open format
  that coding agents such as Claude Code, Codex, Cursor, Copilot and Gemini CLI read for project rules.
- Exports a Markdown agreement, an `AGENTS.md` file, JSON, and a print view for the wall.

#### 🎚️ Delegation Board · [`tools/delegation/`](tools/delegation/)

Who decides what: people, leads and AI agents.

- Each decision gets two levels: a **Delegation Poker** level for people (1 Tell to 7 Delegate,
  from Management 3.0), and an **agent autonomy** level (0 Off-limits, 1 Suggest, 2 Draft for
  approval, 3 Act with review before it lands, 4 Act and notify, 5 Autonomous within guardrails).
- Every decision carries guardrails, a rollback trigger, the evidence that would justify more
  autonomy, an owner role and a review date.
- **Poker mode** on a shared screen or passed device: hidden picks, a reveal that shows the spread,
  and a clear signal when the team disagrees by three levels or more. Only the agreed level is kept.
- Starter sets for software teams with coding agents, product and discovery, and ops with automation.
- Warns when anything that sounds irreversible (deploy, delete, production, secrets, payments)
  is left to an agent without guardrails. Exports a Markdown matrix and an AGENTS.md section.

#### 📝 Task Brief · [`tools/brief/`](tools/brief/)

Write work items a teammate or an AI agent can actually finish.

- Templates per type (feature, bug, spike, refactor, chore) with goal, scope, out of scope,
  constraints, acceptance criteria, verification steps, risk tier and open questions.
- **Live readiness check** that explains every verdict: missing verification, vague words in
  acceptance criteria ("fast", "user-friendly", "should handle"), open questions, a task too big
  to be small. Each check is tagged with the INVEST letter or Definition of Ready item it serves.
- Stricter rules when the executor is an agent, and risk tiers that limit agent autonomy.
- Exports a **Markdown ticket body** for any tracker and an **agent prompt** with a
  *Stop and ask if* section built from your open questions and risk rules.

#### 🧭 Decision Log · [`tools/decisions/`](tools/decisions/)

Record why, not just what, before the thread scrolls away.

- **Quick capture**: type *"We decided to X because Y"*, press Enter, and it becomes a numbered
  Proposed record you can expand later.
- MADR-style records: context, drivers, options with pros and cons, outcome, consequences,
  confidence, revisit date, and an origin field that includes *AI-proposed, human-accepted*.
- A **supersede** flow that links old and new decisions both ways, and a reminder when a decision
  is due for revisit.
- Exports a single ADR file, the whole log with an index, or a short decision index to paste into
  `AGENTS.md` or a README so newcomers and agents get the context.

### Templates

#### 📋 Definition of Done / Ready · [`templates/dod-dor/`](templates/dod-dor/)

Forkable Markdown checklists for backend, frontend, platform, data and mobile teams, a Definition of
Ready, and an **addendum for AI-assisted changes** (ownership, review, generated tests that must fail
first, what never goes into a prompt). Copy one into your repository, delete every line your team
will not honour, and version-control it.

## How the tools fit together

You do not need all nine. Most teams start with one ceremony tool and add the rest when a problem
shows up. A few combinations work especially well:

| If your team... | Try |
|---|---|
| keeps repeating the same retro actions | **Retro Board** carry-over, then a **Decision Log** entry for anything you settle |
| is adopting coding agents | **Working Agreements** (AI section) → **Delegation Board** → paste both exports into `AGENTS.md` |
| hands tickets to agents that come back wrong | **Task Brief** before the work starts, the **AI-assisted DoD** after |
| is asked "when will it be done?" | **Flow Forecaster** for a date range, **Capacity Planner** for the next sprint |
| feels busier but not faster | **Flow Forecaster** segments plus the **Humans + AI** health check |

## Quick start

**Option 1: just open it.** Download the repository and double-click `index.html`. Everything works
from `file://`: no build step, no server, no login.

```bash
git clone https://github.com/USER/agile-toolbox.git
cd agile-toolbox
# then open index.html in your browser
```

On Windows you can also run `start index.html` in PowerShell or cmd; on macOS, `open index.html`.

**Option 2: host it for your team.** Any static file host works. A GitHub Pages workflow is included
([`.github/workflows/pages.yml`](.github/workflows/pages.yml)): enable Pages with the source set to
*GitHub Actions* and push. There are no API keys, environment variables or secrets.

**Option 3: install it as an app.** Served over HTTPS (or `localhost`), your browser offers to
install it. It then opens in its own window and works with no network at all.

## Your data stays with you

| Where your data lives | What that means |
|---|---|
| Your browser's `localStorage` | It is per browser and per site. A different browser or machine sees nothing. |
| Nowhere else | No analytics, no web fonts, no CDN, no telemetry, no network calls. The only `fetch` in the codebase is the service worker caching the app's own files. |
| Until you export or erase it | The home page has **Back up everything** (one JSON file for all tools) and **Erase all local data**. |

Two consequences to plan around:

- **Clearing site data deletes your work.** Export anything you would be upset to lose.
- **Sharing means exporting.** There is no live multiplayer, because that needs a server. In
  practice one person facilitates and shares the screen, or people exchange exported files.

### Why no individual metrics, ever

This is a design rule for every tool, current and future:

- Standup turn timings are shown live to keep the meeting in its box. They are **never stored**.
- Blockers aggregate by **category**, never by who raised them.
- The Flow Forecaster **ignores assignee columns** in your export.
- Delegation Poker and Fist of Five keep **only the result and anonymous counts**, never who voted what.
- The Health Radar cannot attribute a response to a person, even with the raw export.

The moment a team tool can be turned into a performance report, people start managing their answers
instead of giving them.

## What this is not

It is not a tracker and does not integrate with one. It sits between "we need to run this well" and
"we need this recorded in Jira": you facilitate and decide here, then paste the Markdown export
wherever your work lives.

## Roadmap

Ideas sized for a first contribution. Each one is a folder and two files:

- **Cross-team dependency tracker**: "team A needs X from team B by date Y", drawn as a graph, flagged when a date slips.
- **Ceremony playbook**: facilitation scripts, timings and anti-patterns per ceremony, for new scrum masters.
- **Pass-the-device estimation**: planning poker for a co-located or screen-shared team, with a "why are we 3 points apart" prompt.
- **Impediment escalation log**: ageing impediments, escalation paths and the evidence to make the case upward.
- **Blameless incident review guide**: a timeline and the questions, ending in actions and a Decision Log entry.
- **Translations**: the interface is English only today.

## Contributing

Bug reports from people who facilitate for a living are as valuable as code. Read
[CONTRIBUTING.md](CONTRIBUTING.md) for the five constraints (no build step, no dependencies, works
from `file://`, never measure an individual, everything exports) and how to add a tool.

## License

[MIT](LICENSE). Use it at work, fork it for your company, remove what you do not need.

<!--
Publishing your own copy: replace USER/agile-toolbox in the Quick start clone URL with your
repository path. Nothing else in this repo hard-codes a URL.
-->
