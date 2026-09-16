/**
 * Shared Firestore REST helpers for the sanctioned-writer scripts (contract
 * v2.1, Sprint 13) — extracted so scripts/sweep-waitlist.mjs and
 * scripts/export-memberships.mjs don't each reimplement encode/decode/query/
 * commit a third and fourth time (seed-firestore.mjs and
 * sync-calendar-sessions.mjs keep their own pre-existing inline copies
 * unchanged — not this pass's job to refactor working, already-shipped
 * scripts). Dependency-free (Node >= 20 global fetch), same REST surface
 * every other script in this repo already talks to.
 */

import { prodAccessToken } from './prod-auth.mjs';

export const PROJECT_ID = 'rypacad';

export const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

/**
 * Reads FIRESTORE_EMULATOR_HOST and validates it is local — the same posture
 * every writer script in this repo takes, so none of them can be pointed at
 * a remote Firestore by accident.
 */
export function localEmulatorHost({ required }) {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) {
    if (!required) return null;
    console.error(
      'FIRESTORE_EMULATOR_HOST is not set.\n' +
        'This script only reads/writes the Firestore emulator, never production, unless --prod is passed.\n' +
        'Start the emulator (npm run emulator) and set the variable, or pass --prod.'
    );
    process.exit(1);
  }
  const name = host.replace(/:\d+$/, '');
  if (!LOCAL_HOSTS.has(name)) {
    console.error(
      `Refusing to run: FIRESTORE_EMULATOR_HOST="${host}" is not a local address.\n` +
        'This script never touches a remote Firestore without --prod.'
    );
    process.exit(1);
  }
  return host;
}

/**
 * Resolves a { label, base, auth } target: production (IAM, via
 * prod-auth.mjs) when `prod` is true, else the local emulator.
 * @param {object} opts
 * @param {boolean} opts.prod
 * @param {boolean} [opts.requireEmulatorHost] false lets a caller read
 *   nothing (target stays null) when neither --prod nor the emulator host is
 *   set — callers that need SOME target should leave this true (the default).
 */
export async function resolveTarget({ prod, requireEmulatorHost = true }) {
  if (prod) {
    return {
      label: `production (project ${PROJECT_ID})`,
      base: 'https://firestore.googleapis.com/v1',
      auth: `Bearer ${await prodAccessToken()}`,
    };
  }
  const host = localEmulatorHost({ required: requireEmulatorHost });
  if (!host) return null;
  return { label: `emulator at ${host}`, base: `http://${host}/v1`, auth: 'Bearer owner' };
}

// ---------------------------------------------------------------------------
// Encode / decode — identical shape to seed-firestore.mjs / sync-calendar-
// sessions.mjs's own inline copies.
// ---------------------------------------------------------------------------

export function fsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsValue) } };
  if (typeof v === 'object') return { mapValue: { fields: fsFields(v) } };
  throw new Error(`Unsupported value type: ${typeof v}`);
}

export function fsFields(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fsValue(v)]));
}

export function fsDecode(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('nullValue' in v) out[k] = null;
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('doubleValue' in v) out[k] = v.doubleValue;
    else if ('stringValue' in v) out[k] = v.stringValue;
    else if ('timestampValue' in v) out[k] = v.timestampValue;
    else if ('mapValue' in v) out[k] = fsDecode(v.mapValue.fields || {});
    else if ('arrayValue' in v) out[k] = (v.arrayValue.values || []).map((x) => fsDecode({ _: x })._);
    else out[k] = v;
  }
  return out;
}

export function docName(collection, id) {
  return `projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${id}`;
}

// ---------------------------------------------------------------------------
// Query / commit
// ---------------------------------------------------------------------------

/** Raw runQuery against a target; returns the decoded [{ id, ...fields }] rows
 * (documents only — skipped/empty query-progress rows are filtered out). */
export async function queryCollection(target, structuredQuery) {
  const url = `${target.base}/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: target.auth },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) throw new Error(`Query against ${target.label} failed (${res.status}): ${await res.text()}`);
  const rows = await res.json();
  const out = [];
  for (const row of rows) {
    if (!row.document) continue;
    const id = row.document.name.split('/').pop();
    out.push({ id, ...fsDecode(row.document.fields) });
  }
  return out;
}

/** Equality-filter convenience: `collectionId` where `field == value`. */
export function eqFilter(field, value) {
  return { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: fsValue(value) } };
}

/** Comparison-filter convenience (LESS_THAN / GREATER_THAN_OR_EQUAL / ...). */
export function cmpFilter(field, op, value) {
  return { fieldFilter: { field: { fieldPath: field }, op, value: fsValue(value) } };
}

export function andFilter(...filters) {
  const list = filters.filter(Boolean);
  if (list.length === 1) return list[0];
  return { compositeFilter: { op: 'AND', filters: list } };
}

export async function getDoc(target, collection, id) {
  const url = `${target.base}/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${id}`;
  const res = await fetch(url, { headers: { Authorization: target.auth } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Get ${collection}/${id} against ${target.label} failed (${res.status}): ${await res.text()}`);
  const body = await res.json();
  return fsDecode(body.fields || {});
}

export async function commit(target, writes) {
  const url = `${target.base}/projects/${PROJECT_ID}/databases/(default)/documents:commit`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: target.auth },
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) throw new Error(`Commit against ${target.label} failed (${res.status}): ${await res.text()}`);
}

/** Commits in batches of <=400 (Firestore's commit limit is 500 writes). */
export async function commitInBatches(target, writes, { batchSize = 400, onProgress } = {}) {
  for (let i = 0; i < writes.length; i += batchSize) {
    const slice = writes.slice(i, i + batchSize);
    await commit(target, slice);
    onProgress?.(Math.min(i + batchSize, writes.length), writes.length);
  }
}
