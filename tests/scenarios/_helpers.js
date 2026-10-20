// Shared by every scenario. Evaluated inside the page, before the scenario body.
// Scenarios drive the UI the way a person would: type, click, then assert.
// Each scenario starts from empty storage for its own namespace.
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var $ = function (sel) {
  var n = document.querySelector(sel);
  if (!n) throw new Error("not found: " + sel);
  return n;
};
var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
var assert = function (cond, msg) { if (!cond) throw new Error("assert: " + msg); };
var type = function (sel, value) {
  var n = typeof sel === "string" ? $(sel) : sel;
  n.focus();
  n.value = value;
  n.dispatchEvent(new Event("input", { bubbles: true }));
  n.dispatchEvent(new Event("change", { bubbles: true }));
};
var click = function (sel) { (typeof sel === "string" ? $(sel) : sel).click(); };
var byText = function (sel, text) {
  var hit = $$(sel).filter(function (n) { return n.textContent.trim().indexOf(text) !== -1; })[0];
  if (!hit) throw new Error("no " + sel + " containing: " + text);
  return hit;
};
// Silence confirm() so destructive actions can be scripted.
window.confirm = function () { return true; };
window.prompt = function (msg, def) { return def || "Scenario"; };
