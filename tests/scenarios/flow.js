// Flow Forecaster: example data, known cycle times, forecast ordering, skipped rows.
Store.keys("flow").forEach(function (k) { Store.remove("flow", k); });

// Nearest-rank percentile, computed independently of the tool.
function nearestRank(values, p) {
  var s = values.slice().sort(function (a, b) { return a - b; });
  return s[Math.ceil((p / 100) * s.length) - 1];
}
function cellFor(p) { return $('#pct-table td[data-p="' + p + '"]').textContent.trim(); }

// --- Pure parsing checks -------------------------------------------------------
var F = window.__flow;
var iso = function (d) { return d ? UI.isoDate(d) : null; };
assert(iso(F.parseDay("04/Mar/26 10:22 AM")) === "2026-03-04", "Jira date");
assert(iso(F.parseDay("Mar 4, 2026")) === "2026-03-04", "Mon d, yyyy");
assert(iso(F.parseDay("2026-03-04 10:22")) === "2026-03-04", "ISO with time");
assert(iso(F.parseDay("2026-03-04")) === "2026-03-04", "ISO date");
assert(iso(F.parseDay("13/02/2026", "dmy")) === "2026-02-13", "dd/mm");
assert(iso(F.parseDay("02/13/2026", "mdy")) === "2026-02-13", "mm/dd");
assert(F.parseDay("31/02/2026", "dmy") === null, "invalid day rejected");
assert(F.parseDay("garbage") === null, "garbage rejected");
assert(F.guessOrder(["03/04/2026", "25/04/2026"]).order === "dmy", "guess dmy");
assert(F.guessOrder(["04/25/2026"]).order === "mdy", "guess mdy");
var csv = F.parseCSV('a;b;c\n1;"x;y";"he said ""hi""\nline two"\n');
assert(csv.delimiter === ";", "semicolon detected");
assert(csv.rows.length === 2 && csv.rows[1].cells[1] === "x;y", "quoted delimiter");
assert(csv.rows[1].cells[2] === 'he said "hi"\nline two', "escaped quote and newline");
assert(F.parseCSV("a\tb\n1\t2").delimiter === "\t", "tab detected");
assert(iso(F.parseDay("2026-10-03 10:00:00 UTC")) === "2026-10-03", "GitHub UTC timestamp");

// --- Real-world exports (regressions) -------------------------------------------
function mapped(raw, settings) {
  var r = F.analyzeText(raw, settings);
  var h = r.parsed.headers, m = r.mapping, out = { r: r };
  ["start", "done", "exclude"].forEach(function (k) { out[k] = m[k] >= 0 ? h[m[k]] : null; });
  return out;
}
var jiraHead = "Summary,Issue key,Issue id,Issue Type,Status,Created,Updated,Resolved,Labels,Labels,Custom field (Start date)";
var jira = mapped(jiraHead + "\nLogin,ABC-1,10001,Story,Done,01/Oct/26 9:00 AM,05/Oct/26 2:00 PM,05/Oct/26 2:00 PM,web,,03/Oct/26 10:22 AM", { asOf: "2026-10-20" });
assert(jira.start === "Custom field (Start date)" && jira.done === "Resolved", "Jira start prefers the start-date field over Created: " + jira.start);
assert(jira.r.A.pct[50] === 3, "Jira cycle time from Start date: " + jira.r.A.pct[50]);
var jiraLead = mapped("Summary,Issue key,Issue Type,Status,Created,Resolved\nLogin,ABC-1,Story,Done,01/Oct/26 9:00 AM,05/Oct/26 2:00 PM");
assert(jiraLead.start === "Created", "Jira falls back to Created when no start column exists");
var linear = mapped("ID,Title,Status,Created,Updated,Started,Completed,Canceled,Labels\n" +
  "ENG-1,A,Done,2026-10-01T10:00:00.000Z,x,2026-10-02T10:00:00.000Z,2026-10-04T10:00:00.000Z,,Bug\n" +
  "ENG-2,B,Canceled,2026-10-01T10:00:00.000Z,x,2026-10-02T10:00:00.000Z,,2026-10-05T10:00:00.000Z,Bug\n" +
  "ENG-3,C,In Progress,2026-10-01T10:00:00.000Z,x,2026-10-15T10:00:00.000Z,,,Feature", { asOf: "2026-10-20" });
