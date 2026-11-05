import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, pickAthletes, refusal, checkoutNote, buildWrites, compedOk, main } from '../comp-membership.mjs';
import { resolveTarget, commit, docName, fsFields, getDoc } from '../lib/firestore-rest.mjs';

const TODAY = '2026-11-04';
const NOW = Date.parse('2026-11-04T21:00:00Z');
const HOUR = 60 * 60 * 1000;
const BASE = ['--email', ' NOllhoff@Example.com ', '--athlete', 'Abigail'];
const p = (argv) => parseArgs(argv, { today: TODAY });

test('parseArgs: exactly one of --dry-run | --yes, email lower-cased, --athlete repeatable, --until and --note checked', () => {
  assert.match(p(BASE).error, /exactly one/);
  assert.match(p([...BASE, '--dry-run', '--yes']).error, /exactly one/);
  const ok = p([...BASE, '--athlete', 'Grant', '--prod', '--dry-run']);
  assert.equal(ok.email, 'nollhoff@example.com');
  assert.deepEqual(ok.athletes, ['Abigail', 'Grant']);
  assert.equal(ok.until, '2027-02-27');
  assert.equal(ok.note, 'Owner comp (Makel, Mike, Luke): Unlimited free, 2026-27 season');
  assert.equal(ok.prod, true);
  assert.equal(ok.dryRun, true);
  assert.equal(ok.yes, false);
  assert.match(p(['--email', 'a@b.co', '--yes']).error, /--athlete/);
  assert.match(p(['--email', 'a@b.co', '--athlete', ' ', '--yes']).error, /--athlete/);
  assert.match(p(['--email', 'not-an-email', '--athlete', 'Abigail', '--yes']).error, /--email/);
  assert.match(p([...BASE, '--until', '2027-02-30', '--yes']).error, /real date/);
  assert.match(p([...BASE, '--until', '02/27/2027', '--yes']).error, /real date/);
  assert.match(p([...BASE, '--until', TODAY, '--yes']).error, /after today/);
  assert.match(p([...BASE, '--until', '2026-11-01', '--yes']).error, /after today/);
  assert.equal(p([...BASE, '--until', '2026-12-31', '--yes']).until, '2026-12-31');
  assert.match(p([...BASE, '--note', '', '--yes']).error, /--note/);
  assert.match(p([...BASE, '--note', 'x'.repeat(201), '--yes']).error, /--note/);
  assert.equal(p([...BASE, '--note', 'x'.repeat(200), '--yes']).note.length, 200);
  assert.match(p([...BASE, '--email', 'b@c.co', '--yes']).error, /only once/);
  assert.match(p([...BASE, '--until', '--yes']).error, /needs a value/);
  assert.match(p([...BASE, '--bogus', '--yes']).error, /Unknown argument: --bogus/);
  assert.match(p([...BASE, 'Grant', '--yes']).error, /Unknown argument: Grant/);
});

test('pickAthletes: each name matches exactly one athlete, no two names the same one', () => {
  const kids = [
    { id: 'a1', name: 'Abigail Ollhoff', billing: { status: 'pending' } },
    { id: 'a2', name: 'Grant Ollhoff', billing: { status: 'pending' } },
    { id: 'a3', name: 'Abby Ollhoff', billing: { status: 'active' } },
  ];
  assert.deepEqual(pickAthletes(kids, ['abigail', 'GRANT']).athletes.map((a) => a.id), ['a1', 'a2']);
  assert.match(pickAthletes(kids, ['Ab']).error, /More than one athlete matches "Ab"/);
  assert.match(pickAthletes(kids, ['Zoe']).error, /No athlete in this family matches "Zoe"/);
  assert.match(pickAthletes(kids, ['Grant', 'grant o']).error, /both match Grant Ollhoff/);
  assert.match(pickAthletes(kids, ['Zoe']).error, /Abigail Ollhoff \(pending\), Grant Ollhoff \(pending\), Abby Ollhoff \(active\)/);
});

