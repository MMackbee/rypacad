/**
 * Calendly webhook signatures (spec 6.2, contract 6.3): header
 * `Calendly-Webhook-Signature: t=<unix>,v1=<hex>`, HMAC-SHA256 over
 * `t + '.' + rawBody` with the subscription's signing key. Pure; the clock
 * is injectable. Constant-time compare.
 */
'use strict';

const crypto = require('node:crypto');

/** Reject a `t` this far from now, in seconds. @const {number} */
const TOLERANCE_S = 300;
const HEX64 = /^[0-9a-f]{64}$/;

/**
 * @param {Buffer|string} rawBody The request body exactly as received.
 * @param {?string} header The `Calendly-Webhook-Signature` value.
 * @param {string} signingKey The subscription's signing key.
 * @param {number=} nowMs The clock; default `Date.now()`.
 * @return {{ok: boolean, reason: ?string}} `reason` is null when ok, else
 *     `'missing' | 'malformed' | 'stale' | 'mismatch'`.
 */
function verifyCalendlySignature(rawBody, header, signingKey, nowMs) {
  if (!header) return {ok: false, reason: 'missing'};
  const parts = {};
  for (const kv of String(header).split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  const t = Number(parts.t);
  const v1 = String(parts.v1 || '').toLowerCase();
  if (!Number.isInteger(t) || !HEX64.test(v1)) {
    return {ok: false, reason: 'malformed'};
  }
  const now = nowMs === undefined ? Date.now() : nowMs;
  if (Math.abs(now / 1000 - t) > TOLERANCE_S) {
    return {ok: false, reason: 'stale'};
  }
  const body = Buffer.isBuffer(rawBody) ? rawBody :
      Buffer.from(String(rawBody), 'utf8');
  const expected = crypto.createHmac('sha256', String(signingKey))
      .update(`${t}.`).update(body).digest();
  const given = Buffer.from(v1, 'hex');
  if (expected.length !== given.length ||
      !crypto.timingSafeEqual(expected, given)) {
    return {ok: false, reason: 'mismatch'};
  }
  return {ok: true, reason: null};
}

module.exports = {TOLERANCE_S, verifyCalendlySignature};
