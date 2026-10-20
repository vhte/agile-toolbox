/* ==========================================================================
   Working Agreements: the team's rules, including the ones for AI, written
   by the team. Guided sections, a Fist of Five consent check stored only as
   anonymous counts, and two exports: a human agreement and an AGENTS.md.
   ========================================================================== */
(function () {
  "use strict";

  var NS = "agreements";
  var STATUSES = ["Proposed", "Agreed", "Dropped"];
  var BUCKETS = [["always", "Always"], ["ask", "Ask first"], ["never", "Never"], ["none", "Leave out"]];
  var AGENT_SECTIONS = { review: true, ai: true };

  function s(t, b) { return { t: t, b: b || "none" }; }

  var SECTIONS = [
    {
      key: "comm", title: "Communication & availability",
      prompts: [
        "When can teammates expect each other to be reachable, and when is it fine not to be?",
        "Which channel is for what: chat, ticket, email, a call?",
        "How fast should a message get a reply, and what counts as urgent?"
      ],
      suggestions: [
        s("Core hours are 10:00 to 15:00 in our main time zone; outside them nobody is expected to reply."),
        s("Async first: write it in the ticket or the team channel before calling a meeting."),
        s("Reply to direct messages within half a working day; urgent means a call, not a chat message."),
        s("Chat status reflects reality (focus, away, off) so others know when to wait."),
        s("Decisions made in a call are written down in the ticket or channel the same day."),
        s("Use the team channel over direct messages so knowledge stays visible."),
        s("Nobody is expected to read or answer messages on days off or after hours."),
        s("Mention a person only when you need them; otherwise post without a mention.")
      ]
    },
    {
      key: "meetings", title: "Meetings",
      prompts: [
        "Which of our meetings would we miss if they disappeared tomorrow?",
        "What makes a meeting worth joining for you?",
        "How do we keep meetings fair across locations and time zones?"
      ],
      suggestions: [
        s("Cameras are optional."),
        s("No agenda, no meeting: a meeting without an agenda 24 hours ahead is cancelled."),
        s("Every meeting has a timebox and ends on time, even mid-topic."),
        s("Meetings end five minutes before the hour so people get a break."),
        s("Anyone can call a timeout when a discussion goes in circles and move it to a follow-up."),
        s("Notes and decisions are shared in the team channel within a day."),
        s("One meeting-free half day per week for focus work."),
        s("It is fine to leave a meeting where you are neither contributing nor learning.")
      ]
    },
    {
      key: "planning", title: "Planning & work in progress",
      prompts: [
        "How many things can be in progress at once before work starts to queue?",
        "What do we do when an item is blocked for more than a day?",
        "Who can pull new work, and when?"
      ],
      suggestions: [
        s("We respect the WIP limit on each column of the board."),
        s("Stop starting, start finishing: before pulling new work, check if you can help finish something in progress."),
        s("We swarm on blocked work: a blocked item is the first topic of the next stand-up."),
        s("An item blocked for more than one working day is escalated, with the blocker written on the card."),
        s("Work enters the sprint through planning or with the Product Owner's agreement."),
        s("Big items are split until each fits in a few days."),
        s("The board shows the real state of the work; we update it when it changes."),
        s("Unplanned work is visible on the board and marked as unplanned.")
      ]
    },
    {
      key: "review", title: "Code review & quality",
      prompts: [
        "How long can a pull request wait before it hurts the team?",
        "What must be true before anything reaches main?",
        "Who merges, and who decides when a change is good enough?"
      ],
      suggestions: [
        s("Keep pull requests small: one concern per PR, ideally under 400 changed lines.", "always"),
        s("Review requests get a first response within one working day."),
        s("The author merges their own PR after approval."),
        s("No self-approval on main: every change to main is approved by someone other than its author.", "never"),
        s("Every PR links its ticket in the title or description.", "always"),
        s("CI must be green before merge; nobody merges on red.", "always"),
        s("New behaviour comes with tests; a bug fix comes with a test that reproduces the bug.", "always"),
        s("Review comments are about the code, not the person; optional ones start with \"nit:\"."),
        s("Ask before adding a new dependency.", "ask"),
        s("Ask before changing the database schema or a public API.", "ask")
      ]
    },
    {
      key: "ai", title: "AI use & agents",
      prompts: [
        "Which AI tools are approved for our work, and for which kinds of data?",
        "Who is accountable for a change that an AI assistant or an agent wrote?",
        "When should someone stop using the assistant and take over?"
      ],
      suggestions: [
        s("Use only the AI tools the company has approved; ask before trying a new one.", "ask"),
        s("Never paste secrets, credentials, customer data or personal data into a prompt.", "never"),
        s("A person is accountable for every merged change, whatever wrote it.", "always"),
        s("Disclose substantial AI generation in the PR description.", "always"),
        s("Agents work on branches and never push to main.", "never"),
        s("Generated tests must fail before the fix and pass after it.", "always"),
        s("A human reviews agent PRs like any other PR, with the same bar.", "always"),
        s("Re-check the license and origin of generated code before it is merged.", "always"),
        s("When the agent loops or is confidently wrong, stop and take over.", "always"),
        s("Ask before letting an agent run commands against shared environments or production.", "ask"),
        s("Treat AI output as a draft: verify facts, APIs and versions before relying on them.", "always")
      ]
    },
    {
      key: "feedback", title: "Feedback & conflict",
      prompts: [
        "How do we want to hear it when someone thinks we got something wrong?",
        "What do we do when two people disagree and cannot settle it?",
        "How do we make sure quieter voices are heard?"
      ],
      suggestions: [
        s("Give feedback privately and soon; give praise in public."),
        s("Assume positive intent and ask before you judge."),
        s("Disagree and commit: once we decide, we all back the decision, and we revisit it with new data."),
        s("A disagreement that lasts more than 30 minutes goes to the team or a facilitator."),
        s("Any working agreement can be challenged in a retrospective."),
        s("Talk about behaviour and impact, not personality."),
        s("Everyone gets a turn; we use rounds when a few voices dominate."),
        s("We call out a broken agreement kindly, by pointing at the agreement, not the person.")
      ]
    },
    {
      key: "learning", title: "Learning & on-call",
      prompts: [
        "How much time do we protect for learning, and how do we share what we learn?",
        "How does on-call work, and how do we recover after a rough shift?",
        "What knowledge lives in only one head today?"
      ],
      suggestions: [
        s("Everyone gets two hours a week of protected learning time."),
        s("We pair or mob on unfamiliar areas so no knowledge lives in one head."),
        s("On-call rotates weekly and the handover is written down."),
        s("After a night page, the on-call person starts late the next day."),
        s("Every incident gets a blameless review with at least one follow-up action."),
        s("Whoever finds a runbook wrong fixes it."),
        s("We share one learning per sprint in the review or the team channel."),
        s("On-call pages only for customer impact; everything else waits for working hours.")
      ]
    },
    {
      key: "dod", title: "Definition of Done",
      prompts: [
        "What must be true before we call an item done?",
        "Which of these do we skip today, and what does skipping cost us?"
      ],
      suggestions: [
        s("Code is reviewed and merged to main."),
        s("Automated tests cover the change and pass in CI."),
        s("Acceptance criteria are met and checked by the Product Owner or a teammate."),
        s("Documentation and release notes are updated where users are affected."),
        s("The change is deployed to staging and smoke tested."),
        s("No new high or critical security findings."),
        s("Monitoring or logs exist for the new behaviour."),
        s("Feature flags and temporary code are removed or have a ticket.")
      ]
    }
  ];
  var SECTION_KEYS = SECTIONS.map(function (x) { return x.key; });
  function sectionOf(key) { return SECTIONS.filter(function (x) { return x.key === key; })[0]; }

  var state = { docs: [], doc: null, tab: "agreement", painters: {} };

  /* --- Pure logic ------------------------------------------------------- */
  function addMonths(iso, n) {
    var d = UI.parseDate(iso);
    if (!d) return "";
    var day = d.getDate();
    var r = new Date(d.getFullYear(), d.getMonth() + n, 1);
    var last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
    r.setDate(Math.min(day, last));
    return UI.isoDate(r);
  }

  function isDue(doc) {
    return !!doc.nextReview && doc.nextReview < UI.isoDate();
  }

  function emptyVotes() { return [0, 0, 0, 0, 0, 0]; }

  /** Fist of Five result from anonymous counts [n0..n5]. */
  function consent(votes, rule) {
    var v = Array.isArray(votes) ? votes : emptyVotes();
    var total = 0, sum = 0;
    for (var i = 0; i < 6; i++) { total += v[i] || 0; sum += i * (v[i] || 0); }
    if (!total) return { checked: false, total: 0, low: 0, avg: 0, pass: false };
    var avg = sum / total;
    var low = (v[0] || 0) + (v[1] || 0);
    var pass = rule === "avg3" ? avg >= 3 : low === 0;
    return { checked: true, total: total, low: low, avg: avg, pass: pass };
  }

  function needsDiscussion(item, rule) {
    if (item.status === "Dropped") return false;
    var c = consent(item.votes, rule);
    return c.checked && !c.pass;
  }

  function ruleText(rule) {
    return rule === "avg3" ? "agreed when the average is 3 or more" : "agreed when nobody shows 0 or 1";
  }

  function guessBucket(text) {
    var t = String(text || "").trim();
    if (/^(never|do not|don't|no )/i.test(t) || /\bnever\b/i.test(t)) return "never";
    if (/\b(ask|approval|check with)\b/i.test(t)) return "ask";
    return "always";
  }

  function derivedBoundaries(doc) {
    var out = { always: [], ask: [], never: [] };
    doc.items.forEach(function (it) {
      if (it.status !== "Agreed" || !AGENT_SECTIONS[it.section]) return;
      if (!out[it.bucket] || !String(it.text).trim()) return;
      out[it.bucket].push(String(it.text).replace(/\s*\r?\n\s*/g, " ").trim());
    });
    return out;
  }

  function linesOf(text) {
    return String(text || "").split(/\r?\n/).map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length; });
  }

  function boundaries(doc) {
    var a = doc.agents;
    if (!a.custom) return derivedBoundaries(doc);
    return { always: linesOf(a.always), ask: linesOf(a.ask), never: linesOf(a.never) };
  }

  function bullet(line) {
    var l = line.replace(/^([-*+]|\d+\.)\s+/, "");
    return "- " + l;
  }

  function command(line) {
    return String(line || "").trim().replace(/^\$\s+/, "");
  }

  function toAgentsMd(doc) {
    var a = doc.agents;
    var out = ["# AGENTS.md", ""];
    if (String(a.overview).trim()) out.push("## Project overview", "", String(a.overview).trim(), "");
    var setup = [command(a.setup), command(a.build)].filter(Boolean);
    if (setup.length) {
      out.push("## Setup commands", "", "```sh");
      setup.forEach(function (c) { out.push(c); });
      out.push("```", "");
    }
    var tests = [command(a.test), command(a.lint)].filter(Boolean);
    if (tests.length) {
      out.push("## Testing instructions", "", "```sh");
      tests.forEach(function (c) { out.push(c); });
      out.push("```", "");
      out.push("- Run " + (command(a.test) && command(a.lint) ? "the tests and the linter" : command(a.test) ? "the tests" : "the linter") +
        " before every commit and fix every failure before you open a PR.", "");
    }
    [["Code style", a.style], ["Repository layout", a.layout], ["PR instructions", a.pr]].forEach(function (pair) {
      var ls = linesOf(pair[1]);
      if (!ls.length) return;
      out.push("## " + pair[0], "");
      ls.forEach(function (l) { out.push(bullet(l)); });
      out.push("");
    });
    var b = boundaries(doc);
    out.push("## Boundaries", "");
    var any = false;
    [["always", "Always"], ["ask", "Ask first"], ["never", "Never"]].forEach(function (pair) {
      if (!b[pair[0]].length) return;
      any = true;
      out.push("### " + pair[1], "");
      b[pair[0]].forEach(function (l) { out.push(bullet(l)); });
      out.push("");
    });
    if (!any) out.push("_No boundaries agreed yet._", "");
    return out.join("\n").replace(/\n+$/, "\n");
  }

  function exportedItems(doc, sectionKey, includeProposed) {
    return doc.items.filter(function (it) {
      if (it.section !== sectionKey || !String(it.text).trim()) return false;
      return it.status === "Agreed" || (includeProposed && it.status === "Proposed");
    });
  }

  function toMarkdown(doc, includeProposed) {
    var out = ["# Working agreement: " + (doc.team || "Our team"), ""];
    if (String(doc.purpose).trim()) out.push("> " + String(doc.purpose).trim(), "");
    out.push("- Last reviewed: " + (doc.reviewed || "not yet"));
    out.push("- Next review: " + (doc.nextReview || "not set") + (isDue(doc) ? " (review due)" : ""));
    out.push("- Consent: Fist of Five, " + ruleText(doc.rule) + ".", "");
    var total = 0;
    SECTIONS.forEach(function (sec) {
      var items = exportedItems(doc, sec.key, includeProposed);
      var link = sec.key === "dod" && String(doc.dodLink).trim();
      if (!items.length && !link) return;
      out.push("## " + sec.title, "");
      items.forEach(function (it) {
        total++;
        var mark = "";
        if (it.status === "Proposed") mark = needsDiscussion(it, doc.rule) ? " _(proposed, needs discussion)_" : " _(proposed)_";
        out.push("- " + String(it.text).trim().replace(/\s*\n\s*/g, " ") + mark);
        if (String(it.why).trim()) out.push("  - Why: " + String(it.why).trim().replace(/\s*\n\s*/g, " "));
      });
      if (link) out.push((items.length ? "\n" : "") + "Full Definition of Done: " + link);
      out.push("");
    });
    if (!total && !String(doc.dodLink).trim()) out.push("_No agreed items yet._", "");
    out.push("---", "_Written by the team with Agile Toolbox, Working Agreements. Revisit at every review date._");
    return out.join("\n");
  }

  /* --- Model ------------------------------------------------------------ */
  function makeAgents() {
    return { overview: "", setup: "", build: "", test: "", lint: "", style: "", layout: "", pr: "",
      custom: false, always: "", ask: "", never: "" };
  }

  function makeDoc(team) {
    var today = UI.isoDate();
    return {
      id: UI.uid("wa"), team: team || "New team", purpose: "",
      reviewed: today, nextReview: addMonths(today, 3), rule: "no01",
      dodLink: "", includeProposed: false, items: [], agents: makeAgents()
    };
  }

  function makeItem(section, text, bucket) {
    return {
      id: UI.uid("it"), section: section, text: text || "", status: "Proposed", why: "",
      bucket: AGENT_SECTIONS[section] ? (bucket || guessBucket(text)) : "none",
      votes: null
    };
  }

  function str(v, max) {
    return typeof v === "string" ? v.slice(0, max || 4000) : (typeof v === "number" ? String(v) : "");
  }
  function isoOrEmpty(v) { return UI.parseDate(v) && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ""; }

  /** Validate and clean a doc. Throws an Error with a human message on bad shape. */
  function normalizeDoc(d) {
    if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("That file is not a working agreement.");
    if (!Array.isArray(d.items)) throw new Error("That file has no list of agreement items.");
    var doc = makeDoc(str(d.team, 120).trim() || "Imported team");
    doc.id = typeof d.id === "string" && d.id ? d.id : doc.id;
    doc.purpose = str(d.purpose, 300);
    doc.reviewed = isoOrEmpty(d.reviewed);
    doc.nextReview = isoOrEmpty(d.nextReview) || (doc.reviewed ? addMonths(doc.reviewed, 3) : "");
    doc.rule = d.rule === "avg3" ? "avg3" : "no01";
    doc.dodLink = str(d.dodLink, 500);
    doc.includeProposed = d.includeProposed === true;
    var seen = {};
    doc.items = d.items.map(function (raw, i) {
      if (!raw || typeof raw !== "object" || typeof raw.text !== "string") {
        throw new Error("Item " + (i + 1) + " in that file has no text.");
      }
      var section = SECTION_KEYS.indexOf(raw.section) !== -1 ? raw.section : "comm";
      var it = makeItem(section, str(raw.text), null);
      // Ids end up in DOM ids and selectors: keep them unique and selector-safe.
      if (typeof raw.id === "string" && /^[\w-]{1,80}$/.test(raw.id) && !seen[raw.id]) it.id = raw.id;
      seen[it.id] = true;
      it.status = STATUSES.indexOf(raw.status) !== -1 ? raw.status : "Proposed";
      it.why = str(raw.why, 1000);
      if (AGENT_SECTIONS[section]) {
        it.bucket = ["always", "ask", "never", "none"].indexOf(raw.bucket) !== -1 ? raw.bucket : guessBucket(it.text);
      }
      if (Array.isArray(raw.votes) && raw.votes.length === 6) {
        it.votes = raw.votes.map(function (n) {
          var x = Math.floor(Number(n));
          return isFinite(x) && x > 0 ? Math.min(x, 999) : 0;
        });
      }
      return it;
    });
    var a = d.agents && typeof d.agents === "object" ? d.agents : {};
    Object.keys(doc.agents).forEach(function (k) {
      if (k === "custom") doc.agents.custom = a.custom === true;
      else doc.agents[k] = str(a[k]);
    });
    return doc;
  }

  function parseImport(payload) {
    if (payload && payload.app === "agile-toolbox" && payload.tool && payload.tool !== NS) {
      throw new Error("That file was exported by another tool (" + str(payload.tool, 40) + ").");
    }
    var d = payload && payload.doc ? payload.doc : payload;
    return normalizeDoc(JSON.parse(JSON.stringify(d)));
  }

  function load() {
    var raw = Store.read(NS, "docs", []);
    state.docs = [];
    (Array.isArray(raw) ? raw : []).forEach(function (d) {
      try { state.docs.push(normalizeDoc(d)); } catch (err) { /* skip a corrupt entry */ }
    });
    var active = Store.read(NS, "active", null);
    state.doc = state.docs.filter(function (d) { return d.id === active; })[0] || state.docs[0] || null;
  }

  function save() {
    if (!Store.write(NS, "docs", state.docs)) UI.toast("Could not save: browser storage is full.", "danger");
    Store.write(NS, "active", state.doc ? state.doc.id : null);
  }

  /* --- Example ---------------------------------------------------------- */
  function exampleDoc() {
    var reviewed = UI.isoDate(UI.addDays(new Date(), -100));
    var doc = makeDoc("Checkout Squad");
    doc.purpose = "We build and run checkout, and we want working together, with each other and with our AI tools, to feel predictable.";
    doc.reviewed = reviewed;
    doc.nextReview = addMonths(reviewed, 3);
    doc.dodLink = "https://wiki.example.com/checkout/definition-of-done";
    function add(section, text, status, votes, why, bucket) {
      var it = makeItem(section, text, bucket);
      it.status = status;
      it.votes = votes || null;
      it.why = why || "";
      doc.items.push(it);
    }
    add("comm", "Core hours are 10:00 to 15:00 in our main time zone; outside them nobody is expected to reply.", "Agreed", [0, 0, 0, 1, 3, 2], "We span three time zones and need a shared window.");
    add("comm", "Async first: write it in the ticket or the team channel before calling a meeting.", "Agreed", [0, 0, 1, 2, 2, 1]);
    add("comm", "Reply to direct messages within half a working day; urgent means a call, not a chat message.", "Proposed", [0, 1, 2, 2, 1, 0], "Two people feel half a day is too slow during incidents.");
    add("meetings", "Cameras are optional.", "Agreed", [0, 0, 0, 0, 2, 4]);
    add("meetings", "No agenda, no meeting: a meeting without an agenda 24 hours ahead is cancelled.", "Agreed", [0, 0, 1, 1, 3, 1]);
    add("meetings", "One meeting-free half day per week for focus work.", "Proposed");
    add("planning", "Stop starting, start finishing: before pulling new work, check if you can help finish something in progress.", "Agreed", [0, 0, 0, 2, 2, 2], "Our cycle time doubled when everyone ran two items at once.");
    add("planning", "We swarm on blocked work: a blocked item is the first topic of the next stand-up.", "Agreed", [0, 0, 0, 3, 2, 1]);
    add("planning", "WIP limit of 2 items per person.", "Dropped", [2, 1, 1, 1, 1, 0], "Replaced by column limits on the board; per-person limits felt like surveillance.");
    add("review", "Keep pull requests small: one concern per PR, ideally under 400 changed lines.", "Agreed", [0, 0, 0, 2, 3, 1], "", "always");
    add("review", "Review requests get a first response within one working day.", "Agreed", [0, 0, 1, 2, 2, 1], "", "none");
    add("review", "No self-approval on main: every change to main is approved by someone other than its author.", "Agreed", [0, 0, 0, 0, 3, 3], "", "never");
    add("review", "Every PR links its ticket in the title or description.", "Agreed", [0, 0, 0, 1, 2, 3], "", "always");
    add("review", "Ask before adding a new dependency.", "Proposed", null, "", "ask");
    add("ai", "Use only the AI tools the company has approved; ask before trying a new one.", "Agreed", [0, 0, 0, 2, 2, 2], "Security review covers data retention for the approved tools only.", "ask");
    add("ai", "Never paste secrets, credentials, customer data or personal data into a prompt.", "Agreed", [0, 0, 0, 0, 1, 5], "", "never");
    add("ai", "A person is accountable for every merged change, whatever wrote it.", "Agreed", [0, 0, 0, 1, 2, 3], "", "always");
    add("ai", "Agents work on branches and never push to main.", "Agreed", [0, 0, 0, 0, 2, 4], "", "never");
    add("ai", "Generated tests must fail before the fix and pass after it.", "Agreed", [0, 0, 1, 1, 3, 1], "A test that never failed proves nothing.", "always");
    add("ai", "Disclose substantial AI generation in the PR description.", "Proposed", [0, 1, 1, 2, 2, 0], "Open question: what counts as substantial?", "always");
    add("ai", "When the agent loops or is confidently wrong, stop and take over.", "Agreed", [0, 0, 0, 2, 3, 1], "", "always");
    add("feedback", "Disagree and commit: once we decide, we all back the decision, and we revisit it with new data.", "Agreed", [0, 0, 1, 2, 2, 1]);
    add("feedback", "We call out a broken agreement kindly, by pointing at the agreement, not the person.", "Agreed", [0, 0, 0, 1, 3, 2]);
    add("learning", "On-call rotates weekly and the handover is written down.", "Agreed", [0, 0, 0, 2, 2, 2]);
    add("learning", "After a night page, the on-call person starts late the next day.", "Proposed");
    add("dod", "Code is reviewed and merged to main.", "Agreed", [0, 0, 0, 0, 3, 3]);
    add("dod", "Automated tests cover the change and pass in CI.", "Agreed", [0, 0, 0, 1, 2, 3]);
    doc.agents = makeAgents();
    doc.agents.overview = "Checkout service for the web shop: a TypeScript Node.js API (src/api) and a React front end (web/). Payments go through the payment provider SDK; never call its REST API directly.";
    doc.agents.setup = "pnpm install";
    doc.agents.build = "pnpm build";
    doc.agents.test = "pnpm test";
    doc.agents.lint = "pnpm lint --fix";
    doc.agents.style = "TypeScript strict mode, no any.\nPrefer small pure functions; keep side effects at the edges.\nUse the existing logger, never console.log.";
    doc.agents.layout = "src/api: HTTP handlers, one file per route.\nsrc/domain: business rules, no framework imports.\nweb/: React app; tests sit next to components as *.test.tsx.";
    doc.agents.pr = "Title format: [CHK-123] Short imperative summary.\nOne concern per PR; link the ticket in the description.\nSay in the description which parts were generated by an AI tool.";
    return doc;
  }

  /* --- Rendering: selector, empty state, meta --------------------------- */
  function renderSelect() {
    var sel = UI.qs("#doc-select");
    UI.clear(sel);
    state.docs.forEach(function (d) {
      sel.appendChild(UI.el("option", { value: d.id, selected: state.doc && d.id === state.doc.id, text: d.team || "Untitled team" }));
    });
    sel.disabled = !state.docs.length;
    ["#rename-doc", "#dup-doc", "#delete-doc", "#export-json"].forEach(function (id) {
      UI.qs(id).disabled = !state.doc;
    });
  }

  function renderMeta() {
    var d = state.doc;
    UI.qs("#team").value = d.team;
    UI.qs("#purpose").value = d.purpose;
    UI.qs("#reviewed").value = d.reviewed;
    UI.qs("#next-review").value = d.nextReview;
    UI.qs("#rule").value = d.rule;
    paintHeading();
  }

  function paintHeading() {
    var d = state.doc;
    UI.qs("#doc-heading").textContent = d.team || "Untitled team";
    UI.qs("#review-due").classList.toggle("hidden", !isDue(d));
  }

  function renderSummary() {
    var d = state.doc;
    var host = UI.qs("#summary");
    UI.clear(host);
    var counts = { Agreed: 0, Proposed: 0, Dropped: 0, discuss: 0 };
    d.items.forEach(function (it) {
      counts[it.status]++;
      if (needsDiscussion(it, d.rule)) counts.discuss++;
    });
    host.appendChild(UI.el("span", { class: "tag tag--ok", text: counts.Agreed + " agreed" }));
    host.appendChild(UI.el("span", { class: "tag tag--info", text: counts.Proposed + " proposed" }));
    if (counts.discuss) host.appendChild(UI.el("span", { class: "tag tag--warn", text: counts.discuss + " need discussion" }));
    host.appendChild(UI.el("span", { class: "tag", text: counts.Dropped + " dropped" }));
  }

  /* --- Rendering: sections and items ------------------------------------ */
  function renderSections() {
    var host = UI.qs("#sections");
    UI.clear(host);
    state.painters = {};
    SECTIONS.forEach(function (sec) { host.appendChild(buildSection(sec)); });
  }

  function rebuildSection(key, focusItemId) {
    var old = UI.qs("#sec-" + key);
    var fresh = buildSection(sectionOf(key));
    old.parentNode.replaceChild(fresh, old);
    if (focusItemId) {
      var t = UI.qs("#text-" + focusItemId);
      if (t) t.focus();
    }
  }

  function buildSection(sec) {
    var d = state.doc;
    var items = d.items.filter(function (it) { return it.section === sec.key; });
    var card = UI.el("div", { class: "card", id: "sec-" + sec.key });
    var agreed = items.filter(function (it) { return it.status === "Agreed"; }).length;
    card.appendChild(UI.el("div", { class: "card__head" }, [
      UI.el("h2", { text: sec.title }),
      UI.el("span", { class: "tag" + (agreed ? " tag--ok" : ""), text: agreed + " of " + items.length + " agreed" })
    ]));
    var body = UI.el("div", { class: "card__body stack" });
    card.appendChild(body);

    body.appendChild(UI.el("div", { class: "prompts" }, [
      UI.el("span", { class: "label", text: "Ask the team" }),
      UI.el("ul", {}, sec.prompts.map(function (p) { return UI.el("li", { text: p }); }))
    ]));

    var list = UI.el("div", { class: "items" });
    items.forEach(function (it) { list.appendChild(buildItem(it)); });
    if (!items.length) list.appendChild(UI.el("p", { class: "hint", text: "No agreements here yet. Add a suggestion below or write your own." }));
    body.appendChild(list);

    if (sec.key === "dod") {
      var linkId = "dod-link";
      var link = UI.el("input", { type: "text", id: linkId, maxlength: "500", placeholder: "https://wiki.example.com/definition-of-done" });
      link.value = d.dodLink;
      link.addEventListener("input", function () { d.dodLink = link.value; save(); });
      body.appendChild(UI.el("div", { class: "field" }, [
        UI.el("label", { class: "label", for: linkId, text: "Or link to the full Definition of Done" }), link
      ]));
    }

    var ownId = "own-" + sec.key;
    var own = UI.el("input", { type: "text", id: ownId, maxlength: "400", placeholder: "Write your own agreement" });
    function addOwn() {
      var text = own.value.trim();
      if (!text) { UI.toast("Write the agreement first.", "danger"); own.focus(); return; }
      var it = makeItem(sec.key, text, null);
      d.items.push(it);
      save();
      rebuildSection(sec.key, it.id);
      renderSummary();
    }
    own.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addOwn(); } });
    body.appendChild(UI.el("div", { class: "field" }, [
      UI.el("label", { class: "label", for: ownId, text: "Add your own" }),
      UI.el("div", { class: "row", style: "align-items:center" }, [
        UI.el("div", { class: "flex-1" }, own),
        UI.el("button", { class: "btn", type: "button", text: "Add", onclick: addOwn })
      ])
    ]));

    var taken = {};
    items.forEach(function (it) { taken[String(it.text).trim()] = true; });
    var free = sec.suggestions.filter(function (sg) { return !taken[sg.t]; });
    if (free.length) {
      body.appendChild(UI.el("div", {}, [
        UI.el("span", { class: "label", text: "Suggestions (click to add, then edit freely)" }),
        UI.el("div", { class: "suggestions mt-2" }, free.map(function (sg) {
          return UI.el("button", {
            class: "suggestion", type: "button", text: "+ " + sg.t,
            "aria-label": "Add suggestion: " + sg.t,
            onclick: function () {
              var it = makeItem(sec.key, sg.t, sg.b);
              d.items.push(it);
              save();
              rebuildSection(sec.key, it.id);
              renderSummary();
            }
          });
        }))
      ]));
    }
    return card;
  }

  function buildItem(it) {
    var d = state.doc;
    var node = UI.el("div", { class: "item", id: "item-" + it.id, dataset: { item: it.id } });

    var text = UI.el("textarea", { class: "item__text", id: "text-" + it.id, rows: "1", "aria-label": "Agreement text", maxlength: "1000" });
    text.value = it.text;
    text.addEventListener("input", function () { it.text = text.value; save(); });
    node.appendChild(text);
    text.addEventListener("input", function () {
      text.style.height = "auto";
      text.style.height = Math.max(36, text.scrollHeight + 2) + "px";
    });
    UI.defer(regrowAll);

    var tags = UI.el("div", { class: "item__tags" });
    var status = UI.el("select", { "aria-label": "Status" }, STATUSES.map(function (st) {
      return UI.el("option", { value: st, text: st });
    }));
    status.addEventListener("change", function () {
      it.status = status.value; save(); paint(); renderSummary(); refreshSectionTag(it.section);
    });

    var why = UI.el("input", { type: "text", class: "item__why", maxlength: "500", placeholder: "Why (optional)", "aria-label": "Why this agreement (optional)" });
    why.value = it.why;
    why.addEventListener("input", function () { it.why = why.value; save(); });

    var row = UI.el("div", { class: "item__row" }, [status, tags, why]);
    if (AGENT_SECTIONS[it.section]) {
      var bucket = UI.el("select", { "aria-label": "Where this goes in AGENTS.md boundaries", title: "Where this goes in AGENTS.md" },
        BUCKETS.map(function (b) { return UI.el("option", { value: b[0], text: "AGENTS.md: " + b[1] }); }));
      bucket.value = it.bucket;
      bucket.addEventListener("change", function () { it.bucket = bucket.value; save(); });
      row.appendChild(bucket);
    }
    var toggle = UI.el("button", { class: "btn btn--sm", type: "button", "aria-expanded": "false", text: "Fist of Five" });
    var del = UI.el("button", {
      class: "btn btn--sm btn--ghost", type: "button", text: "Remove", "aria-label": "Remove this agreement",
      onclick: function () {
        d.items = d.items.filter(function (x) { return x !== it; });
        save();
        rebuildSection(it.section);
        renderSummary();
        UI.toast("Agreement removed.");
      }
    });
    row.appendChild(toggle);
    row.appendChild(del);
    node.appendChild(row);

    // Consent panel: anonymous counts only.
    var panel = UI.el("div", { class: "consent hidden" });
    panel.appendChild(UI.el("p", { class: "hint", style: "margin:0", text:
      "Everyone shows 0 to 5 fingers at once. Tap how many people showed each value. No names are recorded." }));
    var grid = UI.el("div", { class: "fist" });
    var countNodes = [];
    var cells = [];
    for (var f = 0; f <= 5; f++) {
      (function (fingers) {
        var count = UI.el("span", { class: "fist__count", text: "0" });
        countNodes.push(count);
        var cell = UI.el("div", { class: "fist__cell", dataset: { fingers: String(fingers) } }, [
          UI.el("span", { class: "fist__label", text: fingers + (fingers === 1 ? " finger" : " fingers") }),
          count,
          UI.el("div", { class: "fist__btns" }, [
            UI.el("button", {
              class: "btn btn--sm", type: "button", text: "−", dataset: { act: "minus" },
              "aria-label": "One person fewer showing " + fingers,
              onclick: function () { vote(fingers, -1); }
            }),
            UI.el("button", {
              class: "btn btn--sm", type: "button", text: "+", dataset: { act: "plus" },
              "aria-label": "One more person showing " + fingers,
              onclick: function () { vote(fingers, 1); }
            })
          ])
        ]);
        cells.push(cell);
        grid.appendChild(cell);
      })(f);
    }
    panel.appendChild(grid);
    var result = UI.el("div", { class: "consent__result", "aria-live": "polite" });
    panel.appendChild(result);
    var ask = UI.el("div", { class: "consent__ask hidden" });
    panel.appendChild(ask);
    panel.appendChild(UI.el("div", { class: "btn-row mt-2" }, [
      UI.el("button", {
        class: "btn btn--sm btn--ghost", type: "button", text: "Clear counts",
        onclick: function () {
          var had = consent(it.votes, d.rule).checked;
          it.votes = null;
          if (had && it.status === "Agreed") it.status = "Proposed";
          save(); paint(); renderSummary(); refreshSectionTag(it.section);
        }
      })
    ]));
    node.appendChild(panel);

    toggle.addEventListener("click", function () {
      var open = panel.classList.toggle("hidden") === false;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    function vote(fingers, delta) {
      var v = Array.isArray(it.votes) ? it.votes.slice() : emptyVotes();
      var before = v[fingers] || 0;
      v[fingers] = Math.max(0, Math.min(999, before + delta));
      if (v[fingers] === before) return;
      it.votes = v;
      var c = consent(v, d.rule);
      // A Dropped item stays dropped until someone changes its status by hand.
      // Taking the last count away leaves no evidence of consent: back to Proposed.
      if (it.status !== "Dropped") it.status = c.checked && c.pass ? "Agreed" : "Proposed";
      save();
      paint();
      renderSummary();
      refreshSectionTag(it.section);
    }

    function paint() {
      var c = consent(it.votes, d.rule);
      var discuss = needsDiscussion(it, d.rule);
      status.value = it.status;
      node.className = "item item--" + it.status + (discuss ? " item--discuss" : "");
      UI.clear(tags);
      tags.appendChild(UI.el("span", {
        class: "tag " + (it.status === "Agreed" ? "tag--ok" : it.status === "Proposed" ? "tag--info" : ""),
        text: it.status
      }));
      if (discuss) tags.appendChild(UI.el("span", { class: "tag tag--warn", text: "Needs discussion" }));
      var v = Array.isArray(it.votes) ? it.votes : emptyVotes();
      countNodes.forEach(function (n, i) { n.textContent = String(v[i] || 0); });
      cells.forEach(function (cell, i) {
        cell.classList.toggle("fist__cell--low", i <= 1 && (v[i] || 0) > 0 && d.rule === "no01");
      });
      if (!c.checked) {
        result.textContent = "No consent check yet. Rule: " + ruleText(d.rule) + ".";
      } else {
        result.textContent = c.total + (c.total === 1 ? " person" : " people") + ", average " +
          (Math.floor(c.avg * 10 + 1e-9) / 10).toFixed(1) + (c.low ? ", " + c.low + " at 0 or 1" : "") + ". " +
          (c.pass ? "Consent reached: Agreed." : "Not yet: needs discussion.");
      }
      ask.classList.toggle("hidden", !discuss);
      ask.textContent = d.rule === "avg3"
        ? "Ask the people who showed 2 or less: what would make it a 3 for you? Then edit the wording and check again."
        : "Ask the people who showed 0 or 1: what would make it a 3 for you? Then edit the wording and check again.";
    }

    state.painters[it.id] = paint;
    paint();
    return node;
  }

  function refreshSectionTag(key) {
    var card = UI.qs("#sec-" + key);
    if (!card) return;
    var items = state.doc.items.filter(function (it) { return it.section === key; });
    var agreed = items.filter(function (it) { return it.status === "Agreed"; }).length;
    var tag = UI.qs(".card__head .tag", card);
    tag.className = "tag" + (agreed ? " tag--ok" : "");
    tag.textContent = agreed + " of " + items.length + " agreed";
  }

  /* --- Rendering: AGENTS.md and export ---------------------------------- */
  var AG_FIELDS = ["overview", "setup", "build", "test", "lint", "style", "layout", "pr"];

  function renderAgents() {
    var a = state.doc.agents;
    AG_FIELDS.forEach(function (k) { UI.qs("#ag-" + k).value = a[k]; });
    paintBoundaryInputs();
    renderAgentsPreview();
  }

  function paintBoundaryInputs() {
    var a = state.doc.agents;
    var b = boundaries(state.doc);
    ["always", "ask", "never"].forEach(function (k) {
      UI.qs("#ag-" + k).value = a.custom ? a[k] : b[k].join("\n");
    });
    UI.qs("#ag-bound-hint").textContent = a.custom
      ? "Edited by hand. Refill to start again from the Agreed items."
      : "Filled from Agreed items in Code review & quality and AI use & agents (set each item's AGENTS.md bucket). Edit freely, one rule per line.";
  }

  function renderAgentsPreview() {
    UI.qs("#ag-preview").textContent = toAgentsMd(state.doc);
  }

  function renderExport() {
    UI.qs("#include-proposed").checked = state.doc.includeProposed;
    UI.qs("#md-preview").textContent = toMarkdown(state.doc, state.doc.includeProposed);
  }

  function renderPrint() {
    var d = state.doc;
    var host = UI.qs("#print-view");
    UI.clear(host);
    host.appendChild(UI.el("h1", { text: "Working agreement: " + (d.team || "Our team") }));
    if (String(d.purpose).trim()) host.appendChild(UI.el("p", { text: d.purpose }));
    host.appendChild(UI.el("p", { class: "tiny", text: "Last reviewed " + UI.prettyDate(d.reviewed) +
      ". Next review " + UI.prettyDate(d.nextReview) + ". Consent: Fist of Five, " + ruleText(d.rule) + "." }));
    SECTIONS.forEach(function (sec) {
      var items = exportedItems(d, sec.key, d.includeProposed);
      var link = sec.key === "dod" && String(d.dodLink).trim();
      if (!items.length && !link) return;
      host.appendChild(UI.el("h2", { text: sec.title }));
      host.appendChild(UI.el("ul", {}, items.map(function (it) {
        return UI.el("li", {}, [
          String(it.text).trim() + (it.status === "Proposed" ? " (proposed)" : ""),
          String(it.why).trim() ? UI.el("div", { class: "why", text: "Why: " + it.why }) : null
        ]);
      })));
      if (link) host.appendChild(UI.el("p", { text: "Full Definition of Done: " + link }));
    });
  }

  function regrowAll() {
    UI.qsa(".item__text").forEach(function (t) {
      if (!t.offsetParent) return;
      t.style.height = "auto";
      t.style.height = Math.max(36, t.scrollHeight + 2) + "px";
    });
  }

  /* --- Tabs ------------------------------------------------------------- */
  function setTab(name, focus) {
    state.tab = name;
    Store.write(NS, "tab", name);
    UI.qsa(".tab").forEach(function (t) {
      var on = t.dataset.tab === name;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    ["agreement", "agents", "export"].forEach(function (p) {
      UI.qs("#panel-" + p).classList.toggle("hidden", p !== name);
    });
    if (!state.doc) return;
    if (name === "agreement") UI.defer(regrowAll);
    if (name === "agents") renderAgents();
    if (name === "export") renderExport();
  }

  /* --- Refresh cycle ---------------------------------------------------- */
  function refresh() {
    renderSelect();
    var has = !!state.doc;
    UI.qs("#empty").classList.toggle("hidden", has);
    UI.qs("#tool").classList.toggle("hidden", !has);
    if (!has) { UI.clear(UI.qs("#sections")); UI.clear(UI.qs("#print-view")); return; }
    renderMeta();
    renderSummary();
    renderSections();
    setTab(state.tab);
  }

  function switchDoc(id) {
    state.doc = state.docs.filter(function (d) { return d.id === id; })[0] || state.docs[0] || null;
    save();
    refresh();
  }

  function addDoc(doc) {
    state.docs.push(doc);
    state.doc = doc;
    save();
    refresh();
  }

  function newDoc() {
    var name = prompt("Team name", "New team");
    if (name === null) return;
    addDoc(makeDoc(name.trim() || "New team"));
    setTab("agreement");
    UI.qs("#team").focus();
  }

  function loadExample() {
    addDoc(exampleDoc());
    UI.toast("Example loaded: Checkout Squad.", "ok");
  }

  function init() {
    UI.initChrome();
    load();
    var tab = Store.read(NS, "tab", "agreement");
    state.tab = ["agreement", "agents", "export"].indexOf(tab) !== -1 ? tab : "agreement";
    refresh();

    UI.qs("#doc-select").addEventListener("change", function (e) { switchDoc(e.target.value); });
    UI.qs("#new-doc").addEventListener("click", newDoc);
    UI.qs("#empty-new").addEventListener("click", newDoc);
    UI.qs("#load-example").addEventListener("click", loadExample);
    UI.qs("#empty-example").addEventListener("click", loadExample);
    UI.qs("#rename-doc").addEventListener("click", function () {
      if (!state.doc) return;
      var name = prompt("Team name", state.doc.team);
      if (name === null || !name.trim()) return;
      state.doc.team = name.trim();
      save();
      renderSelect();
      renderMeta();
    });
    UI.qs("#dup-doc").addEventListener("click", function () {
      if (!state.doc) return;
      var copy = normalizeDoc(JSON.parse(JSON.stringify(state.doc)));
      copy.id = UI.uid("wa");
      copy.team = state.doc.team + " (copy)";
      copy.items.forEach(function (it) { it.id = UI.uid("it"); });
      addDoc(copy);
      UI.toast("Duplicated.", "ok");
    });
    UI.qs("#delete-doc").addEventListener("click", function () {
      if (!state.doc) return;
      if (!UI.confirmDanger("Delete the working agreement for \"" + state.doc.team + "\"? This cannot be undone.")) return;
      var gone = state.doc;
      state.docs = state.docs.filter(function (d) { return d !== gone; });
      state.doc = state.docs[0] || null;
      save();
      refresh();
      UI.toast("Agreement deleted.");
    });

    UI.qs("#team").addEventListener("input", function (e) {
      state.doc.team = e.target.value; save(); paintHeading();
      var opt = UI.qs("#doc-select option[value='" + state.doc.id + "']");
      if (opt) opt.textContent = state.doc.team || "Untitled team";
    });
    UI.qs("#purpose").addEventListener("input", function (e) { state.doc.purpose = e.target.value; save(); });
    UI.qs("#reviewed").addEventListener("change", function (e) {
      var v = isoOrEmpty(e.target.value);
      state.doc.reviewed = v;
      if (v) { state.doc.nextReview = addMonths(v, 3); UI.qs("#next-review").value = state.doc.nextReview; }
      save(); paintHeading();
    });
    UI.qs("#next-review").addEventListener("change", function (e) {
      state.doc.nextReview = isoOrEmpty(e.target.value); save(); paintHeading();
    });
    UI.qs("#mark-reviewed").addEventListener("click", function () {
      state.doc.reviewed = UI.isoDate();
      state.doc.nextReview = addMonths(state.doc.reviewed, 3);
      save(); renderMeta();
      UI.toast("Reviewed today. Next review " + UI.prettyDate(state.doc.nextReview) + ".", "ok");
    });
    UI.qs("#rule").addEventListener("change", function (e) {
      var d = state.doc;
      d.rule = e.target.value === "avg3" ? "avg3" : "no01";
      d.items.forEach(function (it) {
        var c = consent(it.votes, d.rule);
        if (c.checked && it.status !== "Dropped") it.status = c.pass ? "Agreed" : "Proposed";
      });
      save();
      UI.defer(function () { renderSummary(); renderSections(); });
    });

    UI.qsa(".tab").forEach(function (t) {
      t.addEventListener("click", function () { setTab(t.dataset.tab); });
      t.addEventListener("keydown", function (e) {
        var order = ["agreement", "agents", "export"];
        var i = order.indexOf(state.tab);
        if (e.key === "ArrowRight") { e.preventDefault(); setTab(order[(i + 1) % 3], true); }
        if (e.key === "ArrowLeft") { e.preventDefault(); setTab(order[(i + 2) % 3], true); }
      });
    });

    AG_FIELDS.forEach(function (k) {
      UI.qs("#ag-" + k).addEventListener("input", function (e) {
        state.doc.agents[k] = e.target.value; save(); renderAgentsPreview();
      });
    });
    ["always", "ask", "never"].forEach(function (k) {
      UI.qs("#ag-" + k).addEventListener("input", function () {
        var a = state.doc.agents;
        if (!a.custom) {
          a.custom = true;
          ["always", "ask", "never"].forEach(function (j) { a[j] = UI.qs("#ag-" + j).value; });
          UI.qs("#ag-bound-hint").textContent = "Edited by hand. Refill to start again from the Agreed items.";
        }
        a[k] = UI.qs("#ag-" + k).value;
        save();
        renderAgentsPreview();
      });
    });
    UI.qs("#ag-refill").addEventListener("click", function () {
      var a = state.doc.agents;
      a.custom = false;
      a.always = a.ask = a.never = "";
      save();
      paintBoundaryInputs();
      renderAgentsPreview();
      UI.toast("Boundaries refilled from Agreed items.", "ok");
    });
    UI.qs("#ag-copy").addEventListener("click", function () { UI.copy(toAgentsMd(state.doc)); });
    UI.qs("#ag-download").addEventListener("click", function () {
      UI.download("AGENTS.md", toAgentsMd(state.doc), "text/markdown");
    });

    UI.qs("#include-proposed").addEventListener("change", function (e) {
      state.doc.includeProposed = e.target.checked; save(); renderExport();
    });
    UI.qs("#md-download").addEventListener("click", function () {
      UI.download(UI.slug(state.doc.team) + "-working-agreement.md", toMarkdown(state.doc, state.doc.includeProposed), "text/markdown");
    });
    UI.qs("#md-copy").addEventListener("click", function () { UI.copy(toMarkdown(state.doc, state.doc.includeProposed)); });
    UI.qs("#print").addEventListener("click", function () { renderPrint(); window.print(); });
    window.addEventListener("resize", UI.debounce(regrowAll, 150));
    window.addEventListener("beforeprint", function () { if (state.doc) renderPrint(); });

    UI.qs("#export-json").addEventListener("click", function () {
      if (!state.doc) return;
      UI.downloadJSON(UI.slug(state.doc.team) + "-working-agreement.json", exportPayload(state.doc));
    });
    UI.qs("#import-json").addEventListener("click", function () {
      UI.pickJSON(function (payload) {
        var doc;
        try { doc = parseImport(payload); }
        catch (err) { UI.toast(err.message || "That file is not a working agreement.", "danger", 4500); return; }
        doc.id = UI.uid("wa");
        if (state.docs.some(function (x) { return x.team === doc.team; })) doc.team += " (imported)";
        addDoc(doc);
        UI.toast("Agreement imported.", "ok");
      });
    });
  }

  function exportPayload(doc) {
    return { app: "agile-toolbox", tool: NS, schema: Store.schema, exportedAt: new Date().toISOString(), doc: doc };
  }

  // Pure functions for the scenario test. Not part of the UI.
  window.__agreements = {
    consent: consent, addMonths: addMonths, parseImport: parseImport, exportPayload: exportPayload,
    toMarkdown: toMarkdown, toAgentsMd: toAgentsMd, guessBucket: guessBucket,
    current: function () { return state.doc; }
  };

  document.addEventListener("DOMContentLoaded", init);
})();
