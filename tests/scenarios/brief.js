// Task Brief: write a vague agent brief, watch the checker fail it, fix it, export the agent prompt.
Store.keys("brief").forEach(function (k) { Store.remove("brief", k); });
window.__brief.reload();
await sleep(50);

assert(!$("#empty").classList.contains("hidden"), "empty state shows with no briefs");
assert($("#editor").classList.contains("hidden"), "editor hidden with no briefs");

// Pure logic: vague-word detection respects word boundaries.
var hits = window.__brief.findVague("Loads fast, is user-friendly and handles breakfast orders etc.");
assert(hits.indexOf("fast") !== -1 && hits.indexOf("user-friendly") !== -1 && hits.indexOf("etc") !== -1, "vague hits: " + hits.join(","));
assert(window.__brief.findVague("Responds within 2 seconds to a breakfast order").length === 0, "no false positive on breakfast");
assert(window.__brief.findVague("Book on Easyjet; toggle the fast_path flag").length === 0, "no false positive on Easyjet or fast_path");
var mlb = { title: "T", criteria: ["Given a user\nwhen they log in\nthen the page loads"], questions: ["who owns it"], dod: ["Docs\nupdated"] };
var mlMd = window.__brief.toMarkdown(mlb), mlPrompt = window.__brief.toPrompt(mlb);
assert(mlMd.indexOf("- [ ] Given a user when they log in then the page loads") !== -1, "multi-line criterion stays one checklist item");
assert(mlPrompt.indexOf("1. Given a user when they log in then the page loads") !== -1, "multi-line criterion stays one numbered item");
assert(mlPrompt.indexOf("undecided: who owns it. Ask before") !== -1, "stop rule punctuates the question");

// 1. New Feature brief via the UI, aimed at an AI agent, with a vague criterion and no verification.
click("#new-brief");
await sleep(30);
assert(!$("#editor").classList.contains("hidden"), "editor visible after New brief");
assert($("#f-type").value === "feature", "new brief defaults to Feature");
type("#f-title", "Search the team directory by skill");
type("#f-goal", "Engineers can find a colleague who knows a given technology without asking in the general channel.");
var acs = $$("#ac-list textarea");
assert(acs.length === 1, "new brief starts with one empty criterion row");
type(acs[0], "Given a signed-in user on the Directory page, when they type a skill, then matching profiles appear fast");
click("#add-ac");
await sleep(20);
acs = $$("#ac-list textarea");
assert(acs.length === 2, "second criterion row added");
type(acs[1], "Given no profile lists the skill, when the search runs, then the message No colleagues found is shown");
type("#f-executor", "agent");
await sleep(20);

assert($("#verdict strong").textContent === "Not ready", "verdict Not ready, got " + $("#verdict strong").textContent);
assert($("#verdict-pill").textContent === "Not ready", "pill mirrors verdict");
var vague = $("#checks [data-check=vague]");
assert(vague.dataset.status === "fail", "vague check fails for an agent");
assert(vague.textContent.indexOf("Criterion 1 uses “fast”") !== -1, "vague check names criterion 1 and the word fast: " + vague.textContent);
assert($("#checks [data-check=verify]").dataset.status === "fail", "verification fails for an agent");
assert($("#checks [data-check=outscope]").dataset.status === "fail", "missing out of scope fails for an agent");
var flags = $$("#ac-list .le-row")[0].querySelector(".le-flags").textContent;
assert(flags.indexOf("Vague: fast") !== -1, "criterion 1 carries a Vague: fast flag");
assert($$("#ac-list .le-row")[1].querySelector(".le-flags").textContent === "", "criterion 2 is clean");
assert(byText("#checks .chk", "Verification steps").querySelector(".chk__tags").textContent.indexOf("INVEST T") !== -1, "verification check tagged INVEST T");

// 2. Fix the criterion, add verification and out of scope: every check passes.
type($$("#ac-list textarea")[0], "Given a signed-in user on the Directory page, when they type a skill, then matching profiles appear within 500 ms");
type("#f-verification", "npm test -- directory-search\nManual: search for Kotlin and confirm the three seeded profiles appear");
type("#f-outscope", "Editing skills on profiles\nRanking or endorsements");
await sleep(20);
var failing = $$("#checks .chk").filter(function (n) { return n.dataset.status !== "pass"; }).map(function (n) { return n.dataset.check; });
assert(failing.length === 0, "all checks pass, not passing: " + failing.join(","));
assert($("#verdict strong").textContent === "Ready", "verdict Ready, got " + $("#verdict strong").textContent);
assert($("#verdict").textContent.indexOf("for an AI agent") !== -1, "verdict names the executor");
assert($$("#ac-list .le-flags")[0].textContent === "", "vague flag cleared");

