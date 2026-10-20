/* ==========================================================================
   Task Brief: write work items a teammate or an AI agent can actually finish.

   The readiness check is deliberately a list of named rules, each with a
   reason, never a score. A team should be able to argue with every line.
   ========================================================================== */
(function () {
  "use strict";

  var NS = "brief";

  var TYPE_LABEL = { feature: "Feature", bug: "Bug", spike: "Spike", refactor: "Refactor", chore: "Chore" };
  var EXEC_LABEL = { person: "Person", agent: "AI agent", pair: "Pair (person + agent)" };
  var EXEC_FOR = { person: "a person", agent: "an AI agent", pair: "a pair (person + agent)" };
  var RISK_LABEL = { low: "Low", medium: "Medium", high: "High" };
  var RISK_HINT = {
    low: "Low: one reviewer is enough. An agent may work end to end and open a pull request; a person merges.",
    medium: "Medium: one human reviewer reads the whole diff before merge. An agent may open a pull request, never merge.",
    high: "High: a second human reviewer is required. No agent autonomy above draft: the agent proposes, a person owns every commit."
  };

  /* Words and phrases that make a criterion impossible to check. */
  var VAGUE = [
    "fast", "faster", "quickly", "quick", "user-friendly", "user friendly", "intuitive", "robust",
    "easy", "easily", "etc", "some", "appropriate", "appropriately", "as needed", "should handle",
    "works well", "properly", "seamless", "seamlessly", "efficient", "efficiently", "flexible",
    "reasonable", "reasonably", "adequate", "optimal", "if possible", "and so on", "tbd", "nice"
  ];
  var VAGUE_RE = VAGUE.map(function (w) {
    var esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
    // word characters include "_" (code identifiers like fast_path) and accented letters
    return { word: w, re: new RegExp("(^|[^a-z0-9_\\u00c0-\\u024f-])(" + esc + ")(?=$|[^a-z0-9_\\u00c0-\\u024f-])", "i") };
  });

  var DOD = {
    feature: [
      "All acceptance criteria verified as written",
      "Tests added or updated and passing in CI",
      "Reviewed at the level the risk tier requires",
      "Docs or release notes updated if behaviour changed"
    ],
    bug: [
      "Root cause written in the ticket",
      "A regression test fails before the fix and passes after it",
      "Reviewed at the level the risk tier requires",
      "Fix confirmed in the reported environment"
    ],
    spike: [
      "Question answered with a recommendation",
      "Evidence and trade-offs written up and linked here",
      "Follow-up work items created or explicitly declined",
      "Throwaway code is not merged"
    ],
    refactor: [
      "Existing tests pass without changes to their assertions",
      "No user-visible behaviour change",
      "Reviewed at the level the risk tier requires",
      "Removed code paths are confirmed unused"
    ],
    chore: [
      "Change applied in every environment listed",
      "Reviewed at the level the risk tier requires",
      "Runbook or docs updated if a procedure changed"
    ]
  };

  /* Prompts per type: placeholders only, never pre-filled text a person must delete. */
  var TEMPLATE = {
    feature: {
      goal: "Who benefits and what changes for them. E.g. Tenant admins can export the audit log as CSV, so compliance reviews no longer need a database query.",
      inScope: "What this brief delivers. One per line.",
      criterion: "Given a signed-in admin on the Audit page, when they click Export CSV, then a file with every row in the current filter downloads",
      verification: "e.g. npm test -- audit-export\nManual: export with a filter applied and compare the row count with the table"
    },
    bug: {
      goal: "What is broken, for whom, and why it matters now. E.g. Safari users cannot reset their password, which creates about 30 support tickets a week.",
      inScope: "The fix, plus a regression test.",
      criterion: "Given the reproduction steps above, when they are followed in the listed environment, then the expected result happens",
      verification: "e.g. Write a test that reproduces the bug and fails first\nRun the reproduction steps manually in the listed environment"
    },
    spike: {
      goal: "The decision this spike unblocks. E.g. Decide whether search can move to Postgres full-text before the roadmap review.",
      inScope: "Options to compare, prototypes allowed.",
      criterion: "A written recommendation compares at least two options against the constraints",
      verification: "e.g. Benchmark script and its output attached\nRecommendation reviewed by the tech lead"
    },
    refactor: {
      goal: "What gets easier after this, and why now. E.g. Split the billing module so next sprint's tax change touches one file.",
      inScope: "Modules or files to restructure.",
      criterion: "Given the existing test suite, when it runs after the change, then every test passes without edits to its assertions",
      verification: "e.g. Full test suite\nDiff review: no public signature changes"
    },
    chore: {
      goal: "What needs doing and what happens if it does not. E.g. Upgrade Node 18 to 22 before end of support on 30 April.",
      inScope: "Repositories, services or environments affected.",
      criterion: "Given the CI pipeline, when it runs on main, then every job uses Node 22",
      verification: "e.g. CI run on main is green\nnode --version on each environment prints v22"
    }
  };

  var TYPE_FIELDS = {
    bug: {
      title: "Bug details",
      fields: [
        { key: "repro", label: "Steps to reproduce", ph: "1. Open ...\n2. Click ...\n3. See ...", multi: true },
        { key: "expected", label: "Expected", ph: "What should happen" },
        { key: "actual", label: "Actual", ph: "What happens instead, with the exact error text" },
        { key: "environment", label: "Environment", ph: "Browser, OS, app version, tenant, feature flags" }
      ]
    },
    spike: {
      title: "Spike details",
      fields: [
        { key: "question", label: "Question to answer", ph: "The one question this spike must answer" },
        { key: "timebox", label: "Timebox", ph: "e.g. 2 days" },
        { key: "decision", label: "Done looks like (the decision)", ph: "e.g. A recommendation: option A or B, with cost and risks", multi: true }
      ]
    },
    refactor: {
      title: "Refactor details",
      fields: [
        { key: "preserve", label: "Behaviour that must not change", ph: "Public APIs, outputs, performance budgets. One per line.", multi: true }
      ]
    }
  };

  var EXTRA_KEYS = ["repro", "expected", "actual", "environment", "question", "timebox", "decision", "preserve"];
  var TEXT_KEYS = ["title", "goal", "context", "inScope", "outScope", "constraints", "verification"];

  var state = {
    briefs: [],
    brief: null,
    tab: "md",
    search: "",
    dirty: false
  };

  /* --- Model ------------------------------------------------------------ */
  function nowStamp() { return new Date().toISOString(); }

  function makeBrief(type) {
    type = TYPE_LABEL[type] ? type : "feature";
    var t = nowStamp();
    return {
      id: UI.uid("brief"),
      title: "",
      type: type,
      goal: "", context: "", inScope: "", outScope: "", constraints: "", verification: "",
      extra: {},
      criteria: [{ id: UI.uid("ac"), text: "" }],
      questions: [],
      dod: defaultDod(type),
      risk: "medium",
      executor: "person",
      created: t,
      updated: t
    };
  }

  function defaultDod(type) {
    return (DOD[type] || DOD.feature).map(function (text) { return { id: UI.uid("dod"), text: text, done: false }; });
  }

  function str(v) { return typeof v === "string" ? v : (v === null || v === undefined ? "" : String(v)); }

  function textList(arr, withDone, prefix) {
    if (!Array.isArray(arr)) return [];
    return arr.map(function (x) {
      if (typeof x === "string") x = { text: x };
      if (!x || typeof x !== "object") return null;
      var item = { id: typeof x.id === "string" && x.id ? x.id : UI.uid(prefix), text: str(x.text) };
      if (withDone) item.done = !!x.done;
      return item;
    }).filter(Boolean);
  }

  /** Coerce anything brief-shaped into a valid brief, or null when it is not one. */
  function normalize(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    var hasContent = typeof raw.title === "string" || typeof raw.goal === "string" || Array.isArray(raw.criteria);
    if (!hasContent) return null;
    var b = {
      id: typeof raw.id === "string" && raw.id ? raw.id : UI.uid("brief"),
      type: TYPE_LABEL[raw.type] ? raw.type : "feature",
      risk: RISK_LABEL[raw.risk] ? raw.risk : "medium",
      executor: EXEC_LABEL[raw.executor] ? raw.executor : "person",
      extra: {},
      criteria: textList(raw.criteria, false, "ac"),
      questions: textList(raw.questions, false, "q"),
      dod: textList(raw.dod, true, "dod"),
      created: typeof raw.created === "string" ? raw.created : nowStamp(),
      updated: typeof raw.updated === "string" ? raw.updated : nowStamp()
    };
    TEXT_KEYS.forEach(function (k) { b[k] = str(raw[k]); });
    var ex = raw.extra && typeof raw.extra === "object" ? raw.extra : {};
    EXTRA_KEYS.forEach(function (k) { b.extra[k] = str(ex[k]); });
    return b;
  }

  function load() {
    var raw = Store.read(NS, "briefs", []);
    state.briefs = (Array.isArray(raw) ? raw : []).map(normalize).filter(Boolean);
    var active = Store.read(NS, "active", null);
    state.brief = state.briefs.filter(function (b) { return b.id === active; })[0] || sorted()[0] || null;
    var ui = Store.read(NS, "ui", {});
    state.tab = ui && (ui.tab === "prompt" || ui.tab === "json") ? ui.tab : "md";
    state.dirty = false;
  }

  function save() {
    var ok = Store.write(NS, "briefs", state.briefs);
    Store.write(NS, "active", state.brief ? state.brief.id : null);
    state.dirty = false;
    setSaveState(ok ? "Saved" : "Not saved: storage is full");
  }

  var scheduleSave = UI.debounce(save, 400);

  function touch() {
    if (!state.brief) return;
    state.brief.updated = nowStamp();
    state.dirty = true;
    setSaveState("Saving...");
    scheduleSave();
  }

  function flush() { if (state.dirty) save(); }

  function setSaveState(text) {
    var n = UI.qs("#save-state");
    if (n) n.textContent = text;
  }

  function sorted() {
    return state.briefs.slice().sort(function (a, b) { return a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0; });
  }

  /* --- Text helpers ----------------------------------------------------- */
  /** One item per line, bullets stripped, blanks dropped. */
  function lines(text) {
    return str(text).split(/\r?\n/).map(function (l) {
      return l.replace(/^\s*(?:[-*\u2022]|\[ \]|\[x\])\s+/i, "").trim();
    }).filter(function (l) { return l.length > 0; });
  }

  function words(text) {
    var t = str(text).trim();
    return t ? t.split(/\s+/).length : 0;
  }

  /** A list item must stay one line in Markdown and in a numbered prompt. */
  function oneLine(text) { return str(text).replace(/\s*[\r\n]+\s*/g, " ").trim(); }
  /** End with punctuation so a following sentence does not run on. */
  function sentence(text) { var t = oneLine(text); return /[.?!:]$/.test(t) ? t : t + "."; }

  function filled(list) {
    return list.filter(function (x) { return str(x.text).trim().length > 0; });
  }

  function findVague(text) {
    var hits = [];
    VAGUE_RE.forEach(function (v) {
      var m = v.re.exec(str(text));
      if (m) hits.push(m[2].toLowerCase().replace(/\s+/g, " "));
    });
    return hits;
  }

  /** Distinct outcomes joined with "and" (or "&") in the goal. */
  function andParts(text) {
    var t = str(text).trim();
    if (!t) return 0;
    return t.split(/\s+(?:and|&)\s+/i).filter(function (p) { return p.trim(); }).length;
  }

  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }

  function quoteList(arr) {
    return arr.map(function (w) { return "\u201c" + w + "\u201d"; }).join(", ");
  }

  /* --- Readiness -------------------------------------------------------- */
  function analyze(b) {
    var checks = [];
    function add(id, label, status, reason, tags) {
      checks.push({ id: id, label: label, status: status, reason: reason, tags: tags || [] });
    }
    var isAgent = b.executor === "agent";
    var involvesAgent = isAgent || b.executor === "pair";
    var crit = filled(b.criteria);
    var ex = b.extra || {};

    add("title", "Title", b.title.trim() ? "pass" : "warn",
      b.title.trim() ? "Has a title." : "Add a short, specific title so the brief can be found in the list and the tracker.",
      ["DoR"]);

    var gw = words(b.goal);
    if (!gw) add("goal", "Goal stated", "fail", "State why this work matters and who benefits. An executor who knows the why makes better small decisions.", ["V", "DoR"]);
    else if (gw < 6) add("goal", "Goal stated", "warn", "The goal is only " + plural(gw, "word") + ". Say who benefits and what changes for them.", ["V", "DoR"]);
    else add("goal", "Goal stated", "pass", "The goal says why (" + gw + " words).", ["V", "DoR"]);

    add("criteria", "Acceptance criteria", crit.length ? "pass" : "fail",
      crit.length ? plural(crit.length, "criterion", "criteria") + "." :
        "Add at least one acceptance criterion. Without one nobody can say when this is finished.",
      ["T", "DoR"]);

    var vagueRows = [];
    b.criteria.forEach(function (c, i) {
      var hits = findVague(c.text);
      if (hits.length) vagueRows.push("Criterion " + (i + 1) + " uses " + quoteList(hits) + ".");
    });
    if (!crit.length) add("vague", "Criteria are checkable", "pass", "Nothing to scan yet.", ["T"]);
    else if (vagueRows.length) {
      add("vague", "Criteria are checkable", involvesAgent ? "fail" : "warn",
        vagueRows.join(" ") + " Replace each with something you can observe or measure: a number, a named state, an exact message.",
        ["T"]);
    } else add("vague", "Criteria are checkable", "pass", "No vague words found in the criteria.", ["T"]);

    var ver = lines(b.verification);
    if (ver.length) add("verify", "Verification steps", "pass", plural(ver.length, "step") + " to prove it works.", ["T", "DoR"]);
    else add("verify", "Verification steps", involvesAgent ? "fail" : "warn",
      involvesAgent ? "An agent cannot prove its work without steps to run. Add the tests, commands or manual checks that show each criterion holds." :
        "Add the tests, commands or manual checks that prove it works, so review does not depend on memory.",
      ["T", "DoR"]);

    if (lines(b.outScope).length) add("outscope", "Out of scope stated", "pass", "Boundaries are written down.", ["E", "DoR"]);
    else add("outscope", "Out of scope stated", isAgent ? "fail" : "warn",
      isAgent ? "Agents widen scope to be helpful. Say what must not be touched or built." :
        "Say what this brief will not do, so nobody quietly expands it.",
      ["E", "DoR"]);

    var qs = filled(b.questions);
    if (!qs.length) add("questions", "No open questions", "pass", "Nothing left undecided.", ["N", "DoR"]);
    else add("questions", "No open questions", isAgent ? "fail" : "warn",
      plural(qs.length, "open question") + ". " + (isAgent ?
        "An agent will guess an answer. Resolve them, or write the answers into the brief as decisions." :
        "Resolve them before work starts, or agree who answers them and by when."),
      ["N", "DoR"]);

    var parts = andParts(b.goal);
    var tooMany = crit.length > 7, tooJoined = parts > 3;
    if (tooMany || tooJoined) {
      var why = [];
      if (tooMany) why.push(plural(crit.length, "criterion", "criteria") + " (more than 7)");
      if (tooJoined) why.push("the goal joins " + parts + " outcomes with \u201cand\u201d");
      add("size", "Small enough", "warn", "This looks big: " + why.join(", and ") + ". Consider splitting it into briefs that each deliver one outcome.", ["S", "E"]);
    } else add("size", "Small enough", "pass", "One outcome, " + plural(crit.length, "criterion", "criteria") + ".", ["S", "E"]);

    if (b.risk === "high" && isAgent) {
      add("risk", "Risk matches executor", "warn",
        "High risk with an AI agent working alone. Switch the executor to Pair, or require human approval: the agent works in draft only and two people review.",
        ["Risk"]);
    } else if (b.risk === "high") {
      add("risk", "Risk matches executor", "pass",
        b.executor === "pair" ? "High risk, paired: the agent stays at draft and a second human reviewer signs off." :
          "High risk: plan for a second human reviewer.", ["Risk"]);
    } else {
      add("risk", "Risk matches executor", "pass", RISK_LABEL[b.risk] + " risk for " + EXEC_FOR[b.executor] + ".", ["Risk"]);
    }

    var dep = lines(b.context).filter(function (l) { return /\b(blocked by|depends on|waiting (on|for))\b/i.test(l); });
    if (dep.length) add("deps", "Independent", "warn",
      "Context mentions a dependency (\u201c" + dep[0] + "\u201d). Make sure it is done first, or this brief cannot be finished on its own.", ["I"]);
    else add("deps", "Independent", "pass", "No blocking dependency mentioned in the context.", ["I"]);

    if (b.type === "bug") {
      var rep = lines(ex.repro);
      add("repro", "Steps to reproduce", rep.length ? "pass" : "fail",
        rep.length ? plural(rep.length, "step") + " to reproduce." : "A bug without reproduction steps cannot be confirmed, or confirmed fixed.",
        ["T", "DoR"]);
      var ea = str(ex.expected).trim() && str(ex.actual).trim();
      add("expected", "Expected vs actual", ea ? "pass" : "warn",
        ea ? "Expected and actual results are both written." : "Write both what should happen and what happens instead, with the exact error text.",
        ["T"]);
    }
    if (b.type === "spike") {
      add("question", "Question to answer", str(ex.question).trim() ? "pass" : "fail",
        str(ex.question).trim() ? "The spike has one question to answer." : "A spike needs the one question it must answer.",
        ["V", "DoR"]);
      add("timebox", "Timebox", str(ex.timebox).trim() ? "pass" : "fail",
        str(ex.timebox).trim() ? "Timeboxed: " + str(ex.timebox).trim() + "." : "A spike without a timebox becomes a project. Set how long to look before deciding.",
        ["E", "S", "DoR"]);
      add("decision", "Done is a decision", str(ex.decision).trim() ? "pass" : "warn",
        str(ex.decision).trim() ? "The expected decision is described." : "Describe the decision the spike ends with, e.g. option A or B with evidence.",
        ["T"]);
    }
    if (b.type === "refactor") {
      add("preserve", "Behaviour to preserve", lines(ex.preserve).length ? "pass" : "warn",
        lines(ex.preserve).length ? "Protected behaviour is listed." : "Name the behaviour that must not change, so a reviewer can check nothing moved.",
        ["T"]);
    }

    add("dod", "Definition of Done", filled(b.dod).length ? "pass" : "warn",
      filled(b.dod).length ? plural(filled(b.dod).length, "item") + "." : "Add the team's Definition of Done so finished means the same thing to everyone.",
      ["DoD"]);

    var counts = { pass: 0, warn: 0, fail: 0 };
    checks.forEach(function (c) { counts[c.status]++; });
    var verdict = counts.fail ? "Not ready" : counts.warn ? "Ready with warnings" : "Ready";
    return { checks: checks, counts: counts, verdict: verdict };
  }

  function verdictKind(v) { return v === "Ready" ? "ok" : v === "Not ready" ? "danger" : "warn"; }

  /* --- Exports ---------------------------------------------------------- */
  function bullets(arr, prefix) { return arr.map(function (l) { return (prefix || "- ") + l; }); }

  function typeSection(b, md) {
    var ex = b.extra || {}, out = [];
    var h = "## ";
    if (b.type === "bug") {
      var rep = lines(ex.repro);
      out.push(h + "Steps to reproduce");
      out = out.concat(rep.length ? rep.map(function (l, i) { return /^\d+[.)]/.test(l) ? l : (i + 1) + ". " + l; }) : ["(missing)"]);
      out.push("");
      if (str(ex.expected).trim()) out.push((md ? "**Expected:** " : "Expected: ") + ex.expected.trim());
      if (str(ex.actual).trim()) out.push((md ? "**Actual:** " : "Actual: ") + ex.actual.trim());
      if (str(ex.environment).trim()) out.push((md ? "**Environment:** " : "Environment: ") + ex.environment.trim());
      out.push("");
    } else if (b.type === "spike") {
      out.push(h + "Spike");
      out.push((md ? "**Question:** " : "Question to answer: ") + (str(ex.question).trim() || "(missing)"));
      out.push((md ? "**Timebox:** " : "Timebox: ") + (str(ex.timebox).trim() || "(missing)"));
      if (str(ex.decision).trim()) out.push((md ? "**Done looks like:** " : "Done looks like: ") + ex.decision.trim());
      out.push("");
    } else if (b.type === "refactor" && lines(ex.preserve).length) {
      out.push(h + "Behaviour that must not change");
      out = out.concat(bullets(lines(ex.preserve)));
      out.push("");
    }
    return out;
  }

  function toMarkdown(b) {
    var r = analyze(b);
    var out = ["# " + (b.title.trim() || "Untitled brief"), ""];
    out.push("**Type:** " + TYPE_LABEL[b.type] + " | **Risk:** " + RISK_LABEL[b.risk] +
      " | **Executor:** " + EXEC_LABEL[b.executor] + " | **Readiness:** " + r.verdict);
    out.push("");
    out.push("## Goal", b.goal.trim() || "(missing)", "");
    out = out.concat(typeSection(b, true));
    var ctx = lines(b.context);
    if (ctx.length) { out.push("## Context"); out = out.concat(bullets(ctx)); out.push(""); }
    out.push("## Scope", "", "### In scope");
    out = out.concat(lines(b.inScope).length ? bullets(lines(b.inScope)) : ["(not stated)"]);
    out.push("", "### Out of scope");
    out = out.concat(lines(b.outScope).length ? bullets(lines(b.outScope)) : ["(not stated)"]);
    out.push("");
    if (lines(b.constraints).length) { out.push("## Constraints"); out = out.concat(bullets(lines(b.constraints))); out.push(""); }
    out.push("## Acceptance criteria");
    var crit = filled(b.criteria);
    out = out.concat(crit.length ? crit.map(function (c) { return "- [ ] " + oneLine(c.text); }) : ["(none yet)"]);
    out.push("", "## How to verify");
    out = out.concat(lines(b.verification).length ? bullets(lines(b.verification)) : ["(not stated)"]);
    out.push("");
    var qs = filled(b.questions);
    if (qs.length) {
      out.push("## Open questions");
      out = out.concat(qs.map(function (q) { return "- [ ] " + oneLine(q.text); }));
      out.push("");
    }
    out.push("## Review");
    out.push(RISK_HINT[b.risk]);
    out.push("");
    out.push("## Definition of Done");
    out = out.concat(filled(b.dod).map(function (d) { return "- [" + (d.done ? "x" : " ") + "] " + oneLine(d.text); }));
    if (!filled(b.dod).length) out.push("(none)");
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  function stopRules(b) {
    var rules = ["You are about to change anything outside the listed scope."];
    if (lines(b.outScope).length) rules.push("The work would touch anything listed under Out of scope.");
    filled(b.questions).forEach(function (q) { rules.push("This is still undecided: " + sentence(q.text) + " Ask before deciding it yourself."); });
    if (lines(b.constraints).length) rules.push("A constraint above cannot be met as written.");
    rules.push("A verification step fails and the cause is not obvious, or a step cannot be run in your environment.");
    if (b.type === "bug") rules.push("You cannot reproduce the bug with the steps above.");
    if (b.type === "spike" && str(b.extra.timebox).trim()) rules.push("The timebox (" + b.extra.timebox.trim() + ") runs out before the question is answered.");
    if (b.type === "refactor") rules.push("Any change would alter behaviour listed as must not change.");
    if (!lines(b.context).length) rules.push("You cannot find the code or documents this task refers to.");
    if (b.risk === "high") {
      rules.push("You are about to commit, merge, deploy, migrate data or change permissions. This task is High risk: work in draft only, and two human reviewers approve every change.");
    } else if (b.risk === "medium") {
      rules.push("You are about to merge or deploy. A human reviews the full diff first.");
    } else {
      rules.push("You are about to merge or deploy. Open a pull request instead.");
    }
    return rules;
  }

  function toPrompt(b) {
    var out = [];
    out.push("Task: " + (b.title.trim() || "Untitled brief"));
    out.push("Type: " + TYPE_LABEL[b.type] + ". Risk: " + RISK_LABEL[b.risk] + ".");
    out.push("");
    out.push("Complete the task below. Work only inside the stated scope. Prove every acceptance criterion with the verification steps before reporting done, and report which steps you ran and their results.");
    out.push("");
    out.push("## Goal", b.goal.trim() || "(not stated: ask before starting)", "");
    out = out.concat(typeSection(b, false));
    out.push("## Context");
    out = out.concat(lines(b.context).length ? bullets(lines(b.context)) : ["- None given. Locate the relevant code and list the files you plan to change before editing."]);
    out.push("", "## Scope");
    out = out.concat(lines(b.inScope).length ? bullets(lines(b.inScope)) : ["- Only what the goal and acceptance criteria require."]);
    out.push("", "## Out of scope");
    out = out.concat(lines(b.outScope).length ? bullets(lines(b.outScope)) : ["- Anything not required by the acceptance criteria."]);
    out.push("", "## Constraints");
    out = out.concat(lines(b.constraints).length ? bullets(lines(b.constraints)) : ["- Follow the existing conventions of the codebase."]);
    out.push("", "## Acceptance criteria");
    var crit = filled(b.criteria);
    out = out.concat(crit.length ? crit.map(function (c, i) { return (i + 1) + ". " + oneLine(c.text); }) : ["(none: ask before starting)"]);
    out.push("", "## How to verify");
    out = out.concat(lines(b.verification).length ? bullets(lines(b.verification)) : ["- No steps given. Propose how you will verify each criterion and wait for confirmation."]);
    out.push("", "## Stop and ask if");
    out = out.concat(bullets(stopRules(b)));
    out.push("", "## Definition of done");
    out = out.concat(filled(b.dod).length ? bullets(filled(b.dod).map(function (d) { return oneLine(d.text); })) : ["- Every acceptance criterion is verified."]);
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  function jsonOne(b) { return { app: "agile-toolbox", tool: "brief", schema: Store.schema, brief: b }; }
  function jsonAll() { return { app: "agile-toolbox", tool: "brief", schema: Store.schema, briefs: state.briefs }; }

  /** Accepts a single-brief export, a library export, a bare brief or an array. Returns count imported. */
  function importPayload(obj) {
    var list = null;
    if (Array.isArray(obj)) list = obj;
    else if (obj && typeof obj === "object") {
      if (obj.tool && obj.tool !== "brief") {
        UI.toast("That file comes from another tool (" + str(obj.tool) + "), not Task Brief.", "danger");
        return 0;
      }
      if (Array.isArray(obj.briefs)) list = obj.briefs;
      else if (obj.brief && typeof obj.brief === "object") list = [obj.brief];
      else if (normalize(obj)) list = [obj];
    }
    if (!list) { UI.toast("That file is not a Task Brief export.", "danger"); return 0; }
    var good = list.map(normalize).filter(Boolean);
    if (!good.length) { UI.toast("No valid briefs found in that file.", "danger"); return 0; }
    var ids = {};
    state.briefs.forEach(function (b) { ids[b.id] = true; });
    good.forEach(function (b) {
      if (ids[b.id]) b.id = UI.uid("brief");
      ids[b.id] = true;
      state.briefs.push(b);
    });
    state.brief = good[0];
    save();
    renderAll();
    UI.toast("Imported " + plural(good.length, "brief") + ".", "ok");
    return good.length;
  }

  /* --- Examples --------------------------------------------------------- */
  function exampleBriefs() {
    var a = makeBrief("feature");
    a.title = "Export the audit log as CSV";
    a.executor = "agent";
    a.risk = "medium";
    a.goal = "Tenant admins can download the audit log they are looking at as a CSV file, so quarterly compliance reviews no longer need a support ticket for a database export.";
    a.context = "src/audit/AuditLogPage.tsx\nsrc/audit/api.ts (listAuditEvents already supports the filters)\nDesign: Figma frame Audit / Export\nRelated: ticket AUD-212 (column naming agreed)";
    a.inScope = "Export CSV button on the Audit page\nServer endpoint GET /api/audit/export returning text/csv";
    a.outScope = "PDF or Excel formats\nScheduled or emailed exports\nChanges to the audit table columns";
    a.constraints = "Streams rows: memory stays flat for 500,000 rows\nOnly users with the audit:read permission can export\nUTF-8 with a header row; dates in ISO 8601 UTC";
    a.criteria = [
      { id: UI.uid("ac"), text: "Given an admin with audit:read on the Audit page, when they click Export CSV, then a file named audit-YYYY-MM-DD.csv downloads with exactly the rows matching the current filter" },
      { id: UI.uid("ac"), text: "Given a user without audit:read, when they call GET /api/audit/export, then the response is 403 and no rows are returned" },
      { id: UI.uid("ac"), text: "Given 500,000 matching rows, when the export runs, then the first byte arrives within 2 seconds and server memory grows by less than 50 MB" }
    ];
    a.verification = "npm test -- audit-export\nnpm run e2e -- --grep \"audit export\"\nManual: apply the filter Actor = system, export, and compare the CSV row count with the table total";

    var b = makeBrief("bug");
    b.title = "Password reset emails not arriving";
    b.executor = "agent";
    b.risk = "high";
    b.goal = "Fix password reset";
    b.context = "Support thread #4411\nsrc/auth/reset.ts";
    b.extra.actual = "Some users never get the email";
    b.criteria = [
      { id: UI.uid("ac"), text: "Reset emails are sent quickly and reliably" },
      { id: UI.uid("ac"), text: "Error handling works properly for some edge cases" }
    ];
    b.questions = [
      { id: UI.uid("q"), text: "Is this every email provider, or only Outlook addresses?" },
      { id: UI.uid("q"), text: "Did the mail provider change rate limits last week?" }
    ];

    var c = makeBrief("spike");
    c.title = "Choose a full-text search engine";
    c.executor = "pair";
    c.risk = "low";
    c.goal = "Decide whether product search can move from Elasticsearch to Postgres full-text search, so we can drop one cluster before the hosting contract renews in March.";
    c.context = "docs/adr/0007-search.md\nQuery log sample: 10,000 real queries in data/search-sample.csv";
    c.extra.question = "Can Postgres full-text search match current relevance and latency for our catalogue?";
    c.extra.timebox = "3 days";
    c.extra.decision = "A recommendation (move, stay, or hybrid) with a latency and relevance comparison on the sample queries, written as an ADR draft.";
    c.inScope = "Prototype on a copy of production data\nCompare Postgres tsvector with the current Elasticsearch index";
    c.outScope = "Migrating production\nEvaluating hosted search vendors";
    c.constraints = "No changes to production databases";
    c.criteria = [
      { id: UI.uid("ac"), text: "The ADR draft compares both options on p95 latency and top-10 relevance for the 10,000 sample queries" },
      { id: UI.uid("ac"), text: "The ADR names one recommendation and the conditions that would reverse it" }
    ];
    c.verification = "Benchmark script and its raw output attached to the ADR\nTech lead reviews the ADR draft";
    c.questions = [{ id: UI.uid("q"), text: "Who owns relevance tuning if we move?" }];

    var t = Date.now();
    [a, b, c].forEach(function (x, i) { x.updated = new Date(t - i * 60000).toISOString(); });
    return [a, b, c];
  }

  function loadExamples() {
    var ex = exampleBriefs();
    state.briefs = state.briefs.concat(ex);
    state.brief = ex[0];
    save();
    renderAll();
    UI.toast("Loaded 3 example briefs.", "ok");
  }

  /* --- Rendering: library ----------------------------------------------- */
  function renderLibrary() {
    var host = UI.qs("#lib-list");
    UI.clear(host);
    UI.qs("#lib-count").textContent = String(state.briefs.length);
    var q = state.search.trim().toLowerCase();
    var list = sorted().filter(function (b) {
      if (!q) return true;
      return (b.title + " " + b.goal + " " + TYPE_LABEL[b.type]).toLowerCase().indexOf(q) !== -1;
    });
    if (!state.briefs.length) {
      host.appendChild(UI.el("li", { class: "hint", text: "No briefs yet." }));
      return;
    }
    if (!list.length) {
      host.appendChild(UI.el("li", { class: "hint", text: "No brief matches \u201c" + state.search.trim() + "\u201d." }));
      return;
    }
    list.forEach(function (b) {
      var r = analyze(b);
      var d = new Date(b.updated);
      var when = isNaN(d.getTime()) ? "" : UI.prettyDate(UI.isoDate(d));
      host.appendChild(UI.el("li", {}, [
        UI.el("button", {
          class: "lib-item", type: "button",
          "aria-current": state.brief && state.brief.id === b.id ? "true" : "false",
          dataset: { id: b.id },
          onclick: function () { select(b.id); }
        }, [
          UI.el("span", { class: "lib-item__title", text: b.title.trim() || "Untitled brief" }),
          UI.el("span", { class: "lib-item__meta" }, [
            UI.el("span", { class: "tag tag--accent", text: TYPE_LABEL[b.type] }),
            UI.el("span", { class: "tag tag--" + verdictKind(r.verdict), text: r.verdict }),
            UI.el("span", { text: when ? "Updated " + when : "" })
          ])
        ])
      ]));
    });
  }
  var renderLibrarySoon = UI.debounce(renderLibrary, 300);

  function select(id) {
    flush();
    state.brief = state.briefs.filter(function (b) { return b.id === id; })[0] || state.brief;
    Store.write(NS, "active", state.brief ? state.brief.id : null);
    renderAll();
  }

  /* --- Rendering: editor ------------------------------------------------ */
  function grow(ta) {
    ta.style.height = "auto";
    ta.style.height = Math.max(38, ta.scrollHeight + 2) + "px";
  }

  function populate() {
    var b = state.brief;
    UI.qsa("[data-field]").forEach(function (n) {
      n.value = b[n.dataset.field];
    });
    var t = TEMPLATE[b.type];
    UI.qs("#f-goal").placeholder = t.goal;
    UI.qs("#f-inscope").placeholder = t.inScope;
    UI.qs("#f-verification").placeholder = t.verification;
    UI.qs("#risk-hint").textContent = RISK_HINT[b.risk];
    renderTypeCard();
    renderCriteria();
    renderQuestions();
    renderDod();
    setSaveState(state.dirty ? "Saving..." : "Saved");
    UI.defer(function () { UI.qsa("#editor textarea").forEach(grow); });
  }

  function renderTypeCard() {
    var b = state.brief, spec = TYPE_FIELDS[b.type];
    var card = UI.qs("#type-card"), host = UI.qs("#type-fields");
    UI.clear(host);
    card.classList.toggle("hidden", !spec);
    if (!spec) return;
    UI.qs("#type-card-title").textContent = spec.title;
    spec.fields.forEach(function (f) {
      var id = "x-" + f.key;
      var input = f.multi ?
        UI.el("textarea", { id: id, rows: 2, placeholder: f.ph }) :
        UI.el("input", { type: "text", id: id, placeholder: f.ph });
      input.value = b.extra[f.key] || "";
      input.addEventListener("input", function () {
        b.extra[f.key] = input.value;
        if (f.multi) grow(input);
        touch();
        updateDerived();
      });
      host.appendChild(UI.el("div", { class: "field" }, [UI.el("label", { class: "label", for: id, text: f.label }), input]));
    });
  }

  function listRow(item, index, opts) {
    var b = state.brief;
    var row = UI.el("li", { class: "le-row" + (opts.dod ? " dod-row" : ""), dataset: { id: item.id } });
    if (opts.dod) {
      var cb = UI.el("input", { type: "checkbox", "aria-label": "Done: item " + (index + 1) });
      cb.checked = !!item.done;
      cb.addEventListener("change", function () { item.done = cb.checked; touch(); updateDerived(); });
      row.appendChild(cb);
    } else {
      row.appendChild(UI.el("span", { class: "le-num", "aria-hidden": "true", text: (index + 1) + "." }));
    }
    var input = opts.multi ?
      UI.el("textarea", { rows: 1, "aria-label": opts.label + " " + (index + 1), placeholder: index === 0 ? opts.ph || "" : "" }) :
      UI.el("input", { type: "text", "aria-label": opts.label + " " + (index + 1), placeholder: opts.ph || "" });
    input.value = item.text;
    input.addEventListener("input", function () {
      item.text = input.value;
      if (opts.multi) grow(input);
      touch();
      updateDerived();
    });
    row.appendChild(input);
    row.appendChild(UI.el("button", {
      class: "btn btn--ghost btn--icon", type: "button", text: "\u00d7",
      "aria-label": "Remove " + opts.label.toLowerCase() + " " + (index + 1),
      onclick: function () {
        var list = b[opts.key];
        var i = list.indexOf(item);
        if (i !== -1) list.splice(i, 1);
        touch();
        opts.render();
        updateDerived();
      }
    }));
    if (opts.flags) row.appendChild(UI.el("div", { class: "le-flags" }));
    return row;
  }

  function renderCriteria() {
    var host = UI.clear(UI.qs("#ac-list"));
    state.brief.criteria.forEach(function (c, i) {
      host.appendChild(listRow(c, i, {
        key: "criteria", label: "Acceptance criterion", multi: true, flags: true,
        ph: TEMPLATE[state.brief.type].criterion, render: renderCriteria
      }));
    });
    UI.defer(function () { UI.qsa("#ac-list textarea").forEach(grow); });
  }

  function renderQuestions() {
    var host = UI.clear(UI.qs("#q-list"));
    state.brief.questions.forEach(function (q, i) {
      host.appendChild(listRow(q, i, { key: "questions", label: "Open question", ph: "What is still undecided?", render: renderQuestions }));
    });
    UI.qs("#q-empty").classList.toggle("hidden", state.brief.questions.length > 0);
  }

  function renderDod() {
    var host = UI.clear(UI.qs("#dod-list"));
    state.brief.dod.forEach(function (d, i) {
      host.appendChild(listRow(d, i, { key: "dod", label: "Definition of Done item", dod: true, render: renderDod }));
    });
    if (!state.brief.dod.length) host.appendChild(UI.el("li", { class: "hint", text: "No items. Add your team's Definition of Done, or reset to the default." }));
  }

  /** Everything computed from the brief: readiness, flags, pill, export preview. */
  function updateDerived() {
    var b = state.brief;
    if (!b) return;
    var r = analyze(b);
    var kind = verdictKind(r.verdict);

    var pill = UI.qs("#verdict-pill");
    pill.className = "tag tag--" + kind;
    pill.textContent = r.verdict;

    var v = UI.qs("#verdict");
    v.className = "verdict verdict--" + kind;
    UI.clear(v);
    v.appendChild(UI.el("strong", { text: r.verdict }));
    v.appendChild(document.createTextNode(" for " + EXEC_FOR[b.executor] + ". " +
      r.counts.pass + " passed, " + plural(r.counts.warn, "warning") + ", " + r.counts.fail + " failed."));

    var host = UI.clear(UI.qs("#checks"));
    var order = { fail: 0, warn: 1, pass: 2 };
    var icon = { fail: "\u2715", warn: "!", pass: "\u2713" };
    var word = { fail: "Failed", warn: "Warning", pass: "Passed" };
    r.checks.map(function (c, i) { return { c: c, i: i }; })
      .sort(function (x, y) { return order[x.c.status] - order[y.c.status] || x.i - y.i; })
      .forEach(function (o) {
        var c = o.c;
        host.appendChild(UI.el("li", { class: "chk chk--" + c.status, dataset: { check: c.id, status: c.status } }, [
          UI.el("span", { class: "chk__icon", "aria-hidden": "true", text: icon[c.status] }),
          UI.el("div", {}, [
            UI.el("div", { class: "chk__label" }, [UI.el("span", { class: "sr-only", text: word[c.status] + ": " }), c.label]),
            UI.el("p", { class: "chk__reason", text: c.reason }),
            UI.el("div", { class: "chk__tags" }, c.tags.map(function (t) {
              var title = t.length === 1 ? "INVEST: " + ({ I: "Independent", N: "Negotiable", V: "Valuable", E: "Estimable", S: "Small", T: "Testable" })[t] :
                t === "DoR" ? "Definition of Ready" : t === "DoD" ? "Definition of Done" : "Review and autonomy";
              return UI.el("span", { class: "tag", title: title, text: t.length === 1 ? "INVEST " + t : t });
            }))
          ])
        ]));
      });

    UI.qsa("#ac-list .le-row").forEach(function (row) {
      var c = b.criteria.filter(function (x) { return x.id === row.dataset.id; })[0];
      var flags = row.querySelector(".le-flags");
      if (!c || !flags) return;
      UI.clear(flags);
      findVague(c.text).forEach(function (w) {
        flags.appendChild(UI.el("span", { class: "tag tag--" + (b.executor === "person" ? "warn" : "danger"), text: "Vague: " + w }));
      });
    });

    renderExport();
    renderLibrarySoon();
  }

  /* --- Rendering: export ------------------------------------------------ */
  function exportText() {
    var b = state.brief;
    if (state.tab === "prompt") return toPrompt(b);
    if (state.tab === "json") return JSON.stringify(jsonOne(b), null, 2);
    return toMarkdown(b);
  }

  function renderExport() {
    if (!state.brief) return;
    UI.qsa("[role=tab]").forEach(function (t) {
      var on = t.dataset.tab === state.tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
    UI.qs("#export-panel").setAttribute("aria-labelledby", "tab-" + state.tab);
    UI.qs("#export-hint").textContent = state.tab === "prompt" ?
      "Plain text to paste into a coding agent. Stop rules come from the open questions and the risk tier." :
      state.tab === "json" ? "This brief as JSON. Import it here on another machine; use Export library for every brief." :
        "Paste into Jira, GitHub, GitLab or Linear. Checklists use - [ ].";
    UI.qs("#export-preview").textContent = exportText();
  }

  function renderAll() {
    var has = !!state.brief;
    UI.qs("#empty").classList.toggle("hidden", has);
    UI.qs("#editor").classList.toggle("hidden", !has);
    UI.qs("#side").classList.toggle("hidden", !has);
    UI.qs("#load-example-lib").classList.toggle("hidden", !state.briefs.length);
    renderLibrary();
    if (has) {
      populate();
      updateDerived();
    }
  }

  /* --- Actions ---------------------------------------------------------- */
  function newBrief() {
    flush();
    var b = makeBrief("feature");
    state.briefs.push(b);
    state.brief = b;
    save();
    renderAll();
    UI.qs("#f-title").focus();
  }

  function duplicate() {
    var src = state.brief;
    if (!src) return;
    var copy = normalize(JSON.parse(JSON.stringify(src)));
    copy.id = UI.uid("brief");
    copy.title = (src.title.trim() || "Untitled brief") + " (copy)";
    copy.criteria.forEach(function (c) { c.id = UI.uid("ac"); });
    copy.questions.forEach(function (q) { q.id = UI.uid("q"); });
    copy.dod.forEach(function (d) { d.id = UI.uid("dod"); });
    copy.created = copy.updated = nowStamp();
    state.briefs.push(copy);
    state.brief = copy;
    save();
    renderAll();
    UI.toast("Duplicated.", "ok");
  }

  function remove() {
    var b = state.brief;
    if (!b) return;
    if (!UI.confirmDanger("Delete the brief \u201c" + (b.title.trim() || "Untitled brief") + "\u201d? This cannot be undone.")) return;
    state.briefs = state.briefs.filter(function (x) { return x.id !== b.id; });
    state.brief = sorted()[0] || null;
    save();
    renderAll();
    UI.toast("Brief deleted.");
  }

  function sameTexts(list, texts) {
    if (list.length !== texts.length) return false;
    return list.every(function (d, i) { return d.text === texts[i]; });
  }

  function changeType(type) {
    var b = state.brief, old = b.type;
    b.type = TYPE_LABEL[type] ? type : "feature";
    // Swap the default DoD only when the team has not edited it.
    if (sameTexts(b.dod, DOD[old] || []) && !b.dod.some(function (d) { return d.done; })) b.dod = defaultDod(b.type);
    touch();
    populate();
    updateDerived();
  }

  function addCriterion(text) {
    var item = { id: UI.uid("ac"), text: text || "" };
    state.brief.criteria.push(item);
    touch();
    renderCriteria();
    updateDerived();
    var rows = UI.qsa("#ac-list textarea");
    if (rows.length) rows[rows.length - 1].focus();
  }

  function setTab(tab) {
    state.tab = tab;
    Store.write(NS, "ui", { tab: tab });
    renderExport();
  }

  function init() {
    UI.initChrome();
    load();
    renderAll();

    UI.qsa("#editor [data-field]").forEach(function (n) {
      var key = n.dataset.field;
      if (n.tagName === "SELECT") {
        n.addEventListener("change", function () {
          if (!state.brief) return;
          if (key === "type") { changeType(n.value); return; }
          state.brief[key] = n.value;
          if (key === "risk") UI.qs("#risk-hint").textContent = RISK_HINT[n.value] || "";
          touch();
          updateDerived();
        });
      } else {
        n.addEventListener("input", function () {
          if (!state.brief) return;
          state.brief[key] = n.value;
          if (n.tagName === "TEXTAREA") grow(n);
          touch();
          updateDerived();
        });
      }
    });

    UI.qs("#new-brief").addEventListener("click", newBrief);
    UI.qs("#start-blank").addEventListener("click", newBrief);
    UI.qs("#load-example").addEventListener("click", loadExamples);
    UI.qs("#load-example-lib").addEventListener("click", loadExamples);
    UI.qs("#dup-brief").addEventListener("click", duplicate);
    UI.qs("#del-brief").addEventListener("click", remove);
    UI.qs("#lib-search").addEventListener("input", function (e) { state.search = e.target.value; renderLibrary(); });

    UI.qs("#add-ac").addEventListener("click", function () { addCriterion(""); });
    UI.qs("#add-q").addEventListener("click", function () {
      state.brief.questions.push({ id: UI.uid("q"), text: "" });
      touch();
      renderQuestions();
      updateDerived();
      var rows = UI.qsa("#q-list input");
      if (rows.length) rows[rows.length - 1].focus();
    });
    UI.qs("#add-dod").addEventListener("click", function () {
      state.brief.dod.push({ id: UI.uid("dod"), text: "", done: false });
      touch();
      renderDod();
      updateDerived();
      var rows = UI.qsa("#dod-list input[type=text]");
      if (rows.length) rows[rows.length - 1].focus();
    });
    UI.qs("#reset-dod").addEventListener("click", function () {
      if (filled(state.brief.dod).length && !sameTexts(state.brief.dod, DOD[state.brief.type] || []) &&
        !UI.confirmDanger("Replace this Definition of Done with the default for " + TYPE_LABEL[state.brief.type] + "?")) return;
      state.brief.dod = defaultDod(state.brief.type);
      touch();
      renderDod();
      updateDerived();
    });

    var gwt = UI.qs("#gwt"), gwtToggle = UI.qs("#gwt-toggle");
    function showGwt(on) {
      gwt.classList.toggle("hidden", !on);
      gwtToggle.setAttribute("aria-expanded", on ? "true" : "false");
      if (on) UI.qs("#gwt-given").focus();
    }
    gwtToggle.addEventListener("click", function () { showGwt(gwt.classList.contains("hidden")); });
    UI.qs("#gwt-cancel").addEventListener("click", function () { showGwt(false); gwtToggle.focus(); });
    UI.qs("#gwt-add").addEventListener("click", function () {
      function part(id, lead) {
        return UI.qs(id).value.trim().replace(new RegExp("^" + lead + "\\s+", "i"), "").replace(/[.,;]+$/, "");
      }
      var g = part("#gwt-given", "given"), w = part("#gwt-when", "when"), t = part("#gwt-then", "then");
      if (!g || !w || !t) { UI.toast("Fill in Given, When and Then.", "danger"); return; }
      // Reuse a single empty criterion instead of leaving a blank row behind.
      var crit = state.brief.criteria;
      if (crit.length === 1 && !crit[0].text.trim()) crit.splice(0, 1);
      ["#gwt-given", "#gwt-when", "#gwt-then"].forEach(function (s) { UI.qs(s).value = ""; });
      showGwt(false);
      addCriterion("Given " + g + ", when " + w + ", then " + t);
    });

    UI.qsa("[role=tab]").forEach(function (t) {
      t.addEventListener("click", function () { setTab(t.dataset.tab); });
      t.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        var tabs = UI.qsa("[role=tab]");
        var i = tabs.indexOf(t) + (e.key === "ArrowRight" ? 1 : -1);
        var next = tabs[(i + tabs.length) % tabs.length];
        setTab(next.dataset.tab);
        next.focus();
        e.preventDefault();
      });
    });
    UI.qs("#export-copy").addEventListener("click", function () { if (state.brief) UI.copy(exportText()); });
    UI.qs("#export-download").addEventListener("click", function () {
      if (!state.brief) return;
      var name = UI.slug(state.brief.title || "brief");
      if (state.tab === "prompt") UI.download(name + "-agent-prompt.txt", toPrompt(state.brief), "text/plain");
      else if (state.tab === "json") UI.downloadJSON(name + ".brief.json", jsonOne(state.brief));
      else UI.download(name + ".md", toMarkdown(state.brief), "text/markdown");
    });
    UI.qs("#export-library").addEventListener("click", function () {
      if (!state.briefs.length) { UI.toast("Nothing to export yet.", "danger"); return; }
      UI.downloadJSON("task-briefs-" + UI.isoDate() + ".json", jsonAll());
    });
    UI.qs("#import-json").addEventListener("click", function () { UI.pickJSON(function (obj) { importPayload(obj); }); });

    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
  }

  /* Debug and test hooks. Pure logic plus a re-read of storage. */
  window.__brief = {
    analyze: function (raw) { return analyze(normalize(raw)); },
    findVague: findVague,
    toMarkdown: function (raw) { return toMarkdown(normalize(raw)); },
    toPrompt: function (raw) { return toPrompt(normalize(raw)); },
    importPayload: importPayload,
    exportLibrary: jsonAll,
    flush: flush,
    reload: function () { load(); renderAll(); }
  };

  document.addEventListener("DOMContentLoaded", init);
})();
