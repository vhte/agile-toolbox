/* ==========================================================================
   Flow Forecaster: flow metrics and Monte Carlo forecasts from a CSV export.

   Works on finished work items, never on people. Assignee-like columns are
   dropped on import and never offered in the mapping.
   ========================================================================== */
(function () {
  "use strict";

  var NS = "flow";
  var RUNS = 10000;
  var DAY = 86400000;
  var MAX_SIM_DAYS = 3650;
  var MIN_ITEMS = 10;
  var PCTS = [50, 70, 85, 95];
  var PCT_TOKENS = { 50: "--text-2", 70: "--info", 85: "--warn", 95: "--danger" };

  var FIELDS = [
    { key: "start", label: "Start date", required: true },
    { key: "done", label: "Done date", required: true },
    { key: "id", label: "ID" },
    { key: "title", label: "Title" },
    { key: "segment", label: "Segment (type or label)" },
    { key: "exclude", label: "Canceled (left out)" }
  ];
  var MAP_KEYS = ["start", "done", "id", "title", "segment", "exclude"];

  var CANDIDATES = {
    id: ["issuekey", "key", "id", "identifier", "issueid", "number", "ticket", "ref"],
    title: ["summary", "title", "name", "subject", "description"],
    start: ["startedat", "started", "startdate", "start", "begin", "inprogressdate", "inprogressat"],
    done: ["completedat", "completed", "resolved", "resolvedat", "resolutiondate", "closedat", "closed",
      "doneat", "donedate", "done", "finishedat", "finished", "enddate", "end", "mergedat",
      "statuscategorychanged"],
    segment: ["segment", "label", "labels", "issuetype", "worktype", "type", "category", "kind", "class"],
    exclude: ["canceled", "cancelled", "canceledat", "cancelledat", "canceleddate", "cancelleddate"]
  };
  var CONTAINS = {
    start: ["started", "startdate", "inprogress", "start"],
    done: ["resolved", "completed", "closed", "finished", "donedate"],
    segment: ["label", "type"],
    exclude: ["cancel"]
  };
  /* Only when no start or in-progress column exists: lead time, not cycle time. */
  var FALLBACK = { start: ["created", "createdat", "createddate", "opened", "openedat"] };
  var CREATED_RE = /^(created|opened|createdat|createddate|openedat|creationdate)$/;
  // Whole words on the raw header, so "Lead time", "Owner Team" or "User story type"
  // stay mappable while "Assignee" or "Assigned to" never are.
  var PERSON_RE = /\b(assignees?|assigned|reporters?|creators?|owners?|authors?|developers?|users?|persons?|people|members?|responsible|watchers?|requesters?|requestors?|reviewers?|leads?|(created|closed|resolved|opened|updated|merged) by)\b/;
  var NOT_PERSON_RE = /\b(team|teams|group|squad|time|times|type|story|stories|count|date)\b/;

  var MONTHS = {
    jan: 0, feb: 1, fev: 1, mar: 2, apr: 3, abr: 3, may: 4, mai: 4, jun: 5, jul: 6,
    aug: 7, ago: 7, sep: 8, set: 8, oct: 9, out: 9, nov: 10, dec: 11, dez: 11
  };

  var state = {
    datasets: [],
    ds: null,
    parseKey: null,
    parsed: null,
    analysis: null,
    fcCache: {},
    saveWarned: false
  };

  /* --- Small utils ------------------------------------------------------- */
  function num(v, fallback) {
    var n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) ? n : fallback;
  }
  function norm(h) { return String(h || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function dayDiff(a, b) { return Math.round((b.getTime() - a.getTime()) / DAY); }
  function isWeekend(d) { var w = d.getDay(); return w === 0 || w === 6; }
  function fmt(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return "—";
    return String(UI.round(n, digits || 0));
  }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
  function shortDate(d) { return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" }); }
  function pretty(d) { return d ? UI.prettyDate(UI.isoDate(d)) : "—"; }

  function hashString(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** mulberry32: tiny seeded PRNG so the same inputs give the same forecast. */
  function prng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Nearest-rank percentile on an ascending array: value at position ceil(p/100 * n). */
  function percentile(sorted, p) {
    if (!sorted.length) return null;
    var rank = Math.ceil((p / 100) * sorted.length);
    return sorted[UI.clamp(rank, 1, sorted.length) - 1];
  }

  /* --- CSV ----------------------------------------------------------------- */
  function detectDelimiter(text) {
    var counts = { ",": 0, ";": 0, "\t": 0 };
    var inQ = false, seen = false;
    for (var i = 0; i < text.length && i < 20000; i++) {
      var ch = text.charAt(i);
      if (ch === '"') inQ = !inQ;
      else if (!inQ && (ch === "\n" || ch === "\r")) { if (seen) break; }
      else if (!inQ && counts.hasOwnProperty(ch)) { counts[ch]++; seen = true; }
      else if (!inQ && ch.trim()) seen = true;
    }
    var best = ",";
    if (counts[";"] > counts[best]) best = ";";
    if (counts["\t"] > counts[best]) best = "\t";
    return best;
  }

  /** RFC 4180-ish parser: quoted fields with delimiters, newlines and "" escapes. */
  function parseCSV(text, delim) {
    text = String(text || "").replace(/^\uFEFF/, "");
    delim = delim || detectDelimiter(text);
    var rows = [], row = [], field = "", inQ = false, line = 1, rowLine = 1;
    var i = 0, n = text.length;
    function endRow() {
      row.push(field);
      field = "";
      var blank = row.every(function (c) { return !String(c).trim(); });
      if (!blank) rows.push({ cells: row, line: rowLine });
      row = [];
    }
    while (i < n) {
      var ch = text.charAt(i);
      if (inQ) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        if (ch === "\n") line++;
        field += ch; i++; continue;
      }
      if (ch === '"' && !field.trim()) { field = ""; inQ = true; i++; continue; }
      if (ch === delim) { row.push(field); field = ""; i++; continue; }
      if (ch === "\r" || ch === "\n") {
        endRow();
        if (ch === "\r" && text.charAt(i + 1) === "\n") i++;
        i++; line++; rowLine = line;
        continue;
      }
      field += ch; i++;
    }
    if (field !== "" || row.length) endRow();
    return { rows: rows, delimiter: delim };
  }

  function csvField(v) {
    var s = String(v === null || v === undefined ? "" : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /* --- Dates ---------------------------------------------------------------- */
  function mkDate(y, m, d) {
    if (y < 100) y += y < 70 ? 2000 : 1900;
    if (y < 1970 || y > 2100) return null;
    var dt = new Date(y, m, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m || dt.getDate() !== d) return null;
    return dt;
  }
  function monthIndex(name) {
    var k = String(name || "").toLowerCase().slice(0, 3);
    return MONTHS.hasOwnProperty(k) ? MONTHS[k] : -1;
  }

  var RE_ISO = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?\s*(Z|UTC|GMT|[+-]\d{2}(?::?\d{2})?)?)?$/i;
  var RE_NUM = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?:[T\s,]+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp]\.?[Mm]\.?)?)?$/;
  var RE_DMON = /^(\d{1,2})[\/\-\s]([A-Za-z]{3,9})\.?[\/\-\s,]+(\d{4}|\d{2})(?:[T\s,]+\d{1,2}:\d{2}.*)?$/;
  var RE_MOND = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:[T\s,]+(?:at\s+)?\d{1,2}:\d{2}.*)?$/i;

  /** Parse a date-ish string into a local calendar day, or null. order: "dmy" | "mdy". */
  function parseDay(raw, order) {
    var s = String(raw === null || raw === undefined ? "" : raw).trim();
    if (!s) return null;
    s = s.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, "");
    var m = RE_ISO.exec(s);
    if (m) {
      var y = +m[1], mo = +m[2] - 1, d = +m[3];
      if (!mkDate(y, mo, d)) return null;
      if (m[7]) {
        var off = 0;
        if (/^[+-]/.test(m[7])) {
          var sign = m[7].charAt(0) === "-" ? -1 : 1;
          var digits = m[7].slice(1).replace(":", "");
          off = sign * (num(digits.slice(0, 2), 0) * 60 + (digits.length > 2 ? num(digits.slice(2, 4), 0) : 0));
        }
        var t = new Date(Date.UTC(y, mo, d, +m[4] || 0, +m[5] || 0, +m[6] || 0) - off * 60000);
        if (isNaN(t.getTime())) return null;
        return new Date(t.getFullYear(), t.getMonth(), t.getDate());
      }
      return mkDate(y, mo, d);
    }
    m = RE_NUM.exec(s);
    if (m) {
      var a = +m[1], b = +m[2], yy = +m[3];
      return order === "mdy" ? mkDate(yy, a - 1, b) : mkDate(yy, b - 1, a);
    }
    m = RE_DMON.exec(s);
    if (m) {
      var mi = monthIndex(m[2]);
      return mi < 0 ? null : mkDate(+m[3], mi, +m[1]);
    }
    m = RE_MOND.exec(s);
    if (m) {
      var mj = monthIndex(m[1]);
      return mj < 0 ? null : mkDate(+m[3], mj, +m[2]);
    }
    return null;
  }

  /** Look at numeric dates: a first part > 12 means dd/mm, a second part > 12 means mm/dd. */
  function guessOrder(values) {
    var dmy = 0, mdy = 0, numeric = 0;
    values.forEach(function (v) {
      var m = RE_NUM.exec(String(v || "").trim());
      if (!m) return;
      numeric++;
      if (+m[1] > 12) dmy++;
      if (+m[2] > 12) mdy++;
    });
    if (!numeric) return { order: "dmy", numeric: false, evidence: false };
    if (dmy === mdy) return { order: "dmy", numeric: true, evidence: false };
    return { order: dmy > mdy ? "dmy" : "mdy", numeric: true, evidence: true };
  }

  /* --- Column mapping ---------------------------------------------------- */
  function isPersonColumn(h) {
    var words = String(h || "").toLowerCase().replace(/[^a-z0-9]+/g, " ");
    return PERSON_RE.test(words) && !NOT_PERSON_RE.test(words);
  }

  function autoMap(headers) {
    var normed = headers.map(norm);
    var used = {};
    var map = { sig: headers.join("\u0001") };
    function pass(list, exact) {
      for (var c = 0; c < list.length; c++) {
        for (var i = 0; i < normed.length; i++) {
          if (used[i] || isPersonColumn(headers[i])) continue;
          if (exact ? normed[i] === list[c] : normed[i].indexOf(list[c]) !== -1) return i;
        }
      }
      return -1;
    }
    MAP_KEYS.forEach(function (key) {
      // exact names first, then "contains", then the lead-time fallback (Created)
      var found = pass(CANDIDATES[key], true);
      if (found < 0) found = pass(CONTAINS[key] || [], false);
      if (found < 0) found = pass(FALLBACK[key] || [], true);
      if (found >= 0) used[found] = true;
      map[key] = found;
    });
    return map;
  }

  /* --- Model ------------------------------------------------------------- */
  function defaultSettings() {
    // asOf "" means today, so a saved dataset stays live from one day to the next
    return { order: "auto", window: 12, weekends: false, segment: "", hmDate: "", whenN: 20, whenStart: "", asOf: "" };
  }

  function makeDataset(name, raw) {
    return {
      id: UI.uid("ds"),
      name: name || "Dataset",
      raw: raw || "",
      mapping: null,
      settings: defaultSettings(),
      updated: new Date().toISOString()
    };
  }

  function normalize(ds) {
    ds.name = String(ds.name || "Dataset").slice(0, 120);
    ds.raw = typeof ds.raw === "string" ? ds.raw : "";
    var s = ds.settings && typeof ds.settings === "object" ? ds.settings : {};
    var d = defaultSettings();
    ds.settings = {
      order: ["auto", "dmy", "mdy"].indexOf(s.order) !== -1 ? s.order : d.order,
      window: [0, 4, 8, 12, 26].indexOf(num(s.window, -1)) !== -1 ? num(s.window, 12) : d.window,
      weekends: !!s.weekends,
      segment: typeof s.segment === "string" ? s.segment : "",
      hmDate: typeof s.hmDate === "string" && UI.parseDate(s.hmDate) ? s.hmDate : "",
      whenN: UI.clamp(Math.round(num(s.whenN, d.whenN)), 1, 5000),
      whenStart: typeof s.whenStart === "string" && UI.parseDate(s.whenStart) ? s.whenStart : "",
      asOf: typeof s.asOf === "string" && UI.parseDate(s.asOf) ? s.asOf : ""
    };
    var m = ds.mapping;
    if (m && typeof m === "object" && typeof m.sig === "string") {
      MAP_KEYS.forEach(function (k) {
        m[k] = Math.round(num(m[k], -1));
      });
    } else {
      ds.mapping = null;
    }
    return ds;
  }

  function load() {
    var list = Store.read(NS, "datasets", []);
    state.datasets = (Array.isArray(list) ? list : []).filter(function (d) {
      return d && typeof d === "object";
    }).map(function (d) { if (!d.id) d.id = UI.uid("ds"); return normalize(d); });
    var active = Store.read(NS, "active", null);
    state.ds = state.datasets.filter(function (d) { return d.id === active; })[0] || state.datasets[0] || null;
  }

  function save() {
    if (state.ds) state.ds.updated = new Date().toISOString();
    var ok = Store.write(NS, "datasets", state.datasets);
    Store.write(NS, "active", state.ds ? state.ds.id : null);
    if (!ok && !state.saveWarned) {
      state.saveWarned = true;
      UI.toast("This dataset is too large to save in the browser. Trim the export to the columns you mapped.", "danger", 6000);
    }
    if (ok) state.saveWarned = false;
  }

  /* --- Parse a dataset into items ---------------------------------------- */
  function parseDataset(ds) {
    var key = ds.id + "\u0002" + ds.raw.length + "\u0002" + hashString(ds.raw) + "\u0002" +
      JSON.stringify(ds.mapping) + "\u0002" + ds.settings.order;
    if (state.parseKey === key && state.parsed) return state.parsed;

    var res = {
      headers: [], items: [], skipped: [], excluded: 0, rowsRead: 0, ignored: [], delimiter: ",",
      order: "dmy", orderNote: "", error: null, mapping: null
    };
    var parsed = parseCSV(ds.raw);
    res.delimiter = parsed.delimiter;
    var rows = parsed.rows;
    if (!rows.length) { res.error = "empty"; return finishParse(key, res); }

    res.headers = rows[0].cells.map(function (h, i) { return String(h).trim() || "Column " + (i + 1); });
    res.ignored = res.headers.filter(isPersonColumn);

    var sig = res.headers.join("\u0001");
    if (!ds.mapping || ds.mapping.sig !== sig) {
      ds.mapping = autoMap(res.headers);
      save();
      key = ds.id + "\u0002" + ds.raw.length + "\u0002" + hashString(ds.raw) + "\u0002" +
        JSON.stringify(ds.mapping) + "\u0002" + ds.settings.order;
    }
    var map = ds.mapping;
    res.mapping = map;
    MAP_KEYS.forEach(function (k) {
      if (map[k] >= res.headers.length || (map[k] >= 0 && isPersonColumn(res.headers[map[k]]))) map[k] = -1;
    });

    var data = rows.slice(1);
    res.rowsRead = data.length;
    if (!data.length) { res.error = "nodata"; return finishParse(key, res); }
    if (map.start < 0 || map.done < 0) { res.error = "unmapped"; return finishParse(key, res); }

    function cell(r, idx) { return idx >= 0 && idx < r.cells.length ? String(r.cells[idx]).trim() : ""; }

    if (ds.settings.order === "auto") {
      var sample = [];
      data.forEach(function (r) { sample.push(cell(r, map.start)); sample.push(cell(r, map.done)); });
      var g = guessOrder(sample);
      res.order = g.order;
      if (g.numeric) {
        res.orderNote = g.evidence
          ? "Numeric dates read as " + (g.order === "dmy" ? "dd/mm/yyyy" : "mm/dd/yyyy") + " (detected from a value over 12)."
          : "Numeric dates are ambiguous (no day over 12), so they are read as dd/mm/yyyy. Change the date order if that is wrong.";
      }
    } else {
      res.order = ds.settings.order;
    }

    data.forEach(function (r) {
      if (map.exclude >= 0 && cell(r, map.exclude)) { res.excluded++; return; }
      var sRaw = cell(r, map.start), dRaw = cell(r, map.done);
      var reason = null, st = null, dn = null;
      if (!sRaw) reason = dRaw ? "missing start date" : "not started (no start or done date)";
      else {
        st = parseDay(sRaw, res.order);
        if (!st) reason = "unparseable start date";
      }
      if (!reason && dRaw) {
        dn = parseDay(dRaw, res.order);
        if (!dn) reason = "unparseable done date";
        else if (dn < st) reason = "done before start";
      }
      if (reason) { res.skipped.push({ line: r.line, reason: reason }); return; }
      res.items.push({
        id: cell(r, map.id),
        title: cell(r, map.title),
        seg: map.segment >= 0 ? (cell(r, map.segment) || "(none)") : "",
        start: st,
        done: dn,
        ct: dn ? dayDiff(st, dn) + 1 : null,
        line: r.line
      });
    });
    if (!res.items.length) res.error = "noitems";
    return finishParse(key, res);
  }

  function finishParse(key, res) {
    state.parseKey = key;
    state.parsed = res;
    return res;
  }

  /* --- Analysis ------------------------------------------------------------ */
  function todayDay() { var t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }

  function analyze(parsed, settings) {
    var all = parsed.items;
    if (!all.length) return null;
    var dataEnd = null, dataStart = null;
    all.forEach(function (it) {
      if (!dataStart || it.start < dataStart) dataStart = it.start;
      if (!dataEnd || it.start > dataEnd) dataEnd = it.start;
      if (it.done && it.done > dataEnd) dataEnd = it.done;
    });
    // Ages and forecasts run from the as-of date (today unless chosen), never
    // from the last date in the file: an export pulled this morning with nothing
    // finished today would otherwise under-age every item. The history window
    // still ends at the data, so a stale export does not gain fake zero days.
    var asked = UI.parseDate(settings.asOf) || todayDay();
    var asOfClamped = asked < dataEnd;
    var asOf = asOfClamped ? dataEnd : asked;

    var segValues = [];
    if (parsed.mapping && parsed.mapping.segment >= 0) {
      var seen = {};
      all.forEach(function (it) { if (!seen[it.seg]) { seen[it.seg] = true; segValues.push(it.seg); } });
      segValues.sort();
    }
    var segFilter = segValues.indexOf(settings.segment) !== -1 ? settings.segment : "";
    var items = segFilter ? all.filter(function (it) { return it.seg === segFilter; }) : all;

    var A = {
      parseKey: state.parseKey,
      asOf: asOf, asOfClamped: asOfClamped, dataEnd: dataEnd, dataStart: dataStart,
      segValues: segValues, segFilter: segFilter, items: items, settings: settings
    };
    fillMetrics(A, items, settings, dataEnd, dataStart);
    A.aging = agingList(A);
    A.weekly = weeklyThroughput(items, dataStart, dataEnd);
    A.wip = wipSeries(items, dataStart, dataEnd);
    A.little = littlesLaw(A, items);
    A.segments = segValues.map(function (v) {
      var sub = all.filter(function (it) { return it.seg === v; });
      var m = {};
      fillMetrics(m, sub, settings, dataEnd, dataStart);
      return { value: v, m: m, inProgress: sub.filter(function (it) { return !it.done; }).length };
    });
    return A;
  }

  /** Shared per-population metrics: percentiles plus the history window, which ends at `end`. */
  function fillMetrics(M, items, settings, end, dataStart) {
    var asOf = end;
    var finished = items.filter(function (it) { return it.done; });
    var cts = finished.map(function (it) { return it.ct; }).sort(function (a, b) { return a - b; });
    M.finished = finished;
    M.cts = cts;
    M.inProgress = items.filter(function (it) { return !it.done; });
    M.pct = {};
    PCTS.forEach(function (p) { M.pct[p] = percentile(cts, p); });
    M.avgCt = cts.length ? cts.reduce(function (s, v) { return s + v; }, 0) / cts.length : null;

    var w = settings.window;
    var winStart = w ? UI.addDays(asOf, -(7 * w) + 1) : dataStart;
    if (winStart < dataStart) winStart = dataStart;
    var nDays = dayDiff(winStart, asOf) + 1;
    var counts = new Array(nDays);
    for (var i = 0; i < nDays; i++) counts[i] = 0;
    var inWindow = 0;
    finished.forEach(function (it) {
      var d = it.done;
      if (d < winStart || d > asOf) return;
      inWindow++;
      if (settings.weekends) {
        while (isWeekend(d)) d = UI.addDays(d, 1);   // weekend finishes count on Monday
        if (d > asOf) return;
      }
      counts[dayDiff(winStart, d)]++;
    });
    var samples = [];
    for (var j = 0; j < nDays; j++) {
      if (settings.weekends && isWeekend(UI.addDays(winStart, j))) continue;
      samples.push(counts[j]);
    }
    M.winStart = winStart;
    M.winEnd = asOf;
    M.winDays = nDays;
    M.winFinished = inWindow;
    M.samples = samples;
    M.tpWeek = nDays > 0 ? inWindow / (nDays / 7) : null;
  }

  function agingList(A) {
    var p70 = A.pct[70], p85 = A.pct[85];
    return A.inProgress.map(function (it) {
      var age = dayDiff(it.start, A.asOf) + 1;
      var level = p85 !== null && age > p85 ? "danger" : p70 !== null && age > p70 ? "warn" : "ok";
      return { item: it, age: age, level: level };
    }).sort(function (a, b) { return b.age - a.age; });
  }

  function mondayOf(d) { return UI.addDays(d, -((d.getDay() + 6) % 7)); }
  function isoWeek(d) {
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    var w1 = new Date(t.getFullYear(), 0, 4);
    return 1 + Math.round((dayDiff(w1, t) - 3 + ((w1.getDay() + 6) % 7)) / 7);
  }

  function weeklyThroughput(items, dataStart, asOf) {
    var first = mondayOf(dataStart), last = mondayOf(asOf);
    var weeks = [];
    for (var d = first; d <= last; d = UI.addDays(d, 7)) weeks.push({ monday: d, count: 0, week: isoWeek(d) });
    items.forEach(function (it) {
      if (!it.done) return;
      var idx = Math.floor(dayDiff(first, mondayOf(it.done)) / 7);
      if (idx >= 0 && idx < weeks.length) weeks[idx].count++;
    });
    return weeks;
  }

  function wipSeries(items, dataStart, asOf) {
    var n = dayDiff(dataStart, asOf) + 1;
    var diff = new Array(n + 1);
    for (var i = 0; i <= n; i++) diff[i] = 0;
    items.forEach(function (it) {
      diff[dayDiff(dataStart, it.start)]++;
      if (it.done) diff[dayDiff(dataStart, it.done) + 1]--;
    });
    var out = [], run = 0;
    for (var j = 0; j < n; j++) { run += diff[j]; out.push(run); }
    return out;
  }

  function littlesLaw(A, items) {
    var offset = dayDiff(A.dataStart, A.winStart);
    var slice = A.wip.slice(offset);
    if (!slice.length) return null;
    var avgWip = slice.reduce(function (s, v) { return s + v; }, 0) / slice.length;
    var tpDay = A.winFinished / A.winDays;
    var inWin = A.finished.filter(function (it) { return it.done >= A.winStart; });
    var actual = inWin.length ? inWin.reduce(function (s, it) { return s + it.ct; }, 0) / inWin.length : null;
    return { avgWip: avgWip, tpDay: tpDay, predicted: tpDay > 0 ? avgWip / tpDay : null, actual: actual };
  }

  /* --- Monte Carlo ---------------------------------------------------------- */
  function forecastKey(kind, A, extra) {
    // seeded from content, not the dataset id, so a duplicate forecasts identically
    return [kind, String(A.parseKey).split("\u0002").slice(1).join("|"), A.segFilter, A.settings.window, A.settings.weekends,
      UI.isoDate(A.asOf), extra].join("|");
  }

  function canForecast(A) {
    return A.samples.length > 0 && A.samples.some(function (v) { return v > 0; });
  }

  function cacheForecast(key, res) {
    if (Object.keys(state.fcCache).length > 40) state.fcCache = {};
    state.fcCache[key] = res;
  }

  /** (a) How many items by `end` (inclusive), starting the day after the as-of date. */
  function forecastHowMany(A, end) {
    var key = forecastKey("hm", A, UI.isoDate(end));
    if (state.fcCache[key]) return state.fcCache[key];
    var first = UI.addDays(A.asOf, 1);
    var days = [];
    for (var d = first; d <= end && days.length < MAX_SIM_DAYS; d = UI.addDays(d, 1)) {
      if (!(A.settings.weekends && isWeekend(d))) days.push(d);
    }
    var rand = prng(hashString(key));
    var s = A.samples, n = s.length, out = new Array(RUNS);
    for (var r = 0; r < RUNS; r++) {
      var total = 0;
      for (var k = 0; k < days.length; k++) total += s[Math.floor(rand() * n)];
      out[r] = total;
    }
    out.sort(function (a, b) { return a - b; });
    var res = {
      kind: "hm", end: end, first: first, days: days.length, totals: out,
      p50: percentile(out, 50), p85: percentile(out, 15), p95: percentile(out, 5)
    };
    cacheForecast(key, res);
    return res;
  }

  /** (b) When will `count` items be done, starting on `start`? Offsets in calendar days. */
  function forecastWhen(A, count, start) {
    var key = forecastKey("when", A, count + "@" + UI.isoDate(start));
    if (state.fcCache[key]) return state.fcCache[key];
    var rand = prng(hashString(key));
    var s = A.samples, n = s.length, out = new Array(RUNS), capped = 0;
    var weekendSkip = A.settings.weekends;
    var startDow = start.getDay();
    for (var r = 0; r < RUNS; r++) {
      var done = 0, k = 0;
      while (k < MAX_SIM_DAYS) {
        var dow = (startDow + k) % 7;
        if (!(weekendSkip && (dow === 0 || dow === 6))) {
          done += s[Math.floor(rand() * n)];
          if (done >= count) break;
        }
        k++;
      }
      if (k >= MAX_SIM_DAYS) capped++;
      out[r] = k;
    }
    out.sort(function (a, b) { return a - b; });
    var res = {
      kind: "when", start: start, count: count, offsets: out, capped: capped,
      p50: percentile(out, 50), p85: percentile(out, 85), p95: percentile(out, 95)
    };
    cacheForecast(key, res);
    return res;
  }

  /* --- Example dataset ------------------------------------------------------ */
  function exampleCSV() {
    var rand = prng(20260304);
    var today = new Date(); today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var spanDays = 140;
    var begin = UI.addDays(today, -spanDays);
    var verbs = ["Add", "Fix", "Refactor", "Export", "Validate", "Migrate", "Document", "Speed up", "Retry", "Audit"];
    var nouns = ["login flow", "session timeout", "vault search", "CSV export", "password rotation", "audit log",
      "API pagination", "SSO callback", "role editor", "billing webhook", "release notes", "health check"];
    var mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    function jira(d, hour, minute) {
      var h12 = hour % 12 === 0 ? 12 : hour % 12;
      return String(d.getDate()).padStart(2, "0") + "/" + mon[d.getMonth()] + "/" +
        String(d.getFullYear()).slice(2) + " " + h12 + ":" + String(minute).padStart(2, "0") + " " + (hour < 12 ? "AM" : "PM");
    }
    function weekday(d) { while (isWeekend(d)) d = UI.addDays(d, 1); return d; }
    function lognormal(median, spread) {
      var u = 0, v = 0;
      while (u === 0) u = rand();
      while (v === 0) v = rand();
      var z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      return median * Math.exp(spread * z);
    }
    var lines = ["Key,Summary,Issue Type,Labels,Assignee,Created,Started,Resolved"];
    var total = 122, openCount = 10;
    for (var i = 0; i < total; i++) {
      var r = rand();
      var type = r < 0.55 ? "feature" : r < 0.85 ? "bug" : "chore";
      var label = rand() < 0.45 ? "agent-assisted" : "human";
      var median = type === "feature" ? 6 : type === "bug" ? 3 : 2;
      if (label === "agent-assisted") median *= 0.9;
      var ct = Math.max(1, Math.round(lognormal(median, 0.75)));
      var isOpen = i >= total - openCount;
      var start, done = null;
      if (isOpen) {
        var k = i - (total - openCount);
        // two old, stuck items so the aging list has something to say
        var back = k === 0 ? 41 : k === 1 ? 30 : Math.floor(rand() * 16);
        start = weekday(UI.addDays(today, -back));
        if (start > today) start = UI.addDays(today, -1);
      } else {
        var offset = Math.floor((i / (total - openCount)) * (spanDays - 8) + rand() * 5);
        start = weekday(UI.addDays(begin, offset));
        done = weekday(UI.addDays(start, ct - 1));
        if (done > today) done = today;
      }
      var created = UI.addDays(start, -Math.floor(rand() * 10));
      var title = verbs[Math.floor(rand() * verbs.length)] + " " + nouns[Math.floor(rand() * nouns.length)];
      lines.push([
        "FLOW-" + (101 + i), csvField(title), type, label, "Team member " + (1 + (i % 5)),
        jira(created, 9 + Math.floor(rand() * 8), Math.floor(rand() * 60)),
        jira(start, 9 + Math.floor(rand() * 8), Math.floor(rand() * 60)),
        done ? jira(done, 9 + Math.floor(rand() * 8), Math.floor(rand() * 60)) : ""
      ].join(","));
    }
    return lines.join("\n");
  }

  /* --- Render: toolbar and states -------------------------------------------- */
  function renderToolbar() {
    var sel = UI.qs("#ds-select");
    UI.clear(sel);
    if (!state.datasets.length) sel.appendChild(UI.el("option", { value: "", text: "No datasets yet" }));
    state.datasets.forEach(function (d) {
      sel.appendChild(UI.el("option", { value: d.id, selected: state.ds && d.id === state.ds.id, text: d.name }));
    });
    var none = !state.ds;
    sel.disabled = none;
    ["#rename-dataset", "#dup-dataset", "#delete-dataset", "#export-md", "#export-json", "#copy-ct"].forEach(function (id) {
      UI.qs(id).disabled = none;
    });
    UI.qs("#empty").classList.toggle("hidden", !none);
    UI.qs("#workspace").classList.toggle("hidden", none);
  }

  function renderData(parsed) {
    var ds = state.ds;
    var raw = UI.qs("#raw");
    if (document.activeElement !== raw && raw.value !== ds.raw) raw.value = ds.raw;

    var grid = UI.clear(UI.qs("#map-grid"));
    var headers = parsed.headers;
    FIELDS.forEach(function (f) {
      var id = "map-" + f.key;
      var sel = UI.el("select", { id: id });
      sel.appendChild(UI.el("option", { value: "-1", text: f.required ? "Choose a column" : "Not used" }));
      headers.forEach(function (h, i) {
        if (isPersonColumn(h)) return;
        sel.appendChild(UI.el("option", { value: String(i), text: h }));
      });
      sel.value = ds.mapping ? String(ds.mapping[f.key]) : "-1";
      if (sel.value === "") sel.value = "-1";
      sel.addEventListener("change", function () {
        if (!ds.mapping) return;
        ds.mapping[f.key] = parseInt(sel.value, 10);
        save();
        UI.defer(refresh);
      });
      grid.appendChild(UI.el("div", { class: "field" }, [
        UI.el("label", { class: "label", for: id, text: f.label + (f.required ? " *" : "") }), sel
      ]));
    });
    var order = UI.el("select", { id: "date-order" }, [
      UI.el("option", { value: "auto", text: "Auto-detect" }),
      UI.el("option", { value: "dmy", text: "dd/mm/yyyy" }),
      UI.el("option", { value: "mdy", text: "mm/dd/yyyy" })
    ]);
    order.value = ds.settings.order;
    order.addEventListener("change", function () {
      ds.settings.order = order.value; save(); UI.defer(refresh);
    });
    grid.appendChild(UI.el("div", { class: "field" }, [
      UI.el("label", { class: "label", for: "date-order", text: "Numeric date order" }), order
    ]));

    var notes = UI.clear(UI.qs("#data-notes"));
    function note(kind, text, id) { notes.appendChild(UI.el("div", { class: "note note--" + kind, text: text, id: id || null })); }
    if (parsed.error === "empty") note("info", "Paste CSV or TSV text above. The first row must be the column headers.");
    else if (parsed.error === "nodata") note("warn", "Only a header row was found. Add data rows below it.");
    else if (parsed.error === "unmapped") note("warn", "Choose which columns hold the start date and the done date.");
    else if (parsed.error === "noitems") note("danger", "No row could be used. Check the mapped columns and the date order.");
    if (headers.length) {
      note("info", "Read " + plural(parsed.rowsRead, "row") + " with " + plural(headers.length, "column") +
        " (" + ({ ",": "comma", ";": "semicolon", "\t": "tab" }[parsed.delimiter]) + " separated). " +
        plural(parsed.items.length, "item") + " usable." + (parsed.orderNote ? " " + parsed.orderNote : ""));
    }
    if (parsed.skipped.length) {
      var byReason = {};
      parsed.skipped.forEach(function (s) {
        (byReason[s.reason] = byReason[s.reason] || []).push(s.line);
      });
      var parts = Object.keys(byReason).map(function (r) {
        var lines = byReason[r];
        return lines.length + " " + r + " (line" + (lines.length === 1 ? " " : "s ") +
          lines.slice(0, 8).join(", ") + (lines.length > 8 ? ", ..." : "") + ")";
      });
      note("warn", "Skipped " + parsed.skipped.length + " of " + parsed.rowsRead + " rows: " + parts.join("; ") + ".", "skip-note");
    }
    if (parsed.excluded) {
      note("info", "Left out " + plural(parsed.excluded, "canceled row") + " (a value in \u201c" + headers[ds.mapping.exclude] +
        "\u201d). Canceled work never finished, so it counts neither as done nor as in progress.", "excluded-note");
    }
    if (ds.mapping && ds.mapping.start >= 0 && CREATED_RE.test(norm(headers[ds.mapping.start]))) {
      note("info", "The start date is \u201c" + headers[ds.mapping.start] + "\u201d, so these numbers are lead time (request to done), " +
        "not cycle time. If the export has a start or in-progress date, map it as the start date.", "leadtime-note");
    }
    if (parsed.ignored.length) {
      note("info", "Ignored person columns: " + parsed.ignored.join(", ") + ". This tool never breaks data down by person.");
    }
  }

  function renderSettings(A) {
    var ds = state.ds;
    var sel = UI.clear(UI.qs("#seg-filter"));
    sel.appendChild(UI.el("option", { value: "", text: "All items" }));
    var values = A ? A.segValues : [];
    values.forEach(function (v) { sel.appendChild(UI.el("option", { value: v, text: v })); });
    sel.value = A ? A.segFilter : "";
    sel.disabled = !values.length;
    UI.qs("#window").value = String(ds.settings.window);
    UI.qs("#weekends").checked = ds.settings.weekends;
    var asofInput = UI.qs("#asof-date");
    if (document.activeElement !== asofInput) asofInput.value = A ? UI.isoDate(A.asOf) : ds.settings.asOf;
    UI.qs("#asof-today").disabled = !ds.settings.asOf;
    UI.qs("#asof").textContent = A
      ? "Ages are measured to " + pretty(A.asOf) + (ds.settings.asOf ? "" : " (today)") + " and forecasts start the day after. " +
        "History window: " + pretty(A.winStart) + " to " + pretty(A.winEnd) + " (the latest date in the file), " + plural(A.winDays, "day") + "."
      : "";
    var asofNote = UI.clear(UI.qs("#asof-note"));
    if (A && A.asOfClamped) {
      asofNote.appendChild(UI.el("div", { class: "note note--warn",
        text: "The as-of date cannot be before the latest date in the file, so " + pretty(A.dataEnd) + " is used." }));
    } else if (A && dayDiff(A.dataEnd, A.asOf) > 14) {
      asofNote.appendChild(UI.el("div", { class: "note note--info",
        text: "Your data ends on " + pretty(A.dataEnd) + "; ages are measured to " + pretty(A.asOf) +
          ". For an older export, set the as-of date to the day it was pulled." }));
    }
  }

  /* --- Render: results ------------------------------------------------------- */
  function stat(label, value, sub, id) {
    return UI.el("div", { class: "stat" }, [
      UI.el("div", { class: "stat__label", text: label }),
      UI.el("div", { class: "stat__value", text: value, id: id || null }),
      UI.el("div", { class: "stat__sub", text: sub })
    ]);
  }

  function renderStats(A) {
    var host = UI.clear(UI.qs("#stats"));
    host.appendChild(stat("Items", String(A.items.length), A.finished.length + " finished, " + A.inProgress.length + " in progress", "stat-items"));
    host.appendChild(stat("Throughput", fmt(A.tpWeek, 1) + " / week", A.winFinished + " finished in the window"));
    host.appendChild(stat("Median cycle time", A.pct[50] === null ? "—" : plural(A.pct[50], "day"), "half finish within this"));
    host.appendChild(stat("85th percentile", A.pct[85] === null ? "—" : plural(A.pct[85], "day"), "a fair service level expectation"));
    var red = A.aging.filter(function (a) { return a.level === "danger"; }).length;
    host.appendChild(stat("Aging over P85", String(red), "in-progress items"));
  }

  function renderPctTable(A) {
    var tbl = UI.clear(UI.qs("#pct-table"));
    tbl.appendChild(UI.el("thead", {}, UI.el("tr", {}, [
      UI.el("th", { text: "Percentile" }), UI.el("th", { class: "num", text: "Cycle time (days)" }),
      UI.el("th", { text: "Reads as" })
    ])));
    var body = UI.el("tbody");
    PCTS.forEach(function (p) {
      var v = A.pct[p];
      body.appendChild(UI.el("tr", {}, [
        UI.el("td", {}, [UI.el("span", { class: "swatch", style: "background:var(" + PCT_TOKENS[p] + ")" }), "P" + p]),
        UI.el("td", { class: "num", text: v === null ? "—" : String(v), dataset: { p: String(p) } }),
        UI.el("td", { class: "muted tiny reads", text: v === null ? "No finished items yet" : p + "% of items finished in " + plural(v, "day") + " or less" })
      ]));
    });
    body.appendChild(UI.el("tr", {}, [
      UI.el("td", { text: "Average" }),
      UI.el("td", { class: "num", text: fmt(A.avgCt, 1) }),
      UI.el("td", { class: "muted tiny", text: "Skewed by the long tail; prefer percentiles" })
    ]));
    tbl.appendChild(body);
  }

  function renderLittle(A) {
    var host = UI.qs("#little");
    var L = A.little;
    if (!L || L.predicted === null || L.actual === null) {
      host.textContent = "Little's Law check needs finished items inside the history window.";
      return;
    }
    var gap = Math.abs(L.predicted - L.actual) / L.actual;
    host.innerHTML = "";
    host.appendChild(document.createTextNode("Little's Law over the window: average WIP "));
    host.appendChild(UI.el("strong", { text: fmt(L.avgWip, 1) }));
    host.appendChild(document.createTextNode(" ÷ throughput "));
    host.appendChild(UI.el("strong", { text: fmt(L.tpDay, 2) + " per day" }));
    host.appendChild(document.createTextNode(" = "));
    host.appendChild(UI.el("strong", { text: fmt(L.predicted, 1) + " days" }));
    host.appendChild(document.createTextNode(", against an actual average cycle time of "));
    host.appendChild(UI.el("strong", { text: fmt(L.actual, 1) + " days" }));
    host.appendChild(document.createTextNode(". " + (gap <= 0.25
      ? "Close enough: the system looks stable, so forecasts are reasonable."
      : "A large gap: WIP is growing or work is being started and left, so treat forecasts as optimistic.")));
  }

  function renderAging(A) {
    UI.qs("#aging-count").textContent = A.aging.length + " in progress";
    var tbl = UI.clear(UI.qs("#aging-table"));
    var hasSeg = A.segValues.length > 0;
    var heads = [UI.el("th", { text: "Item" }), UI.el("th", { text: "Title" })];
    if (hasSeg) heads.push(UI.el("th", { text: "Segment" }));
    heads.push(UI.el("th", { text: "Started" }), UI.el("th", { class: "num", text: "Age (days)" }), UI.el("th", { text: "Signal" }));
    tbl.appendChild(UI.el("thead", {}, UI.el("tr", {}, heads)));
    var body = UI.el("tbody");
    A.aging.forEach(function (a) {
      var it = a.item;
      var tag = a.level === "danger"
        ? UI.el("span", { class: "tag tag--danger", text: "Over P85", title: "Already older than 85% of everything we finished" })
        : a.level === "warn"
          ? UI.el("span", { class: "tag tag--warn", text: "Over P70", title: "Already older than 70% of everything we finished" })
          : UI.el("span", { class: "tag tag--ok", text: "Within P70" });
      var cells = [
        UI.el("td", { class: "nowrap", text: it.id || "line " + it.line }),
        UI.el("td", {}, UI.el("div", { class: "aging-title", text: it.title || "—", title: it.title || "" }))
      ];
      if (hasSeg) cells.push(UI.el("td", { class: "nowrap", text: it.seg }));
      cells.push(UI.el("td", { class: "nowrap", text: pretty(it.start) }), UI.el("td", { class: "num", text: String(a.age) }), UI.el("td", {}, tag));
      body.appendChild(UI.el("tr", { class: "aging-" + a.level }, cells));
    });
    if (!A.aging.length) {
      body.appendChild(UI.el("tr", {}, UI.el("td", { colspan: hasSeg ? 6 : 5, class: "muted center", text: "Nothing in progress. Rows with an empty done date show up here." })));
    }
    tbl.appendChild(body);
  }

  function renderSegments(A) {
    var card = UI.qs("#seg-card");
    card.classList.toggle("hidden", !A.segValues.length);
    if (!A.segValues.length) return;
    var tbl = UI.clear(UI.qs("#seg-table"));
    tbl.appendChild(UI.el("thead", {}, UI.el("tr", {}, [
      UI.el("th", { text: "Segment" }), UI.el("th", { class: "num", text: "Finished" }),
      UI.el("th", { class: "num", text: "In progress" }), UI.el("th", { class: "num", text: "Throughput / week" }),
      UI.el("th", { class: "num", text: "Median CT" }), UI.el("th", { class: "num", text: "P85 CT" })
    ])));
    var body = UI.el("tbody");
    A.segments.forEach(function (s) {
      body.appendChild(UI.el("tr", { class: s.value === A.segFilter ? "is-current" : null }, [
        UI.el("td", { text: s.value }),
        UI.el("td", { class: "num", text: String(s.m.finished.length) }),
        UI.el("td", { class: "num", text: String(s.inProgress) }),
        UI.el("td", { class: "num", text: fmt(s.m.tpWeek, 1) }),
        UI.el("td", { class: "num", text: s.m.pct[50] === null ? "—" : String(s.m.pct[50]) }),
        UI.el("td", { class: "num", text: s.m.pct[85] === null ? "—" : String(s.m.pct[85]) })
      ]));
    });
    tbl.appendChild(body);
  }

  function forecastInputs(A) {
    var s = state.ds.settings;
    var hm = UI.parseDate(s.hmDate) || UI.addDays(A.asOf, 28);
    var ws = UI.parseDate(s.whenStart) || UI.addDays(A.asOf, 1);
    return { hmDate: hm, whenN: s.whenN, whenStart: ws };
  }

  function renderForecasts(A) {
    var inp = forecastInputs(A);
    var hmInput = UI.qs("#hm-date"), wn = UI.qs("#when-n"), wsI = UI.qs("#when-start");
    if (document.activeElement !== hmInput) hmInput.value = UI.isoDate(inp.hmDate);
    if (document.activeElement !== wn) wn.value = String(inp.whenN);
    if (document.activeElement !== wsI) wsI.value = UI.isoDate(inp.whenStart);
    UI.qs("#fc-basis").textContent = A.samples.length + " days of history, " + A.winFinished + " items";

    var warn = UI.clear(UI.qs("#fc-warn"));
    var ok = canForecast(A);
    if (!ok) {
      warn.appendChild(UI.el("div", { class: "note note--danger", text: "No items finished inside the history window, so there is no throughput to resample. Widen the window." }));
    } else if (A.winFinished < MIN_ITEMS) {
      warn.appendChild(UI.el("div", { class: "note note--warn", id: "fc-low",
        text: "Only " + plural(A.winFinished, "finished item") + " in the window. Under about " + MIN_ITEMS + " the range is mostly noise: widen the window or wait for more data." }));
    }

    A.hm = null; A.when = null;
    var hmNote = UI.qs("#hm-note");
    if (ok && inp.hmDate > A.asOf) {
      A.hm = forecastHowMany(A, inp.hmDate);
      UI.qs("#hm-50").textContent = String(A.hm.p50);
      UI.qs("#hm-85").textContent = String(A.hm.p85);
      UI.qs("#hm-95").textContent = String(A.hm.p95);
      hmNote.textContent = "From " + pretty(A.hm.first) + " to " + pretty(inp.hmDate) + " (" + plural(A.hm.days, "simulated day") +
        "). With 85% confidence the team finishes " + A.hm.p85 + " items or more (the 15th percentile of simulated totals).";
    } else {
      ["#hm-50", "#hm-85", "#hm-95"].forEach(function (id) { UI.qs(id).textContent = "—"; });
      hmNote.textContent = ok ? "Pick a date after the as-of date (" + pretty(A.asOf) + ")." : "";
    }

    var whenNote = UI.qs("#when-note");
    if (ok) {
      A.when = forecastWhen(A, inp.whenN, inp.whenStart);
      var w = A.when;
      [["#when-50", w.p50], ["#when-85", w.p85], ["#when-95", w.p95]].forEach(function (pair) {
        UI.qs(pair[0]).textContent = pair[1] >= MAX_SIM_DAYS ? "Over 10 years" : pretty(UI.addDays(w.start, pair[1]));
      });
      whenNote.textContent = "Starting " + pretty(w.start) + ", " + plural(w.count, "item") + " are done by " +
        (w.p85 >= MAX_SIM_DAYS ? "an unknown date" : pretty(UI.addDays(w.start, w.p85))) + " in 85% of simulated futures." +
        (w.capped ? " " + w.capped + " runs never got there within 10 years." : "");
    } else {
      ["#when-50", "#when-85", "#when-95"].forEach(function (id) { UI.qs(id).textContent = "—"; });
      whenNote.textContent = "";
    }
  }

  /* --- Charts ----------------------------------------------------------------- */
  function css(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function setupCanvas(canvas) {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(220, Math.round(rect.width));
    var h = Math.max(140, parseInt(canvas.getAttribute("height"), 10) || 220);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = h + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function font(size, weight) { return (weight ? weight + " " : "") + size + "px " + css("--font-sans", "sans-serif"); }

  function placeholder(canvas, text) {
    var c = setupCanvas(canvas);
    c.ctx.fillStyle = css("--text-3", "#888");
    c.ctx.font = font(13);
    c.ctx.textAlign = "center";
    c.ctx.fillText(text, c.w / 2, c.h / 2);
  }

  function niceMax(v) {
    if (v <= 5) return Math.max(1, Math.ceil(v));
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * mag >= v) return steps[i] * mag;
    return 10 * mag;
  }

  /** Axes plus horizontal gridlines with integer labels. Returns plot geometry. */
  function frame(c, pad, yMax, yLabel) {
    var ctx = c.ctx;
    var plot = { x: pad.l, y: pad.t, w: c.w - pad.l - pad.r, h: c.h - pad.t - pad.b, yMax: yMax };
    var ticks = yMax <= 5 ? yMax : yMax % 4 === 0 ? 4 : yMax % 5 === 0 ? 5 : 4;
    ctx.font = font(10);
    ctx.textAlign = "right";
    for (var i = 0; i <= ticks; i++) {
      var v = (yMax * i) / ticks;
      var y = plot.y + plot.h - (v / yMax) * plot.h;
      ctx.strokeStyle = css("--border", "#ddd");
      ctx.lineWidth = 1;
      ctx.globalAlpha = i === 0 ? 1 : 0.6;
      ctx.beginPath(); ctx.moveTo(plot.x, Math.round(y) + 0.5); ctx.lineTo(plot.x + plot.w, Math.round(y) + 0.5); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = css("--text-3", "#888");
      ctx.fillText(String(UI.round(v, yMax < 4 ? 1 : 0)), plot.x - 5, y + 3);
    }
    if (yLabel) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.translate(10, plot.y + plot.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(yLabel, 0, 0);
      ctx.restore();
    }
    return plot;
  }

  function drawThroughput(A) {
    var canvas = UI.qs("#tp-chart");
    var weeks = A.weekly;
    if (!weeks.length || !A.finished.length) { placeholder(canvas, "No finished items yet"); return; }
    var c = setupCanvas(canvas), ctx = c.ctx;
    var max = niceMax(Math.max.apply(null, weeks.map(function (w) { return w.count; })) || 1);
    var p = frame(c, { l: 34, r: 8, t: 10, b: 24 }, max, "items");
    var bw = p.w / weeks.length;
    var winMonday = mondayOf(A.winStart);
    weeks.forEach(function (w, i) {
      var h = (w.count / max) * p.h;
      ctx.fillStyle = css("--accent", "#4f46e5");
      ctx.globalAlpha = w.monday >= winMonday ? 0.85 : 0.35;
      ctx.fillRect(p.x + i * bw + 1, p.y + p.h - h, Math.max(1, bw - 2), h);
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = css("--text-3", "#888");
    ctx.font = font(10);
    ctx.textAlign = "center";
    var every = Math.max(1, Math.ceil(weeks.length / Math.max(2, Math.floor(p.w / 46))));
    weeks.forEach(function (w, i) {
      if (i % every !== 0) return;
      ctx.fillText("W" + w.week, p.x + i * bw + bw / 2, c.h - 8);
    });
    canvas.setAttribute("aria-label", "Weekly throughput over " + weeks.length + " weeks, peak " +
      Math.max.apply(null, weeks.map(function (w) { return w.count; })) + " items. Faded bars fall outside the history window.");
  }

  function drawScatter(A) {
    var canvas = UI.qs("#ct-chart");
    if (!A.finished.length) { placeholder(canvas, "No finished items yet"); return; }
    var c = setupCanvas(canvas), ctx = c.ctx;
    var maxCt = A.cts[A.cts.length - 1];
    var max = niceMax(maxCt * 1.08);
    var p = frame(c, { l: 34, r: 10, t: 10, b: 24 }, max, "days");
    var x0 = A.dataStart, span = Math.max(1, dayDiff(A.dataStart, A.dataEnd));
    function xOf(d) { return p.x + (dayDiff(x0, d) / span) * p.w; }
    function yOf(v) { return p.y + p.h - (v / max) * p.h; }

    ctx.fillStyle = css("--accent", "#4f46e5");
    ctx.globalAlpha = 0.6;
    A.finished.forEach(function (it, i) {
      var jitter = ((i * 7919) % 7 - 3) * 0.6;
      ctx.beginPath();
      ctx.arc(xOf(it.done) + jitter, yOf(it.ct), 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    var labels = [];
    PCTS.forEach(function (pc) {
      var v = A.pct[pc];
      if (v === null) return;
      var y = yOf(v), color = css(PCT_TOKENS[pc], "#888");
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(p.x, y); ctx.lineTo(p.x + p.w, y); ctx.stroke();
      ctx.setLineDash([]);
      labels.push({ y: y - 4, text: pc + "%: " + v + "d", color: color });
    });
    // push labels apart so close percentiles stay readable (top to bottom)
    labels.sort(function (a, b) { return b.y - a.y; });
    for (var i = 1; i < labels.length; i++) {
      if (labels[i - 1].y - labels[i].y < 12) labels[i].y = labels[i - 1].y - 12;
    }
    ctx.font = font(10, 650);
    ctx.textAlign = "right";
    labels.forEach(function (l) {
      var tw = ctx.measureText(l.text).width;
      ctx.fillStyle = css("--surface", "#fff");
      ctx.globalAlpha = 0.85;
      ctx.fillRect(p.x + p.w - tw - 4, Math.max(p.y, l.y) - 9, tw + 4, 12);
      ctx.globalAlpha = 1;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, p.x + p.w - 2, Math.max(p.y + 9, l.y));
    });

    ctx.fillStyle = css("--text-3", "#888");
    ctx.font = font(10);
    ctx.textAlign = "left";
    ctx.fillText(shortDate(A.dataStart), p.x, c.h - 8);
    ctx.textAlign = "right";
    ctx.fillText(shortDate(A.dataEnd) + " (done date)", p.x + p.w, c.h - 8);
    canvas.setAttribute("aria-label", "Cycle time scatterplot of " + A.finished.length + " finished items. P50 " +
      A.pct[50] + " days, P85 " + A.pct[85] + " days.");
  }

  function drawWip(A) {
    var canvas = UI.qs("#wip-chart");
    var s = A.wip;
    if (!s.length) { placeholder(canvas, "No data"); return; }
    var c = setupCanvas(canvas), ctx = c.ctx;
    var max = niceMax(Math.max.apply(null, s) || 1);
    var p = frame(c, { l: 34, r: 10, t: 10, b: 24 }, max, "items");
    var step = s.length > 1 ? p.w / (s.length - 1) : 0;
    ctx.beginPath();
    s.forEach(function (v, i) {
      var x = p.x + i * step, y = p.y + p.h - (v / max) * p.h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = css("--info", "#1f6feb");
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineTo(p.x + (s.length - 1) * step, p.y + p.h);
    ctx.lineTo(p.x, p.y + p.h);
    ctx.closePath();
    ctx.fillStyle = css("--info", "#1f6feb");
    ctx.globalAlpha = 0.12;
    ctx.fill();
    ctx.globalAlpha = 1;

    var wx = p.x + dayDiff(A.dataStart, A.winStart) * step;
    if (wx > p.x + 1) {
      ctx.strokeStyle = css("--text-3", "#888");
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(wx, p.y); ctx.lineTo(wx, p.y + p.h); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = css("--text-3", "#888");
      ctx.font = font(10);
      ctx.textAlign = "left";
      ctx.fillText("window", wx + 4, p.y + 10);
    }
    ctx.fillStyle = css("--text-3", "#888");
    ctx.font = font(10);
    ctx.textAlign = "left";
    ctx.fillText(shortDate(A.dataStart), p.x, c.h - 8);
    ctx.textAlign = "right";
    ctx.fillText(shortDate(A.dataEnd), p.x + p.w, c.h - 8);
    canvas.setAttribute("aria-label", "WIP over time, currently " + s[s.length - 1] + " items, peak " + Math.max.apply(null, s) + ".");
  }

  /** Histogram of integer outcomes with confidence markers. */
  function drawHistogram(canvas, values, markers, xLabel) {
    var c = setupCanvas(canvas), ctx = c.ctx;
    var lo = values[0], hi = values[values.length - 1];
    var bins = Math.min(30, hi - lo + 1);
    var width = (hi - lo + 1) / bins;
    var counts = [];
    for (var b = 0; b < bins; b++) counts.push(0);
    values.forEach(function (v) { counts[UI.clamp(Math.floor((v - lo) / width), 0, bins - 1)]++; });
    var max = Math.max.apply(null, counts);
    var p = { x: 10, y: 18, w: c.w - 20, h: c.h - 18 - 26 };
    var bw = p.w / bins;
    ctx.fillStyle = css("--accent", "#4f46e5");
    ctx.globalAlpha = 0.75;
    counts.forEach(function (n, i) {
      var h = (n / max) * p.h;
      ctx.fillRect(p.x + i * bw + 0.5, p.y + p.h - h, Math.max(1, bw - 1), h);
    });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = css("--border", "#ddd");
    ctx.beginPath(); ctx.moveTo(p.x, p.y + p.h + 0.5); ctx.lineTo(p.x + p.w, p.y + p.h + 0.5); ctx.stroke();
    function xOf(v) { return p.x + ((v - lo + 0.5) / (hi - lo + 1)) * p.w; }
    var last = -100;
    markers.forEach(function (m) {
      var x = xOf(m.value), color = css(m.token, "#888");
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x, p.y + p.h); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = font(10, 650);
      ctx.textAlign = "center";
      var lx = UI.clamp(x, p.x + 14, p.x + p.w - 14);
      var shifted = Math.abs(lx - last) < 28;
      ctx.fillText(m.label, lx, shifted ? p.y + 10 : p.y - 5);
      last = shifted ? -100 : lx;
    });
    ctx.fillStyle = css("--text-3", "#888");
    ctx.font = font(10);
    ctx.textAlign = "left";
    ctx.fillText(xLabel(lo), p.x, c.h - 8);
    ctx.textAlign = "right";
    ctx.fillText(xLabel(hi), p.x + p.w, c.h - 8);
  }

  function drawForecasts(A) {
    var hmC = UI.qs("#hm-chart"), wC = UI.qs("#when-chart");
    if (A.hm) {
      drawHistogram(hmC, A.hm.totals, [
        { value: A.hm.p95, label: "95%", token: "--ok" },
        { value: A.hm.p85, label: "85%", token: "--warn" },
        { value: A.hm.p50, label: "50%", token: "--text-2" }
      ], function (v) { return v + " items"; });
      hmC.setAttribute("aria-label", "Simulated items by the date: 50% " + A.hm.p50 + ", 85% " + A.hm.p85 + ", 95% " + A.hm.p95 + ".");
    } else placeholder(hmC, "No forecast yet");
    if (A.when) {
      var w = A.when;
      drawHistogram(wC, w.offsets, [
        { value: w.p50, label: "50%", token: "--text-2" },
        { value: w.p85, label: "85%", token: "--warn" },
        { value: w.p95, label: "95%", token: "--ok" }
      ], function (v) { return shortDate(UI.addDays(w.start, v)); });
      wC.setAttribute("aria-label", "Simulated completion dates for " + w.count + " items.");
    } else placeholder(wC, "No forecast yet");
  }

  function drawAll() {
    var A = state.analysis;
    if (!A || UI.qs("#workspace").classList.contains("hidden")) return;
    drawScatter(A);
    drawThroughput(A);
    drawWip(A);
    drawForecasts(A);
  }

  /* --- Export ----------------------------------------------------------------- */
  function toMarkdown() {
    var ds = state.ds;
    var parsed = parseDataset(ds);
    var A = state.analysis;
    var out = ["# Flow forecast: " + ds.name, ""];
    if (!A) {
      out.push("_No usable items in this dataset yet._");
      return out.join("\n");
    }
    out.push("_As of " + UI.isoDate(A.asOf) + " (ages and forecast start). History window " + UI.isoDate(A.winStart) + " to " + UI.isoDate(A.winEnd) +
      " (" + (ds.settings.window ? "last " + ds.settings.window + " weeks" : "all history") + ")" +
      (ds.settings.weekends ? ", weekends excluded" : "") + ". Segment: " + (A.segFilter || "all items") + "._", "");
    out.push("- Items: " + A.items.length + " (" + A.finished.length + " finished, " + A.inProgress.length + " in progress)");
    out.push("- Throughput: " + fmt(A.tpWeek, 1) + " items per week (" + A.winFinished + " finished in the window)");
    if (parsed.skipped.length) out.push("- Rows skipped on import: " + parsed.skipped.length);
    out.push("");
    out.push("## Cycle time percentiles", "");
    out.push("Calendar days, start to done inclusive (same day = 1). Nearest-rank method.", "");
    out.push("| Percentile | Days |", "|---|---:|");
    PCTS.forEach(function (p) { out.push("| P" + p + " | " + (A.pct[p] === null ? "n/a" : A.pct[p]) + " |"); });
    out.push("");
    if (A.little && A.little.predicted !== null && A.little.actual !== null) {
      out.push("Little's Law: average WIP " + fmt(A.little.avgWip, 1) + " / throughput " + fmt(A.little.tpDay, 2) +
        " per day = " + fmt(A.little.predicted, 1) + " days, actual average cycle time " + fmt(A.little.actual, 1) + " days.", "");
    }
    if (A.segments.length) {
      out.push("## Segments", "", "| Segment | Finished | In progress | Throughput/week | Median CT | P85 CT |", "|---|---:|---:|---:|---:|---:|");
      A.segments.forEach(function (s) {
        out.push("| " + mdCell(s.value) + " | " + s.m.finished.length + " | " + s.inProgress + " | " + fmt(s.m.tpWeek, 1) + " | " +
          (s.m.pct[50] === null ? "n/a" : s.m.pct[50]) + " | " + (s.m.pct[85] === null ? "n/a" : s.m.pct[85]) + " |");
      });
      out.push("");
    }
    out.push("## Forecasts (Monte Carlo, " + RUNS.toLocaleString("en-US") + " runs)", "");
    if (A.winFinished < MIN_ITEMS) out.push("> Only " + A.winFinished + " finished items in the window; treat these as rough.", "");
    if (A.hm) {
      out.push("**How many items by " + UI.isoDate(A.hm.end) + "?** 50%: " + A.hm.p50 + " or more. 85%: " + A.hm.p85 +
        " or more. 95%: " + A.hm.p95 + " or more.", "");
    }
    if (A.when) {
      var w = A.when;
      var d = function (o) { return o >= MAX_SIM_DAYS ? "over 10 years" : UI.isoDate(UI.addDays(w.start, o)); };
      out.push("**When will " + w.count + " items be done, starting " + UI.isoDate(w.start) + "?** 50%: by " + d(w.p50) +
        ". 85%: by " + d(w.p85) + ". 95%: by " + d(w.p95) + ".", "");
    }
    var red = A.aging.filter(function (a) { return a.level === "danger"; });
    out.push("## Aging items over P85 (" + red.length + ")", "");
    if (!red.length) out.push("_None._");
    else {
      out.push("| Item | Title | Age (days) |", "|---|---|---:|");
      red.forEach(function (a) {
        out.push("| " + mdCell(a.item.id || "line " + a.item.line) + " | " + mdCell(a.item.title || "") + " | " + a.age + " |");
      });
    }
    out.push("", "---", "_Generated with Agile Toolbox, Flow Forecaster. A forecast is a range, not a promise._");
    return out.join("\n");
  }

  function mdCell(s) { return String(s).replace(/\|/g, "\\|").replace(/[\r\n]+/g, " "); }

  function cycleTimesCSV() {
    var A = state.analysis;
    var lines = ["id,title,segment,start,done,cycle_time_days"];
    if (A) {
      A.finished.forEach(function (it) {
        lines.push([csvField(it.id), csvField(it.title), csvField(it.seg), UI.isoDate(it.start), UI.isoDate(it.done), it.ct].join(","));
      });
    }
    return lines.join("\n");
  }

  function exportPayload() {
    var ds = state.ds;
    var A = state.analysis;
    return {
      app: "agile-toolbox", tool: "flow", schema: Store.schema,
      dataset: { name: ds.name, raw: ds.raw, mapping: ds.mapping, settings: ds.settings },
      items: A ? A.items.map(function (it) {
        return { id: it.id, title: it.title, segment: it.seg, start: UI.isoDate(it.start),
          done: it.done ? UI.isoDate(it.done) : null, cycleTimeDays: it.ct };
      }) : []
    };
  }

  function importPayload(payload) {
    var d = payload && payload.dataset ? payload.dataset : payload;
    if (!d || typeof d !== "object" || typeof d.raw !== "string") {
      UI.toast("That file is not a Flow Forecaster dataset.", "danger");
      return;
    }
    if (d.raw.length > 4000000) { UI.toast("That dataset is too large to import.", "danger"); return; }
    var ds = makeDataset((typeof d.name === "string" && d.name.trim() ? d.name.trim() : "Imported dataset") + " (imported)", d.raw);
    ds.mapping = d.mapping;
    ds.settings = d.settings;
    normalize(ds);
    addDataset(ds);
    UI.toast("Dataset imported.", "ok");
  }

  /* --- Datasets --------------------------------------------------------------- */
  function addDataset(ds) {
    state.datasets.push(ds);
    state.ds = ds;
    save();
    refresh();
  }

  function switchDataset(id) {
    state.ds = state.datasets.filter(function (d) { return d.id === id; })[0] || state.datasets[0] || null;
    save();
    refresh();
  }

  function uniqueName(base) {
    var names = state.datasets.map(function (d) { return d.name; });
    if (names.indexOf(base) === -1) return base;
    for (var i = 2; ; i++) if (names.indexOf(base + " " + i) === -1) return base + " " + i;
  }

  /* --- Refresh cycle ------------------------------------------------------------ */
  function refresh() {
    renderToolbar();
    var ds = state.ds;
    if (!ds) { state.analysis = null; return; }
    var parsed = parseDataset(ds);
    renderData(parsed);
    var A = parsed.items.length ? analyze(parsed, ds.settings) : null;
    state.analysis = A;
    renderSettings(A);
    UI.qs("#no-items").classList.toggle("hidden", !!A);
    UI.qs("#results").classList.toggle("hidden", !A);
    if (!A) return;
    renderStats(A);
    renderPctTable(A);
    renderLittle(A);
    renderAging(A);
    renderSegments(A);
    renderForecasts(A);
    drawAll();
  }

  function setRaw(text) {
    state.ds.raw = text;
    save();
    refresh();
  }

  function readFile(file) {
    if (!file) return;
    if (file.size > 8000000) { UI.toast("That file is over 8 MB. Export fewer columns or rows.", "danger"); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || "");
      addDataset(makeDataset(uniqueName(file.name.replace(/\.(csv|tsv|txt)$/i, "") || "Imported CSV"), text));
      UI.toast("Loaded " + file.name + ".", "ok");
    };
    reader.onerror = function () { UI.toast("Could not read that file.", "danger"); };
    reader.readAsText(file);
  }

  function init() {
    UI.initChrome();
    load();
    refresh();

    UI.qs("#ds-select").addEventListener("change", function (e) { switchDataset(e.target.value); });
    UI.qs("#load-example").addEventListener("click", function () {
      addDataset(makeDataset(uniqueName("Example team"), exampleCSV()));
      UI.toast("Example loaded: 20 weeks of a made-up team.", "ok");
    });
    function newDataset() {
      var name = prompt("Dataset name", uniqueName("Team flow"));
      if (name === null) return;
      addDataset(makeDataset(name.trim() || "Dataset", ""));
      UI.qs("#data-card").open = true;
      UI.qs("#raw").focus();
    }
    UI.qs("#new-dataset").addEventListener("click", newDataset);
    UI.qs("#paste-own").addEventListener("click", newDataset);
    UI.qs("#open-file").addEventListener("click", function () { UI.qs("#file-input").click(); });
    UI.qs("#file-input").addEventListener("change", function (e) {
      readFile(e.target.files && e.target.files[0]);
      e.target.value = "";
    });
    UI.qs("#rename-dataset").addEventListener("click", function () {
      if (!state.ds) return;
      var name = prompt("Rename dataset", state.ds.name);
      if (name === null || !name.trim()) return;
      state.ds.name = name.trim().slice(0, 120);
      save(); refresh();
    });
    UI.qs("#dup-dataset").addEventListener("click", function () {
      if (!state.ds) return;
      var copy = JSON.parse(JSON.stringify(state.ds));
      copy.id = UI.uid("ds");
      copy.name = uniqueName(state.ds.name + " copy");
      addDataset(normalize(copy));
    });
    UI.qs("#delete-dataset").addEventListener("click", function () {
      if (!state.ds) return;
      if (!UI.confirmDanger("Delete dataset \"" + state.ds.name + "\"? This cannot be undone.")) return;
      var gone = state.ds.id;
      state.datasets = state.datasets.filter(function (d) { return d.id !== gone; });
      state.ds = state.datasets[0] || null;
      save(); refresh();
      UI.toast("Dataset deleted.");
    });

    var raw = UI.qs("#raw");
    // The pending id pins an edit to the dataset it was typed into, even if the
    // selector changes before the debounce fires.
    var pendingId = null;
    function flushRaw() {
      var id = pendingId, text = raw.value;
      pendingId = null;
      var ds = state.datasets.filter(function (d) { return d.id === id; })[0];
      if (!ds || text === ds.raw) return;
      if (ds === state.ds) setRaw(text);
      else { ds.raw = text; save(); }
    }
    var applyRaw = UI.debounce(function () { if (pendingId) flushRaw(); }, 350);
    raw.addEventListener("input", function () { pendingId = state.ds ? state.ds.id : null; applyRaw(); });
    raw.addEventListener("blur", function () { if (pendingId) flushRaw(); });

    UI.qs("#seg-filter").addEventListener("change", function (e) {
      state.ds.settings.segment = e.target.value; save(); UI.defer(refresh);
    });
    UI.qs("#window").addEventListener("change", function (e) {
      state.ds.settings.window = num(e.target.value, 12); save(); UI.defer(refresh);
    });
    UI.qs("#weekends").addEventListener("change", function (e) {
      state.ds.settings.weekends = e.target.checked; save(); UI.defer(refresh);
    });
    UI.qs("#asof-date").addEventListener("change", function (e) {
      var v = UI.parseDate(e.target.value) ? e.target.value : "";
      state.ds.settings.asOf = v === UI.isoDate(todayDay()) ? "" : v;
      save(); UI.defer(refresh);
    });
    UI.qs("#asof-today").addEventListener("click", function () {
      state.ds.settings.asOf = ""; save();
      UI.qs("#asof-date").value = UI.isoDate(todayDay());
      refresh();
    });
    UI.qs("#hm-date").addEventListener("change", function (e) {
      state.ds.settings.hmDate = UI.parseDate(e.target.value) ? e.target.value : ""; save(); UI.defer(refresh);
    });
    UI.qs("#when-n").addEventListener("change", function (e) {
      state.ds.settings.whenN = UI.clamp(Math.round(num(e.target.value, 20)), 1, 5000);
      e.target.value = state.ds.settings.whenN;
      save(); UI.defer(refresh);
    });
    UI.qs("#when-start").addEventListener("change", function (e) {
      state.ds.settings.whenStart = UI.parseDate(e.target.value) ? e.target.value : ""; save(); UI.defer(refresh);
    });

    var dialog = UI.qs("#md-dialog");
    UI.qs("#export-md").addEventListener("click", function () {
      if (!state.ds) return;
      UI.qs("#md-text").value = toMarkdown();
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    });
    UI.qs("#md-close").addEventListener("click", function () { dialog.close ? dialog.close() : dialog.removeAttribute("open"); });
    UI.qs("#md-copy").addEventListener("click", function () { UI.copy(UI.qs("#md-text").value); });
    UI.qs("#md-download").addEventListener("click", function () {
      UI.download(UI.slug(state.ds.name) + "-flow.md", UI.qs("#md-text").value, "text/markdown");
    });
    UI.qs("#export-json").addEventListener("click", function () {
      if (!state.ds) return;
      UI.downloadJSON(UI.slug(state.ds.name) + "-flow.json", exportPayload());
    });
    UI.qs("#import-json").addEventListener("click", function () { UI.pickJSON(importPayload); });
    UI.qs("#copy-ct").addEventListener("click", function () {
      if (!state.analysis || !state.analysis.finished.length) { UI.toast("No finished items to copy.", "danger"); return; }
      UI.copy(cycleTimesCSV());
    });

    var redraw = UI.debounce(drawAll, 120);
    window.addEventListener("resize", redraw);
    if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
    new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    UI.qs("#data-card").addEventListener("toggle", redraw);
  }

  /* Pure helpers for scenario checks. */
  window.__flow = {
    parseCSV: parseCSV, isPersonColumn: isPersonColumn, parseDay: parseDay, percentile: percentile, guessOrder: guessOrder,
    autoMap: autoMap, toMarkdown: function () { return toMarkdown(); }, cycleTimesCSV: cycleTimesCSV,
    /** Parse and analyse CSV text without touching saved datasets (for scenario checks). */
    analyzeText: function (raw, settings) {
      var ds = normalize({ id: "probe-" + hashString(raw), raw: raw, settings: settings || {} });
      var saved = { key: state.parseKey, parsed: state.parsed };
      var parsed = parseDataset(ds);
      state.parseKey = saved.key; state.parsed = saved.parsed;
      return { parsed: parsed, mapping: ds.mapping, A: parsed.items.length ? analyze(parsed, ds.settings) : null };
    },
    forecast: function (A, kind, arg, start) {
      return kind === "hm" ? forecastHowMany(A, arg) : forecastWhen(A, arg, start || UI.addDays(A.asOf, 1));
    }
  };

  document.addEventListener("DOMContentLoaded", init);
})();
