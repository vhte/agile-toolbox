// Working Agreements: create, add an AI suggestion, Fist of Five fail then pass,
// AGENTS.md boundaries + test command, Markdown export excludes Proposed.
Store.keys("agreements").forEach(function (k) { Store.remove("agreements", k); });
var A = window.__agreements;

// Pure logic first, with numbers computed by hand.
var c1 = A.consent([0, 1, 0, 0, 4, 0], "no01");
assert(c1.checked && !c1.pass && c1.low === 1 && c1.total === 5, "one person at 1 fails no-0-or-1");
assert(Math.abs(c1.avg - 17 / 5) < 1e-9, "average 3.4");
assert(A.consent([0, 1, 0, 0, 4, 0], "avg3").pass === true, "same counts pass avg >= 3");
assert(A.consent([0, 0, 2, 2, 0, 0], "avg3").pass === false, "avg 2.5 fails avg rule");
assert(A.consent([0, 0, 0, 0, 0, 0], "no01").checked === false, "no votes, no check");
assert(A.addMonths("2026-11-30", 3) === "2027-02-28", "month end clamps");
assert(A.addMonths("2026-01-15", 3) === "2026-04-15", "plain +3 months");
var bad = null;
try { A.parseImport({ hello: 1 }); } catch (e) { bad = e.message; }
assert(bad && /not|no list/i.test(bad), "malformed import throws a readable error");
bad = null;
try { A.parseImport({ items: [{ nope: 1 }] }); } catch (e) { bad = e.message; }
assert(bad && /Item 1/.test(bad), "item without text rejected");

// 1. Create a new agreement via the UI.
click("#new-doc");
await sleep(50);
assert(!$("#tool").classList.contains("hidden"), "tool visible after creating");
type("#team", "Scenario Team");
type("#purpose", "We ship the scenario.");
assert($("#doc-heading").textContent === "Scenario Team", "heading follows team name");
// Regression: a long unbroken team name wraps instead of widening the page.
type("#team", "T".repeat(120));
assert($("#doc-heading").scrollWidth <= $("#doc-heading").clientWidth + 1, "long team name wraps");
type("#team", "Scenario Team");
assert(A.current().nextReview === A.addMonths(A.current().reviewed, 3), "next review defaults to +3 months");
assert($("#review-due").classList.contains("hidden"), "fresh agreement is not due");

// 2. Add a suggested item from AI use & agents.
var SECRET = "Never paste secrets, credentials, customer data or personal data into a prompt.";
click(byText("#sec-ai .suggestion", "Never paste secrets"));
await sleep(30);
var item = $$("#sec-ai .item").filter(function (n) { return n.querySelector("textarea").value === SECRET; })[0];
assert(item, "AI suggestion added as an item");
assert(item.querySelector("select").value === "Proposed", "new item starts Proposed");
assert($$("#sec-ai .suggestion").every(function (b) { return b.textContent.indexOf("Never paste secrets") === -1; }), "added suggestion leaves the library");

// 3. Fist of Five that fails the default rule: four at 4, one at 1.
click(byText("#sec-ai .item .btn", "Fist of Five"));
item = $("#sec-ai .item");
function plus(n) { click(item.querySelector('.fist__cell[data-fingers="' + n + '"] [data-act="plus"]')); }
function minus(n) { click(item.querySelector('.fist__cell[data-fingers="' + n + '"] [data-act="minus"]')); }
plus(4); plus(4); plus(4); plus(4); plus(1);
assert(item.textContent.indexOf("Needs discussion") !== -1, "fails rule: Needs discussion");
assert(item.textContent.indexOf("what would make it a 3 for you?") !== -1, "prompt shown");
assert(item.querySelector("select").value === "Proposed", "still Proposed");
assert(/5 people, average 3\.4, 1 at 0 or 1/.test(item.textContent), "result line shows counts");
assert($("#summary").textContent.indexOf("1 need discussion") !== -1, "summary counts discussion");

// Then counts that pass: the 1 becomes a 3.
minus(1); plus(3);
assert(item.querySelector("select").value === "Agreed", "passes: Agreed");
assert(item.textContent.indexOf("Needs discussion") === -1, "discussion tag gone");
assert(JSON.stringify(A.current().items[0].votes) === "[0,0,0,1,4,0]", "only counts stored");

// A Proposed item that must stay out of the default export.
type("#own-meetings", "Scenario proposed rule");
click(byText("#sec-meetings .btn", "Add"));
await sleep(20);
assert($("#sec-meetings").textContent.indexOf("0 of 1 agreed") !== -1, "meetings tag updated");

