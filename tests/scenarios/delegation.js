// Delegation Board: preset, level change, poker with disagreement, AGENTS.md, risk warning.
Store.keys("delegation").forEach(function (k) { Store.remove("delegation", k); });
var D = window.__delegation;
assert(D, "debug surface present");
var guard = 0;
while (D.state().boards.length && guard++ < 50) { click("#delete-board"); await sleep(10); }
assert(!$("#empty").classList.contains("hidden"), "empty state visible with no boards");

// Pure logic.
var st = D.distStats([2, 4, 6]);
assert(st.min === 2 && st.max === 6 && st.spread === 4 && st.median === 4, "distStats");
assert(!D.isRisky({ decision: "Prioritize the product backlog", agent: 5, guardrails: "" }), "product is not prod");
assert(D.isRisky({ decision: "Delete stale branches", agent: 4, guardrails: " " }), "delete at 4 is risky");

// 1. Load a preset through the UI.
type("#new-from", "software");
click("#create-board");
await sleep(60);
assert($("#empty").classList.contains("hidden"), "empty state hidden");
assert($$(".dcard").length === 11, "11 cards, got " + $$(".dcard").length);
assert($('.mcol[data-level="6"]').textContent.indexOf("Merge a PR to main") !== -1, "merge sits at people level 6");
assert($('.lbar[data-level="4"] .lbar__n').textContent === "3", "3 rows at agent level 4");
// Regression: a long unbroken board name wraps instead of widening the page.
var keepPrompt = window.prompt, presetName = D.state().board.name;
window.prompt = function () { return "B".repeat(120); };
click("#rename-board");
assert($("#board-title").scrollWidth <= $("#board-title").clientWidth + 1, "long board name wraps");
window.prompt = function () { return presetName; };
click("#rename-board");
window.prompt = keepPrompt;

// 2. Change a row's agent level in the table view.
click('.view-tabs button[data-view="table"]');
await sleep(30);
// Regression: the sr-only "Actions" header must be contained by the scroll box, or it widens the page on phones.
assert($("#rows-table .sr-only").offsetParent === $("#view"), "table's sr-only header is positioned inside #view");
function tr(text) {
  var hit = $$("#rows-table tbody tr").filter(function (t) { return t.querySelector("input").value === text; })[0];
  if (!hit) throw new Error("no row " + text);
  return hit;
}
function rowSel(text, dim) { return tr(text).querySelector('select[data-fkey^="' + dim + '-"]'); }
type(rowSel("Refactor within a single module", "agent"), "4");
await sleep(40);
assert($('.lbar[data-level="4"] .lbar__n').textContent === "4", "now 4 rows at agent level 4");
assert($('.lbar[data-level="3"] .lbar__n').textContent === "2", "now 2 rows at agent level 3");

// 3. Poker round with 3 participants, people spread of 4.
click(tr("Change the sprint goal").querySelector('button[data-fkey^="poker-"]'));
await sleep(40);
var picks = [["Zorblax", 2, 1], ["Quuxine", 4, 1], ["", 6, 2]];
for (var i = 0; i < picks.length; i++) {
  type("#poker-name", picks[i][0]);
  click("input[name='poker-people'][value='" + picks[i][1] + "']");
  click("input[name='poker-agent'][value='" + picks[i][2] + "']");
  click("#poker-lock");
  await sleep(40);
}
assert($$("#poker-voters .voter__hidden").length === 3, "three hidden picks");
assert($$("#poker-voters .voter__hidden").every(function (n) { return n.textContent === "•••"; }), "picks masked");
assert($("#poker-voters").textContent.indexOf("Participant 3") !== -1, "default nickname");
click("#poker-reveal");
await sleep(60);
var dis = $$("#poker-dialog .disagree");
assert(dis.length === 1 && dis[0].textContent.indexOf("you disagree") !== -1, "disagreement signal on people only");
var ps = $("#dist-people-stats").textContent;
assert(ps.indexOf("Min 2") !== -1 && ps.indexOf("max 6") !== -1 && ps.indexOf("spread 4") !== -1, "people stats: " + ps);
assert($("#dist-agent-stats").textContent.indexOf("spread 1") !== -1, "agent spread 1");
assert($("#agreed-people").value === "4", "median prefilled");
type("#agreed-agent", "1");
click("#poker-agree");
await sleep(60);
var stored = Store.read("delegation", "boards", []);
var sg = stored[0].rows.filter(function (r) { return r.decision === "Change the sprint goal"; })[0];
assert(sg.people === 4 && sg.agent === 1, "agreed levels saved");
assert(sg.poker.votes === 3 && sg.poker.people.join(",") === "0,1,0,1,0,1,0", "anonymous counts saved");
var dump = JSON.stringify(stored);
assert(dump.indexOf("Zorblax") === -1 && dump.indexOf("Quuxine") === -1 && dump.indexOf("Participant 3") === -1, "no nicknames stored");
assert(!document.getElementById("poker-dialog") || !document.getElementById("poker-dialog").open, "poker closed");

