// Decision Log: quick capture, expand, supersede, export, revisit-due, import merge.
Store.keys("decisions").forEach(function (k) { Store.remove("decisions", k); });

var D = window.__decisions;
assert(D, "debug export missing");

// --- Pure logic -----------------------------------------------------------
var p = D.parseCapture("We decided to adopt trunk-based development because long-lived branches caused merge pain");
assert(p.title === "Adopt trunk-based development", "capture title: " + p.title);
assert(p.rationale === "Long-lived branches caused merge pain", "capture rationale: " + p.rationale);
var p2 = D.parseCapture("Use Postgres for the event store because we know it, because reasons.");
assert(p2.title === "Use Postgres for the event store" && p2.rationale === "We know it, because reasons", "splits on first because only");
assert(D.parseCapture("Freeze the API").rationale === "", "no because, no rationale");
assert(D.truncate("one two three four five", 16) === "one two three...", "truncate: " + D.truncate("one two three four five", 16));
assert(D.isRevisitDue({ status: "Accepted", revisitBy: "2000-01-01" }), "past revisit is due");
assert(!D.isRevisitDue({ status: "Proposed", revisitBy: "2000-01-01" }), "only Accepted is due");
assert(D.recordFileName({ number: 7, title: "Use Postgres for the event store" }) === "0007-use-postgres-for-the-event-store.md", "file name");

// Merge: target issued 1..3 (0002 deleted), incoming 1,2,5: 1 and 2 are retired here, 5 is free.
var target = D.normalizeLog({ name: "T", nextNumber: 4, records: [{ id: "a", number: 1, title: "A" }, { id: "c", number: 3, title: "C" }] });
var res = D.mergeInto(target, { name: "X", records: [
  { id: "x1", number: 1, title: "X1" }, { id: "x2", number: 2, title: "X2", supersedes: "x1" },
  { id: "x5", number: 5, title: "X5" }, { id: "a", number: 1, title: "A again" }] });
assert(res.added === 3 && res.skipped === 1, "merge counts " + JSON.stringify(res));
assert(res.renumbered.length === 2 && res.renumbered[0][0] === 1 && res.renumbered[0][1] === 6 && res.renumbered[1][1] === 7, "renumber " + JSON.stringify(res.renumbered));
assert(target.nextNumber === 8, "nextNumber after merge " + target.nextNumber);
assert(target.records.filter(function (r) { return r.id === "x2"; })[0].supersedes === "x1", "refs survive merge");

// --- Drive the UI -----------------------------------------------------------
click("#start-empty");
await sleep(60);
type("#quick", "We decided to adopt trunk-based development because long-lived branches caused merge pain");
$("#quick").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
await sleep(80);
var row1 = byText(".rec-row", "0001");
assert(row1.textContent.indexOf("Adopt trunk-based development") !== -1, "row title");
assert(row1.textContent.indexOf("Proposed") !== -1, "row status Proposed");
assert($("#f-title").value === "Adopt trunk-based development", "detail title");
assert($("#f-rationale").value === "Long-lived branches caused merge pain", "detail rationale");
assert($("#f-status").value === "Proposed", "detail status");

// Accept it and add an option with a pro and a con.
type("#f-status", "Accepted");
await sleep(60);
assert(byText(".rec-row", "0001").textContent.indexOf("Accepted") !== -1, "accepted in list");
click("#add-option");
await sleep(30);
type($$("#options .opt-name")[0], "Trunk-based development");
type($$("#options .opt-pros")[0], "Small merges");
type($$("#options .opt-cons")[0], "Needs feature flags");
type("#f-chosen", $$("#f-chosen option")[1].value);
await sleep(30);

// Supersede and accept the replacement.
click("#supersede");
await sleep(80);
assert(byText(".rec-row", "0002"), "new record 0002");
assert($("#f-context").value.indexOf("Revisits 0001") === 0, "context prefilled");
assert($("#refs").textContent.indexOf("Supersedes") !== -1, "new links to old");
type("#f-title", "Adopt trunk-based development with short-lived flags");
type("#f-status", "Accepted");
await sleep(80);