// Regression: status follows the counts both ways, never Agreed with no votes, Dropped stays Dropped.
var mItem = $("#sec-meetings .item");
var mSel = mItem.querySelector("select");
function mPlus(n) { click(mItem.querySelector('.fist__cell[data-fingers="' + n + '"] [data-act="plus"]')); }
function mMinus(n) { click(mItem.querySelector('.fist__cell[data-fingers="' + n + '"] [data-act="minus"]')); }
click(byText("#sec-meetings .item .btn", "Fist of Five"));
mPlus(5);
assert(mSel.value === "Agreed", "one 5 agrees");
mMinus(5); mMinus(5);
assert(mSel.value === "Proposed" && /No consent check yet/.test(mItem.textContent), "back to zero votes: Proposed, not Agreed");
assert(mItem.querySelector(".fist__count").textContent === "0" && A.current().items[1].votes.every(function (n) { return n === 0; }), "counts never negative");
for (var k = 0; k < 19; k++) mPlus(3);
mPlus(2);
assert(/20 people, average 2\.9\b/.test(mItem.textContent), "average 2.95 is shown as 2.9, not rounded up to 3.0");
click(byText("#sec-meetings .item .btn", "Clear counts"));
assert(mSel.value === "Proposed" && A.current().items[1].votes === null, "clearing counts drops an Agreed that rested on them");
mSel.value = "Dropped"; mSel.dispatchEvent(new Event("change"));
mPlus(4);
assert(mSel.value === "Dropped" && A.current().items[1].status === "Dropped", "voting does not revive a Dropped item");
mSel.value = "Proposed"; mSel.dispatchEvent(new Event("change"));
click(byText("#sec-meetings .item .btn", "Clear counts"));
assert(A.current().items[1].status === "Proposed" && A.current().items[1].votes === null, "meetings item reset");

// 4. AGENTS.md tab: test command and boundaries.
click("#tab-agents");
assert(!$("#panel-agents").classList.contains("hidden"), "agents panel open");
assert($("#ag-never").value.indexOf(SECRET) !== -1, "Never boundary pre-filled from agreed AI item");
type("#ag-test", "npm test -- --ci");
var md = $("#ag-preview").textContent;
var bIdx = md.indexOf("## Boundaries");
assert(bIdx !== -1, "preview has ## Boundaries");
assert(md.indexOf("### Never", bIdx) !== -1 && md.indexOf(SECRET, bIdx) > bIdx, "agreed AI item under Boundaries");
assert(/```sh\nnpm test -- --ci\n```/.test(md), "test command inside a code block");
assert(md.indexOf("## Testing instructions") !== -1, "testing heading");
assert($("#ag-delegation-hint").textContent.indexOf("## Autonomy and approvals") !== -1, "builder points to the Delegation Board section");

// 5. Export the team agreement: Proposed excluded by default.
click("#tab-export");
var out = $("#md-preview").textContent;
assert(out.indexOf("# Working agreement: Scenario Team") === 0, "markdown title");
assert(out.indexOf(SECRET) !== -1, "agreed item exported");
assert(out.indexOf("Scenario proposed rule") === -1, "proposed excluded by default");
assert(out.indexOf("## Meetings") === -1, "section with only proposed items skipped");
click("#include-proposed");
assert($("#md-preview").textContent.indexOf("Scenario proposed rule _(proposed)_") !== -1, "toggle includes proposed");

// JSON round trip of what the UI holds.
var round = A.parseImport(JSON.parse(JSON.stringify(A.exportPayload(A.current()))));
assert(round.items.length === 2 && round.items[0].status === "Agreed" && round.agents.test === "npm test -- --ci", "JSON round trip");
assert(A.toMarkdown(round, false) === A.toMarkdown(A.current(), false), "round trip markdown identical");
// Regression: multi-line items stay one boundary bullet; imported ids are unique and selector-safe.
var ml = A.parseImport({ items: [{ section: "ai", text: "Line one\nline two", status: "Agreed", bucket: "always" }] });
assert(A.toAgentsMd(ml).indexOf("- Line one line two\n") !== -1, "multi-line item is one bullet");
var dupe = A.parseImport({ items: [{ id: "x", text: "a" }, { id: "x", text: "b" }, { id: "a'b c", text: "c" }] });
assert(dupe.items[0].id === "x" && dupe.items[1].id !== "x" && /^[\w-]+$/.test(dupe.items[2].id), "duplicate and unsafe ids replaced");

// 6. Load the example: every status present, AGENTS.md filled, review due.
click("#tab-agreement");
click("#load-example");
await sleep(30);
assert($("#doc-heading").textContent === "Checkout Squad", "example selected");
assert(!$("#review-due").classList.contains("hidden"), "example shows Review due");
var sum = $("#summary").textContent;
assert(/\d+ agreed/.test(sum) && /[1-9]\d* proposed/.test(sum) && /[1-9] dropped/.test(sum) && /need discussion/.test(sum), "all statuses in example");
click("#tab-agents");
assert($("#ag-preview").textContent.indexOf("pnpm test") !== -1, "example AGENTS.md filled");
assert($$("#doc-select option").length === 2, "two agreements");

// Delete both: empty state comes back.
click("#delete-doc"); click("#delete-doc");
assert(!$("#empty").classList.contains("hidden"), "empty state after deleting the last");
click("#empty-example");
assert($("#doc-heading").textContent === "Checkout Squad", "empty-state example works");
click("#tab-agreement");
return "ok";
