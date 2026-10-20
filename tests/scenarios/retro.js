// Retro: new board in the Humans + Agents format, cards in two columns, edit,
// vote, group, action item, Markdown export.
Store.keys("retro").forEach(function (k) { Store.remove("retro", k); });

var enter = function (ta) {
  ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
};
var colCards = function (i) { return $$(".col")[i].querySelectorAll(".rcard"); };

click("#new-board");
await sleep(50);
var dlg = $("dialog[open]");
type(dlg.querySelector("input[type=text]"), "Scenario retro");
type(dlg.querySelector("select"), "agents");
click(byText("dialog[open] button", "Create"));
await sleep(50);

var heads = $$(".col__name").map(function (n) { return n.textContent; });
assert(heads.join("|") === "AI helped|AI cost us|Trust calibration|Try next", "agents columns: " + heads.join("|"));

var ta = $('textarea[data-composer="helped"]');
type(ta, "Agent drafted the migration\nTests generated in minutes");
enter(ta);
await sleep(30);
assert(document.activeElement === $('textarea[data-composer="helped"]'), "composer keeps focus after adding");
ta = $('textarea[data-composer="cost"]');
type(ta, "Review load doubled");
enter(ta);
await sleep(30);
assert(colCards(0).length === 2 && colCards(1).length === 1, "cards land in their columns");

// Escape must cancel an edit, not save it.
click(colCards(1)[0].querySelector(".rcard__text"));
await sleep(20);
var edit = colCards(1)[0].querySelector(".rcard__edit textarea");
edit.value = "should not stick";
edit.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await sleep(30);
assert(colCards(1)[0].querySelector(".rcard__text").textContent === "Review load doubled", "Escape cancels edit");

// Enter commits an edit.
click(colCards(1)[0].querySelector(".rcard__text"));
await sleep(20);
edit = colCards(1)[0].querySelector(".rcard__edit textarea");
edit.value = "Review load doubled <b>x</b>";
enter(edit);
await sleep(30);
assert(colCards(1)[0].querySelector(".rcard__text").textContent === "Review load doubled <b>x</b>", "edit saved as text");
assert(!document.querySelector(".rcard__text b"), "card text is not parsed as HTML");

click(byText(".phase-btn", "Vote"));
await sleep(30);
var plus = function (card) { return byText.call(null, ".rcard[data-id='" + card.dataset.id + "'] button", "+"); };
click(plus(colCards(0)[0]));
await sleep(20);
click(plus(colCards(0)[0]));
await sleep(20);
click(plus(colCards(1)[0]));
await sleep(20);
assert($("#votes-left").textContent === "0", "three dots spent");
assert(colCards(0)[0].querySelector(".rcard__votes .n").textContent === "2", "two votes shown");

// Grouping must not refund dots that stay counted on the group.
var src = colCards(0)[1];
var srcId = src.dataset.id;
click(byText(".rcard[data-id='" + srcId + "'] button", "⿻"));
await sleep(30);
click(byText("dialog[open] button", "Group"));
await sleep(30);
assert(colCards(0).length === 1, "grouped into one card");
assert(colCards(0)[0].querySelector(".rcard__votes .n").textContent === "2", "votes kept after grouping");
assert($("#votes-left").textContent === "0", "grouping does not refund dots");

click(byText(".phase-btn", "Discuss"));
await sleep(30);
click("#add-action");
await sleep(30);
var act = $("#actions .action-text");
assert(document.activeElement === act, "new action gets focus");
type(act, "Pair-review every agent PR for a sprint");
type("#actions .action-owner", "Team");
await sleep(400);

var md = null;
var realDownload = UI.download;
UI.download = function (name, text) { md = text; };
click("#export-md");
UI.download = realDownload;
assert(md && md.indexOf("# Scenario retro") === 0, "markdown title");
assert(md.indexOf("Format: Humans + Agents") !== -1, "markdown format");
assert(md.indexOf("## ⚡ AI helped") !== -1, "markdown column");
assert(md.indexOf("- **(2▲)** Agent drafted the migration") !== -1, "markdown card with votes: " + md);
assert(md.indexOf("  - Tests generated in minutes") !== -1, "markdown grouped child");
assert(md.indexOf("- [ ] Pair-review every agent PR for a sprint, owner **Team**") !== -1, "markdown action");
var created = Store.read("retro", "index", [])[0].createdAt;
assert(md.indexOf(UI.prettyDate(UI.isoDate(new Date(created)))) !== -1, "markdown date is the local date");

// JSON round-trip.
var json = null;
var realJSON = UI.downloadJSON;
UI.downloadJSON = function (name, obj) { json = JSON.parse(JSON.stringify(obj)); };
click("#export-json");
UI.downloadJSON = realJSON;
var realPick = UI.pickJSON;
UI.pickJSON = function (cb) { cb(json, "x.json"); };
click("#import-json");
UI.pickJSON = realPick;
await sleep(30);
assert($("#board-select").selectedOptions[0].textContent.indexOf("Scenario retro (imported)") === 0, "imported board opens");
assert($$(".rcard").length === 2, "imported cards");
assert($("#actions .action-text").value === "Pair-review every agent PR for a sprint", "imported action");

return "ok";
