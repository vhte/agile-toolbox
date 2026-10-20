/* ==========================================================================
   Decision Log: lightweight, MADR-style decision records.

   The point is the reasoning, not the paperwork. Quick capture turns one
   sentence into a Proposed record; everything else can be filled in later.
   Numbers are per log, never reused, and decisions are superseded rather
   than rewritten.
   ========================================================================== */
(function () {
  "use strict";

  var NS = "decisions";
  var STATUSES = ["Proposed", "Accepted", "Rejected", "Superseded", "Deprecated"];
  var STATUS_TAG = {
    Proposed: "tag--info", Accepted: "tag--ok", Rejected: "tag--danger",
    Superseded: "", Deprecated: "tag--warn"
  };
  var ORIGINS = [
    ["human", "Human"],
    ["ai", "AI-proposed, human-accepted"],
    ["meeting", "Meeting"],
    ["incident", "Incident / postmortem"]
  ];
  var ORIGIN_SHORT = { human: "Human", ai: "AI, human-accepted", meeting: "Meeting", incident: "Postmortem" };
  var CONFIDENCE = ["Low", "Medium", "High"];

  var state = {
    logs: [],
    log: null,
    selected: null,
    filter: { q: "", status: "", tag: "", sort: "num-desc" },
    dirty: false
  };

  /* --- Small helpers ---------------------------------------------------- */
  function pad(n) { return String(n).padStart(4, "0"); }
  function str(v) { return typeof v === "string" ? v : (v === null || v === undefined ? "" : String(v)); }
  function strList(v) {
    if (!Array.isArray(v)) return [];
    return v.map(function (x) { return str(x).trim(); }).filter(Boolean);
  }
  function lines(text) {
    return str(text).split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function tagsFrom(text) {
    var seen = {};
    return str(text).split(",").map(function (s) { return s.trim().toLowerCase(); }).filter(function (t) {
      if (!t || seen[t]) return false;
      seen[t] = true;
      return true;
    });
  }
  function validIso(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !!UI.parseDate(v); }
  function today() { return UI.isoDate(); }
  function daysFromToday(n) { return UI.isoDate(UI.addDays(new Date(), n)); }
  function cap(s) { s = str(s); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function originLabel(key) {
    var hit = ORIGINS.filter(function (o) { return o[0] === key; })[0];
    return hit ? hit[1] : "Human";
  }
  /** "Long-lived..." -> "long-lived...", but "API drift" stays as is. */
  function lowerFirst(t) {
    t = str(t).trim();
    return /^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
  }

  /** Collapse whitespace and cut at a word boundary. */
  function truncate(text, max) {
    var t = str(text).replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    var cut = t.slice(0, max);
    var sp = cut.lastIndexOf(" ");
    if (sp > max * 0.6) cut = cut.slice(0, sp);
    return cut.replace(/[\s.,;:]+$/, "") + "...";
  }

  /**
   * "We decided to adopt X because Y" -> { title: "Adopt X", rationale: "Y" }.
   * Splits on the first " because "; strips the "we decided to" lead-in so the
   * title reads as the decision itself.
   */
  function parseCapture(text) {
    var t = str(text).replace(/\s+/g, " ").trim();
    if (!t) return null;
    var m = /\s+because\s+/i.exec(t);
    var head = m ? t.slice(0, m.index) : t;
    var why = m ? t.slice(m.index + m[0].length) : "";
    var stripped = head.replace(
      /^(we\s+)?(have\s+)?(decided|agreed|chose|will)\s+(to\s+|on\s+|that\s+(we\s+(will|should)\s+)?)?/i, "");
    head = (stripped.trim() || head).replace(/[\s.,;:]+$/, "");
    why = why.replace(/[\s.]+$/, "").trim();
    return { title: cap(head), rationale: cap(why) };
  }

  /** Due on the revisit-by date itself, not the day after. Local dates, compared as YYYY-MM-DD. */
  function isRevisitDue(r, now) {
    return r.status === "Accepted" && validIso(r.revisitBy) && r.revisitBy <= (now || today());
  }

  /* --- Model ------------------------------------------------------------ */
  function makeLog(name) {
    return { id: UI.uid("log"), name: name || "Team decisions", nextNumber: 1, records: [] };
  }

  function blankRecord() {
    return {
      id: UI.uid("dr"), number: 0, title: "", date: today(), status: "Proposed",
      owner: "", deciders: "", context: "", drivers: [], options: [], chosen: "",
      rationale: "", positive: [], negative: [], followUps: [], confidence: "Medium",
      revisitBy: "", tags: [], links: [], origin: "human", supersedes: "", supersededBy: "",
      updated: new Date().toISOString()
    };
  }

  function addRecord(log, fields) {
    var r = blankRecord();
    Object.keys(fields || {}).forEach(function (k) { r[k] = fields[k]; });
    r.number = log.nextNumber;
    log.nextNumber += 1;
    log.records.push(r);
    return r;
  }

  function normalizeRecord(r) {
    var base = blankRecord();
    var out = {};
    r = r && typeof r === "object" ? r : {};
    out.id = str(r.id) || base.id;
    out.number = parseInt(r.number, 10) > 0 ? parseInt(r.number, 10) : 0;
    ["title", "owner", "deciders", "context", "rationale", "chosen", "supersedes", "supersededBy", "updated"]
      .forEach(function (k) { out[k] = str(r[k]); });
    out.date = validIso(r.date) ? r.date : base.date;
    out.revisitBy = validIso(r.revisitBy) ? r.revisitBy : "";
    out.status = STATUSES.indexOf(r.status) !== -1 ? r.status : "Proposed";
    out.confidence = CONFIDENCE.indexOf(r.confidence) !== -1 ? r.confidence : "Medium";
    out.origin = ORIGINS.some(function (o) { return o[0] === r.origin; }) ? r.origin : "human";
    ["drivers", "positive", "negative", "followUps", "links"].forEach(function (k) { out[k] = strList(r[k]); });
    out.tags = tagsFrom(strList(r.tags).join(","));
    out.options = (Array.isArray(r.options) ? r.options : []).filter(function (o) {
      return o && typeof o === "object";
    }).map(function (o) {
      return { id: str(o.id) || UI.uid("opt"), name: str(o.name), pros: strList(o.pros), cons: strList(o.cons) };
    });
    if (out.chosen && !out.options.some(function (o) { return o.id === out.chosen; })) out.chosen = "";
    return out;
  }

  function normalizeLog(l) {
    l = l && typeof l === "object" ? l : {};
    var out = {
      id: str(l.id) || UI.uid("log"),
      name: str(l.name).trim() || "Decision log",
      nextNumber: parseInt(l.nextNumber, 10) > 0 ? parseInt(l.nextNumber, 10) : 1,
      records: (Array.isArray(l.records) ? l.records : []).map(normalizeRecord)
    };
    var used = {};
    out.records.forEach(function (r) {
      if (!r.number || used[r.number]) r.number = 0;
      else used[r.number] = true;
      if (r.number >= out.nextNumber) out.nextNumber = r.number + 1;
    });
    out.records.forEach(function (r) {
      if (!r.number) { r.number = out.nextNumber; out.nextNumber += 1; }
    });
    dropDanglingRefs(out);
    return out;
  }

  function dropDanglingRefs(log) {
    var ids = {};
    log.records.forEach(function (r) { ids[r.id] = true; });
    log.records.forEach(function (r) {
      if (r.supersedes && !ids[r.supersedes]) r.supersedes = "";
      if (r.supersededBy && !ids[r.supersededBy]) r.supersededBy = "";
    });
  }

  /**
   * Merge another log's records into `target`. A record whose id is already in
   * the log is skipped (re-importing your own export is harmless). A number that
   * is taken, or was ever handed out in this log, is renumbered: numbers are
   * never reused.
   */
  function mergeInto(target, incoming) {
    var src = normalizeLog(incoming);
    var ids = {};
    target.records.forEach(function (r) { ids[r.id] = true; });
    var retiredBelow = target.nextNumber; // every number below this was issued already
    var maxIncoming = src.records.reduce(function (m, r) { return ids[r.id] ? m : Math.max(m, r.number); }, 0);
    target.nextNumber = Math.max(target.nextNumber, maxIncoming + 1);
    var result = { added: 0, skipped: 0, renumbered: [] };
    src.records.slice().sort(function (a, b) { return a.number - b.number; }).forEach(function (r) {
      if (ids[r.id]) { result.skipped++; return; }
      if (r.number < retiredBelow) {
        var from = r.number;
        r.number = target.nextNumber;
        target.nextNumber += 1;
        result.renumbered.push([from, r.number]);
      }
      ids[r.id] = true;
      target.records.push(r);
      result.added++;
    });
    dropDanglingRefs(target);
    return result;
  }

  function findRecord(id) {
    if (!state.log || !id) return null;
    return state.log.records.filter(function (r) { return r.id === id; })[0] || null;
  }

  /* --- Persistence ------------------------------------------------------ */
  function save() {
    state.dirty = false;
    if (!Store.write(NS, "logs", state.logs)) UI.toast("Could not save: browser storage is full.", "danger");
    Store.write(NS, "active", state.log ? state.log.id : null);
  }
  var saveSoon = UI.debounce(function () {
    if (!state.dirty) return;
    save();
    var s = UI.qs("#save-state");
    if (s) s.textContent = "Saved";
  }, 400);

  function touched(rec) {
    if (rec) rec.updated = new Date().toISOString();
    state.dirty = true;
    var s = UI.qs("#save-state");
    if (s) s.textContent = "Saving...";
    renderSummary();
    renderTagFilter();
    renderList();
    saveSoon();
  }

  function load() {
    var raw = Store.read(NS, "logs", []);
    state.logs = (Array.isArray(raw) ? raw : []).map(normalizeLog);
    var active = Store.read(NS, "active", null);
    state.log = state.logs.filter(function (l) { return l.id === active; })[0] || state.logs[0] || null;
    state.selected = null;
  }

  /* --- Example ---------------------------------------------------------- */
  function exampleLog() {
    var log = makeLog("Payments platform (example)");
    var r1 = addRecord(log, {
      title: "Ship through a weekly release train", date: daysFromToday(-340), status: "Superseded",
      owner: "Engineering manager, Payments", deciders: "Payments team; consulted: SRE, QA",
      context: "Releases were ad hoc and every deploy needed a manual regression pass. We needed a predictable rhythm before the card-issuing launch.",
      drivers: ["Predictable dates for partners", "Manual regression takes two days"],
      options: [
        { id: "o11", name: "Weekly release train", pros: ["Predictable for partners", "Fits the manual regression pass"], cons: ["Changes wait up to a week", "Big batches are harder to roll back"] },
        { id: "o12", name: "Release on demand", pros: ["Fast feedback"], cons: ["No automated regression yet"] }
      ],
      chosen: "o11", rationale: "Manual regression made anything faster unsafe, and partners asked for fixed dates.",
      positive: ["Partners can plan around Tuesdays"], negative: ["Lead time grows to about a week"],
      followUps: ["Automate the regression suite"], confidence: "Medium",
      tags: ["delivery", "release"], origin: "meeting"
    });
    var r2 = addRecord(log, {
      title: "Use Postgres for the event store", date: daysFromToday(-300), status: "Accepted",
      owner: "Tech lead, Payments", deciders: "Payments team; consulted: Data platform",
      context: "We need an append-only store for payment events with strong ordering per account. The team already runs Postgres in production.",
      drivers: ["Ordering per account", "Operational familiarity", "Expected volume under 2k events per second"],
      options: [
        { id: "o21", name: "Postgres with an append-only table", pros: ["Team knows how to run it", "Transactions with the read model"], cons: ["Needs partitioning past a few billion rows"] },
        { id: "o22", name: "Dedicated event store product", pros: ["Built for the job"], cons: ["New thing to operate", "No in-house experience"] }
      ],
      chosen: "o21", rationale: "Volume is well within what Postgres handles and the team can operate it today. We made this on volume estimates, so check it once real traffic arrives.",
      positive: ["No new infrastructure"], negative: ["Partitioning work later"],
      followUps: ["Measure event volume three months after launch"], confidence: "Low",
      revisitBy: daysFromToday(-20), tags: ["architecture", "data"], origin: "human",
      links: ["https://example.com/wiki/payments/event-store-spike"]
    });
    addRecord(log, {
      title: "Adopt Kafka for inter-service messaging", date: daysFromToday(-250), status: "Rejected",
      owner: "Architecture guild", deciders: "Payments and Ledger teams",
      context: "Two services poll each other's APIs. A message bus was proposed to decouple them.",
      drivers: ["Decoupling", "Operational cost", "Team size"],
      options: [
        { id: "o31", name: "Kafka cluster", pros: ["Durable, replayable streams"], cons: ["Heavy to operate for two consumers"] },
        { id: "o32", name: "Keep polling, add webhooks later", pros: ["Nothing new to run"], cons: ["Some coupling stays"] }
      ],
      chosen: "o32", rationale: "Two consumers do not justify running a cluster; webhooks cover the need.",
      confidence: "High", tags: ["architecture", "messaging"], origin: "meeting"
    });
    var r4 = addRecord(log, {
      title: "Deploy every merge to main behind feature flags", date: daysFromToday(-120), status: "Accepted",
      owner: "Engineering manager, Payments", deciders: "Payments team; consulted: SRE",
      context: "The regression suite is now automated (follow-up from 0001). Changes still wait up to a week for the train.",
      drivers: ["Lead time", "Smaller, safer changes", "Automated regression now exists"],
      options: [
        { id: "o41", name: "Continuous deployment with feature flags", pros: ["Lead time drops to hours", "Small batches roll back easily"], cons: ["Flag hygiene needs discipline"] },
        { id: "o42", name: "Keep the weekly train", pros: ["Partners know the rhythm"], cons: ["Week-long lead time"] }
      ],
      chosen: "o41", rationale: "Automated regression removed the reason for batching, and flags keep partner-facing changes on a schedule.",
      positive: ["Lead time in hours"], negative: ["Flags must be cleaned up"],
      followUps: ["Add a flag-age check to the weekly review"], confidence: "High",
      revisitBy: daysFromToday(200), tags: ["delivery", "release"], origin: "meeting",
      supersedes: r1.id
    });
    r1.supersededBy = r4.id;
    addRecord(log, {
      title: "Generate API client SDKs from the OpenAPI spec", date: daysFromToday(-60), status: "Accepted",
      owner: "Tech lead, Developer experience", deciders: "Payments team; consulted: partner integrations",
      context: "Hand-written clients drifted from the API twice this quarter. A coding agent proposed generating them in CI and opened a draft change.",
      drivers: ["Clients must match the API", "Low maintenance"],
      options: [
        { id: "o51", name: "Generate in CI from the spec", pros: ["Always in sync"], cons: ["Generated code is less idiomatic"] },
        { id: "o52", name: "Keep hand-written clients", pros: ["Nicer ergonomics"], cons: ["They drift"] }
      ],
      chosen: "o51", rationale: "Drift caused two partner incidents; generation makes the spec the single source of truth.",
      followUps: ["Write a short guide on extending generated clients"], confidence: "Medium",
      revisitBy: daysFromToday(90), tags: ["api", "dx"], origin: "ai"
    });
    addRecord(log, {
      title: "Require a rollback plan in every production change", date: daysFromToday(-5), status: "Proposed",
      owner: "SRE lead", deciders: "Payments team, SRE",
      context: "The last postmortem found that a failed migration took 90 minutes to undo because nobody had written down how.",
      drivers: ["Time to recover", "Low overhead for small changes"],
      rationale: "A written rollback step would have cut recovery from 90 minutes to under 15.",
      confidence: "Medium", tags: ["reliability", "postmortem"], origin: "incident"
    });
    return { log: log, overdue: r2 };
  }

  /* --- Markdown --------------------------------------------------------- */
  function h(level, text) { return new Array(level + 1).join("#") + " " + text; }
  function cell(text) { return str(text).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim(); }
  function refLabel(id) {
    var r = findRecord(id);
    return r ? pad(r.number) + " " + (r.title || "(untitled)") : "";
  }
  function statusText(r) {
    var by = findRecord(r.supersededBy);
    if (r.status === "Superseded" && by) return "Superseded by " + pad(by.number);
    return r.status;
  }

  function recordFileName(r) {
    return pad(r.number) + "-" + UI.slug(r.title || "decision") + ".md";
  }

  function recordMarkdown(r, base) {
    var b = base || 1;
    var out = [h(b, pad(r.number) + ". " + (r.title || "(untitled decision)")), ""];
    out.push("- Status: " + statusText(r));
    out.push("- Date: " + r.date);
    if (r.owner) out.push("- Decision owner: " + r.owner);
    if (r.deciders) out.push("- Deciders and consulted: " + r.deciders);
    out.push("- Origin: " + originLabel(r.origin));
    out.push("- Confidence: " + r.confidence);
    if (r.revisitBy) out.push("- Revisit by: " + r.revisitBy + (isRevisitDue(r) ? " (due)" : ""));
    if (r.tags.length) out.push("- Tags: " + r.tags.join(", "));
    if (r.supersedes && findRecord(r.supersedes)) out.push("- Supersedes: " + refLabel(r.supersedes));
    if (r.supersededBy && findRecord(r.supersededBy)) out.push("- Superseded by: " + refLabel(r.supersededBy));
    out.push("");

    out.push(h(b + 1, "Context and problem statement"), "", r.context || "_Not recorded._", "");
    if (r.drivers.length) {
      out.push(h(b + 1, "Decision drivers"), "");
      r.drivers.forEach(function (d) { out.push("- " + d); });
      out.push("");
    }
    var named = r.options.filter(function (o) { return o.name.trim(); });
    if (named.length) {
      out.push(h(b + 1, "Considered options"), "");
      named.forEach(function (o, i) { out.push((i + 1) + ". " + o.name.trim()); });
      out.push("");
    }
    out.push(h(b + 1, "Decision outcome"), "");
    var chosen = r.options.filter(function (o) { return o.id === r.chosen; })[0];
    var what = chosen && chosen.name.trim() ? "Chosen option: \"" + chosen.name.trim() + "\"" :
      "Decision: " + (r.title || "(untitled)");
    var because = lowerFirst(r.rationale);
    if (because && !/[.!?]$/.test(because)) because += ".";
    out.push(what + (because ? ", because " + because : "."), "");
    if (r.positive.length || r.negative.length || r.followUps.length) {
      out.push(h(b + 2, "Consequences"), "");
      r.positive.forEach(function (x) { out.push("- Good: " + x); });
      r.negative.forEach(function (x) { out.push("- Bad: " + x); });
      if (r.followUps.length) {
        if (r.positive.length || r.negative.length) out.push("");
        out.push("Follow-ups:", "");
        r.followUps.forEach(function (x) { out.push("- [ ] " + x); });
      }
      out.push("");
    }
    var withDetail = named.filter(function (o) { return o.pros.length || o.cons.length; });
    if (withDetail.length) {
      out.push(h(b + 1, "Pros and cons of the options"), "");
      withDetail.forEach(function (o) {
        out.push(h(b + 2, o.name.trim()), "");
        o.pros.forEach(function (x) { out.push("- Good: " + x); });
        o.cons.forEach(function (x) { out.push("- Bad: " + x); });
        out.push("");
      });
    }
    if (r.links.length) {
      out.push(h(b + 1, "Links"), "");
      r.links.forEach(function (x) { out.push("- " + x); });
      out.push("");
    }
    return out;
  }

  function byNumber(a, b) { return a.number - b.number; }

  function logMarkdown(log) {
    var recs = log.records.slice().sort(byNumber);
    var out = [h(1, log.name + ": decision log"), ""];
    out.push("_Exported " + today() + ". " + recs.length + " record" + (recs.length === 1 ? "" : "s") + "._", "");
    out.push("| # | Decision | Status | Date |", "|---|---|---|---|");
    recs.forEach(function (r) {
      out.push("| " + pad(r.number) + " | " + cell(r.title || "(untitled)") + " | " + cell(statusText(r)) + " | " + r.date + " |");
    });
    out.push("");
    recs.forEach(function (r) {
      out.push("---", "");
      out = out.concat(recordMarkdown(r, 2));
    });
    out.push("---", "_Recorded with Agile Toolbox, Decision Log._");
    return out.join("\n");
  }

  function agentsIndex(log) {
    var acc = log.records.filter(function (r) { return r.status === "Accepted"; })
      .sort(function (a, b) { return b.number - a.number; });
    var out = [h(2, "Decision index: " + log.name), ""];
    out.push("Accepted decisions, newest first, each with the short reason. Check the full record before changing something listed here.", "");
    if (!acc.length) out.push("_No accepted decisions yet._");
    acc.forEach(function (r) {
      var why = r.rationale ? " Why: " + truncate(r.rationale, 140) : "";
      out.push("- **" + pad(r.number) + "** " + (r.title || "(untitled)").trim() + " (" + r.date + ")." + why +
        (isRevisitDue(r) ? " _Revisit due._" : ""));
    });
    return out.join("\n");
  }

  /* --- Dialog ----------------------------------------------------------- */
  var preview = { name: "", text: "" };
  function openPreview(title, filename, text) {
    preview.name = filename;
    preview.text = text;
    UI.qs("#md-title").textContent = title;
    UI.qs("#md-text").value = text;
    UI.qs("#md-file").textContent = filename;
    var d = UI.qs("#md-dialog");
    if (d.showModal && !d.open) d.showModal();
    else d.setAttribute("open", "");
  }
  function closePreview() {
    var d = UI.qs("#md-dialog");
    if (d.close && d.open) d.close();
    else d.removeAttribute("open");
  }

  /* --- Rendering: chrome ------------------------------------------------ */
  function renderAll() {
    var has = !!state.log;
    UI.qs("#no-logs").classList.toggle("hidden", has);
    UI.qs("#app").classList.toggle("hidden", !has);
    if (!has) return;
    renderLogSelect();
    renderSummary();
    renderStatusFilter();
    renderTagFilter();
    renderList();
    renderDetail();
  }

  function renderLogSelect() {
    var sel = UI.qs("#log-select");
    UI.clear(sel);
    state.logs.forEach(function (l) {
      sel.appendChild(UI.el("option", { value: l.id, selected: l.id === state.log.id, text: l.name }));
    });
  }

  function counts() {
    var c = { total: 0, due: 0 };
    STATUSES.forEach(function (s) { c[s] = 0; });
    var now = today();
    state.log.records.forEach(function (r) {
      c.total++;
      c[r.status]++;
      if (isRevisitDue(r, now)) c.due++;
    });
    return c;
  }

  function renderSummary() {
    var host = UI.qs("#summary");
    UI.clear(host);
    if (!state.log) return;
    var c = counts();
    host.appendChild(UI.el("span", { class: "sum-total", text: c.total + " decision" + (c.total === 1 ? "" : "s") }));
    STATUSES.forEach(function (s) {
      host.appendChild(UI.el("button", {
        class: "sum-btn", type: "button", "aria-pressed": state.filter.status === s ? "true" : "false",
        title: "Show only " + s, onclick: function () { setStatusFilter(state.filter.status === s ? "" : s); }
      }, [UI.el("span", { class: "tag " + STATUS_TAG[s], text: s }), UI.el("strong", { text: String(c[s]) })]));
    });
    host.appendChild(UI.el("button", {
      class: "sum-btn", type: "button", id: "sum-due", "aria-pressed": state.filter.status === "due" ? "true" : "false",
      title: "Show Accepted decisions on or past their revisit date",
      onclick: function () { setStatusFilter(state.filter.status === "due" ? "" : "due"); }
    }, [UI.el("span", { class: "tag " + (c.due ? "tag--warn" : ""), text: "Revisit" }),
      UI.el("strong", { text: c.due + " due for revisit" })]));
  }

  function setStatusFilter(v) {
    state.filter.status = v;
    UI.qs("#filter-status").value = v;
    renderSummary();
    renderList();
  }

  function renderStatusFilter() {
    var sel = UI.qs("#filter-status");
    UI.clear(sel);
    sel.appendChild(UI.el("option", { value: "", text: "All statuses" }));
    STATUSES.forEach(function (s) { sel.appendChild(UI.el("option", { value: s, text: s })); });
    sel.appendChild(UI.el("option", { value: "due", text: "Revisit due" }));
    sel.value = state.filter.status;
  }

  function renderTagFilter() {
    var sel = UI.qs("#filter-tag");
    var all = {};
    state.log.records.forEach(function (r) { r.tags.forEach(function (t) { all[t] = true; }); });
    var tags = Object.keys(all).sort();
    if (state.filter.tag && !all[state.filter.tag]) state.filter.tag = "";
    UI.clear(sel);
    sel.appendChild(UI.el("option", { value: "", text: "All tags" }));
    tags.forEach(function (t) { sel.appendChild(UI.el("option", { value: t, text: "#" + t })); });
    sel.value = state.filter.tag;
  }

  function haystack(r) {
    var parts = [pad(r.number), r.title, r.tags.join(" "), r.context, r.rationale, r.owner, r.deciders,
      r.drivers.join(" "), r.positive.join(" "), r.negative.join(" "), r.followUps.join(" "), r.links.join(" ")];
    r.options.forEach(function (o) { parts.push(o.name, o.pros.join(" "), o.cons.join(" ")); });
    return parts.join(" ").toLowerCase();
  }

  function visibleRecords() {
    var f = state.filter;
    var q = f.q.trim().toLowerCase();
    var now = today();
    var list = state.log.records.filter(function (r) {
      if (f.status === "due" && !isRevisitDue(r, now)) return false;
      if (f.status && f.status !== "due" && r.status !== f.status) return false;
      if (f.tag && r.tags.indexOf(f.tag) === -1) return false;
      if (q && haystack(r).indexOf(q) === -1) return false;
      return true;
    });
    list.sort(function (a, b) {
      if (f.sort === "num-asc") return a.number - b.number;
      if (f.sort === "date-desc") return b.date.localeCompare(a.date) || b.number - a.number;
      if (f.sort === "date-asc") return a.date.localeCompare(b.date) || a.number - b.number;
      return b.number - a.number;
    });
    return list;
  }

  function renderList() {
    var host = UI.qs("#rec-list");
    var empty = UI.qs("#list-empty");
    UI.clear(host);
    var list = visibleRecords();
    var total = state.log.records.length;
    UI.qs("#list-count").textContent = list.length === total ? String(total) : list.length + " of " + total;
    var now = today();
    list.forEach(function (r) {
      var meta = [UI.el("span", { class: "tag " + STATUS_TAG[r.status], text: r.status })];
      if (isRevisitDue(r, now)) meta.push(UI.el("span", { class: "tag tag--warn badge-due", text: "Revisit due" }));
      if (r.origin === "ai") meta.push(UI.el("span", { class: "tag tag--accent", text: "AI-proposed" }));
      meta.push(UI.el("span", { text: UI.prettyDate(r.date) }));
      r.tags.slice(0, 4).forEach(function (t) { meta.push(UI.el("span", { class: "tag", text: "#" + t })); });
      var btn = UI.el("button", {
        class: "rec-row", type: "button", dataset: { id: r.id },
        "aria-current": r.id === state.selected ? "true" : "false",
        onclick: function () { select(r.id, true); }
      }, [
        UI.el("span", { class: "rec-num", text: pad(r.number) }),
        UI.el("span", { class: "rec-title" + (r.title ? "" : " untitled"), text: r.title || "(untitled decision)" }),
        UI.el("span", { class: "rec-meta" }, meta)
      ]);
      host.appendChild(UI.el("li", {}, [btn]));
    });
    empty.classList.toggle("hidden", list.length > 0);
    empty.textContent = total ? "No decision matches these filters." :
      "No decisions yet. Type one into quick capture above, for example: We decided to use feature flags because releases were blocking each other.";
  }

  function select(id, scroll) {
    state.selected = id;
    renderList();
    renderDetail();
    if (scroll && window.matchMedia && matchMedia("(max-width: 900px)").matches) {
      UI.qs("#detail-card").scrollIntoView({ block: "start" });
    }
  }

  /* --- Rendering: detail ------------------------------------------------ */
  function fieldWrap(id, label, control, hint) {
    return UI.el("div", { class: "field" }, [
      UI.el("label", { class: "label", for: id, text: label }),
      control,
      hint ? UI.el("span", { class: "hint", text: hint }) : null
    ]);
  }

  function textInput(id, value, onValue, attrs) {
    var props = { type: "text", id: id };
    Object.keys(attrs || {}).forEach(function (k) { props[k] = attrs[k]; });
    var input = UI.el("input", props);
    input.value = value;
    input.addEventListener("input", function () { onValue(input.value); });
    return input;
  }

  function area(id, value, onValue, attrs) {
    var props = { id: id, rows: 2 };
    Object.keys(attrs || {}).forEach(function (k) { props[k] = attrs[k]; });
    var ta = UI.el("textarea", props);
    ta.value = value;
    ta.addEventListener("input", function () { onValue(ta.value); });
    UI.defer(function () { UI.autoGrow(ta, 44); });
    return ta;
  }

  function selectInput(id, options, value, onValue) {
    var sel = UI.el("select", { id: id });
    options.forEach(function (o) {
      sel.appendChild(UI.el("option", { value: o[0], text: o[1] }));
    });
    sel.value = value;
    sel.addEventListener("change", function () { onValue(sel.value); });
    return sel;
  }

  function renderDetail() {
    var host = UI.qs("#detail");
    UI.clear(host);
    var r = findRecord(state.selected);
    if (!r) {
      host.appendChild(UI.el("div", { class: "empty" }, [
        state.log.records.length ? "Select a decision on the left to read or expand it." :
          "Capture your first decision above. Each record gets the next number in this log, and numbers are never reused."
      ]));
      return;
    }

    var title = textInput("f-title", r.title, function (v) { r.title = v; touched(r); },
      { class: "title-input", placeholder: "Phrase it as the decision, e.g. Use Postgres for the event store" });
    var status = selectInput("f-status", STATUSES.map(function (s) { return [s, s]; }), r.status, function (v) {
      setStatus(r, v);
    });
    host.appendChild(UI.el("div", { class: "rec-head" }, [
      UI.el("span", { class: "num-big", text: pad(r.number) }),
      UI.el("div", { class: "field flex-1", style: "flex-basis: 260px;" }, [
        UI.el("label", { class: "label", for: "f-title", text: "Decision" }), title
      ]),
      UI.el("div", { class: "field", style: "flex: 0 1 160px;" }, [
        UI.el("label", { class: "label", for: "f-status", text: "Status" }), status
      ])
    ]));

    // Cross references
    var refs = UI.el("div", { class: "refs", id: "refs" });
    var sup = findRecord(r.supersedes);
    if (sup) {
      refs.appendChild(UI.el("span", { class: "muted", text: "Supersedes" }));
      refs.appendChild(UI.el("button", {
        class: "ref-link", type: "button", text: pad(sup.number) + " " + (sup.title || "(untitled)"),
        onclick: function () { select(sup.id); }
      }));
    }
    var by = findRecord(r.supersededBy);
    if (by) {
      var done = r.status === "Superseded";
      refs.appendChild(UI.el("span", {
        class: done ? "muted" : "tag tag--info",
        text: done ? "Superseded by" : "Replacement proposed in"
      }));
      refs.appendChild(UI.el("button", {
        class: "ref-link", type: "button", text: pad(by.number) + " " + (by.title || "(untitled)") + (done ? "" : " (" + by.status + ")"),
        onclick: function () { select(by.id); }
      }));
    }
    host.appendChild(refs);

    // Actions
    var pending = by && by.status !== "Rejected";
    var actions = UI.el("div", { class: "btn-row" }, [
      UI.el("button", { class: "btn btn--sm", id: "export-record", type: "button", text: "Export as ADR",
        onclick: function () { openPreview("ADR " + pad(r.number), recordFileName(r), recordMarkdown(r, 1).join("\n")); } }),
      r.status === "Accepted" && !pending ? UI.el("button", {
        class: "btn btn--sm", id: "supersede", type: "button", text: "Supersede with new decision",
        onclick: function () { supersede(r); }
      }) : null,
      UI.el("button", { class: "btn btn--sm btn--danger", id: "delete-record", type: "button", text: "Delete",
        onclick: function () { deleteRecord(r); } }),
      UI.el("span", { class: "hint", id: "save-state", "aria-live": "polite", text: "Saved" })
    ]);
    host.appendChild(actions);
    if (r.status === "Accepted" && !pending) {
      host.appendChild(UI.el("p", { class: "hint", style: "margin:0;",
        text: "Superseding drafts a linked record. This one stays Accepted until the new one is Accepted, so a rejected proposal never leaves a gap." }));
    }

    // Who, when, how sure
    host.appendChild(UI.el("div", { class: "form-grid" }, [
      fieldWrap("f-date", "Date", (function () {
        var d = UI.el("input", { type: "date", id: "f-date" });
        d.value = r.date;
        d.addEventListener("input", function () { if (validIso(d.value)) { r.date = d.value; touched(r); } });
        return d;
      })()),
      fieldWrap("f-owner", "Decision owner", textInput("f-owner", r.owner, function (v) { r.owner = v; touched(r); },
        { placeholder: "Accountable role or name" })),
      fieldWrap("f-deciders", "Deciders", textInput("f-deciders", r.deciders, function (v) { r.deciders = v; touched(r); },
        { placeholder: "Who decided, who was consulted" })),
      fieldWrap("f-origin", "Origin", selectInput("f-origin", ORIGINS.map(function (o) { return [o[0], ORIGIN_SHORT[o[0]]]; }), r.origin, function (v) { r.origin = v; touched(r); })),
      fieldWrap("f-confidence", "Confidence", selectInput("f-confidence", CONFIDENCE.map(function (c) { return [c, c]; }),
        r.confidence, function (v) { r.confidence = v; touched(r); })),
      fieldWrap("f-revisit", "Revisit by", (function () {
        var d = UI.el("input", { type: "date", id: "f-revisit" });
        d.value = r.revisitBy;
        d.addEventListener("input", function () { r.revisitBy = validIso(d.value) ? d.value : ""; touched(r); });
        return d;
      })()),
      fieldWrap("f-tags", "Tags", textInput("f-tags", r.tags.join(", "), function (v) { r.tags = tagsFrom(v); touched(r); },
        { placeholder: "architecture, delivery" }))
    ]));

    host.appendChild(fieldWrap("f-context", "Context and problem", area("f-context", r.context,
      function (v) { r.context = v; touched(r); }, { rows: 3, placeholder: "What forced a decision? What was known, and what was not?" })));
    host.appendChild(fieldWrap("f-drivers", "Decision drivers", area("f-drivers", r.drivers.join("\n"),
      function (v) { r.drivers = lines(v); touched(r); }, { placeholder: "One per line" })));

    // Options
    var optHost = UI.el("div", { class: "stack", id: "options", style: "gap: var(--sp-2);" });
    var chosenSel = UI.el("select", { id: "f-chosen" });
    chosenSel.addEventListener("change", function () { r.chosen = chosenSel.value; touched(r); });
    function renderChosen() {
      UI.clear(chosenSel);
      chosenSel.appendChild(UI.el("option", { value: "", text: r.options.length ? "(none selected)" : "(add options first)" }));
      r.options.forEach(function (o, i) {
        chosenSel.appendChild(UI.el("option", { value: o.id, text: o.name.trim() || "Option " + (i + 1) }));
      });
      chosenSel.value = r.chosen;
    }
    function renderOptions() {
      UI.clear(optHost);
      if (!r.options.length) optHost.appendChild(UI.el("p", { class: "hint", style: "margin:0;", text: "No options recorded yet. Listing even two makes the trade-off visible." }));
      r.options.forEach(function (o, i) {
        var n = i + 1;
        var name = textInput("opt-name-" + n, o.name, function (v) { o.name = v; renderChosen(); touched(r); },
          { "aria-label": "Option " + n + " name", placeholder: "Option " + n, class: "opt-name" });
        optHost.appendChild(UI.el("div", { class: "opt-card" }, [
          UI.el("div", { class: "flex gap-2 items-center" }, [
            UI.el("div", { class: "flex-1" }, [name]),
            UI.el("button", { class: "btn btn--ghost btn--sm", type: "button", text: "Remove",
              "aria-label": "Remove option " + n,
              onclick: function () {
                r.options.splice(i, 1);
                if (r.chosen === o.id) r.chosen = "";
                renderOptions(); renderChosen(); touched(r);
              } })
          ]),
          UI.el("div", { class: "opt-grid" }, [
            fieldWrap("opt-pros-" + n, "Pros", area("opt-pros-" + n, o.pros.join("\n"),
              function (v) { o.pros = lines(v); touched(r); }, { class: "opt-pros", placeholder: "One per line" })),
            fieldWrap("opt-cons-" + n, "Cons", area("opt-cons-" + n, o.cons.join("\n"),
              function (v) { o.cons = lines(v); touched(r); }, { class: "opt-cons", placeholder: "One per line" }))
          ])
        ]));
      });
    }
    renderOptions();
    renderChosen();
    host.appendChild(UI.el("div", { class: "field" }, [
      UI.el("span", { class: "label", text: "Options considered" }),
      optHost,
      UI.el("div", {}, [UI.el("button", { class: "btn btn--sm", id: "add-option", type: "button", text: "Add option",
        onclick: function () {
          r.options.push({ id: UI.uid("opt"), name: "", pros: [], cons: [] });
          renderOptions(); renderChosen(); touched(r);
          var names = UI.qsa("#options .opt-name");
          if (names.length) names[names.length - 1].focus();
        } })])
    ]));

    host.appendChild(UI.el("div", { class: "form-grid" }, [fieldWrap("f-chosen", "Chosen option", chosenSel)]));
    host.appendChild(fieldWrap("f-rationale", "Rationale (because...)", area("f-rationale", r.rationale,
      function (v) { r.rationale = v; touched(r); }, { rows: 2, placeholder: "Why this option over the others" })));

    host.appendChild(UI.el("div", { class: "opt-grid" }, [
      fieldWrap("f-positive", "Positive consequences", area("f-positive", r.positive.join("\n"),
        function (v) { r.positive = lines(v); touched(r); }, { placeholder: "One per line" })),
      fieldWrap("f-negative", "Negative consequences", area("f-negative", r.negative.join("\n"),
        function (v) { r.negative = lines(v); touched(r); }, { placeholder: "One per line" })),
      fieldWrap("f-followups", "Follow-ups", area("f-followups", r.followUps.join("\n"),
        function (v) { r.followUps = lines(v); touched(r); }, { placeholder: "One per line" }))
    ]));
    host.appendChild(fieldWrap("f-links", "Links", area("f-links", r.links.join("\n"),
      function (v) { r.links = lines(v); touched(r); }, { placeholder: "Thread, ticket, doc: one per line" })));
  }

  /* --- Actions ---------------------------------------------------------- */
  function setStatus(r, v) {
    r.status = v;
    r.updated = new Date().toISOString();
    var msg = "";
    if (v === "Accepted" && r.supersedes) {
      var old = findRecord(r.supersedes);
      if (old && old.status !== "Superseded") {
        old.status = "Superseded";
        old.supersededBy = r.id;
        old.updated = r.updated;
        msg = pad(old.number) + " is now Superseded by " + pad(r.number) + ".";
      }
    }
    save();
    UI.defer(function () {
      renderSummary();
      renderTagFilter();
      renderList();
      renderDetail();
      var s = UI.qs("#f-status");
      if (s) s.focus();
      if (msg) UI.toast(msg, "ok");
    });
  }

  function quickCapture() {
    var input = UI.qs("#quick");
    var parsed = parseCapture(input.value);
    if (!parsed || !parsed.title) { UI.toast("Type a decision first, e.g. We decided X because Y.", "danger"); return; }
    var r = addRecord(state.log, { title: parsed.title, rationale: parsed.rationale, status: "Proposed" });
    input.value = "";
    save();
    state.selected = r.id;
    renderSummary();
    renderTagFilter();
    renderList();
    renderDetail();
    UI.toast("Recorded " + pad(r.number) + " as Proposed." + (parsed.rationale ? "" : " Add a because when you can."), "ok");
    input.focus();
  }

  function supersede(old) {
    var r = addRecord(state.log, {
      title: "",
      context: "Revisits " + pad(old.number) + " (" + (old.title || "untitled") + ")." +
        (old.context ? "\n\nOriginal context: " + old.context : ""),
      drivers: old.drivers.slice(), tags: old.tags.slice(), owner: old.owner, deciders: old.deciders,
      confidence: old.confidence, supersedes: old.id
    });
    old.supersededBy = r.id;
    save();
    select(r.id);
    UI.toast("Drafted " + pad(r.number) + ". " + pad(old.number) + " becomes Superseded when you accept it.", "ok", 4500);
    var t = UI.qs("#f-title");
    if (t) t.focus();
  }

  function deleteRecord(r) {
    if (!UI.confirmDanger("Delete " + pad(r.number) + " \"" + (r.title || "untitled") + "\"? Its number will not be reused. Consider Rejected or Deprecated instead, so the history stays.")) return;
    state.log.records = state.log.records.filter(function (x) { return x.id !== r.id; });
    dropDanglingRefs(state.log);
    state.selected = null;
    save();
    renderAll();
  }

  function switchLog(id) {
    state.log = state.logs.filter(function (l) { return l.id === id; })[0] || state.logs[0] || null;
    state.selected = null;
    state.filter.tag = "";
    if (state.log) {
      var newest = visibleRecords()[0];
      state.selected = newest ? newest.id : null;
    }
    Store.write(NS, "active", state.log ? state.log.id : null);
    renderAll();
  }

  function newLog(name) {
    var l = makeLog(name);
    state.logs.push(l);
    save();
    switchLog(l.id);
    return l;
  }

  function loadExample() {
    var ex = exampleLog();
    state.logs.push(ex.log);
    save();
    switchLog(ex.log.id);
    select(ex.overdue.id);
    UI.toast("Example loaded: six records, one superseded pair, one AI-proposed, one overdue for revisit.", "ok", 4500);
  }

  function importPayload(payload, fileName) {
    var incoming = payload && payload.log ? payload.log : payload;
    if (!incoming || typeof incoming !== "object" || !Array.isArray(incoming.records) ||
        !incoming.records.every(function (r) { return r && typeof r === "object" && typeof r.title === "string"; })) {
      UI.toast("That file is not a Decision Log export (expected a log with a records list).", "danger", 4500);
      return;
    }
    var created = false;
    if (!state.log) {
      state.logs.push(makeLog(str(incoming.name).trim() || str(fileName).replace(/\.json$/i, "") || "Imported log"));
      state.log = state.logs[state.logs.length - 1];
      created = true;
    }
    var res = mergeInto(state.log, incoming);
    save();
    switchLog(state.log.id);
    var msg = (created ? "Created \"" + state.log.name + "\". " : "") +
      "Imported " + res.added + " record" + (res.added === 1 ? "" : "s") + " into \"" + state.log.name + "\".";
    if (res.skipped) msg += " " + res.skipped + " already present, skipped.";
    if (res.renumbered.length) {
      msg += " Renumbered because the number was taken: " + res.renumbered.map(function (p) {
        return pad(p[0]) + " to " + pad(p[1]);
      }).join(", ") + ".";
    }
    UI.toast(msg, "ok", res.renumbered.length ? 8000 : 4000);
    return res;
  }

  /* --- Init ------------------------------------------------------------- */
  function init() {
    UI.initChrome();
    load();
    if (state.log) switchLog(state.log.id);
    else renderAll();

    UI.qs("#load-example-empty").addEventListener("click", loadExample);
    UI.qs("#load-example").addEventListener("click", loadExample);
    UI.qs("#start-empty").addEventListener("click", function () { newLog("Team decisions"); UI.qs("#quick").focus(); });
    UI.qs("#import-empty").addEventListener("click", function () { UI.pickJSON(importPayload); });
    UI.qs("#import-json").addEventListener("click", function () { UI.pickJSON(importPayload); });

    UI.qs("#log-select").addEventListener("change", function (e) { switchLog(e.target.value); });
    UI.qs("#new-log").addEventListener("click", function () {
      var name = prompt("Name the new decision log (a team or a product)", "Team decisions");
      if (name === null) return;
      newLog(name.trim() || "Team decisions");
      UI.qs("#quick").focus();
    });
    UI.qs("#rename-log").addEventListener("click", function () {
      var name = prompt("Rename this decision log", state.log.name);
      if (name === null || !name.trim()) return;
      state.log.name = name.trim();
      save();
      renderLogSelect();
    });
    UI.qs("#delete-log").addEventListener("click", function () {
      var n = state.log.records.length;
      if (!UI.confirmDanger("Delete the log \"" + state.log.name + "\" and its " + n + " record" + (n === 1 ? "" : "s") + "? Export it first if you might need it.")) return;
      var gone = state.log.id;
      state.logs = state.logs.filter(function (l) { return l.id !== gone; });
      state.log = state.logs[0] || null;
      save();
      switchLog(state.log ? state.log.id : null);
    });

    UI.qs("#quick").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); quickCapture(); }
    });
    UI.qs("#quick-add").addEventListener("click", quickCapture);

    UI.qs("#search").addEventListener("input", UI.debounce(function (e) { state.filter.q = e.target.value; renderList(); }, 150));
    UI.qs("#filter-status").addEventListener("change", function (e) { setStatusFilter(e.target.value); });
    UI.qs("#filter-tag").addEventListener("change", function (e) { state.filter.tag = e.target.value; renderList(); });
    UI.qs("#sort").addEventListener("change", function (e) { state.filter.sort = e.target.value; renderList(); });

    UI.qs("#export-log-md").addEventListener("click", function () {
      openPreview("Whole log as Markdown", UI.slug(state.log.name) + "-decisions.md", logMarkdown(state.log));
    });
    UI.qs("#export-agents").addEventListener("click", function () {
      openPreview("Decision index for AGENTS.md or README", UI.slug(state.log.name) + "-decision-index.md", agentsIndex(state.log));
    });
    UI.qs("#export-json").addEventListener("click", function () {
      UI.downloadJSON(UI.slug(state.log.name) + "-decisions.json", {
        app: "agile-toolbox", tool: "decisions", schema: Store.schema, exportedAt: new Date().toISOString(), log: state.log
      });
    });

    UI.qs("#md-close").addEventListener("click", closePreview);
    UI.qs("#md-copy").addEventListener("click", function () { UI.copy(preview.text); });
    UI.qs("#md-download").addEventListener("click", function () { UI.download(preview.name, preview.text, "text/markdown"); });

    // Never lose the last keystrokes to the autosave debounce.
    window.addEventListener("pagehide", function () { if (state.dirty) save(); });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden" && state.dirty) save();
    });

    // Pure functions, for the scenario's unit checks.
    window.__decisions = {
      parseCapture: parseCapture, truncate: truncate, mergeInto: mergeInto, normalizeLog: normalizeLog,
      isRevisitDue: isRevisitDue, recordFileName: recordFileName, importPayload: importPayload
    };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