assert(linear.start === "Started" && linear.done === "Completed" && linear.exclude === "Canceled", "Linear mapping incl. Canceled");
assert(linear.r.parsed.excluded === 1 && linear.r.A.inProgress.length === 1, "canceled Linear item is neither done nor WIP");
var gh = mapped("number,title,state,created_at,closed_at\n1,a,closed,2026-10-01T10:00:00Z,2026-10-03T10:00:00Z");
assert(gh.start === "created_at" && gh.done === "closed_at", "GitHub mapping");
var eu = mapped("ID;Title;Start date;Done date\n1;a;03/10/2026;13/10/2026\n2;b;14/10/2026;", { asOf: "2026-10-20" });
assert(eu.r.parsed.delimiter === ";" && eu.r.parsed.order === "dmy" && eu.r.A.pct[50] === 11, "European semicolon dd/mm");
assert(eu.r.A.aging[0].age === 7, "age measured to the as-of date, not the last date in the file: " + eu.r.A.aging[0].age);
var euPast = F.analyzeText("ID;Start;Done\n1;03/10/2026;13/10/2026\n2;14/10/2026;", { asOf: "2026-10-01" }).A;
assert(euPast.asOfClamped && UI.isoDate(euPast.asOf) === "2026-10-14", "as-of before the data is clamped to the data end");
var fA = F.analyzeText("id,start,done\n1,2026-09-01,2026-09-02\n2,2026-09-02,2026-09-04\n3,2026-09-03,2026-09-03", { asOf: "2026-09-10", window: 0 }).A;
var fH = F.forecast(fA, "hm", new Date(2026, 9, 31)), fW = F.forecast(fA, "when", 10);
assert(UI.isoDate(fH.first) === "2026-09-11", "how-many starts the day after the as-of date");
assert(fH.p50 >= fH.p85 && fH.p85 >= fH.p95 && fW.p50 <= fW.p85 && fW.p85 <= fW.p95, "Monte Carlo confidence direction");

// --- Empty state, then the example -----------------------------------------------
await sleep(50);
assert(!$("#empty").classList.contains("hidden") || $$("#ds-select option").length, "empty state or datasets");
click("#load-example");
await sleep(300);
assert($("#empty").classList.contains("hidden"), "empty state hidden after example");
[50, 70, 85, 95].forEach(function (p) {
  assert(/^\d+$/.test(cellFor(p)), "example P" + p + " is a number: " + cellFor(p));
});
assert(+cellFor(50) <= +cellFor(85) && +cellFor(85) <= +cellFor(95), "example percentiles ordered");
assert(/Ignored person columns: Assignee/.test($("#data-notes").textContent), "assignee ignored");
assert($$("#map-segment option").every(function (o) { return o.textContent !== "Assignee"; }), "assignee not mappable");
assert(!$("#seg-card").classList.contains("hidden"), "segments shown");
assert(/agent-assisted/.test($("#seg-table").textContent) && /human/.test($("#seg-table").textContent), "label segments");
assert($$("#aging-table tbody tr").length >= 8, "aging list has in-progress items");
assert($$("#aging-table .tag--danger").length >= 1, "an item is flagged over P85");
assert($("#asof-note").textContent === "", "example data is current: no stale-data note");
assert($("#asof-date").value === UI.isoDate(new Date()), "as-of defaults to today");
assert(+$("#aging-table tbody td.num").textContent >= 30, "oldest example item ages to today");

// Segment filter narrows every view.
var totalItems = +$("#stat-items").textContent;
type("#seg-filter", "agent-assisted");
await sleep(100);
var filtered = +$("#stat-items").textContent;
assert(filtered > 0 && filtered < totalItems, "segment filter narrows items: " + filtered + " of " + totalItems);
type("#seg-filter", "");
await sleep(100);

