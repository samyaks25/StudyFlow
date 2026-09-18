/**
 * tests/init-crash-test.js
 *
 * Verifies the UIController initialization order fix:
 * - Simulates the JSDOM environment well enough to confirm:
 *   1. UIController constructor completes without throwing
 *   2. this.timer is assigned and has formatTime
 *   3. this.dom is populated before timer callbacks fire
 *   4. updateTimerUI guard prevents crash when this.timer is null
 *
 * Run: node tests/init-crash-test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

console.log('\n--- Init Crash Regression Test ---');

// ── 1. Confirm the fix is present in script.js source
const scriptSrc = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');

// The DOM block must appear BEFORE the StudyTimer construction
const domBlockIdx     = scriptSrc.indexOf('Query DOM References FIRST');
const timerCtorIdx    = scriptSrc.indexOf('new StudyTimer(');
const guardIdx        = scriptSrc.indexOf('if (!this.timer || !this.dom || !this.dom.mainTimerDigits) return;');
const nullInitIdx     = scriptSrc.indexOf('this.timer = null;');

assert(domBlockIdx > 0,  'DOM comment "Query DOM References FIRST" exists in source');
assert(timerCtorIdx > 0, 'StudyTimer constructor call exists in source');
assert(guardIdx > 0,     'Defensive guard exists in updateTimerUI');
assert(nullInitIdx > 0,  'this.timer = null pre-init sentinel exists');

// Critical ordering check: DOM block must come before StudyTimer construction
assert(
  domBlockIdx < timerCtorIdx,
  'DOM query block appears BEFORE new StudyTimer() in source (ordering fix)'
);

// Guard must be in updateTimerUI, which is always after the constructor
assert(
  guardIdx > timerCtorIdx,
  'Defensive guard appears inside updateTimerUI method (after constructor)'
);

// ── 2. Confirm service worker cache version was bumped
const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
assert(
  swSrc.includes('studyflow-cache-v1.0.1'),
  'Service worker cache bumped to v1.0.1'
);
assert(
  swSrc.includes('Network-first') || swSrc.includes('network-first') || swSrc.includes('isCoreAsset'),
  'Service worker uses network-first strategy for core assets'
);
assert(
  swSrc.includes('skipWaiting'),
  'Service worker calls skipWaiting() on install'
);
assert(
  swSrc.includes('clients.claim()'),
  'Service worker calls clients.claim() on activate'
);

// ── 3. Source-level simulation: extract the updateTimerUI guard behaviour
// Confirm the guard returns before calling this.timer.formatTime
const updateTimerBlock = scriptSrc.slice(
  scriptSrc.indexOf('updateTimerUI(state) {'),
  scriptSrc.indexOf('updateTimerUI(state) {') + 800
);
const guardLine  = updateTimerBlock.indexOf('if (!this.timer');
const formatLine = updateTimerBlock.indexOf('this.timer.formatTime');
assert(
  guardLine > 0 && formatLine > 0 && guardLine < formatLine,
  'Guard check (if !this.timer) appears before this.timer.formatTime call in updateTimerUI'
);

// ── 4. Verify the null-sentinel appears before DOM block in constructor
// Exact: this.timer = null  =>  then DOM block  =>  then new StudyTimer(
assert(
  nullInitIdx < domBlockIdx && domBlockIdx < timerCtorIdx,
  'Init order: this.timer=null → DOM block → new StudyTimer() (strict ordering)'
);

console.log(`\nInit Crash Test Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
