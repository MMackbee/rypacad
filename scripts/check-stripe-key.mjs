// Usage: node scripts/check-stripe-key.mjs [--coupon SIBLING10]   (asks for an rk_test_ key, hidden)
// Stripe TEST key check for the portal functions. Asks for the key (hidden),
// never prints it, refuses live keys. Part 1 reads the six catalogue prices.
// Part 2 rehearses every call the portal makes with this key, using the
// portal's own checkout builder: one test-mode Checkout Session is created,
// read back, then expired. Nothing is charged; no card is involved. With
// --coupon <id> it also rehearses the sibling discount (a session created
// with that coupon applied, then expired) and reports the coupon's terms.
import readline from 'node:readline';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkout = require(path.join(repoRoot, 'functions', 'portal', 'checkout.js'));
const PORTAL_URL = 'https://portal.rypacademy.com';
const couponArg = process.argv.indexOf('--coupon');
let COUPON = couponArg > -1 ? String(process.argv[couponArg + 1] || '').trim() : '';
const PRICES = [
  ['t-6', 'price_1UKkzSD16IMJzfAPSoZioKKA', 299, 6],
  ['t-12', 'price_1UKl1qD16IMJzfAPERVeoeaN', 569, 12],
  ['t-16', 'price_1UKl2XD16IMJzfAPQyEUFpbP', 719, 16],
  ['elite', 'price_1UKl5HD16IMJzfAPMyX25Aei', 999, null],
  ['single', 'price_1UKlCPD16IMJzfAPYPEI29ED', 65, 1],
  ['facility-access', 'price_1UKlG2D16IMJzfAPomCAirrw', 300, null],
];
const mask = (s) => String(s).replace(/\b(sk|rk)_(test|live)_[A-Za-z0-9*]+/g, '$1_$2_****');

function askHidden(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({input: process.stdin, output: process.stdout, terminal: true});
    let muted = false;
    rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); };
    rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); resolve(a.trim()); });
    muted = true;
  });
}

function form(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') form(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out.join('&');
}

