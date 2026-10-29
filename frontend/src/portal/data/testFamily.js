/**
 * Test households (owner, 2026-10-15). Staging - the Railway "Staging"
 * environment at rypacad.ryptest.com, built from develop - runs on the
 * PRODUCTION database, so the one test family the owner and Phil test with
 * (scripts/provision-test-family.mjs) sits beside real families, marked
 * `test: true` on the household and on each of its athletes. Every staff
 * count and report leaves it out; working lists (the assessments list, the
 * staff households directory) still show it by name, so it can be used.
 * PURE - no React, no Firebase.
 */

/** True only for a household marked `test: true`. */
export function isTestHousehold(household) {
  return household?.test === true;
}

/**
 * `{ households, athletes }` without the test households, their athletes
 * and any athlete marked `test: true` (the athlete's own mark covers a
 * caller whose household list is partial, like the sign-ups report's).
 */
export function withoutTestFamilies({ households = [], athletes = [] }) {
  const testIds = new Set(households.filter(isTestHousehold).map((h) => h.id));
  return {
    households: households.filter((h) => !isTestHousehold(h)),
    athletes: athletes.filter((a) => a?.test !== true && !testIds.has(a?.householdId)),
  };
}
