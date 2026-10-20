// Capacity: sprint dates + holidays, two people, three past sprints, forecast.
Store.keys("capacity").forEach(function (k) { Store.remove("capacity", k); });

type("#sprint-name", "Scenario sprint 7");
type("#sprint-start", "2026-11-02");          // a Monday
await sleep(20);
type("#sprint-days", "14");
await sleep(20);
assert($("#sprint-summary").textContent.indexOf("10 working days") !== -1, "two weeks = 10 days: " + $("#sprint-summary").textContent);
assert($("#sprint-summary").textContent.indexOf(UI.prettyDate("2026-11-02")) === 0, "start date not shifted by UTC");
assert($("#sprint-summary").textContent.indexOf(UI.prettyDate("2026-11-15")) !== -1, "end date is day 14");

type("#holiday-date", "2026-11-02");
type("#holiday-name", "Bank holiday");
click("#add-holiday");
type("#holiday-date", "2026-11-07");          // a Saturday: changes nothing
click("#add-holiday");
await sleep(20);
assert($("#sprint-summary").textContent.indexOf("9 working days") !== -1, "holiday removes a day");
assert($$("#holidays .holiday-chip").length === 2, "two holiday chips");
assert(byText("#holidays .holiday-chip", "07").textContent.indexOf("⚠") !== -1, "weekend holiday flagged");

// Two people: 9d - 1 off = 8; half time = 4.5. Total 12.5.
while ($$("#people tbody button").length) { click($$("#people tbody button")[0]); await sleep(5); }
click("#add-person");
type($$("#people input[type=text]").slice(-1)[0], "Ana");
var nums = $$("#people tbody tr")[0].querySelectorAll("input[type=number]");
type(nums[0], "100"); await sleep(10);
nums = $$("#people tbody tr")[0].querySelectorAll("input[type=number]");
type(nums[1], "1"); await sleep(10);
nums = $$("#people tbody tr")[0].querySelectorAll("input[type=number]");
type(nums[2], "0"); await sleep(10);
click("#add-person");
type($$("#people input[type=text]").slice(-1)[0], "Bo");
nums = $$("#people tbody tr")[1].querySelectorAll("input[type=number]");
type(nums[0], "50"); await sleep(10);
nums = $$("#people tbody tr")[1].querySelectorAll("input[type=number]");
type(nums[2], ""); await sleep(10);       // empty input must not become NaN
var total = $$("#people tbody tr").slice(-1)[0].querySelectorAll("td")[4].textContent;
assert(total === "12.5", "total person-days 12.5, got " + total);
assert($("#capacity-stats").textContent.indexOf("NaN") === -1, "no NaN in stats");

// History: 2, 2.5 and 3 per person-day.
while ($$("#history tbody button").length) { click($$("#history tbody button")[0]); await sleep(5); }
[[20, 10], [25, 10], [30, 10]].forEach(function () { click("#add-history"); });
await sleep(10);
for (var i = 0; i < 3; i++) {
  var row = $$("#history tbody tr")[i].querySelectorAll("input[type=number]");
  type(row[0], String([20, 25, 30][i])); await sleep(10);
  row = $$("#history tbody tr")[i].querySelectorAll("input[type=number]");
  type(row[1], "10"); await sleep(10);
}
assert($("#history-count").textContent === "3 recorded", "three past sprints");

var bars = function () {
  var out = {};
  $$("#forecast-bars .fbar").forEach(function (b) {
    out[b.querySelector(".fbar__label").textContent.split(/[a-z]/)[0].trim()] = Number(b.querySelector(".fbar__val").textContent);
  });
  return out;
};
var v = bars();
assert(v["85%"] === 25 && v["50/50"] === 31, "bootstrap figures: " + JSON.stringify(v));
assert(v["85%"] <= v["50/50"], "85% <= 50%");

type("#method", "lognormal");
await sleep(20);
v = bars();
assert(v["85%"] <= v["50/50"] && v["50/50"] <= v["30%"], "lognormal ordering: " + JSON.stringify(v));
assert(v["85%"] > 15 && v["30%"] < 45, "lognormal plausible: " + JSON.stringify(v));

type("#target", "20");
await sleep(260);
assert(parseInt($("#target-prob").textContent, 10) >= 85, "20 is a comfortable commitment: " + $("#target-prob").textContent);

var md = null;
var real = UI.download;
UI.download = function (n, t) { md = t; };
click("#export-md");
UI.download = real;
assert(md.indexOf("# Capacity plan · Scenario sprint 7") === 0, "markdown title");
assert(md.indexOf("| Ana | 100% | 1 | 0% | 8.0 |") !== -1, "markdown person row: " + md);
assert(md.indexOf("2026-11-02 (Bank holiday)") !== -1, "markdown holidays");
assert(md.indexOf("NaN") === -1, "no NaN in markdown");

return "ok";