const key = process.env.STRIPE_CHECK_KEY || await askHidden('Paste the rk_test_ key (hidden), then Enter: ');
if (!/^(rk|sk)_test_/.test(key)) {
  console.log('That is not a test-mode key (should start with rk_test_). Nothing was sent.');
  process.exit(1);
}
async function api(method, path, body) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${key}`, 'Stripe-Version': '2025-07-30.basil',
      ...(body ? {'Content-Type': 'application/x-www-form-urlencoded'} : {}),
    },
    body: body ? form(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return {status: res.status, ok: res.ok, json, msg: mask((json.error && json.error.message) || '')};
}
const denied = (r) => r.status === 401 || r.status === 403 || /required permissions|rak_/.test(r.msg);

let problems = 0;
console.log('Part 1: prices');
const found = {};
for (const [pkg, id, dollars] of PRICES) {
  const r = await api('GET', `prices/${id}`);
  if (!r.ok) {
    problems++;
    const why = r.status === 404 ? 'NOT FOUND in this account (test mode)' : denied(r) ? 'permission problem' : `HTTP ${r.status}`;
    console.log(`PROBLEM  ${pkg.padEnd(16)} ${why}  ${r.msg}`);
    continue;
  }
  const p = r.json;
  found[pkg] = p;
  const issues = [];
  if (!p.active) issues.push('price is archived');
  if (p.type !== 'recurring') issues.push('one-time price, subscription checkout will fail');
  else if (p.recurring.interval !== 'month' || p.recurring.interval_count !== 1) issues.push(`bills every ${p.recurring.interval_count} ${p.recurring.interval}`);
  if (p.billing_scheme !== 'per_unit' || p.unit_amount == null) issues.push('not a simple per-unit amount');
  if (p.currency !== 'usd') issues.push(`currency ${p.currency}`);
  if (p.unit_amount != null && p.unit_amount !== dollars * 100) issues.push(`Stripe says $${p.unit_amount / 100}, portal shows $${dollars}`);
  if (issues.length) problems++;
  const amt = p.unit_amount == null ? '?' : `$${p.unit_amount / 100}`;
  const every = p.type === 'recurring' ? `/${p.recurring.interval}` : ' one-time';
  console.log(`${issues.length ? 'PROBLEM' : 'OK     '}  ${pkg.padEnd(16)} ${amt}${every}  ${issues.join('; ')}`);
}

console.log('\nPart 1b: sibling discount objects in test mode (Phil creates these)');
// Lists what exists so a code that "didn't work" can be traced: the checkout
// page accepts PROMOTION CODES (customer-facing), never a coupon's id, and a
// code has its own restrictions on top of the coupon's.
const cps = await api('GET', 'coupons?limit=20');
if (!cps.ok) {
  console.log(`         cannot list coupons: ${denied(cps) ? 'the key needs Coupons: Read' : cps.msg}`);
} else {
  const list = cps.json.data || [];
  if (!list.length) { problems++; console.log('PROBLEM  no coupons in test mode: create the 10% sibling coupon here too (Stripe keeps test and live apart)'); }
  for (const c of list) {
    const off = c.percent_off != null ? `${c.percent_off}% off` : `$${(c.amount_off || 0) / 100} off`;
    const dur = c.duration + (c.duration === 'repeating' ? ` ${c.duration_in_months} months` : '');
    const restr = [c.applies_to ? 'limited to specific products (the prepaid line is a new product each time: it would NOT be discounted)' : '', c.valid ? '' : 'NOT VALID (expired or fully redeemed)'].filter(Boolean).join('; ');
    console.log(`         coupon ${c.id.padEnd(16)} "${c.name || ''}" ${off}, ${dur}${restr ? '  !! ' + restr : ''}`);
  }
  if (!COUPON && list.length === 1 && list[0].valid) COUPON = list[0].id;
}
const pcs = await api('GET', 'promotion_codes?limit=20');
if (!pcs.ok) {
  console.log(`         cannot list promotion codes: ${denied(pcs) ? 'the key needs Promotion Codes: Read (only for this listing)' : pcs.msg}`);
} else {
  for (const p of pcs.json.data || []) {
    const r = p.restrictions || {};
    const why = [p.active ? '' : 'INACTIVE', p.expires_at && p.expires_at * 1000 < Date.now() ? 'EXPIRED' : '', p.max_redemptions && p.times_redeemed >= p.max_redemptions ? 'ALL REDEMPTIONS USED' : '', r.first_time_transaction ? 'first-time customers only (a returning family is refused)' : '', r.minimum_amount ? `minimum $${r.minimum_amount / 100}` : '', p.customer ? 'tied to one customer' : ''].filter(Boolean).join('; ');
    console.log(`         code   ${p.code.padEnd(16)} -> coupon ${(p.coupon && p.coupon.id) || '?'}${why ? '  !! ' + why : '  (usable)'}`);
  }
  if (!(pcs.json.data || []).length) console.log('         no promotion codes in test mode (fine once the coupon is applied automatically; a typed code needs one)');
}

console.log('\nPart 2: the calls the portal makes');
const row = (label, good, detail = '') => {
  if (!good) problems++;
  console.log(`${good ? 'OK     ' : 'PROBLEM'}  ${label.padEnd(38)} ${detail}`);
};
const t6 = found['t-6'];
if (!t6 || t6.type !== 'recurring') {
  row('checkout rehearsal', false, 'skipped: the 6-token price must be a working monthly price first');
} else {
  const base = {
    householdId: 'key-check', athleteId: 'key-check', product: 'tier', packageId: 't-6',
    priceId: t6.id, currency: t6.currency, productName: '6 tokens',
    prepaid: checkout.prepaidFor(Date.now(), {priceCents: t6.unit_amount, tokens: 6}),
    role: 'parent', portalUrl: PORTAL_URL,
  };
  // 1. New parent: checkout with an email, Stripe creates the customer.
  const s = await api('POST', 'checkout/sessions', checkout.sessionBody({...base, customerId: null, email: 'key-check@example.com'}));
  row('create checkout, new parent', s.ok, s.ok ? `session made, first charge $${(s.json.amount_total || 0) / 100}` : s.msg);
  if (s.ok) {
    // 2. Webhook reads which package was bought.
    const li = await api('GET', `checkout/sessions/${s.json.id}/line_items?limit=10`);
    row('read checkout line items', li.ok, li.ok ? `${li.json.data.length} lines` : li.msg);
    // 3. Clean up: expire the rehearsal session so it can never be paid.
    const ex = await api('POST', `checkout/sessions/${s.json.id}/expire`);
    row('expire the rehearsal session', ex.ok, ex.ok ? 'cleaned up' : ex.msg);
  }
  // 4. Returning family: checkout with an existing customer id. A made-up id
  //    passes the permission check and then fails "No such customer".
  const c = await api('POST', 'checkout/sessions', checkout.sessionBody({...base, customerId: 'cus_keycheckmissing', email: null}));
  row('create checkout, returning family', c.ok || (!denied(c) && /customer/i.test(c.msg)), c.ok ? 'session made' : denied(c) ? c.msg : 'permission OK (made-up customer, as expected)');
  if (c.ok) await api('POST', `checkout/sessions/${c.json.id}/expire`);
  // 5. Webhook fallback: find the checkout that started a subscription.
  const l = await api('GET', 'checkout/sessions?subscription=sub_keycheckmissing&limit=1');
  row('find checkout by subscription', l.ok || !denied(l), l.ok || !denied(l) ? 'permission OK' : l.msg);
  // 6. Sibling discount (owner 2026-09-30): a 2+ membership family's checkout
  //    with the coupon applied (STRIPE_SIBLING_COUPON), and the code field
  //    for the same family when no coupon is configured.
  if (COUPON) {
    const cp = await api('GET', `coupons/${encodeURIComponent(COUPON)}`);
    if (cp.ok) {
      const c = cp.json;
      const terms = `${c.percent_off != null ? c.percent_off + '% off' : '$' + (c.amount_off || 0) / 100 + ' off'}, ${c.duration}${c.duration === 'repeating' ? ' ' + c.duration_in_months + ' months' : ''}${c.valid ? '' : ', NOT VALID'}`;
      row('read the sibling coupon', c.valid && c.percent_off === 10 && c.duration === 'forever', terms + (c.duration !== 'forever' ? ' - expected forever (every month of the season)' : '') + (c.percent_off !== 10 ? ' - expected 10%' : ''));
    } else {
      row('read the sibling coupon', !denied(cp) && cp.status !== 404, cp.status === 404 ? 'NOT FOUND in test mode: create it with this exact id in test AND live' : denied(cp) ? 'key cannot read coupons (add Coupons: Read, or ignore if the next line is OK)' : cp.msg);
    }
    const ds = await api('POST', 'checkout/sessions', checkout.sessionBody({...base, customerId: null, email: 'key-check@example.com', sibling: {eligible: true, coupon: COUPON}}));
    // Only the prepaid line is charged at checkout (the monthly price is in
    // its trial), so the first charge is 90% of it; December onwards gets
    // its 10% from the coupon's "forever" duration.
    const want = Math.round(base.prepaid.amountCents * 0.9);
    row('create checkout with the sibling coupon', ds.ok && ds.json.amount_total === want, ds.ok ? `first charge $${(ds.json.amount_total || 0) / 100}, expected $${want / 100} (10% off the prepaid month; monthly from December)` : ds.msg);
    if (ds.ok) await api('POST', `checkout/sessions/${ds.json.id}/expire`);
  } else {
    const pc = await api('POST', 'checkout/sessions', checkout.sessionBody({...base, customerId: null, email: 'key-check@example.com', sibling: {eligible: true, coupon: null}}));
    row('create checkout with the promo-code field', pc.ok, pc.ok ? 'session made (families type the code on the Stripe page)' : pc.msg);
    if (pc.ok) await api('POST', `checkout/sessions/${pc.json.id}/expire`);
    console.log('         (pass --coupon <id> to rehearse the automatic sibling discount)');
  }
}
console.log(problems ? `\n${problems} need attention. Paste this output to Claude.` : '\nAll clear: the prices are right and this key can do everything the portal needs.');
