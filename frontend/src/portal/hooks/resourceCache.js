/*
 * The in-memory resource cache behind useSeedResource's `cacheKey` (F5,
 * speed work 2026-11-17): the last value each named resource resolved to,
 * keyed by its identity (the cacheKey plus its non-generation deps), so a
 * screen opened again paints at once while it re-reads.
 *
 * Memory only - nothing goes to IndexedDB or localStorage, so a reload or a
 * home-screen launch starts empty. It belongs to one signed-in uid (the
 * scope sessionStore.js sets from the auth listener): nothing is kept while
 * signed out, a scope change empties it, and a read that started under an
 * older scope never lands. Bounded: the oldest entries go past MAX_ENTRIES.
 */
const MAX_ENTRIES = 60;

let scope = null;
let epoch = 0;
const entries = new Map();

/** The signed-in uid (null signed out). A change empties the cache. */
export function setCacheScope(uid) {
  const next = uid || null;
  if (next === scope) return;
  scope = next;
  epoch += 1;
  entries.clear();
}

/** Taken when a read starts; writeCached drops the result if the scope moved since. */
export function cacheTicket() {
  return scope == null ? null : { scope, epoch };
}

/** `{ data }` for this identity, or undefined (none, or signed out). */
export function readCached(key) {
  return scope == null ? undefined : entries.get(key);
}

export function writeCached(key, data, ticket) {
  if (!ticket || ticket.scope !== scope || ticket.epoch !== epoch) return;
  entries.delete(key);
  entries.set(key, { data });
  if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
}

export function dropCached(key) {
  entries.delete(key);
}
