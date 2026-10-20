/* ==========================================================================
   Delegation Board: who decides what, for people and for AI agents.

   Two independent settings per decision area: the Management 3.0 Delegation
   Poker level (lead to team, 1 to 7) and an agent autonomy level (0 to 5).
   Poker picks live in memory only. When a round ends, the board keeps the
   agreed level and an anonymous count per level, never who picked what.
   ========================================================================== */
(function () {
  "use strict";

  var NS = "delegation";
  var SCHEMA = 1;

  var PEOPLE = [
    { n: 1, name: "Tell", meaning: "The lead decides and tells the team." },
    { n: 2, name: "Sell", meaning: "The lead decides and explains why, to get buy-in." },
    { n: 3, name: "Consult", meaning: "The lead asks the team for input, then decides." },
    { n: 4, name: "Agree", meaning: "Lead and team decide together, by consensus." },
    { n: 5, name: "Advise", meaning: "The team decides after hearing the lead's advice." },
    { n: 6, name: "Inquire", meaning: "The team decides, then tells the lead." },
    { n: 7, name: "Delegate", meaning: "The team decides; the lead does not need to know." }
  ];

  var AGENT = [
    { n: 0, name: "Off-limits", meaning: "Agents must not do or propose this." },
    { n: 1, name: "Suggest", meaning: "Agent may only advise in conversation." },
    { n: 2, name: "Draft, human approves each", meaning: "Agent prepares it; nothing happens until a person approves." },
    { n: 3, name: "Act, human reviews before it lands", meaning: "Agent does the work; normal review gates it (e.g. a PR)." },
    { n: 4, name: "Act and notify", meaning: "Agent does it; humans are told and can roll back.", risk: true },
    { n: 5, name: "Autonomous within guardrails", meaning: "Agent acts alone inside written guardrails.", risk: true }
  ];

  var CATEGORIES = ["Code", "Release", "Product", "People/Process", "Ops", "Data", "Other"];

  var RISKY = /\b(deploy\w*|delet\w*|prod|production|secrets?|credentials?|payments?|iam|permissions?|customers?)\b/i;

  var GROUPS = [
    { title: "You may do without asking", levels: [4, 5] },
    { title: "Do it, but open it for human review", levels: [3] },
    { title: "Propose only; wait for explicit approval", levels: [1, 2] },
    { title: "Never do", levels: [0] }
  ];

  /* --- Presets ------------------------------------------------------------ */
  // [decision, category, people, agent, guardrails, rollback, evidence, owner]
  var PRESETS = {
    software: {
      name: "Software team with coding agents",
      rows: [
        ["Merge a PR to main", "Code", 6, 3, "CI green and one human approval; no force-push; agent never approves its own PR.", "A merged agent change is reverted for a defect.", "Reviewers changed almost nothing on the last 30 agent PRs.", "Tech Lead"],
        ["Write or update tests", "Code", 7, 4, "Only test files change; no test is deleted or skipped to make a build pass.", "A test change hides a real failure.", "Two sprints of agent test commits with no reverts.", "Tech Lead"],
        ["Refactor within a single module", "Code", 6, 3, "No public API change; behavior covered by existing tests.", "A refactor changes behavior in production.", "Approvers accept refactor PRs without changes.", "Tech Lead"],
        ["Upgrade a dependency with a CVE fix", "Code", 6, 3, "Patch or minor version only; full test suite passes; changelog linked in the PR.", "An upgrade breaks a build or a customer flow.", "Patch upgrades merged clean for a quarter.", "Tech Lead"],
        ["Add a new third-party dependency", "Code", 4, 2, "License and maintenance check before proposing; explain why the standard library is not enough.", "A dependency is added without a license check.", "Not planned: keep human approval.", "Architect"],
        ["Deploy to production", "Release", 5, 2, "Only from main, during business hours, with a tested rollback.", "Any failed or rolled-back deploy started by an agent.", "A quarter of agent-prepared deploys approved unchanged.", "Release Manager"],
        ["Roll back a failed deploy", "Release", 6, 2, "Only to the previous released version; announce in the incident channel.", "A rollback causes data loss.", "Rollback drills run cleanly.", "Release Manager"],
        ["Rotate secrets / change IAM", "Ops", 3, 0, "Humans only, through the access management process.", "Not applicable.", "Not planned.", "Security Lead"],
        ["Change the sprint goal", "People/Process", 4, 1, "Agent may point out risk to the goal; the team decides.", "Not applicable.", "Not planned.", "Product Owner"],
        ["Update README and developer docs", "Code", 7, 4, "Docs folder and README only; link the code change that motivated it.", "Docs contradict the code after an agent edit.", "Doc edits accepted without corrections for a month.", "Tech Lead"],
        ["Label and triage new issues", "Product", 6, 4, "Labels and duplicates only; never closes an issue opened by a customer.", "A mislabeled issue misses its SLA.", "Triage labels match human triage on a sample.", "Product Owner"]
      ]
    },
    product: {
      name: "Product & discovery",
      rows: [
        ["Reply to customer", "Product", 5, 2, "Agent drafts; a person reviews tone and facts before sending; no commitments on dates or price.", "Any reply that a customer escalates.", "Drafts sent with almost no edits for two months.", "Support Lead"],
        ["Prioritize the backlog", "Product", 3, 1, "Agent may suggest an order with reasons; the Product Owner orders.", "Not applicable.", "Not planned.", "Product Owner"],
        ["Write a first-draft user story", "Product", 6, 3, "Draft is marked as agent-written until refined by the team.", "Stories reach refinement with invented requirements.", "Refinement keeps most agent drafts with light edits.", "Product Owner"],
        ["Summarize user interview notes", "Data", 6, 4, "Only anonymized notes as input; quotes kept verbatim and attributed to a persona, never a person.", "A summary contains a name or other personal data.", "Researchers spot-check summaries and find no distortion.", "Product Manager"],
        ["Change the sprint goal", "People/Process", 4, 1, "Agent may point out risk to the goal; the team decides.", "Not applicable.", "Not planned.", "Product Owner"],
        ["Publish release notes", "Release", 5, 2, "Generated from merged items only; a person approves before publishing.", "Notes announce something that did not ship.", "Approved without edits for three releases.", "Product Manager"],
        ["Start an A/B experiment in production", "Product", 4, 2, "Pre-registered hypothesis and stop criteria; capped exposure.", "An experiment runs past its stop criteria.", "Not planned this quarter.", "Product Manager"],
        ["Change pricing or packaging", "Product", 2, 0, "Humans only.", "Not applicable.", "Not planned.", "Product Manager"],
        ["Define success metrics for an initiative", "Product", 4, 1, "Agent may propose candidate metrics and how to measure them.", "Not applicable.", "Not planned.", "Product Manager"],
        ["Tag and cluster incoming feedback", "Data", 7, 5, "Tags from the agreed taxonomy only; weekly human sample of 20 items.", "The weekly sample finds more than 2 wrong clusters.", "Already met: sample accuracy above 90% for a quarter.", "Product Owner"],
        ["Decline a feature request publicly", "Product", 3, 1, "Agent may suggest wording; a person decides and sends.", "Not applicable.", "Not planned.", "Product Manager"]
      ]
    },
    ops: {
      name: "Ops / on-call with automation",
      rows: [
        ["Restart a failed service", "Ops", 6, 4, "Stateless services only; at most 2 restarts per hour, then page a human.", "A restart loop hides a real outage.", "Restarts resolved the alert in most cases last quarter.", "SRE Lead"],
        ["Scale capacity within budget limits", "Ops", 6, 5, "Within the approved min and max; never above the monthly budget cap.", "Spend exceeds the forecast by more than 10%.", "Already met: a quarter of autoscaling within budget.", "SRE Lead"],
        ["Page the on-call engineer", "Ops", 7, 5, "Only for alerts tagged as actionable; deduplicate within 15 minutes.", "More than 2 false pages in a week.", "Already met.", "On-call Lead"],
        ["Declare an incident", "Ops", 6, 2, "Agent proposes severity with evidence; the on-call engineer declares.", "Not applicable.", "Proposed severities match the final ones for a quarter.", "Incident Commander"],
        ["Roll back a production deploy", "Release", 6, 3, "Only to the last known good version; incident channel notified.", "A rollback causes data loss.", "Rollback drills run cleanly.", "Release Manager"],
        ["Rotate secrets / change IAM", "Ops", 3, 0, "Humans only, through the access management process.", "Not applicable.", "Not planned.", "Security Lead"],
        ["Delete old logs and backups", "Data", 4, 1, "Agent may list candidates against the retention policy; humans delete.", "Not applicable.", "Not planned.", "Data Steward"],
        ["Silence a noisy alert", "Ops", 6, 3, "Silence for at most 24 hours and open a ticket to fix the alert.", "A silenced alert hid a real incident.", "Silences proposed by the agent accepted unchanged.", "On-call Lead"],
        ["Update the runbook", "Ops", 7, 4, "Change linked to the incident or alert that motivated it.", "A runbook step is wrong during an incident.", "Runbook edits accepted without corrections.", "SRE Lead"],
        ["Draft the incident postmortem", "People/Process", 6, 2, "Blameless: describe systems and decisions, never name individuals.", "A draft assigns blame to a person.", "Not planned.", "Incident Commander"],
        ["Change the on-call rotation", "People/Process", 4, 1, "Agent may point out gaps or overload; people agree the rotation.", "Not applicable.", "Not planned.", "On-call Lead"],
        ["Apply an OS security patch", "Ops", 5, 3, "Staging first, then canary; maintenance window only.", "A patch causes an outage.", "Patches applied cleanly for two quarters.", "SRE Lead"]
      ]
    }
  };

  var state = {
    boards: [],
    board: null,
    view: "people",
    poker: null // { rowId, votes: [{people, agent}], names: [], revealed }
  };

  /* --- Model -------------------------------------------------------------- */
  function today() { return UI.isoDate(); }
  function inDays(n) { return UI.isoDate(UI.addDays(new Date(), n)); }

  function str(v, max) {
    var s = typeof v === "string" ? v : (v === null || v === undefined ? "" : String(v));
    return s.slice(0, max || 2000);
  }
  function intIn(v, min, max, fallback) {
    var n = typeof v === "number" ? v : parseInt(v, 10);
    if (!isFinite(n)) return fallback;
    return UI.clamp(Math.round(n), min, max);
  }
  function validIso(v) {
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && UI.parseDate(v) ? v : "";
  }

  function makeRow(fields) {
    var f = fields || {};
    return {
      id: UI.uid("r"),
      decision: str(f.decision, 300),
      category: CATEGORIES.indexOf(f.category) !== -1 ? f.category : "Other",
      people: intIn(f.people, 1, 7, 4),
      agent: intIn(f.agent, 0, 5, 1),
      guardrails: str(f.guardrails),
      rollback: str(f.rollback),
      evidence: str(f.evidence),
      owner: str(f.owner, 120),
      review: validIso(f.review),
      poker: null
    };
  }

  function normalizePoker(p) {
    if (!p || typeof p !== "object") return null;
    function counts(arr, len) {
      var out = [];
      for (var i = 0; i < len; i++) out.push(Array.isArray(arr) ? Math.max(0, intIn(arr[i], 0, 999, 0)) : 0);
      return out;
    }
    var pc = counts(p.people, 7);
    var ac = counts(p.agent, 6);
    var votes = pc.reduce(function (a, b) { return a + b; }, 0);
    if (!votes) return null;
    return { date: validIso(p.date), votes: votes, people: pc, agent: ac };
  }

  function normalizeRow(r) {
    var row = makeRow(r);
    if (r && typeof r.id === "string" && r.id) row.id = r.id.slice(0, 80);
    row.poker = normalizePoker(r && r.poker);
    return row;
  }

  function makeBoard(name, rows) {
    return { id: UI.uid("board"), name: name || "New board", created: today(), rows: rows || [] };
  }

  function boardFromPreset(key) {
    var p = PRESETS[key];
    var review = inDays(90);
    return makeBoard(p.name, p.rows.map(function (t) {
      return makeRow({
        decision: t[0], category: t[1], people: t[2], agent: t[3],
        guardrails: t[4], rollback: t[5], evidence: t[6], owner: t[7], review: review
      });
    }));
  }

  function normalizeBoard(b) {
    if (!b || typeof b !== "object" || !Array.isArray(b.rows)) return null;
    var seen = {};
    var rows = b.rows.filter(function (r) { return r && typeof r === "object"; }).map(function (r) {
      var row = normalizeRow(r);
      if (seen[row.id]) row.id = UI.uid("r");
      seen[row.id] = true;
      return row;
    });
    return {
      id: typeof b.id === "string" && b.id ? b.id.slice(0, 80) : UI.uid("board"),
      name: str(b.name, 120).trim() || "Untitled board",
      created: validIso(b.created) || today(),
      rows: rows
    };
  }

  function load() {
    var raw = Store.read(NS, "boards", []);
    state.boards = (Array.isArray(raw) ? raw : []).map(normalizeBoard).filter(Boolean);
    var active = Store.read(NS, "active", null);
    state.board = state.boards.filter(function (b) { return b.id === active; })[0] || state.boards[0] || null;
    var v = Store.read(NS, "view", "people");
    state.view = ["people", "agent", "table"].indexOf(v) !== -1 ? v : "people";
  }

  function save() {
    if (!Store.write(NS, "boards", state.boards)) UI.toast("Could not save: browser storage is full.", "danger");
    Store.write(NS, "active", state.board ? state.board.id : null);
  }
  var saveSoon = UI.debounce(save, 300);

  function findRow(id) {
    if (!state.board) return null;
    return state.board.rows.filter(function (r) { return r.id === id; })[0] || null;
  }

  /* --- Pure logic --------------------------------------------------------- */
  function isRisky(row) {
    return RISKY.test(row.decision || "") && row.agent >= 4 && !String(row.guardrails || "").trim();
  }
  function isDue(row) {
    return !!row.review && row.review < today();
  }

  /** min, max, spread and median of a list of level numbers. */
  function distStats(values) {
    if (!values.length) return null;
    var s = values.slice().sort(function (a, b) { return a - b; });
    return { min: s[0], max: s[s.length - 1], spread: s[s.length - 1] - s[0], median: s[Math.floor((s.length - 1) / 2)], n: s.length };
  }

  function countsOf(values, from, to) {
    var out = [];
    for (var l = from; l <= to; l++) out.push(0);
    values.forEach(function (v) { out[v - from]++; });
    return out;
  }

  function agentCounts(board) {
    var c = [0, 0, 0, 0, 0, 0];
    board.rows.forEach(function (r) { c[r.agent]++; });
    return c;
  }

  function peopleLabel(n) { var l = PEOPLE[n - 1]; return n + " " + l.name; }
  function agentLabel(n) { var l = AGENT[n]; return n + " " + l.name; }

  function mdCell(s) {
    return String(s || "").replace(/\r?\n+/g, " ").replace(/\|/g, "\\|").trim();
  }
  function oneLine(s) { return String(s || "").replace(/\s*\r?\n+\s*/g, " ").trim(); }

  function countsSummary(counts, from) {
    var parts = [];
    counts.forEach(function (c, i) { if (c) parts.push("L" + (i + from) + ": " + c); });
    return parts.join(", ");
  }

  function toMarkdown(board) {
    var out = [];
    out.push("# Delegation matrix: " + board.name);
    out.push("");
    out.push("Exported " + today() + ". People levels follow Management 3.0 Delegation Poker (1 Tell to 7 Delegate, lead to team). Agent levels follow a 0 to 5 autonomy ladder; levels 4 and 5 allow acting without approval.");
    out.push("");
    if (!board.rows.length) { out.push("_No decisions yet._"); return out.join("\n") + "\n"; }
    out.push("| Decision | Category | People level | Agent level | Owner role | Review |");
    out.push("| --- | --- | --- | --- | --- | --- |");
    board.rows.forEach(function (r) {
      out.push("| " + [
        mdCell(r.decision) || "(untitled)", mdCell(r.category), peopleLabel(r.people),
        agentLabel(r.agent) + (AGENT[r.agent].risk ? " (no approval)" : ""),
        mdCell(r.owner) || "-", (r.review || "-") + (isDue(r) ? " (review due)" : "")
      ].join(" | ") + " |");
    });
    out.push("");
    out.push("## Guardrails per decision");
    board.rows.forEach(function (r) {
      out.push("");
      out.push("### " + (oneLine(r.decision) || "(untitled)"));
      out.push("");
      out.push("- People: " + peopleLabel(r.people) + ". " + PEOPLE[r.people - 1].meaning);
      out.push("- Agents: " + agentLabel(r.agent) + ". " + AGENT[r.agent].meaning);
      out.push("- Guardrails: " + (oneLine(r.guardrails) || "none written"));
      out.push("- Rollback trigger (lower the level if): " + (oneLine(r.rollback) || "none written"));
      out.push("- Evidence to raise it: " + (oneLine(r.evidence) || "none written"));
      if (r.owner) out.push("- Owner role: " + oneLine(r.owner));
      if (r.review) out.push("- Review by: " + r.review);
      if (r.poker) {
        out.push("- Last poker round (" + (r.poker.date || "undated") + ", " + r.poker.votes + " votes): people " +
          countsSummary(r.poker.people, 1) + "; agents " + countsSummary(r.poker.agent, 0));
      }
      if (isRisky(r)) out.push("- WARNING: irreversible-sounding decision at agent level " + r.agent + " without guardrails.");
    });
    var warn = board.rows.filter(isRisky);
    if (warn.length) {
      out.push("");
      out.push("> " + warn.length + " decision(s) look irreversible and allow agents to act without approval, with no guardrails written.");
    }
    return out.join("\n") + "\n";
  }

  /** Rollback text that says there is no trigger ("Not applicable.") is left out of AGENTS.md. */
  function realTrigger(s) {
    var t = oneLine(s);
    return /^(not applicable|n\/?a|none|not planned|-)\.?$/i.test(t) ? "" : t;
  }

  /**
   * A section, not a whole file: it is meant to sit under the AGENTS.md that
   * the Working Agreements tool builds, next to its "## Boundaries".
   */
  function toAgentsMd(board) {
    var out = [];
    out.push("## Autonomy and approvals");
    out.push("");
    out.push("These rules come from the team's delegation board \"" + oneLine(board.name) + "\" (" + today() + "). Find the decision a task falls under and follow its group. If no decision here and no other rule in this file covers a task, treat it as \"Propose only\" and ask. If a stop condition happens, stop and tell a human.");
    GROUPS.forEach(function (g) {
      out.push("");
      out.push("### " + g.title);
      out.push("");
      var rows = board.rows.filter(function (r) { return g.levels.indexOf(r.agent) !== -1 && oneLine(r.decision); });
      if (!rows.length) { out.push("- Nothing at this level."); return; }
      rows.sort(function (a, b) { return b.agent - a.agent; });
      rows.forEach(function (r) {
        var line = "- " + oneLine(r.decision) + " (level " + r.agent + ": " + AGENT[r.agent].name.toLowerCase() + ").";
        if (oneLine(r.guardrails)) line += " Guardrails: " + oneLine(r.guardrails).replace(/\.?$/, ".");
        else if (isRisky(r)) line += " No guardrails written yet: until there are, open it for human review instead.";
        else if (r.agent >= 4) line += " No guardrails written yet: keep the change small and easy to undo.";
        if (r.agent === 4) line += " Afterwards, tell the owner what you did.";
        if (r.agent > 0 && realTrigger(r.rollback)) line += " Stop and tell a human if: " + realTrigger(r.rollback).replace(/\.?$/, ".");
        if (oneLine(r.owner)) line += " Owner: " + oneLine(r.owner) + ".";
        out.push(line);
      });
    });
    return out.join("\n") + "\n";
  }

  /** Accepts {board}, {boards:[...]}, [...] or a bare board. Throws a readable Error. */
  function parseImport(payload) {
    var list;
    if (Array.isArray(payload)) list = payload;
    else if (payload && typeof payload === "object") {
      if (payload.tool && payload.tool !== NS) throw new Error("That file comes from another tool (" + str(payload.tool, 40) + ").");
      if (Array.isArray(payload.boards)) list = payload.boards;
      else if (payload.board) list = [payload.board];
      else list = [payload];
    } else throw new Error("That file is not a delegation board.");
    var boards = list.map(normalizeBoard).filter(Boolean);
    if (!boards.length) throw new Error("That file is not a delegation board: no list of decisions found.");
    return boards;
  }

  /* --- Rendering: shell --------------------------------------------------- */
  function renderAll() {
    renderSelect();
    var has = !!state.board;
    UI.qs("#empty").classList.toggle("hidden", has);
    UI.qs("#board").classList.toggle("hidden", !has);
    ["#rename-board", "#duplicate-board", "#delete-board", "#export-md", "#export-agents", "#export-json"].forEach(function (s) {
      UI.qs(s).disabled = !has;
    });
    UI.qs("#board-select").disabled = !has;
    if (!has) return;
    UI.qs("#board-title").textContent = state.board.name;
    renderSummary();
    renderView();
  }

  function renderSelect() {
    var sel = UI.clear(UI.qs("#board-select"));
    if (!state.boards.length) sel.appendChild(UI.el("option", { value: "", text: "No boards yet" }));
    state.boards.forEach(function (b) {
      sel.appendChild(UI.el("option", { value: b.id, text: b.name, selected: state.board && b.id === state.board.id }));
    });
  }

  function renderLegend() {
    var p = UI.clear(UI.qs("#legend-people"));
    PEOPLE.forEach(function (l) {
      p.appendChild(UI.el("li", null, [
        UI.el("span", { class: "lvl", text: String(l.n) }),
        UI.el("span", null, [UI.el("strong", { text: l.name + ": " }), l.meaning])
      ]));
    });
    var a = UI.clear(UI.qs("#legend-agent"));
    AGENT.forEach(function (l) {
      a.appendChild(UI.el("li", { class: l.risk ? "risk" : "" }, [
        UI.el("span", { class: "lvl", text: String(l.n) }),
        UI.el("span", null, [UI.el("strong", { text: l.name + ": " }), l.meaning,
          l.risk ? UI.el("span", { class: "tag tag--danger", style: "margin-left:6px", text: "no approval" }) : null])
      ]));
    });
  }

  function renderSummary() {
    var b = state.board;
    var host = UI.clear(UI.qs("#summary"));
    UI.qs("#row-count").textContent = b.rows.length + (b.rows.length === 1 ? " decision" : " decisions");
    var due = b.rows.filter(isDue).length;
    var calibrated = b.rows.filter(function (r) { return r.poker; }).length;
    var noApproval = b.rows.filter(function (r) { return r.agent >= 4; }).length;

    var left = UI.el("div", { class: "stack", style: "gap:var(--sp-3)" });
    left.appendChild(UI.el("div", { class: "stats-row" }, [
      stat("Decisions", b.rows.length, ""),
      stat("Agents act without approval", noApproval, "levels 4 and 5"),
      stat("Review due", due, due ? "date has passed" : "all current"),
      stat("Calibrated by poker", calibrated, "of " + b.rows.length)
    ]));
    var bars = UI.el("div", { class: "stack", style: "gap:6px", id: "agent-bars" });
    bars.appendChild(UI.el("span", { class: "label", text: "Decisions per agent level" }));
    var counts = agentCounts(b);
    var max = Math.max(1, Math.max.apply(null, counts));
    AGENT.forEach(function (l) {
      bars.appendChild(UI.el("div", { class: "lbar" + (l.risk ? " lbar--risk" : ""), dataset: { level: String(l.n) } }, [
        UI.el("span", { class: "lbar__name", text: l.n + " " + l.name, title: l.n + " " + l.name }),
        UI.el("div", { class: "lbar__track", "aria-hidden": "true" }, UI.el("div", { class: "lbar__fill", style: "width:" + (counts[l.n] / max * 100) + "%" })),
        UI.el("span", { class: "lbar__n", text: String(counts[l.n]) })
      ]));
    });
    left.appendChild(bars);
    host.appendChild(left);

    var right = UI.el("div", { class: "stack", style: "gap:var(--sp-2)", id: "warnings" });
    right.appendChild(UI.el("span", { class: "label", text: "Warnings" }));
    var risky = b.rows.filter(isRisky);
    var dueRows = b.rows.filter(isDue);
    if (!risky.length && !dueRows.length) {
      right.appendChild(UI.el("div", { class: "ok-note", text: "No warnings. Every irreversible-sounding decision that agents may do without approval has guardrails, and no review is overdue." }));
    } else {
      var ul = UI.el("ul", { class: "warn-list" });
      risky.forEach(function (r) {
        ul.appendChild(UI.el("li", { class: "warn-item risky-warning" }, [
          UI.el("span", { text: "Irreversible without guardrails: \"" + oneLine(r.decision) + "\" is at agent level " + r.agent + " (" + AGENT[r.agent].name + ") with no guardrails written. Write guardrails or lower the level." }),
          UI.el("button", { class: "btn btn--sm", type: "button", text: "Edit", onclick: function () { openRow(r.id); } })
        ]));
      });
      dueRows.forEach(function (r) {
        ul.appendChild(UI.el("li", { class: "warn-item", style: "background:var(--warn-soft);color:var(--warn)" }, [
          UI.el("span", { text: "Review due: \"" + (oneLine(r.decision) || "(untitled)") + "\" was due " + UI.prettyDate(r.review) + "." }),
          UI.el("button", { class: "btn btn--sm", type: "button", text: "Edit", onclick: function () { openRow(r.id); } })
        ]));
      });
      right.appendChild(ul);
    }
    right.appendChild(UI.el("p", { class: "hint", text: "Irreversible-sounding means the decision mentions deploy, delete, prod, production, secret, credential, payment, IAM, permission or customer." }));
    host.appendChild(right);
  }

  function stat(label, value, sub) {
    return UI.el("div", { class: "stat" }, [
      UI.el("div", { class: "stat__label", text: label }),
      UI.el("div", { class: "stat__value", text: String(value) }),
      sub ? UI.el("div", { class: "stat__sub", text: sub }) : null
    ]);
  }

  function rowTags(r, dimension) {
    var tags = [];
    tags.push(UI.el("span", { class: "tag", text: r.category }));
    if (dimension === "people") {
      tags.push(UI.el("span", { class: "tag " + (AGENT[r.agent].risk ? "tag--danger" : "tag--accent"), text: "Agent " + r.agent, title: agentLabel(r.agent) }));
    } else if (dimension === "agent") {
      tags.push(UI.el("span", { class: "tag tag--accent", text: "People " + r.people, title: peopleLabel(r.people) }));
    }
    if (isDue(r)) tags.push(UI.el("span", { class: "tag tag--warn review-due", text: "Review due" }));
    if (isRisky(r)) tags.push(UI.el("span", { class: "tag tag--danger", text: "No guardrails" }));
    if (r.poker) tags.push(UI.el("span", { class: "tag tag--info", text: "Poker: " + r.poker.votes + " votes", title: "People " + countsSummary(r.poker.people, 1) + "; agents " + countsSummary(r.poker.agent, 0) }));
    return tags;
  }

  function levelSelect(r, dimension, cls, compact) {
    var levels = dimension === "people" ? PEOPLE : AGENT;
    var sel = UI.el("select", {
      class: cls || "", "aria-label": (dimension === "people" ? "People level for " : "Agent level for ") + (r.decision || "untitled decision"),
      dataset: { fkey: dimension + "-" + r.id }
    });
    levels.forEach(function (l) {
      sel.appendChild(UI.el("option", { value: String(l.n), text: l.n + " " + l.name + (l.risk && !compact ? " (no approval)" : ""), selected: r[dimension] === l.n }));
    });
    sel.addEventListener("change", function () {
      setLevel(r.id, dimension, parseInt(sel.value, 10));
    });
    return sel;
  }

  function setLevel(rowId, dimension, value) {
    var r = findRow(rowId);
    if (!r) return;
    r[dimension] = dimension === "people" ? UI.clamp(value, 1, 7) : UI.clamp(value, 0, 5);
    save();
    UI.defer(function () { renderSummary(); renderView(); });
  }

  /* --- Rendering: views --------------------------------------------------- */
  function renderView() {
    var active = document.activeElement;
    var fkey = active && active.dataset ? active.dataset.fkey : null;
    var host = UI.clear(UI.qs("#view"));
    UI.qsa(".view-tabs button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.view === state.view ? "true" : "false");
    });
    var hint = UI.qs("#view-hint");
    if (!state.board.rows.length) {
      hint.textContent = "";
      host.appendChild(UI.el("div", { class: "empty" }, [
        UI.el("p", { text: "No decisions on this board yet." }),
        UI.el("button", { class: "btn btn--primary", type: "button", text: "Add the first decision", onclick: addRow })
      ]));
      return;
    }
    if (state.view === "table") {
      hint.textContent = "Compact view. Change levels with the selects; open Edit for guardrails, rollback trigger and evidence.";
      host.appendChild(renderTable());
    } else {
      hint.textContent = state.view === "people"
        ? "Columns are Delegation Poker levels, from the lead deciding (1) to the team deciding (7). Drag a card, or use its select."
        : "Columns are agent autonomy levels. Red columns let agents act without approval. Drag a card, or use its select.";
      host.appendChild(renderMatrix(state.view));
    }
    if (fkey) {
      var again = UI.qsa("[data-fkey]").filter(function (n) { return n.dataset.fkey === fkey; })[0];
      if (again) again.focus();
    }
  }

  var dragId = null;

  function renderMatrix(dimension) {
    var levels = dimension === "people" ? PEOPLE : AGENT;
    var grid = UI.el("div", { class: "matrix", style: "--cols:" + levels.length, id: "matrix" });
    levels.forEach(function (l) {
      var col = UI.el("div", { class: "mcol" + (l.risk ? " mcol--risk" : ""), dataset: { level: String(l.n) } });
      col.appendChild(UI.el("div", { class: "mcol__head" }, [
        UI.el("div", { class: "flex items-center between gap-2" }, [
          UI.el("span", { class: "mcol__num", text: String(l.n) }),
          l.risk ? UI.el("span", { class: "tag tag--danger", text: "no approval" }) : null
        ]),
        UI.el("div", { class: "mcol__name", text: l.name }),
        UI.el("div", { class: "mcol__meaning", text: l.meaning })
      ]));
      var rows = state.board.rows.filter(function (r) { return r[dimension] === l.n; });
      if (!rows.length) col.appendChild(UI.el("div", { class: "mcol__empty", text: "Drop here" }));
      rows.forEach(function (r) { col.appendChild(renderCard(r, dimension)); });

      col.addEventListener("dragover", function (e) {
        if (!dragId) return;
        e.preventDefault();
        col.classList.add("is-over");
      });
      col.addEventListener("dragleave", function (e) {
        if (!col.contains(e.relatedTarget)) col.classList.remove("is-over");
      });
      col.addEventListener("drop", function (e) {
        e.preventDefault();
        col.classList.remove("is-over");
        var id = dragId;
        dragId = null;
        if (id) setLevel(id, dimension, l.n);
      });
      grid.appendChild(col);
    });
    return grid;
  }

  function renderCard(r, dimension) {
    var card = UI.el("div", { class: "dcard", draggable: "true", dataset: { row: r.id } });
    card.appendChild(UI.el("button", {
      class: "dcard__title", type: "button", text: r.decision || "(untitled decision)",
      title: "Edit details", dataset: { fkey: "title-" + r.id },
      onclick: function () { openRow(r.id); }
    }));
    card.appendChild(UI.el("div", { class: "dcard__tags" }, rowTags(r, dimension)));
    card.appendChild(levelSelect(r, dimension, "", true));
    card.appendChild(UI.el("button", {
      class: "btn btn--sm", type: "button", text: "Poker", dataset: { fkey: "poker-" + r.id },
      "aria-label": "Run a poker round for " + (r.decision || "untitled decision"),
      onclick: function () { openPoker(r.id); }
    }));
    card.addEventListener("dragstart", function (e) {
      dragId = r.id;
      card.classList.add("is-dragging");
      try { e.dataTransfer.setData("text/plain", r.id); e.dataTransfer.effectAllowed = "move"; } catch (err) { /* older browsers */ }
    });
    card.addEventListener("dragend", function () {
      card.classList.remove("is-dragging");
      dragId = null;
      UI.qsa(".mcol.is-over").forEach(function (c) { c.classList.remove("is-over"); });
    });
    return card;
  }

  function renderTable() {
    var table = UI.el("table", { class: "data deleg", id: "rows-table" });
    table.appendChild(UI.el("thead", null, UI.el("tr", null, [
      UI.el("th", { text: "Decision" }), UI.el("th", { text: "Category" }),
      UI.el("th", { text: "People level" }), UI.el("th", { text: "Agent level" }),
      UI.el("th", { text: "Owner role" }), UI.el("th", { text: "Review" }),
      UI.el("th", { text: "Status" }), UI.el("th", { html: "<span class=\"sr-only\">Actions</span>" })
    ])));
    var tbody = UI.el("tbody");
    state.board.rows.forEach(function (r) {
      var tr = UI.el("tr", { dataset: { row: r.id } });
      var status = UI.el("div", { class: "tags" }, rowTags(r, "table"));
      function refreshStatus() {
        UI.clear(status);
        rowTags(r, "table").forEach(function (t) { status.appendChild(t); });
        renderSummary();
      }
      var dec = UI.el("input", { type: "text", value: r.decision, "aria-label": "Decision", placeholder: "e.g. Merge a PR to main", dataset: { fkey: "dec-" + r.id } });
      dec.addEventListener("input", function () { r.decision = str(dec.value, 300); saveSoon(); refreshStatus(); });
      var cat = UI.el("select", { "aria-label": "Category for " + (r.decision || "decision"), dataset: { fkey: "cat-" + r.id } });
      CATEGORIES.forEach(function (c) { cat.appendChild(UI.el("option", { value: c, text: c, selected: r.category === c })); });
      cat.addEventListener("change", function () { r.category = cat.value; save(); refreshStatus(); });
      var pSel = levelSelect(r, "people");
      var aSel = levelSelect(r, "agent");
      var owner = UI.el("input", { type: "text", value: r.owner, "aria-label": "Owner role for " + (r.decision || "decision"), placeholder: "Tech Lead", dataset: { fkey: "own-" + r.id } });
      owner.addEventListener("input", function () { r.owner = str(owner.value, 120); saveSoon(); });
      var review = UI.el("input", { type: "date", value: r.review, "aria-label": "Review date for " + (r.decision || "decision"), dataset: { fkey: "rev-" + r.id } });
      review.addEventListener("change", function () { r.review = validIso(review.value); save(); refreshStatus(); });
      tr.appendChild(UI.el("td", { class: "c-dec" }, dec));
      tr.appendChild(UI.el("td", { class: "c-cat" }, cat));
      tr.appendChild(UI.el("td", { class: "c-people" }, pSel));
      tr.appendChild(UI.el("td", { class: "c-agent" }, aSel));
      tr.appendChild(UI.el("td", null, owner));
      tr.appendChild(UI.el("td", { class: "c-date" }, review));
      tr.appendChild(UI.el("td", { class: "c-tags" }, status));
      tr.appendChild(UI.el("td", { class: "nowrap" }, [
        UI.el("button", { class: "btn btn--sm", type: "button", text: "Edit", "aria-label": "Edit " + (r.decision || "decision"), dataset: { fkey: "edit-" + r.id }, onclick: function () { openRow(r.id); } }),
        " ",
        UI.el("button", { class: "btn btn--sm", type: "button", text: "Poker", "aria-label": "Run a poker round for " + (r.decision || "decision"), dataset: { fkey: "poker-" + r.id }, onclick: function () { openPoker(r.id); } })
      ]));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  /* --- Row editor --------------------------------------------------------- */
  function addRow() {
    if (!state.board) return;
    var r = makeRow({ decision: "", category: "Code", people: 4, agent: 1, review: inDays(90) });
    state.board.rows.push(r);
    save();
    renderAll();
    openRow(r.id);
  }

  function dialogShell(id, title, wide) {
    var old = document.getElementById(id);
    if (old) old.remove();
    var dlg = UI.el("dialog", { id: id, class: wide ? "wide" : "", "aria-labelledby": id + "-title" });
    dlg.appendChild(UI.el("div", { class: "dlg-head" }, [
      UI.el("h2", { id: id + "-title", text: title }),
      UI.el("button", { class: "btn btn--ghost btn--sm", type: "button", text: "Close", onclick: function () { dlg.close(); } })
    ]));
    document.body.appendChild(dlg);
    dlg.addEventListener("close", function () { UI.defer(function () { dlg.remove(); }); });
    return dlg;
  }

  function openRow(id) {
    var r = findRow(id);
    if (!r) return;
    var opener = document.activeElement;
    var openerKey = opener && opener.dataset ? opener.dataset.fkey : null;
    var dlg = dialogShell("row-dialog", "Edit decision", true);
    var rerender = UI.debounce(function () { renderSummary(); renderView(); }, 200);
    function changed(now) { if (now) { save(); renderSummary(); renderView(); } else { saveSoon(); rerender(); } }

    function textField(key, label, hint, multi, placeholder) {
      var fid = "rd-" + key;
      var input = multi
        ? UI.el("textarea", { id: fid, rows: "2", placeholder: placeholder || "" })
        : UI.el("input", { id: fid, type: "text", placeholder: placeholder || "" });
      input.value = r[key] || "";
      input.addEventListener("input", function () { r[key] = str(input.value, key === "decision" ? 300 : 2000); changed(false); });
      if (multi) UI.defer(function () { UI.autoGrow(input, 54); });
      return UI.el("div", { class: "field" }, [
        UI.el("label", { class: "label", for: fid, text: label }), input,
        hint ? UI.el("span", { class: "hint", text: hint }) : null
      ]);
    }

    function levelField(dimension) {
      var levels = dimension === "people" ? PEOPLE : AGENT;
      var fid = "rd-" + dimension;
      var sel = UI.el("select", { id: fid });
      levels.forEach(function (l) { sel.appendChild(UI.el("option", { value: String(l.n), text: l.n + " " + l.name, selected: r[dimension] === l.n })); });
      var desc = UI.el("span", { class: "level-desc", "aria-live": "polite" });
      function paint() {
        var l = levels[dimension === "people" ? r.people - 1 : r.agent];
        desc.textContent = l.meaning + (l.risk ? " Allows acting without approval." : "");
        desc.className = "level-desc" + (l.risk ? " risk" : "");
      }
      sel.addEventListener("change", function () { r[dimension] = parseInt(sel.value, 10); paint(); changed(true); });
      paint();
      return UI.el("div", { class: "field" }, [
        UI.el("label", { class: "label", for: fid, text: dimension === "people" ? "People level (lead to team)" : "Agent autonomy level" }), sel, desc
      ]);
    }

    var cat = UI.el("select", { id: "rd-category" });
    CATEGORIES.forEach(function (c) { cat.appendChild(UI.el("option", { value: c, text: c, selected: r.category === c })); });
    cat.addEventListener("change", function () { r.category = cat.value; changed(true); });
    var review = UI.el("input", { id: "rd-review", type: "date", value: r.review });
    review.addEventListener("change", function () { r.review = validIso(review.value); changed(true); });

    var body = UI.el("div", { class: "card__body stack", style: "gap:var(--sp-3)" }, [
      textField("decision", "Decision", "Write it as an action, e.g. \"Merge a PR to main\".", false, "Merge a PR to main"),
      UI.el("div", { class: "two" }, [
        UI.el("div", { class: "field" }, [UI.el("label", { class: "label", for: "rd-category", text: "Category" }), cat]),
        textField("owner", "Owner role", "A role, not a person.", false, "Tech Lead")
      ]),
      UI.el("div", { class: "two" }, [levelField("people"), levelField("agent")]),
      textField("guardrails", "Guardrails", "Limits the agent must respect at this level.", true, "CI green, one human approval, no force-push"),
      textField("rollback", "Rollback trigger", "What makes us lower this level.", true, "A merged agent change is reverted"),
      textField("evidence", "Evidence to raise it", "What we need to see before moving up one level.", true, "Approvers changed almost nothing on the last 30 proposals"),
      UI.el("div", { class: "field", style: "max-width:220px" }, [UI.el("label", { class: "label", for: "rd-review", text: "Review date" }), review])
    ]);
    if (r.poker) {
      body.appendChild(UI.el("p", { class: "hint", text: "Last poker round " + (r.poker.date ? UI.prettyDate(r.poker.date) : "") + ": " + r.poker.votes + " votes. People " + countsSummary(r.poker.people, 1) + ". Agents " + countsSummary(r.poker.agent, 0) + "." }));
    }
    dlg.appendChild(body);
    dlg.appendChild(UI.el("div", { class: "dlg-foot" }, [
      UI.el("button", {
        class: "btn btn--danger", type: "button", text: "Delete decision", style: "margin-right:auto",
        onclick: function () {
          if (!UI.confirmDanger("Delete the decision \"" + (oneLine(r.decision) || "untitled") + "\"?")) return;
          state.board.rows = state.board.rows.filter(function (x) { return x.id !== r.id; });
          save();
          dlg.close();
          renderAll();
        }
      }),
      UI.el("button", { class: "btn", type: "button", text: "Run poker", onclick: function () { dlg.close(); UI.defer(function () { openPoker(r.id); }); } }),
      UI.el("button", { class: "btn btn--primary", type: "button", id: "rd-done", text: "Done", onclick: function () { dlg.close(); } })
    ]));
    dlg.addEventListener("close", function () {
      save();
      renderAll();
      // The opener may have been rebuilt (or removed) while the dialog was open;
      // land on its replacement, the row, or the Add button.
      var a = document.activeElement;
      if (a && a !== document.body && a.isConnected && !dlg.contains(a)) return;
      var keys = [openerKey, "title-" + r.id, "edit-" + r.id];
      var target = UI.qsa("[data-fkey]").filter(function (n) { return keys.indexOf(n.dataset.fkey) !== -1; })[0];
      (target || UI.qs("#add-row") || document.body).focus();
    });
    dlg.showModal();
  }

  /* --- Poker -------------------------------------------------------------- */
  function openPoker(id) {
    var r = findRow(id);
    if (!r) return;
    state.poker = { rowId: id, votes: [], names: [], revealed: false };
    var dlg = dialogShell("poker-dialog", "Delegation Poker: " + (oneLine(r.decision) || "untitled decision"), true);
    var body = UI.el("div", { class: "card__body stack", id: "poker-body", style: "gap:var(--sp-3)" });
    dlg.appendChild(body);
    dlg.addEventListener("close", function () { state.poker = null; });
    renderPoker(body, r);
    dlg.showModal();
  }

  function pickGroup(name, levels, legend) {
    var fs = UI.el("fieldset", { style: "border:0;padding:0;margin:0;min-width:0" });
    fs.appendChild(UI.el("legend", { class: "label mb-2", text: legend }));
    var wrap = UI.el("div", { class: "picks" });
    levels.forEach(function (l) {
      wrap.appendChild(UI.el("label", { class: "pick" + (l.risk ? " risk" : ""), title: l.meaning }, [
        UI.el("input", { type: "radio", name: name, value: String(l.n), "aria-label": l.n + " " + l.name + ": " + l.meaning }),
        UI.el("span", { text: l.n + " " + l.name })
      ]));
    });
    fs.appendChild(wrap);
    return fs;
  }

  function renderPoker(body, r) {
    var p = state.poker;
    UI.clear(body);
    if (!p) return;
    var live = UI.el("div", { id: "poker-status", "aria-live": "polite", class: "stack", style: "gap:var(--sp-3)" });

    if (!p.revealed) {
      body.appendChild(UI.el("p", { class: "muted tiny", text: "Pass the device around. Each person enters a nickname (or leaves it blank), picks both levels, and locks in. Picks are hidden right away and never stored." }));
      var nameInput = UI.el("input", { type: "text", id: "poker-name", placeholder: "Participant " + (p.votes.length + 1), maxlength: "40" });
      body.appendChild(UI.el("div", { class: "field", style: "max-width:280px" }, [
        UI.el("label", { class: "label", for: "poker-name", text: "Nickname (optional)" }), nameInput
      ]));
      body.appendChild(pickGroup("poker-people", PEOPLE, "People level (lead to team)"));
      body.appendChild(pickGroup("poker-agent", AGENT, "Agent autonomy level"));
      var lock = UI.el("button", { class: "btn btn--primary", type: "button", id: "poker-lock", text: "Lock in my pick" });
      lock.addEventListener("click", function () {
        var pp = UI.qs("input[name='poker-people']:checked", body);
        var ap = UI.qs("input[name='poker-agent']:checked", body);
        if (!pp || !ap) { err.textContent = "Pick both a people level and an agent level, then lock in."; return; }
        var nick = str(nameInput.value, 40).trim() || ("Participant " + (p.votes.length + 1));
        p.votes.push({ people: parseInt(pp.value, 10), agent: parseInt(ap.value, 10) });
        p.names.push(nick);
        UI.defer(function () {
          renderPoker(body, r);
          var n = UI.qs("#poker-name");
          if (n) n.focus();
        });
      });
      // Toasts sit below a modal dialog, so feedback stays inside it.
      var err = UI.el("span", { class: "tiny", id: "poker-error", role: "alert", style: "color:var(--danger);font-weight:600" });
      body.appendChild(UI.el("div", { class: "btn-row items-center" }, [lock, err]));

      var voters = UI.el("div", { class: "voters", id: "poker-voters" });
      p.names.forEach(function (n) {
        voters.appendChild(UI.el("span", { class: "voter" }, [UI.el("span", { text: n }), UI.el("span", { class: "voter__hidden", text: "•••", "aria-label": "pick hidden" })]));
      });
      live.appendChild(UI.el("span", { class: "label", text: p.votes.length + (p.votes.length === 1 ? " pick locked in" : " picks locked in") }));
      if (p.names.length) live.appendChild(voters);
      body.appendChild(live);
      body.appendChild(UI.el("div", { class: "dlg-foot", style: "padding:0;border:0" }, [
        UI.el("button", { class: "btn", type: "button", text: "Cancel round", onclick: function () { UI.qs("#poker-dialog").close(); } }),
        UI.el("button", {
          class: "btn btn--primary", type: "button", id: "poker-reveal", text: "Reveal",
          disabled: p.votes.length < 2,
          onclick: function () { p.revealed = true; UI.defer(function () { renderPoker(body, r); }); }
        })
      ]));
      if (p.votes.length < 2) body.appendChild(UI.el("p", { class: "hint", style: "text-align:right", text: "Reveal needs at least two picks." }));
      return;
    }

    var pv = p.votes.map(function (v) { return v.people; });
    var av = p.votes.map(function (v) { return v.agent; });
    var ps = distStats(pv);
    var as = distStats(av);
    body.appendChild(UI.el("p", { class: "muted tiny", text: p.votes.length + " picks revealed as a distribution. Nobody's individual pick is shown." }));

    function block(title, values, stats, from, levels, id) {
      var wrap = UI.el("div", { class: "stack", style: "gap:var(--sp-2)" });
      wrap.appendChild(UI.el("span", { class: "label", text: title }));
      var canvas = UI.el("canvas", { class: "dist", id: id, height: "110", role: "img",
        "aria-label": title + ": " + countsSummary(countsOf(values, from, from + levels.length - 1), from) });
      wrap.appendChild(canvas);
      wrap.appendChild(UI.el("div", { class: "dist-stats", id: id + "-stats",
        text: "Min " + stats.min + " (" + levels[stats.min - from].name + "), max " + stats.max + " (" + levels[stats.max - from].name + "), spread " + stats.spread + (stats.spread === 1 ? " level" : " levels") + "." }));
      if (stats.spread >= 3) {
        wrap.appendChild(UI.el("div", { class: "disagree", text: "Spread of " + stats.spread + " levels: worth discussing, you disagree. Ask the people at " + stats.min + " and " + stats.max + " what they are picturing." }));
      } else {
        wrap.appendChild(UI.el("div", { class: "aligned", text: stats.spread === 0 ? "Everyone picked the same level." : "Close enough to settle quickly." }));
      }
      return { node: wrap, canvas: canvas, counts: countsOf(values, from, from + levels.length - 1), from: from, levels: levels };
    }
    var b1 = block("People level", pv, ps, 1, PEOPLE, "dist-people");
    var b2 = block("Agent autonomy level", av, as, 0, AGENT, "dist-agent");
    live.appendChild(UI.el("div", { class: "two" }, [b1.node, b2.node]));
    body.appendChild(live);

    var agreedP = UI.el("select", { id: "agreed-people" });
    PEOPLE.forEach(function (l) { agreedP.appendChild(UI.el("option", { value: String(l.n), text: l.n + " " + l.name, selected: l.n === ps.median })); });
    var agreedA = UI.el("select", { id: "agreed-agent" });
    AGENT.forEach(function (l) { agreedA.appendChild(UI.el("option", { value: String(l.n), text: l.n + " " + l.name + (l.risk ? " (no approval)" : ""), selected: l.n === as.median })); });
    body.appendChild(UI.el("div", { class: "two" }, [
      UI.el("div", { class: "field" }, [UI.el("label", { class: "label", for: "agreed-people", text: "Agreed people level" }), agreedP]),
      UI.el("div", { class: "field" }, [UI.el("label", { class: "label", for: "agreed-agent", text: "Agreed agent level" }), agreedA])
    ]));
    body.appendChild(UI.el("p", { class: "hint", text: "Prefilled with the median pick. The facilitator sets what the group agreed after discussion. Only the agreed levels and an anonymous count per level are kept." }));
    body.appendChild(UI.el("div", { class: "dlg-foot", style: "padding:0;border:0" }, [
      UI.el("button", { class: "btn", type: "button", text: "Vote again", onclick: function () {
        state.poker = { rowId: r.id, votes: [], names: [], revealed: false };
        UI.defer(function () { renderPoker(body, r); });
      } }),
      UI.el("button", { class: "btn btn--primary", type: "button", id: "poker-agree", text: "Set agreed level", onclick: function () {
        r.people = parseInt(agreedP.value, 10);
        r.agent = parseInt(agreedA.value, 10);
        r.poker = { date: today(), votes: p.votes.length, people: b1.counts, agent: b2.counts };
        state.poker = null; // drop every pick and nickname
        save();
        UI.qs("#poker-dialog").close();
        renderAll();
        UI.toast("Agreed: people " + peopleLabel(r.people) + ", agents " + agentLabel(r.agent) + ".", "ok");
      } })
    ]));
    UI.defer(function () { drawDist(b1); drawDist(b2); });
    pokerCharts = [b1, b2];
  }

  /* --- Charts ------------------------------------------------------------- */
  var pokerCharts = [];

  function css(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function setupCanvas(canvas) {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(200, Math.round(rect.width));
    var h = parseInt(canvas.getAttribute("height"), 10) || 130;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = h + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  /** Dot plot: one dot per pick, stacked above its level; min to max bracket below. */
  function drawDist(b) {
    if (!b.canvas.isConnected) return;
    var c = setupCanvas(b.canvas);
    var ctx = c.ctx;
    var n = b.levels.length;
    var pad = { l: 8, r: 8, t: 8, b: 34 };
    var slot = (c.w - pad.l - pad.r) / n;
    var base = c.h - pad.b;
    var maxC = Math.max(1, Math.max.apply(null, b.counts));
    var rad = Math.max(3, Math.min(slot * 0.28, (base - pad.t) / (maxC * 2.2), 9));
    var font = css("--font-sans", "sans-serif");

    ctx.strokeStyle = css("--border-strong", "#ccc");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, base + 0.5);
    ctx.lineTo(c.w - pad.r, base + 0.5);
    ctx.stroke();

    var first = -1, last = -1;
    b.counts.forEach(function (cnt, i) { if (cnt) { if (first < 0) first = i; last = i; } });

    b.levels.forEach(function (l, i) {
      var x = pad.l + slot * i + slot / 2;
      var color = l.risk ? css("--danger", "#c02a34") : css("--accent", "#4f46e5");
      for (var k = 0; k < b.counts[i]; k++) {
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(x, base - rad - 2 - k * (rad * 2 + 2), rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = l.risk ? css("--danger", "#c02a34") : css("--text-2", "#555");
      ctx.font = "600 11px " + font;
      ctx.textAlign = "center";
      ctx.fillText(String(l.n), x, base + 14);
    });

    if (first >= 0) {
      var x1 = pad.l + slot * first + slot / 2;
      var x2 = pad.l + slot * last + slot / 2;
      var y = base + 24;
      var spread = last - first;
      ctx.strokeStyle = spread >= 3 ? css("--warn", "#a86400") : css("--text-3", "#888");
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y - 4); ctx.lineTo(x1, y); ctx.lineTo(x2, y); ctx.lineTo(x2, y - 4);
      ctx.stroke();
      ctx.fillStyle = spread >= 3 ? css("--warn", "#a86400") : css("--text-3", "#888");
      ctx.font = "600 10px " + font;
      ctx.textAlign = "center";
      ctx.fillText("spread " + spread, UI.clamp((x1 + x2) / 2, pad.l + 24, c.w - pad.r - 24), y + 9);
    }
  }

  function redrawCharts() {
    pokerCharts.forEach(function (b) { if (b.canvas.isConnected) drawDist(b); });
  }

  /* --- Exports ------------------------------------------------------------ */
  function showExport(title, text, filename, mime) {
    var dlg = dialogShell("export-dialog", title, true);
    var ta = UI.el("textarea", { class: "export", id: "export-text", readonly: true, "aria-label": title, spellcheck: "false" });
    ta.value = text;
    // Toasts render below a modal dialog, so copy feedback is shown inline.
    var note = UI.el("span", { class: "tiny muted", role: "status", style: "margin-right:auto;align-self:center" });
    function copy() {
      function fallback() {
        ta.focus();
        ta.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        note.textContent = ok ? "Copied to clipboard." : "Copy failed: the text is selected, press Ctrl+C.";
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { note.textContent = "Copied to clipboard."; }, fallback);
      } else fallback();
    }
    dlg.appendChild(UI.el("div", { class: "card__body" }, ta));
    dlg.appendChild(UI.el("div", { class: "dlg-foot" }, [
      note,
      UI.el("button", { class: "btn", type: "button", text: "Download", onclick: function () { UI.download(filename, text, mime); } }),
      UI.el("button", { class: "btn btn--primary", type: "button", text: "Copy", onclick: copy })
    ]));
    dlg.showModal();
  }

  function exportJSONPayload(board) {
    return { app: "agile-toolbox", tool: NS, schema: SCHEMA, exportedAt: new Date().toISOString(), board: board };
  }

  function importPayload(payload) {
    var boards;
    try { boards = parseImport(payload); }
    catch (err) { UI.toast(err.message, "danger"); return 0; }
    boards.forEach(function (b) {
      b.id = UI.uid("board");
      b.name = b.name + " (imported)";
      state.boards.push(b);
    });
    state.board = boards[boards.length - 1];
    save();
    renderAll();
    UI.toast(boards.length === 1 ? "Board imported." : boards.length + " boards imported.", "ok");
    return boards.length;
  }

  /* --- Board actions ------------------------------------------------------ */
  function createBoard(kind) {
    var b;
    if (kind === "blank") {
      var name = prompt("Board name", "New board");
      if (name === null) return;
      b = makeBoard(str(name, 120).trim() || "New board", []);
    } else if (PRESETS[kind]) {
      b = boardFromPreset(kind);
    } else return;
    state.boards.push(b);
    state.board = b;
    save();
    renderAll();
    UI.toast("Board created: " + b.name, "ok");
  }

  function cloneBoard(b) {
    var copy = JSON.parse(JSON.stringify(b));
    copy.id = UI.uid("board");
    copy.name = b.name + " (copy)";
    copy.created = today();
    copy.rows.forEach(function (r) { r.id = UI.uid("r"); });
    return copy;
  }

  function init() {
    UI.initChrome();
    load();
    renderLegend();

    UI.qs("#board-select").addEventListener("change", function (e) {
      var id = e.target.value;
      state.board = state.boards.filter(function (b) { return b.id === id; })[0] || state.board;
      save();
      UI.defer(renderAll);
    });
    UI.qs("#create-board").addEventListener("click", function () { createBoard(UI.qs("#new-from").value); });
    UI.qs("#load-example").addEventListener("click", function () { createBoard("software"); });
    UI.qs("#start-blank").addEventListener("click", function () { createBoard("blank"); });
    UI.qs("#rename-board").addEventListener("click", function () {
      if (!state.board) return;
      var name = prompt("Board name", state.board.name);
      if (name === null || !name.trim()) return;
      state.board.name = str(name, 120).trim();
      save();
      renderAll();
    });
    UI.qs("#duplicate-board").addEventListener("click", function () {
      if (!state.board) return;
      var copy = cloneBoard(state.board);
      state.boards.push(copy);
      state.board = copy;
      save();
      renderAll();
      UI.toast("Duplicated.", "ok");
    });
    UI.qs("#delete-board").addEventListener("click", function () {
      if (!state.board) return;
      if (!UI.confirmDanger("Delete the board \"" + state.board.name + "\" and all its decisions? This cannot be undone.")) return;
      var id = state.board.id;
      state.boards = state.boards.filter(function (b) { return b.id !== id; });
      state.board = state.boards[0] || null;
      save();
      renderAll();
      UI.toast("Board deleted.");
    });
    UI.qs("#add-row").addEventListener("click", addRow);
    UI.qsa(".view-tabs button").forEach(function (b) {
      b.addEventListener("click", function () {
        state.view = b.dataset.view;
        Store.write(NS, "view", state.view);
        renderView();
      });
    });

    UI.qs("#export-md").addEventListener("click", function () {
      if (!state.board) return;
      showExport("Delegation matrix (Markdown)", toMarkdown(state.board), UI.slug(state.board.name) + "-delegation.md", "text/markdown");
    });
    UI.qs("#export-agents").addEventListener("click", function () {
      if (!state.board) return;
      showExport("AGENTS.md section", toAgentsMd(state.board), "AGENTS-delegation.md", "text/markdown");
    });
    UI.qs("#export-json").addEventListener("click", function () {
      if (!state.board) return;
      UI.downloadJSON(UI.slug(state.board.name) + "-delegation.json", exportJSONPayload(state.board));
    });
    UI.qs("#import-json").addEventListener("click", function () { UI.pickJSON(importPayload); });

    var redraw = UI.debounce(redrawCharts, 120);
    window.addEventListener("resize", redraw);
    if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
    new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    renderAll();

    // Debug and test surface: pure functions only, no stored picks to expose.
    window.__delegation = {
      distStats: distStats, isRisky: isRisky, toAgentsMd: toAgentsMd, toMarkdown: toMarkdown,
      parseImport: parseImport, importPayload: importPayload, exportJSONPayload: exportJSONPayload,
      state: function () { return state; }
    };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