// createFamily's shapes (functions/portal/family.js): the household and an athlete as sign-up writes them.
const ELITE = { name: 'Elite', kind: 'elite', tokens: null };
const HH = {
  id: 'hh1', name: 'Ollhoff family', guardian: { name: 'Nathan Ollhoff', email: 'n@example.test', phone: '555', relationship: 'parent' },
  stripeCustomerId: null, stripeSubscriptionId: null, stripeCustomerIds: [],
  signup: { at: '2026-11-04T20:00:00Z', by: 'u1', source: 'self', mode: 'parent' }, createdBy: 'u1',
};
const KID = {
  id: 'a1', name: 'Abigail Ollhoff', dob: '2012-05-01', householdId: 'hh1', packageId: 'elite', contractMinutes: null, coachId: null,
  facilityAccess: false, facilityAccessConsent: null, handicap: 12, loginEmail: null, facilityRequested: false,
  billing: { status: 'pending', customerId: null, subscriptionId: null, priceId: null, checkoutSessionId: null, updatedAt: '2026-11-04T20:00:00Z' },
  consents: { dataCollection: true, videoCapture: true, mediaRelease: false, research: null, signature: { name: 'Nathan Ollhoff', date: TODAY } },
};
const r = (over = {}) => refusal({ athlete: KID, pkg: ELITE, household: HH, nowMs: NOW, ...over });
const billed = (b) => ({ ...KID, billing: { ...KID.billing, ...b } });
const opened = (agoMs, product = 'tier') => ({ ...KID, pendingCheckout: { [product]: { sessionId: 'cs_test_1', priceId: 'price_1', discount: 'none', createdAt: new Date(NOW - agoMs).toISOString() } } });

test('refusal: null for a pending Elite athlete in a clean family; a reason for everything else', () => {
  assert.equal(r(), null);
  assert.match(r({ athlete: billed({ status: 'active' }) }), /not unpaid \(billing active\)/);
  assert.match(r({ athlete: billed({ subscriptionId: 'sub_123' }) }), /Stripe details \(subscriptionId\)/);
  assert.match(r({ athlete: billed({ customerId: 'cus_123' }) }), /Stripe details \(customerId\)/);
  assert.match(r({ athlete: billed({ checkoutSessionId: 'cs_123' }) }), /Stripe details \(checkoutSessionId\)/);
  assert.match(r({ athlete: billed({ oneTime: true }) }), /Stripe details \(oneTime\)/);
  assert.match(r({ athlete: { ...KID, billing: undefined } }), /billing missing/);
  assert.match(r({ athlete: { ...KID, packageId: 't-8' }, pkg: { name: '8 sessions', kind: 'tokens', tokens: 8 } }), /on 8 sessions, not Elite\. Change it to Elite first/);
  assert.match(r({ pkg: { name: 'Elite', kind: 'tokens', tokens: 8 } }), /packages\/elite is kind tokens/);
  assert.match(r({ pkg: { name: 'Elite', kind: 'elite', tokens: 30 } }), /not unlimited Elite/);
  assert.match(r({ pkg: null }), /packages\/elite is missing/);
  assert.match(r({ household: { ...HH, test: true } }), /test family/);
  assert.match(r({ athlete: { ...KID, test: true } }), /test family/);
  assert.match(r({ household: { ...HH, membership: { status: 'past_due' } } }), /membership is past_due/);
  assert.match(r({ household: { ...HH, membership: { status: 'lapsed' } } }), /membership is lapsed/);
  assert.equal(r({ household: { ...HH, membership: { status: 'active' } } }), null);
  assert.match(r({ household: { ...HH, stripeCustomerId: 'cus_123' } }), /Stripe customer/);
  assert.match(r({ household: { ...HH, stripeCustomerIds: ['cus_123'] } }), /Stripe customer/);
  assert.match(r({ athlete: billed({ status: 'active', comp: true, compUntil: '2027-02-27' }) }), /already comped \(until 2027-02-27\)/);
});