// 3. Agent prompt export.
click("#tab-prompt");
await sleep(20);
assert($("#tab-prompt").getAttribute("aria-selected") === "true", "prompt tab selected");
var prompt = $("#export-preview").textContent;
assert(prompt.indexOf("## How to verify") !== -1, "prompt has How to verify");
assert(prompt.indexOf("npm test -- directory-search") !== -1, "prompt lists the verification command");
assert(prompt.indexOf("then matching profiles appear within 500 ms") !== -1, "prompt has criterion 1");
assert(prompt.indexOf("2. Given no profile lists the skill") !== -1, "prompt numbers criterion 2");
assert(prompt.indexOf("## Stop and ask if") !== -1 && prompt.indexOf("outside the listed scope") !== -1, "prompt has the scope stop rule");
assert(prompt.indexOf("## Out of scope\n- Editing skills on profiles") !== -1, "prompt lists out of scope");
assert(prompt.indexOf("You are") === -1 || prompt.indexOf("You are about to") !== -1, "prompt is role-free");

click("#tab-md");
await sleep(20);
var md = $("#export-preview").textContent;
assert(md.indexOf("# Search the team directory by skill") === 0, "markdown starts with the title");
assert(md.indexOf("- [ ] Given a signed-in user") !== -1, "criteria render as checklists");
assert(md.indexOf("**Readiness:** Ready") !== -1, "markdown carries the verdict");

// 4. Persistence: autosave lands, and a re-read from storage restores the same brief and verdict.
await sleep(600);
var saved = Store.read("brief", "briefs", []);
assert(saved.length === 1 && saved[0].executor === "agent", "one brief saved for an agent");
assert(saved[0].criteria[0].text.indexOf("within 500 ms") !== -1, "fixed criterion persisted");
window.__brief.reload();
await sleep(30);
assert($("#f-title").value === "Search the team directory by skill", "title restored after reload");
assert($("#verdict strong").textContent === "Ready", "verdict still Ready after reload");
assert(byText(".lib-item", "Search the team directory").textContent.indexOf("Ready") !== -1, "library tags it Ready");

// 5. Examples: one Ready feature, one Not ready bug, one Spike with warnings.
click("#load-example-lib");
await sleep(30);
assert($$(".lib-item").length === 4, "three examples added");
var ex = Store.read("brief", "briefs", []);
var verdicts = ex.map(function (b) { return b.title + "=" + window.__brief.analyze(b).verdict; });
assert(verdicts.indexOf("Export the audit log as CSV=Ready") !== -1, "feature example Ready: " + verdicts);
assert(verdicts.indexOf("Password reset emails not arriving=Not ready") !== -1, "bug example Not ready: " + verdicts);
assert(verdicts.indexOf("Choose a full-text search engine=Ready with warnings") !== -1, "spike example warns: " + verdicts);
click(byText(".lib-item", "Password reset emails"));
await sleep(30);
assert($("#checks [data-check=repro]").dataset.status === "fail", "bug without repro fails");
assert($("#checks [data-check=risk]").dataset.status === "warn", "High risk + agent warns");
assert($("#checks [data-check=vague]").textContent.indexOf("“quickly”") !== -1, "bug criteria flagged quickly");
assert(window.__brief.analyze({ title: "x", type: "spike", goal: "a b c d e f", criteria: ["Decide"], extra: { question: "q" } })
  .checks.filter(function (c) { return c.id === "timebox"; })[0].status === "fail", "spike without timebox fails");

// 6. Search, duplicate, delete.
type("#lib-search", "audit");
assert($$(".lib-item").length === 1, "search filters to one brief");
type("#lib-search", "");
click("#dup-brief");
await sleep(30);
assert($$(".lib-item").length === 5 && $("#f-title").value === "Password reset emails not arriving (copy)", "duplicated");
click("#del-brief");
await sleep(30);
assert($$(".lib-item").length === 4, "deleted the copy");

// 7. JSON round trip through the same import path the file picker uses.
var lib = JSON.parse(JSON.stringify(window.__brief.exportLibrary()));
assert(window.__brief.importPayload(lib) === 4, "library import adds four briefs");
assert($$(".lib-item").length === 8, "eight briefs after import");
assert(window.__brief.importPayload({ tool: "retro", items: [] }) === 0, "foreign file rejected");
assert(window.__brief.importPayload({ hello: 1 }) === 0, "malformed file rejected");
window.__brief.flush();
assert(Store.read("brief", "briefs", []).length === 8, "imports persisted");

// XSS: markup typed into fields renders as text everywhere.
var evil = "<img src=x onerror=alert(1)>";
click("#new-brief");
await sleep(30);
type("#f-title", evil);
type($$("#ac-list textarea")[0], evil);
click("#add-q");
await sleep(20);
type($$("#q-list input")[0], evil);
await sleep(400);
assert($$("#lib-list img, #export-preview img, #checks img, #editor img").length === 0, "no injected elements");
assert($("#export-preview").textContent.indexOf(evil) !== -1, "markup shown literally in the preview");
click("#del-brief");
await sleep(30);

return "ok";
