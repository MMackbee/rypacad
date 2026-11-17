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
 *
 * Reads of one identity can land out of order (review 2026-11-17): one that
 * started before a write can resolve after the read the write triggered.
 * Each read's ticket carries its place in line, and a key keeps the latest
 * place that wrote or dropped it, so an older read never puts the
 * pre-write value back, nor drops the newer one when it fails.
 */
const MAX_ENTRIES = 60;
const MAX_FLOORS = MAX_ENTRIES * 4;

let scope = null;
let epoch = 0;
let reads = 0;
const entries = new Map();
const floors = new Map(); // key -> the latest read (ticket.n) that wrote or dropped it

/** The signed-in uid (null signed out). A change empties the cache. */
export function setCacheScope(uid) {
  const next = uid || null;
  if (next === scope) return;
  scope = next;
  epoch += 1;
  entries.clear();
  floors.clear();
}

/** Taken when a read starts; its result is dropped if the scope moved since or a later read of the key landed first. */
export function cacheTicket() {
  return scope == null ? null : { scope, epoch, n: ++reads };
}

/** Whether this ticket's read may still write or drop `key` - and if so, it is now the key's latest. */
function claim(key, ticket) {
  if (!ticket || ticket.scope !== scope || ticket.epoch !== epoch) return false;
  if ((floors.get(key) || 0) > ticket.n) return false;
  floors.delete(key);
  floors.set(key, ticket.n);
  if (floors.size > MAX_FLOORS) floors.delete(floors.keys().next().value);
  return true;
}

/** `{ data }` for this identity, or undefined (none, or signed out). */
export function readCached(key) {
  return scope == null ? undefined : entries.get(key);
}

export function writeCached(key, data, ticket) {
  if (!claim(key, ticket)) return;
  entries.delete(key);
  entries.set(key, { data });
  if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
}

/** A failed read: its key's value goes, unless a later read of it already landed. */
export function dropCached(key, ticket = null) {
  if (ticket && !claim(key, ticket)) return;
  entries.delete(key);
}