// 4. AGENTS.md export, decisions under the right headings.
await sleep(20);
click("#export-agents");
await sleep(30);
var md = $("#export-text").value;
function section(text, title) {
  var start = text.indexOf("### " + title);
  assert(start !== -1, "heading " + title);
  var next = text.indexOf("\n### ", start + 4);
  return text.slice(start, next === -1 ? text.length : next);
}
var auto = section(md, "You may do without asking");
assert(auto.indexOf("Refactor within a single module") !== -1, "refactor moved to without asking");
assert(auto.indexOf("Write or update tests") !== -1, "tests without asking");
assert(section(md, "Do it, but open it for human review").indexOf("Merge a PR to main") !== -1, "merge under review");
assert(section(md, "Propose only; wait for explicit approval").indexOf("Change the sprint goal") !== -1, "sprint goal propose only");
assert(section(md, "Never do").indexOf("Rotate secrets / change IAM") !== -1, "IAM never");
assert(auto.indexOf("Guardrails: Only test files change") !== -1, "guardrails in bullet");
// Regression: a section meant to sit under the Working Agreements AGENTS.md, imperative and free of filler.
assert(md.indexOf("## Autonomy and approvals") === 0 && !/^# /m.test(md), "AGENTS.md section is a level-2 subsection");
assert(md.indexOf("no other rule in this file covers") !== -1, "fallback rule scoped to the whole file");
assert(md.indexOf("Not applicable") === -1, "no 'Stop and tell a human if: Not applicable'");
assert(/Write or update tests[^\n]*tell the owner what you did/.test(md), "level 4 tells the agent to notify");
assert(!/Write or update tests[^\n]*tell the owner/.test(section(md, "Do it, but open it for human review")), "notify only on level 4");
$("#export-dialog").close();
await sleep(30);

// 5. Deploy to production at level 5: no warning while guardrails exist, warning once emptied.
assert($$(".risky-warning").length === 0, "no risk warning on preset");
type(rowSel("Deploy to production", "agent"), "5");
await sleep(40);
assert($$(".risky-warning").length === 0, "guardrails present, no warning yet");
var editBtn = tr("Deploy to production").querySelector('button[data-fkey^="edit-"]');
var editKey = editBtn.dataset.fkey;
editBtn.focus();
click(editBtn);
await sleep(30);
type("#rd-guardrails", "");
await sleep(300); // the debounced re-render replaces the opener behind the dialog
click("#rd-done");
await sleep(60);
assert(document.activeElement && document.activeElement.dataset.fkey === editKey, "focus returns to the row's Edit button, got " + document.activeElement.tagName);
var w = $$(".risky-warning");
assert(w.length === 1 && w[0].textContent.indexOf("Deploy to production") !== -1, "irreversible without guardrails warning");
assert(tr("Deploy to production").textContent.indexOf("No guardrails") !== -1, "row tag");
assert(/Deploy to production[^\n]*open it for human review instead/.test(D.toAgentsMd(D.state().board)), "risky row without guardrails falls back to review in AGENTS.md");

// 6. Review due indicator.
type(tr("Merge a PR to main").querySelector('input[type="date"]'), "2020-01-01");
await sleep(30);
assert(tr("Merge a PR to main").querySelector(".review-due"), "review due tag");
assert($("#warnings").textContent.indexOf("Review due") !== -1, "review due warning");

// 7. Markdown matrix.
click("#export-md");
await sleep(30);
var mx = $("#export-text").value;
assert(mx.indexOf("| Decision | Category | People level | Agent level |") !== -1, "md table");
assert(mx.indexOf("| Deploy to production | Release | 5 Advise | 5 Autonomous within guardrails (no approval) |") !== -1, "deploy row");
assert(mx.indexOf("3 votes") !== -1 && mx.indexOf("WARNING") !== -1, "poker + warning in md");
$("#export-dialog").close();
await sleep(30);

// 8. JSON round trip and bad imports.
var payload = JSON.parse(JSON.stringify(D.exportJSONPayload(D.state().board)));
assert(D.importPayload(payload) === 1, "import ok");
await sleep(30);
assert(D.state().boards.length === 2, "two boards");
var imp = D.state().board;
assert(imp.rows.length === 11 && /\(imported\)$/.test(imp.name), "imported board");
assert(imp.rows.filter(function (r) { return r.decision === "Change the sprint goal"; })[0].poker.votes === 3, "poker summary round-trips");
assert(D.importPayload({ foo: 1 }) === 0, "bad shape rejected");
assert(D.importPayload({ tool: "retro", board: { rows: [] } }) === 0, "other tool rejected");
assert(D.importPayload("nope") === 0, "string rejected");
assert($$(".toast").some(function (t) { return t.textContent.indexOf("not a delegation board") !== -1; }), "clear toast");
assert(D.state().boards.length === 2, "still two boards");
return "ok";
