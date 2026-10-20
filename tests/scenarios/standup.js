// Standup: roster of three, reshuffle, start, advance, blocker, finish, digest, trend.
Store.keys("standup").forEach(function (k) { Store.remove("standup", k); });

// Empty the seeded roster, then add three people.
while ($$("#roster button").length) { click($$("#roster button")[0]); await sleep(5); }
["Ana", "Bo", "Cy"].forEach(function (name) {
  click("#add-member");
  type($$("#roster input[type=text]").slice(-1)[0], name);
});
assert($$("#roster input[type=text]").length === 3, "three people on the roster");

// The order drawn by Reshuffle is the one the standup uses.
click("#btn-reshuffle");
await sleep(20);
var preview = $$("#queue .queue__item .flex-1").map(function (n) { return n.textContent; });
assert(preview.length === 3, "preview lists three: " + preview.join(","));
click("#btn-start");
await sleep(20);
var live = $$("#queue .queue__item .flex-1").map(function (n) { return n.textContent; });
assert(live.join(",") === preview.join(","), "start keeps the reshuffled order: " + preview + " vs " + live);
assert($("#speaker-name").textContent === preview[0], "first speaker shown");
assert($("#speaker-position").textContent === "Speaker 1 of 3", "position");

click("#btn-next");
await sleep(20);
assert($("#speaker-name").textContent === preview[1], "advanced to second speaker");

click("#add-blocker");
await sleep(20);
var opts = $$("#blockers select option").map(function (o) { return o.value; });
assert(opts.indexOf("Waiting on review") !== -1 && opts.indexOf("Waiting on AI/agent output") !== -1, "new categories offered");
assert(opts.indexOf("Dependency on another team") !== -1, "old categories kept");
type("#blockers select", "Waiting on AI/agent output");
type("#blockers input[type=text]", "Agent PR still generating");
// Finish straight away, with no pause after typing.
click("#btn-next");
await sleep(10);
click("#btn-next");
await sleep(20);
assert($("#speaker-name").textContent === "Standup closed", "standup closed");
var digest = $("#digest").textContent;
assert(digest.indexOf("- **[Waiting on AI/agent output]** Agent PR still generating") !== -1, "digest has blocker: " + digest);
assert(digest.indexOf("3 participants") !== -1, "digest participants");

var saved = Store.read("standup", "sessions", []);
assert(saved.length === 1 && saved[0].blockers[0].text === "Agent PR still generating", "blocker text persisted");
assert(!("spent" in saved[0]), "no per-person timings stored");

// Older history with a retired category still renders in the trend.
var teamId = saved[0].teamId;
var realPick = UI.pickJSON;
UI.pickJSON = function (cb) {
  cb({ sessions: [{ id: "old-1", teamId: teamId, date: saved[0].date, participants: 4, totalSec: 600,
    blockers: [{ text: "Old style blocker", category: "Legacy category", resolved: false }] }] });
};
click("#import-sessions");
UI.pickJSON = realPick;
click(byText("#mode-tabs .mode-tab", "Trend"));
await sleep(20);
var rows = $$("#heatmap tbody th").map(function (n) { return n.textContent; });
assert(rows.indexOf("Waiting on AI/agent output") !== -1, "new category in heatmap: " + rows);
assert(rows.indexOf("Legacy category") !== -1, "legacy category in heatmap: " + rows);
assert($$("#sessions tbody tr").length === 2, "two sessions in history");
click(byText("#mode-tabs .mode-tab", "Live"));

return "ok";
