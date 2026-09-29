/**
 * The three-line test runner every `*.test.js` in this folder shares:
 * `node portal/x.test.js`, first failure exits 1. No framework.
 */
'use strict';

const cases = [];
/**
 * @param {string} name The case.
 * @param {function()} fn The body.
 */
function test(name, fn) {
  cases.push({name, fn});
}
/** @return {!Promise<void>} Runs every case in order. */
async function run() {
  for (const c of cases) {
    try {
      await c.fn();
    } catch (err) {
      console.error(`  FAIL  ${c.name}\n${err && err.stack}`);
      process.exitCode = 1;
      return;
    }
    console.log(`  ok  ${c.name}`);
  }
  console.log(`\n${cases.length} passing`);
}
module.exports = {test, run};