click(byText(".rec-row", "0001"));
await sleep(40);
assert($("#f-status").value === "Superseded", "old is Superseded: " + $("#f-status").value);
assert($("#refs").textContent.indexOf("Superseded by") !== -1 && $("#refs").textContent.indexOf("0002") !== -1, "old shows Superseded by 0002");
assert(byText(".rec-row", "0001").textContent.indexOf("Superseded") !== -1, "list shows Superseded");
click(byText(".rec-row", "0002"));
await sleep(40);
assert($("#refs").textContent.indexOf("Supersedes") !== -1 && $("#refs").textContent.indexOf("0001") !== -1, "new shows Supersedes 0001");

// Export the single record as an ADR.
click(byText(".rec-row", "0001"));
await sleep(40);
click("#export-record");
await sleep(40);
var md = $("#md-text").value;
assert(md.indexOf("# 0001. Adopt trunk-based development") === 0, "ADR title line");
assert(md.indexOf("## Decision outcome") !== -1, "ADR decision heading");
assert(md.indexOf("Chosen option: \"Trunk-based development\", because long-lived branches caused merge pain") !== -1, "ADR chosen + because");
assert(md.indexOf("1. Trunk-based development") !== -1, "ADR lists option");
assert(md.indexOf("- Good: Small merges") !== -1 && md.indexOf("- Bad: Needs feature flags") !== -1, "ADR pros/cons");
assert(md.indexOf("Status: Superseded by 0002") !== -1, "ADR status");
assert($("#md-file").textContent === "0001-adopt-trunk-based-development.md", "ADR file name");
click("#md-close");

// Revisit due: an Accepted record with a past revisit date.
click(byText(".rec-row", "0002"));
await sleep(40);
type("#f-revisit", "2020-01-15");
await sleep(40);
assert(byText(".rec-row", "0002").textContent.indexOf("Revisit due") !== -1, "revisit badge on 0002");
assert(byText(".rec-row", "0001").textContent.indexOf("Revisit due") === -1, "no badge on superseded");
assert($("#summary").textContent.indexOf("1 due for revisit") !== -1, "summary due count");

// Whole log + agents index.
click("#export-log-md");
await sleep(30);
var logMd = $("#md-text").value;
assert(logMd.indexOf("| 0001 | Adopt trunk-based development | Superseded by 0002 |") !== -1, "log index row");
assert(logMd.indexOf("## 0002. Adopt trunk-based development with short-lived flags") !== -1, "log record heading");
click("#md-close");
click("#export-agents");
await sleep(30);
var idx = $("#md-text").value;
assert(idx.indexOf("**0002** Adopt trunk-based development with short-lived flags") !== -1, "agents index lists 0002");
assert(idx.indexOf("**0001**") === -1, "agents index omits superseded");
click("#md-close");

// Import merge through the real import path (round-trip shape).
var exported = JSON.parse(JSON.stringify({ app: "agile-toolbox", tool: "decisions", log: { name: "Other", records: [{ id: "ext-1", number: 1, title: "Imported one" }] } }));
var ir = D.importPayload(exported, "x.json");
assert(ir.added === 1 && ir.renumbered[0][1] === 3, "import renumbered to 0003");
assert(byText(".rec-row", "0003").textContent.indexOf("Imported one") !== -1, "imported row visible");
D.importPayload({ nope: true });
await sleep(30);
assert(byText(".toast", "not a Decision Log export"), "bad import toast");

// Search and filter.
type("#search", "short-lived");
await sleep(220);
assert($$(".rec-row").length === 1, "search narrows to one");
type("#search", "");
await sleep(220);
type("#filter-status", "Superseded");
await sleep(20);
assert($$(".rec-row").length === 1 && $$(".rec-row")[0].textContent.indexOf("0001") !== -1, "status filter");
type("#filter-status", "");
await sleep(20);