// --- Known cycle times 1..10 -----------------------------------------------------
click("#new-dataset");
await sleep(100);
var lines = ["id,title,start,done"];
var cts = [];
for (var i = 1; i <= 10; i++) {
  var s = new Date(2026, 8, i);
  var d = new Date(2026, 8, i + i - 1);       // inclusive: cycle time i
  lines.push("K-" + i + ",Item " + i + "," + UI.isoDate(s) + "," + UI.isoDate(d));
  cts.push(i);
}
type("#raw", lines.join("\n"));
await sleep(600);
assert(/Your data ends on/.test($("#asof-note").textContent), "stale-data note when the file ends weeks before today");
type("#asof-date", "2026-09-19");
await sleep(150);
assert($("#asof-note").textContent === "", "note gone once as-of matches the data");
assert(Store.read("flow", "datasets", [])[1].settings.asOf === "2026-09-19", "as-of stored per dataset");
assert(cellFor(50) === String(nearestRank(cts, 50)), "P50 " + cellFor(50) + " vs " + nearestRank(cts, 50));
assert(cellFor(85) === String(nearestRank(cts, 85)), "P85 " + cellFor(85) + " vs " + nearestRank(cts, 85));
assert(cellFor(50) === "5" && cellFor(85) === "9", "nearest-rank values 5 and 9");
assert($$("#skip-note").length === 0, "no skipped rows on clean data");

type("#hm-date", "2026-10-31");
await sleep(200);
var h50 = +$("#hm-50").textContent, h85 = +$("#hm-85").textContent, h95 = +$("#hm-95").textContent;
assert(isFinite(h50) && isFinite(h85) && isFinite(h95), "how-many results are numbers");
assert(h50 >= h85 && h85 >= h95, "50% >= 85% >= 95%: " + h50 + ", " + h85 + ", " + h95);
assert(h50 > 0, "some items forecast");
// Stable: re-render does not move the answer.
type("#window", "12");
await sleep(150);
assert(+$("#hm-50").textContent === h50, "forecast stable across re-render");

type("#when-n", "15");
await sleep(200);
var w50 = $("#when-50").textContent, w95 = $("#when-95").textContent;
assert(w50 !== "—" && w95 !== "—", "when forecast shown");

// --- Markdown export ---------------------------------------------------------------
click("#export-md");
await sleep(100);
var md = $("#md-text").value;
assert(/\| P85 \| 9 \|/.test(md), "markdown has P85 row");
assert(/How many items by 2026-10-31/.test(md), "markdown has how-many answer");
click("#md-close");

// --- Garbage rows -------------------------------------------------------------------
click("#new-dataset");
await sleep(100);
type("#raw", [
  "id,start,done",
  "A,2026-09-01,2026-09-03",
  "this line is garbage",
  "B,not a date,2026-09-04",
  "C,2026-09-10,2026-09-02",
  "D,2026-09-05,"
].join("\n"));
await sleep(600);
var note = $("#skip-note");
assert(note.offsetParent !== null, "skipped-rows note visible");
assert(/Skipped 3 of 5 rows/.test(note.textContent), "skip count: " + note.textContent);
assert(/done before start/.test(note.textContent) && /unparseable start date/.test(note.textContent), "skip reasons");
assert($("#stat-items").textContent === "2", "two usable items");
type("#asof-date", "2026-09-30");
await sleep(150);
assert(byText("#aging-table tr", "D").querySelector("td.num").textContent === "26", "D ages 26 days to the chosen as-of date");
click("#asof-today");
await sleep(150);
assert($("#asof-date").value === UI.isoDate(new Date()) && Store.read("flow", "datasets", [])[2].settings.asOf === "", "Today resets the as-of date");

// --- Datasets persist and delete cleanly ---------------------------------------------
assert(Store.read("flow", "datasets", []).length === 3, "three datasets saved");
click("#delete-dataset");
await sleep(100);
assert($$("#ds-select option").length === 2, "dataset deleted");

// Visible notes: canceled rows left out, Created read as lead time.
click("#new-dataset");
await sleep(100);
type("#raw", "ID,Title,Created,Completed,Canceled\nE-1,A,2026-10-01,2026-10-04,\nE-2,<img src=x onerror=alert(1)>,2026-10-01,,2026-10-05\nE-3,C,2026-10-02,,");
await sleep(600);
assert(/Left out 1 canceled row/.test($("#excluded-note").textContent), "excluded note");
assert(/lead time/.test($("#leadtime-note").textContent), "lead-time note for Created");
assert($$("#aging-table img").length === 0, "titles render as text");
// Person columns are dropped by whole word; team, time and type columns stay mappable.
["Assignee", "Assigned To", "created_by", "Tech Lead"].forEach(function (h) {
  assert(window.__flow.isPersonColumn(h), "person column: " + h);
});
["Lead time", "Owner Team", "User story type", "Created"].forEach(function (h) {
  assert(!window.__flow.isPersonColumn(h), "not a person column: " + h);
});
return "ok";
