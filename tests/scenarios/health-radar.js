// Health radar: three codes unlock results with the right averages; a code made
// against the Humans + AI set is rejected by the Classic set and accepted by its own.
Store.keys("radar").forEach(function (k) { Store.remove("radar", k); });

var answer = async function (values) {
  click("#clear-answers");
  await sleep(10);
  var qs = $$("#questions .q");
  assert(qs.length === values.length, "expected " + values.length + " questions, got " + qs.length);
  for (var i = 0; i < values.length; i++) {
    var name = $$("#questions .q")[i].querySelector("input[type=radio]").name;
    var radio = $$("#questions input[type=radio]").filter(function (r) {
      return r.name === name && r.value === String(values[i]);
    })[0];
    radio.focus();
    radio.click();
    await sleep(10);
    assert(document.activeElement && document.activeElement.name === name &&
      document.activeElement.value === String(values[i]), "focus stays on the picked answer");
  }
  click("#make-code");
  return $("#code-out").textContent;
};

type("#question-set", "classic");
await sleep(10);
click(byText("#role-tabs .role-tab", "answering"));
await sleep(10);
assert($("#survey-progress").textContent === "0 of 8", "eight classic questions");
var a = await answer([5, 4, 3, 2, 1, 2, 3, 4]);
var b = await answer([3, 3, 3, 3, 3, 3, 3, 3]);
var c = await answer([4, 5, 3, 4, 5, 4, 3, 2]);
assert(/^ATBX-/.test(a) && a !== b && b !== c, "three distinct codes: " + [a, b, c].join(" "));

type("#question-set", "ai");
await sleep(10);
var names = $$("#questions .q__name").map(function (n) { return n.textContent; });
assert(names.length === 8 && names.indexOf("Clear AI stance") !== -1 && names.indexOf("Review load is sustainable") !== -1,
  "Humans + AI questions: " + names.join(", "));
var d = await answer([2, 2, 2, 2, 2, 2, 2, 2]);
assert(d.slice(0, 9) !== a.slice(0, 9), "set signature differs: " + d + " vs " + a);
type("#question-set", "classic");
await sleep(10);
assert($$("#questions .q__name")[1].textContent === "Delivery confidence", "back to classic");

click(byText("#role-tabs .role-tab", "facilitating"));
await sleep(10);
type("#codes-in", a + "\n" + b);
click("#add-codes");
await sleep(10);
assert($("#radar-n").textContent === "2 responses", "two in");
assert($("#readout .empty"), "results hidden below three");

type("#codes-in", d);
click("#add-codes");
await sleep(10);
assert($("#codes-in").value.indexOf("Humans + AI question set") !== -1, "AI code rejected with reason: " + $("#codes-in").value);
assert($("#radar-n").textContent === "2 responses", "rejected code not counted");

type("#codes-in", c);
click("#add-codes");
await sleep(10);
assert($("#radar-n").textContent === "3 responses", "three in");
assert(!document.querySelector("#readout .empty"), "results unlock at three");
var overall = $("#readout .stat__value").textContent;
assert(overall === "3.25", "overall mean 3.25, got " + overall);
var cells = $$("#trend-table tbody tr")[0].querySelectorAll("td");
assert(cells[1].textContent === "3", "n = 3");
assert(cells[2].textContent === "4.0" && cells[3].textContent === "4.0" && cells[9].textContent === "3.0",
  "per-dimension means: " + Array.prototype.map.call(cells, function (x) { return x.textContent; }).join(" "));

// The other set has its own rounds and accepts its own code.
type("#question-set", "ai");
await sleep(10);
assert($("#radar-n").textContent === "0 responses", "AI set starts with an empty round");
type("#codes-in", d);
click("#add-codes");
await sleep(10);
assert($("#radar-n").textContent === "1 response", "AI code accepted by its own set");
assert($("#codes-in").value === "", "nothing rejected");
type("#question-set", "classic");
await sleep(10);
assert($("#radar-n").textContent === "3 responses", "classic round untouched");

var md = null;
var real = UI.download;
UI.download = function (n, t) { md = t; };
click("#export-md");
UI.download = real;
assert(md.indexOf("# Team health radar · Classic") === 0, "markdown title");
assert(md.indexOf("| 3.25 |") !== -1 || md.indexOf("3.25") !== -1, "markdown overall");

click(byText("#role-tabs .role-tab", "answering"));
type("#question-set", "ai");   // leave the new set showing after the reload
return "ok";