// Load the example.
click("#load-example");
await sleep(80);
assert($$(".rec-row").length === 6, "example has 6 records: " + $$(".rec-row").length);
assert($$(".rec-row .badge-due").length === 1, "example has one overdue");
assert(byText(".rec-row", "AI-proposed"), "example has AI-proposed");
assert($("#summary").textContent.indexOf("1 due for revisit") !== -1, "example summary");
assert($("#log-select").options.length === 2, "two logs");

// --- Regressions: numbering, a supersede chain of three, revisit boundary, XSS ---
click("#new-log");
await sleep(60);
function capture(text) {
  type("#quick", text);
  $("#quick").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}
capture("Use REST for public APIs");
await sleep(40);
assert($("#f-rationale").value === "", "quick capture without because leaves rationale empty");
click("#export-record");
await sleep(30);
assert($("#md-text").value.indexOf("Decision: Use REST for public APIs.") !== -1, "ADR without rationale ends cleanly");
click("#md-close");
capture("We decided to drop IE11 because usage is under 0.1%");
await sleep(40);
click("#delete-record");
await sleep(40);
capture("We agreed to version the API in the URL because clients cache by path");
await sleep(40);
assert(byText(".rec-row", "0003").textContent.indexOf("Version the API in the URL") !== -1, "deleted 0002 is never reused: new record is 0003");
click("#export-record");
await sleep(30);
assert($("#md-text").value.indexOf(", because clients cache by path.") !== -1, "because clause ends with a period: " + $("#md-text").value.split("\n").filter(function (l) { return l.indexOf("because") !== -1; })[0]);
click("#md-close");

// chain: 0003 -> 0004 -> 0005
type("#f-status", "Accepted");
await sleep(60);
click("#supersede");
await sleep(60);
type("#f-title", "Version the API with a header");
type("#f-status", "Accepted");
await sleep(60);
click("#supersede");
await sleep(60);
type("#f-title", "Version the API by date");
type("#f-status", "Accepted");
await sleep(60);
var recs = Store.read("decisions", "logs", []).filter(function (l) { return l.id === $("#log-select").value; })[0].records;
function num(n) { return recs.filter(function (r) { return r.number === n; })[0]; }
assert(num(3).status === "Superseded" && num(4).status === "Superseded" && num(5).status === "Accepted", "chain statuses");
assert(num(3).supersededBy === num(4).id && num(4).supersedes === num(3).id && num(4).supersededBy === num(5).id && num(5).supersedes === num(4).id, "chain links");
click(byText(".rec-row", "0004"));
await sleep(40);
assert(/Supersedes\s*0003/.test($("#refs").textContent) && /Superseded by\s*0005/.test($("#refs").textContent), "middle record links both ways");
assert($$("#supersede").length === 0, "a superseded record offers no second supersede");

// revisit boundary, in local dates
click(byText(".rec-row", "0005"));
await sleep(40);
type("#f-revisit", UI.isoDate(UI.addDays(new Date(), 1)));
await sleep(40);
assert(byText(".rec-row", "0005").textContent.indexOf("Revisit due") === -1, "tomorrow is not due yet");
type("#f-revisit", UI.isoDate(new Date()));
await sleep(40);
assert(byText(".rec-row", "0005").textContent.indexOf("Revisit due") !== -1, "due on the revisit-by date itself");

// XSS in every text field of the detail view
var evil = "<img src=x onerror=alert(1)>";
$$("#detail input[type=text], #detail textarea").forEach(function (n) { type(n, evil); });
await sleep(40);
click("#export-record");
await sleep(30);
assert($$("#app img, #md-dialog img").length === 0, "no injected elements");
assert($("#md-text").value.indexOf(evil) !== -1, "markup kept literally in the export");
click("#md-close");

// empty state after deleting every record
["0005", "0004", "0003", "0001"].forEach(function (n) { click(byText(".rec-row", n)); click("#delete-record"); });
await sleep(60);
assert($$(".rec-row").length === 0 && !$("#list-empty").classList.contains("hidden"), "empty list state after deleting the last record");
capture("Keep numbering going");
await sleep(40);
assert(byText(".rec-row", "0006"), "numbering continues after deleting everything");

await sleep(600);
return "ok";