test('refusal: a checkout opened in the last 25 hours refuses; an older one only shows as expired', () => {
  assert.match(r({ athlete: opened(HOUR) }), /membership checkout opened .* can still be paid until .*Run this again after/);
  assert.match(r({ athlete: opened(24.5 * HOUR) }), /can still be paid/); // the hour of margin past Stripe's 24
  assert.match(r({ athlete: opened(HOUR, 'facility') }), /facility add-on checkout/);
  assert.match(r({ athlete: { ...KID, pendingCheckout: { tier: { sessionId: 'cs_test_1' } } } }), /no time on record/);
  assert.equal(r({ athlete: opened(2 * 24 * HOUR) }), null);
  assert.match(checkoutNote(opened(2 * 24 * HOUR), NOW), /^old membership checkout from 2026-11-02 3:00 PM \(expired\)$/);
  assert.equal(checkoutNote(KID, NOW), 'none');
  assert.equal(checkoutNote({ ...KID, pendingCheckout: { tier: null } }, NOW), 'none');
});

test('buildWrites: one masked billing write per athlete, its own precondition, server time; no household write', () => {
  const args = p([...BASE, '--athlete', 'Grant', '--yes']);
  const w = buildWrites({ athletes: [{ athlete: { id: 'a1' }, updateTime: 'T1' }, { athlete: { id: 'a2' }, updateTime: 'T2' }], args });
  assert.equal(w.length, 2);
  assert.deepEqual(w.map((x) => x.update.name.split('/').slice(-2).join('/')), ['athletes/a1', 'athletes/a2']);
  assert.deepEqual(w.map((x) => x.currentDocument), [{ updateTime: 'T1' }, { updateTime: 'T2' }]);
  for (const x of w) {
    assert.ok(x.updateMask.fieldPaths.every((f) => f.startsWith('billing.')));
    assert.ok(!x.updateMask.fieldPaths.includes('billing.lastEventId'));
    assert.deepEqual(x.updateTransforms, [{ fieldPath: 'billing.updatedAt', setToServerValue: 'REQUEST_TIME' }]);
    assert.deepEqual(Object.keys(x.update.fields), ['billing']);
    const b = x.update.fields.billing.mapValue.fields;
    assert.equal(b.status.stringValue, 'active');
    assert.equal(b.comp.booleanValue, true);
    assert.equal(b.oneTime.booleanValue, false);
    for (const id of ['customerId', 'subscriptionId', 'priceId', 'checkoutSessionId']) assert.deepEqual(b[id], { nullValue: null });
    assert.equal(b.compUntil.stringValue, '2027-02-27');
    assert.equal(b.linkedBy.stringValue, 'comp-membership');
    assert.deepEqual(Object.keys(b).sort(), x.updateMask.fieldPaths.map((f) => f.slice(8)).sort());
  }
  assert.throws(() => buildWrites({ athletes: [{ athlete: { id: 'a1' }, updateTime: null }], args }), /No updateTime/);
});

test('compedOk: comped Elite that books; not a frozen family or a subscribed one', () => {
  const comped = billed({ status: 'active', oneTime: false, comp: true, subscriptionId: null, linkedBy: 'comp-membership' });
  assert.equal(compedOk(comped, HH), true);
  assert.equal(compedOk(comped, { ...HH, membership: { status: 'past_due' } }), false);
  assert.equal(compedOk({ ...comped, billing: { ...comped.billing, subscriptionId: 'sub_1' } }, HH), false);
  assert.equal(compedOk(KID, HH), false);
  assert.equal(compedOk(null, HH), false);
});

