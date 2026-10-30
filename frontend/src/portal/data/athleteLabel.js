/**
 * How staff screens name an athlete whose record carries a first name only
 * (Yannick, 2026-10-30: two "Brooks", a "Lucas" beside "Lucas Rossow", a
 * "Sebastian" with no last name). PURE. The name itself is never changed
 * here; the family name is shown beside it so the rows tell apart.
 */

/** True when `name` is a single word (no inner whitespace). */
export function isFirstNameOnly(name) {
  const n = String(name || '').trim();
  return n.length > 0 && !/\s/.test(n);
}

/**
 * The household name to show beside `name`, or null: only for a
 * first-name-only athlete whose household has a name.
 */
export function familyHint(name, familyName) {
  const f = typeof familyName === 'string' ? familyName.trim() : '';
  return isFirstNameOnly(name) && f ? f : null;
}