// Against a real Firestore emulator; skipped unless one is running, e.g.
//   npx firebase-tools emulators:exec --only firestore --project rypacad "node --test scripts/test/comp-membership.test.mjs"
test('against the emulator: dry run writes nothing, --yes comps only billing, a re-run and any refusal write nothing, a failed read-back says it was written', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const t = await resolveTarget({ prod: false });
  const stamp = String(process.hrtime.bigint());
  const kid = (name, hh, over = {}) => ({
    name, householdId: hh, packageId: 'elite', dob: '2012-05-01', handicap: 12, contractMinutes: null, coachId: null,
    facilityAccess: false, facilityAccessConsent: null, loginEmail: null, facilityRequested: false,
    consents: { dataCollection: true, videoCapture: true, mediaRelease: false, research: null, signature: { name: 'Nathan Ollhoff', date: TODAY } },
    billing: { status: 'pending', customerId: null, subscriptionId: null, priceId: null, checkoutSessionId: null },
    ...over,
  });
  const family = (key, name) => [
    { update: { name: docName('households', `hh-${key}-${stamp}`), fields: fsFields({ name, stripeCustomerId: null, stripeCustomerIds: [], signup: { source: 'self', mode: 'parent' } }) } },
    { update: { name: docName('users', `u-${key}-${stamp}`), fields: fsFields({ role: 'parent', householdId: `hh-${key}-${stamp}`, email: `${key}-${stamp}@example.test` }) } },
  ];
  const ids = { abigail: `abigail-${stamp}`, grant: `grant-${stamp}`, control: `control-${stamp}`, ava: `ava-${stamp}`, ben: `ben-${stamp}`, cy: `cy-${stamp}`, dee: `dee-${stamp}`, eve: `eve-${stamp}`, finn: `finn-${stamp}` };
  await commit(t, [
    { update: { name: docName('packages', 'elite'), fields: fsFields({ name: 'Elite', kind: 'elite', tokens: null }) } },
    { update: { name: docName('packages', 't-8'), fields: fsFields({ name: '8 sessions', kind: 'tokens', tokens: 8 }) } },
    ...family('ollhoff', 'Ollhoff family'),
    { update: { name: docName('athletes', ids.abigail), fields: fsFields(kid('Abigail Ollhoff', `hh-ollhoff-${stamp}`)) } },
    { update: { name: docName('athletes', ids.grant), fields: fsFields(kid('Grant Ollhoff', `hh-ollhoff-${stamp}`)) } },
    ...family('control', 'Control family'),
    { update: { name: docName('athletes', ids.control), fields: fsFields(kid('Abigail Control', `hh-control-${stamp}`)) } },
    ...family('mixed', 'Mixed family'),
    { update: { name: docName('athletes', ids.ava), fields: fsFields(kid('Ava Mixed', `hh-mixed-${stamp}`)) } },
    { update: { name: docName('athletes', ids.ben), fields: fsFields(kid('Ben Mixed', `hh-mixed-${stamp}`, { packageId: 't-8' })) } },
    ...family('open', 'Open family'),
    { update: { name: docName('athletes', ids.cy), fields: fsFields(kid('Cy Open', `hh-open-${stamp}`)) } },
    { update: { name: docName('athletes', ids.dee), fields: fsFields(kid('Dee Open', `hh-open-${stamp}`, { pendingCheckout: { tier: { sessionId: 'cs_test_open', priceId: 'price_elite', discount: 'none', createdAt: new Date(NOW).toISOString() } } })) } },
    ...family('blip', 'Blip family'),
    { update: { name: docName('athletes', ids.eve), fields: fsFields(kid('Eve Blip', `hh-blip-${stamp}`)) } },
    { update: { name: docName('athletes', ids.finn), fields: fsFields(kid('Finn Blip', `hh-blip-${stamp}`)) } },
  ]);
  const read = async (id) => getDoc(t, 'athletes', id);
  const run = (key, names, mode) => main(['--email', `${key}-${stamp}@example.test`, ...names.flatMap((n) => ['--athlete', n]), mode], { nowMs: NOW });
  const before = { abigail: await read(ids.abigail), grant: await read(ids.grant), control: await read(ids.control), household: await getDoc(t, 'households', `hh-ollhoff-${stamp}`) };

  assert.equal(await run('ollhoff', ['Abigail', 'Grant'], '--dry-run'), 0);
  assert.deepEqual(await read(ids.abigail), before.abigail);
  assert.deepEqual(await read(ids.grant), before.grant);

  assert.equal(await run('ollhoff', ['Abigail', 'Grant'], '--yes'), 0);
  for (const id of [ids.abigail, ids.grant]) {
    const a = await read(id), was = id === ids.abigail ? before.abigail : before.grant;
    assert.equal(a.billing.status, 'active');
    assert.equal(a.billing.comp, true);
    assert.equal(a.billing.linkedBy, 'comp-membership');
    assert.equal(a.billing.compUntil, '2027-02-27');
    assert.equal(a.billing.compNote, 'Owner comp (Makel, Mike, Luke): Unlimited free, 2026-27 season');
    assert.equal(a.billing.oneTime, false);
    assert.equal(a.billing.subscriptionId, null);
    assert.equal(a.billing.customerId, null);
    assert.ok(a.billing.updatedAt);
    assert.equal('lastEventId' in a.billing, false);
    for (const f of ['packageId', 'dob', 'handicap', 'consents', 'name', 'householdId', 'facilityAccess']) assert.deepEqual(a[f], was[f], f);
  }
  const hhAfter = await getDoc(t, 'households', `hh-ollhoff-${stamp}`);
  assert.deepEqual(hhAfter, before.household);
  assert.equal('periodAnchorDay' in hhAfter, false);
  assert.equal('membership' in hhAfter, false);
  assert.deepEqual(await read(ids.control), before.control);

  const comped = { abigail: await read(ids.abigail), grant: await read(ids.grant) };
  assert.equal(await run('ollhoff', ['Abigail', 'Grant'], '--yes'), 1); // no longer pending
  assert.deepEqual(await read(ids.abigail), comped.abigail);
  assert.deepEqual(await read(ids.grant), comped.grant);

  const mixed = { ava: await read(ids.ava), ben: await read(ids.ben) };
  assert.equal(await run('mixed', ['Ava', 'Ben'], '--yes'), 1); // Ben is on 8 sessions: neither is written
  assert.deepEqual(await read(ids.ava), mixed.ava);
  assert.deepEqual(await read(ids.ben), mixed.ben);

  const open = { cy: await read(ids.cy), dee: await read(ids.dee) };
  assert.equal(await run('open', ['Cy', 'Dee'], '--yes'), 1); // Dee's checkout can still be paid
  assert.deepEqual(await read(ids.cy), open.cy);
  assert.deepEqual(await read(ids.dee), open.dee);

  // The commit lands, then every read fails (a 503): it says both were written, with the season-end line.
  const realFetch = globalThis.fetch, realError = console.error, errors = [];
  let committed = false;
  globalThis.fetch = async (url, opts = {}) => {
    if (committed && (opts.method ?? 'GET') === 'GET') return new Response('{"error":"unavailable"}', { status: 503 });
    const res = await realFetch(url, opts);
    if (String(url).endsWith(':commit') && res.ok) committed = true;
    return res;
  };
  console.error = (...a) => errors.push(a.join(' '));
  let code;
  try { code = await run('blip', ['Eve', 'Finn'], '--yes'); } finally { globalThis.fetch = realFetch; console.error = realError; }
  assert.equal(committed, true);
  assert.equal(code, 1);
  assert.match(errors.join('\n'), /^Written: Eve Blip and Finn Blip are comped \(one commit, all or nothing\), but the read-back failed: Get households\/.* failed \(503\)/);
  assert.match(errors.join('\n'), /Run it again with --dry-run to check; it should say each one is already comped\.\nNothing ends this comp automatically: add it to the season-end list\.$/);
  for (const id of [ids.eve, ids.finn]) {
    const a = await read(id);
    assert.equal(a.billing.status, 'active');
    assert.equal(a.billing.comp, true);
  }
  assert.equal(await run('blip', ['Eve', 'Finn'], '--dry-run'), 1); // already comped
});
