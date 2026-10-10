'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const s = require('./stripe-single');

const secs = (iso) => Date.parse(iso) / 1000;
const OCT1 = secs('2026-10-01T15:00:00Z');
let DATA = {};

/**
 * A Firestore stand-in whose refs carry a path; queries filter DATA.
 * @type {!Object}
 */
const db = {collection: (c) => ({
  doc: (id) => ({kind: 'doc', c, id, path: `${c}/${id}`}),
  where: (field, op, value) => ({kind: 'query', c, field, value}),
})};

/** @return {{tx: !Object, writes: !Array, gets: !Array}} A recording tx. */
function recorder() {
  const writes = [];
  const gets = [];
  return {writes, gets, tx: {
    get: async (ref) => {
      if (writes.length) throw new Error('read after write: ' + ref.path);
      if (ref.kind === 'doc') {
        gets.push(ref.path);
        const d = (DATA[ref.c] || {})[ref.id];
        return {exists: d !== undefined, id: ref.id, data: () => d};
      }
      gets.push(`${ref.c}?${ref.field}==${ref.value}`);
      const docs = Object.entries(DATA[ref.c] || {})
          .filter(([, d]) => d[ref.field] === ref.value)
          .map(([id, d]) => ({id, data: () => d}));
      return {empty: docs.length === 0, docs};
    },
    set: (ref, data) => writes.push({op: 'set', path: ref.path, data}),
    update: (ref, data) => writes.push({op: 'update', path: ref.path, data}),
  }};
}

/**
 * @param {!Object=} over Overrides: session, event, athlete, hh, ref.
 * @return {!Object} applySinglePurchase's args for athlete sol.
 */
function argsFor(over) {
  const o = over || {};
  return {db,
    event: Object.assign({id: 'evt_x', created: OCT1}, o.event),
    session: Object.assign({id: 'cs_x', mode: 'payment',
      payment_status: 'paid', payment_intent: 'pi_x', amount_total: 6500,
      currency: 'usd', customer: 'cus_q'}, o.session),
    ref: o.ref || {householdId: 'quist', athleteId: 'sol', product: 'tier'},
    priceId: 'price_single',
    athlete: o.athlete || {householdId: 'quist', packageId: 'single',
      billing: {status: 'pending'}},
    athleteRef: {id: 'sol', path: 'athletes/sol'},
    hh: o.hh || {id: 'quist', ref: {path: 'households/quist'}, data: {}}};
}
const byPath = (writes, p) => writes.filter((w) => w.path === p);

test('Oct 1 paid session: the token, billing and firstActive', async () => {
  DATA = {};
  const {tx, writes} = recorder();
  const out = await s.applySinglePurchase(tx, argsFor());
  assert.equal(out.outcome, 'issued-single');
  assert.equal(out.firstActive, true);
  assert.deepEqual(out.detail, {graceTokenId: 'single_cs_x',
    expiresAt: '2027-02-27', paymentIntentId: 'pi_x'});
  const tok = byPath(writes, 'graceTokens/single_cs_x');
  assert.equal(tok.length, 1);
  assert.equal(tok[0].op, 'set');
  const t = Object.assign({}, tok[0].data);
  assert.ok(t.createdAt, 'createdAt is a server timestamp');
  delete t.createdAt;
  assert.deepEqual(t, {athleteId: 'sol', householdId: 'quist',
    expiresAt: '2027-02-27', reason: 'single-purchase',
    sourceSessionId: null, createdBy: 'stripe', checkoutSessionId: 'cs_x',
    paymentIntentId: 'pi_x', amountTotal: 6500, currency: 'usd',
    priceId: 'price_single', purchasedOn: '2026-10-01', eventId: 'evt_x'});
  const a = byPath(writes, 'athletes/sol')[0].data;
  assert.deepEqual([a['billing.status'], a['billing.oneTime'],
    a['billing.subscriptionId'], a['billing.customerId'],
    a['billing.priceId'], a['billing.checkoutSessionId'],
    a['billing.lastEventId']], ['active', true, null, 'cus_q',
    'price_single', 'cs_x', 'evt_x']);
  assert.equal('billing.retiredSubscriptionIds' in a, false);
  assert.equal('packageId' in a, false, 'already single');
  const h = byPath(writes, 'households/quist');
  assert.equal(h.length, 1, 'only the customer link');
  assert.equal(h[0].data.stripeCustomerId, 'cus_q');
  assert.equal(writes.some((w) => w.path.startsWith('tokenPeriods/')), false);
  assert.equal(writes.some((w) => 'periodAnchorDay' in w.data), false);
});

test('paymentIntentId from an expanded object', async () => {
  DATA = {};
  const {tx, writes} = recorder();
  const out = await s.applySinglePurchase(tx, argsFor({session:
    {payment_intent: {id: 'pi_x', object: 'payment_intent'}}}));
  assert.equal(out.detail.paymentIntentId, 'pi_x');
  assert.equal(byPath(writes, 'graceTokens/single_cs_x')[0].data
      .paymentIntentId, 'pi_x');
});

test('existing token: duplicate-purchase; unpaid: single-unpaid; 0 writes',
    async () => {
      DATA = {graceTokens: {single_cs_x: {athleteId: 'sol'}}};
      const dup = recorder();
      const d = await s.applySinglePurchase(dup.tx, argsFor());
      assert.deepEqual([d.outcome, d.firstActive, dup.writes.length],
          ['duplicate-purchase', false, 0]);
      DATA = {};
      const un = recorder();
      const u = await s.applySinglePurchase(un.tx, argsFor({session:
        {payment_status: 'unpaid'}}));
      assert.deepEqual([u.outcome, un.writes.length], ['single-unpaid', 0]);
      const fac = recorder();
      const f = await s.applySinglePurchase(fac.tx, argsFor({ref:
        {householdId: 'quist', athleteId: 'sol', product: 'facility'}}));
      assert.deepEqual([f.outcome, fac.writes.length],
          ['unexpected-one-time', 0]);
    });

test('a second session: a second token, firstActive false', async () => {
  DATA = {graceTokens: {single_cs_x: {athleteId: 'sol'}}};
  const {tx, writes} = recorder();
  const out = await s.applySinglePurchase(tx, argsFor({
    session: {id: 'cs_y'},
    athlete: {householdId: 'quist', packageId: 'single', billing: {
      status: 'active', oneTime: true, subscriptionId: null}}}));
  assert.deepEqual([out.outcome, out.firstActive],
      ['issued-single', false]);
  assert.equal(byPath(writes, 'graceTokens/single_cs_y').length, 1);
  assert.equal(byPath(writes, 'athletes/sol')[0]
      .data['billing.checkoutSessionId'], 'cs_y');
});

test('live subscription: issued-single-topup, billing untouched', async () => {
  for (const status of ['active', 'past_due']) {
    DATA = {};
    const {tx, writes} = recorder();
    const out = await s.applySinglePurchase(tx, argsFor({athlete: {
      householdId: 'quist', packageId: 't-6', billing: {status,
        subscriptionId: 'sub_live'}}}));
    assert.deepEqual([out.outcome, out.firstActive],
        ['issued-single-topup', false], status);
    assert.equal(byPath(writes, 'athletes/sol').length, 0, status);
    assert.equal(byPath(writes, 'graceTokens/single_cs_x').length, 1);
  }
});

test('a lapsed subscription is retired; packageId moves to single',
    async () => {
      DATA = {};
      const {tx, writes} = recorder();
      const out = await s.applySinglePurchase(tx, argsFor({athlete: {
        householdId: 'quist', packageId: 't-6', billing: {status: 'lapsed',
          subscriptionId: 'sub_vic'}}}));
      assert.deepEqual([out.outcome, out.firstActive],
          ['issued-single', true]);
      const a = byPath(writes, 'athletes/sol')[0].data;
      assert.equal(a['billing.subscriptionId'], null);
      assert.ok(a['billing.retiredSubscriptionIds'], 'arrayUnion sentinel');
      assert.equal(a.packageId, 'single');
      assert.ok(a.updatedAt);
    });

test('a lapsed household is lifted only when every sibling is billed',
    async () => {
      const lapsedHh = {id: 'quist', ref: {path: 'households/quist'},
        data: {stripeCustomerId: 'cus_q', membership: {status: 'lapsed'}}};
      DATA = {athletes: {
        sol: {householdId: 'quist', billing: {status: 'pending'}},
        sib: {householdId: 'quist', billing: {status: 'lapsed'}}}};
      const ok = recorder();
      const o = await s.applySinglePurchase(ok.tx, argsFor({hh: lapsedHh}));
      assert.equal(o.outcome, 'issued-single');
      assert.ok(ok.gets.includes('athletes?householdId==quist'));
      const lifted = byPath(ok.writes, 'households/quist')
          .find((w) => 'membership.status' in w.data);
      assert.deepEqual([lifted.data['membership.status'],
        lifted.data['membership.lastEventId']], ['active', 'evt_x']);
      assert.equal(byPath(ok.writes, 'households/quist').length, 1,
          'the lift and the customer link are one household write');

      DATA.athletes.legacy = {householdId: 'quist', packageId: 't-6'};
      const no = recorder();
      const n = await s.applySinglePurchase(no.tx, argsFor({hh: lapsedHh}));
      assert.equal(n.outcome, 'issued-single-household-lapsed');
      assert.equal(no.writes.some((w) => 'membership.status' in w.data),
          false, 'membership untouched');
      assert.equal(byPath(no.writes, 'graceTokens/single_cs_x').length, 1,
          'the paid token is still issued');

      const pastDue = recorder();
      const p = await s.applySinglePurchase(pastDue.tx, argsFor({hh:
        {id: 'quist', ref: {path: 'households/quist'},
          data: {membership: {status: 'past_due'}}}}));
      assert.equal(p.outcome, 'issued-single');
      assert.equal(pastDue.gets.some((g) => g.startsWith('athletes?')),
          false, 'no sibling read unless lapsed');
      assert.equal(pastDue.writes.some((w) =>
        Object.keys(w.data).some((k) => k.startsWith('membership.'))), false,
      'past_due is never touched');
    });

test('late purchase and amount check', async () => {
  DATA = {};
  const late = recorder();
  const l = await s.applySinglePurchase(late.tx, argsFor({event:
    {created: secs('2027-02-28T12:00:00Z')}}));
  assert.equal(l.outcome, 'issued-single-late');
  assert.equal(byPath(late.writes, 'graceTokens/single_cs_x')[0].data
      .purchasedOn, '2027-02-28');
  const lastDay = recorder();
  assert.equal((await s.applySinglePurchase(lastDay.tx, argsFor({event:
    {created: secs('2027-02-28T05:00:00Z')}}))).outcome, 'issued-single',
  '23:00 Chicago on Feb 27 is still in season');
  const amt = recorder();
  assert.equal((await s.applySinglePurchase(amt.tx, argsFor({session:
    {amount_total: 650}}))).outcome, 'issued-single-amount-check');
  const both = recorder();
  assert.equal((await s.applySinglePurchase(both.tx, argsFor({
    event: {created: secs('2027-03-02T12:00:00Z')},
    session: {amount_total: 650}}))).outcome, 'issued-single-late',
  'late outranks amount-check');
});

test('paidWithoutToken: a paid portal session that minted nothing', () => {
  const paid = {mode: 'payment', payment_status: 'paid',
    client_reference_id: 'quist__sol__tier'};
  for (const outcome of ['unmatched', 'unexpected-one-time', 'ignored',
    'stripe-lookup-failed']) {
    assert.equal(s.paidWithoutToken(paid, outcome), true, outcome);
  }
  // A token was issued (the review outcomes log their own line), or this
  // is a replay of one already issued.
  for (const outcome of ['issued-single', 'issued-single-topup',
    'issued-single-late', 'issued-single-amount-check',
    'issued-single-household-lapsed', 'duplicate-purchase']) {
    assert.equal(s.paidWithoutToken(paid, outcome), false, outcome);
  }
  // Nobody was charged, a subscription checkout, or not the portal's sale.
  assert.equal(s.paidWithoutToken(Object.assign({}, paid,
      {payment_status: 'unpaid'}), 'single-unpaid'), false);
  assert.equal(s.paidWithoutToken(Object.assign({}, paid,
      {mode: 'subscription'}), 'unexpected-quantity'), false);
  assert.equal(s.paidWithoutToken(Object.assign({}, paid,
      {client_reference_id: null}), 'ignored'), false);
  assert.equal(s.paidWithoutToken(null, 'unmatched'), false);
});

test('a session with no customer never clears the linked one', async () => {
  DATA = {};
  const {tx, writes} = recorder();
  await s.applySinglePurchase(tx, argsFor({session: {customer: null}}));
  const a = byPath(writes, 'athletes/sol')[0].data;
  assert.equal('billing.customerId' in a, false);
  assert.equal(byPath(writes, 'households/quist').length, 0);
});

// The extra session at the member rate (owner, 2026-10-10): the single
// token's session with a coupon and metadata.memberRate (checkout.js
// extraSessionBody), bought by a paid monthly member.
const MEMBER = {householdId: 'quist', packageId: 't-8', billing: {
  status: 'active', subscriptionId: 'sub_live', customerId: 'cus_q'}};
/**
 * @param {string} rate The package whose member rate was sold.
 * @param {number} cents What Stripe charged.
 * @param {!Object=} over More argsFor overrides.
 * @return {!Object} applySinglePurchase's args for the extra session.
 */
const extraArgs = (rate, cents, over) => argsFor(Object.assign({
  athlete: MEMBER,
  session: {amount_total: cents, metadata: {householdId: 'quist',
    athleteId: 'sol', product: 'tier', packageId: 'single',
    memberRate: rate}}}, over));

test('an extra session: exactly one token, a top-up, billing untouched',
    async () => {
      DATA = {};
      const {tx, writes} = recorder();
      const out = await s.applySinglePurchase(tx, extraArgs('t-8', 4863));
      assert.deepEqual([out.outcome, out.firstActive],
          ['issued-single-topup', false]);
      assert.deepEqual(out.detail, {graceTokenId: 'single_cs_x',
        expiresAt: '2027-02-27', paymentIntentId: 'pi_x', memberRate: 't-8'});
      const tokens = writes.filter((w) => w.path.startsWith('graceTokens/'));
      assert.equal(tokens.length, 1, 'one token');
      assert.equal(tokens[0].op, 'set');
      const t = Object.assign({}, tokens[0].data);
      delete t.createdAt;
      assert.deepEqual(t, {athleteId: 'sol', householdId: 'quist',
        expiresAt: '2027-02-27', reason: 'single-purchase',
        sourceSessionId: null, createdBy: 'stripe', checkoutSessionId: 'cs_x',
        paymentIntentId: 'pi_x', amountTotal: 4863, currency: 'usd',
        priceId: 'price_single', purchasedOn: '2026-10-01', eventId: 'evt_x',
        memberRate: 't-8'});
      assert.equal(byPath(writes, 'athletes/sol').length, 0,
          'never moved to the single package, billing untouched');
      // Only the customer link on the household; never a membership change.
      assert.deepEqual(writes.map((w) => w.path).sort(),
          ['graceTokens/single_cs_x', 'households/quist']);
      assert.equal(Object.keys(byPath(writes, 'households/quist')[0].data)
          .some((k) => k.startsWith('membership.')), false);
      // A redelivery mints nothing more.
      DATA = {graceTokens: {single_cs_x: {athleteId: 'sol'}}};
      const dup = recorder();
      const d = await s.applySinglePurchase(dup.tx, extraArgs('t-8', 4863));
      assert.deepEqual([d.outcome, dup.writes.length],
          ['duplicate-purchase', 0]);
    });

test('every member rate is accepted at exactly its own amount', async () => {
  const rates = {'t-4': 5475, 't-6': 4983, 't-8': 4863, 't-12': 4742,
    't-16': 4494};
  for (const [rate, cents] of Object.entries(rates)) {
    DATA = {};
    const ok = recorder();
    const athlete = Object.assign({}, MEMBER, {packageId: rate});
    assert.equal((await s.applySinglePurchase(ok.tx, extraArgs(rate, cents,
        {athlete}))).outcome, 'issued-single-topup', rate);
    assert.equal(ok.writes.filter((w) =>
      w.path.startsWith('graceTokens/')).length, 1, rate);
  }
  // A failing card is still a live subscription: a top-up, past_due kept.
  DATA = {};
  const pd = recorder();
  const pastDue = Object.assign({}, MEMBER, {billing: {status: 'past_due',
    subscriptionId: 'sub_live'}});
  assert.equal((await s.applySinglePurchase(pd.tx, extraArgs('t-8', 4863,
      {athlete: pastDue}))).outcome, 'issued-single-topup');
  assert.equal(byPath(pd.writes, 'athletes/sol').length, 0);
});

test('any other amount on a top-up is flagged; the token is still issued',
    async () => {
      const outcomeOf = async (args) => {
        DATA = {};
        const r = recorder();
        const out = await s.applySinglePurchase(r.tx, args);
        assert.equal(r.writes.filter((w) =>
          w.path.startsWith('graceTokens/')).length, 1, 'paid: one token');
        assert.equal(byPath(r.writes, 'athletes/sol').length, 0);
        return out.outcome;
      };
      // A member-rate session that charged $65, or another package's rate.
      assert.equal(await outcomeOf(extraArgs('t-8', 6500)),
          'issued-single-amount-check');
      assert.equal(await outcomeOf(extraArgs('t-8', 4742)),
          'issued-single-amount-check');
      assert.equal(await outcomeOf(extraArgs('elite', 4863)),
          'issued-single-amount-check', 'a rate nobody sells');
      // Without the metadata only $65 is right: the discount is accepted
      // for a member-rate session alone.
      assert.equal(await outcomeOf(argsFor({athlete: MEMBER})),
          'issued-single-topup');
      assert.equal(await outcomeOf(argsFor({athlete: MEMBER,
        session: {amount_total: 4863}})), 'issued-single-amount-check');
      // A single-package buyer is still held to $65.
      DATA = {};
      const sp = recorder();
      assert.equal((await s.applySinglePurchase(sp.tx, argsFor({session:
        {amount_total: 4863}}))).outcome, 'issued-single-amount-check');
      // The review row says what was charged against what was due; a right
      // amount adds nothing.
      DATA = {};
      const wrong = await s.applySinglePurchase(recorder().tx,
          extraArgs('t-8', 6500));
      assert.deepEqual([wrong.detail.amountTotal, wrong.detail.expectedCents],
          [6500, 4863]);
      DATA = {};
      const nobody = await s.applySinglePurchase(recorder().tx,
          extraArgs('elite', 4863));
      assert.deepEqual([nobody.detail.amountTotal,
        nobody.detail.expectedCents], [4863, null]);
      DATA = {};
      const right = await s.applySinglePurchase(recorder().tx,
          extraArgs('t-8', 4863));
      assert.equal('amountTotal' in right.detail, false);
      assert.equal('expectedCents' in right.detail, false);
    });

test('an extra session paid after the subscription ended: never a move to ' +
    'Single', async () => {
  for (const billing of [{status: 'lapsed', subscriptionId: 'sub_live'},
    {status: 'pending'}, {status: 'active', oneTime: true,
      subscriptionId: null}]) {
    DATA = {};
    const {tx, writes} = recorder();
    const out = await s.applySinglePurchase(tx, extraArgs('t-8', 4863,
        {athlete: {householdId: 'quist', packageId: 't-8', billing}}));
    assert.deepEqual([out.outcome, out.firstActive],
        ['issued-single-extra-no-plan', false], JSON.stringify(billing));
    assert.equal(byPath(writes, 'graceTokens/single_cs_x').length, 1,
        'the family paid: the token is issued');
    assert.equal(byPath(writes, 'athletes/sol').length, 0,
        'no package move, no billing patch, nothing retired');
  }
  // Nor does it lift a lapsed household (no sibling read either).
  DATA = {athletes: {sol: {householdId: 'quist', billing: {status: 'lapsed'}}}};
  const lap = recorder();
  const out = await s.applySinglePurchase(lap.tx, extraArgs('t-8', 4863, {
    athlete: {householdId: 'quist', packageId: 't-8',
      billing: {status: 'lapsed', subscriptionId: 'sub_live'}},
    hh: {id: 'quist', ref: {path: 'households/quist'},
      data: {stripeCustomerId: 'cus_q', membership: {status: 'lapsed'}}}}));
  assert.equal(out.outcome, 'issued-single-extra-no-plan');
  assert.equal(lap.gets.some((g) => g.startsWith('athletes?')), false);
  assert.equal(lap.writes.some((w) => 'membership.status' in w.data), false);
  // Paid at the wrong amount as well: still the no-plan row, and the detail
  // carries the amount check so ops sees both.
  DATA = {};
  const both = await s.applySinglePurchase(recorder().tx, extraArgs('t-8',
      6500, {athlete: {householdId: 'quist', packageId: 't-8',
        billing: {status: 'pending'}}}));
  assert.equal(both.outcome, 'issued-single-extra-no-plan');
  assert.deepEqual([both.detail.amountTotal, both.detail.expectedCents],
      [6500, 4863]);
  // Late still outranks it; the row is a review outcome with a token.
  DATA = {};
  const late = recorder();
  assert.equal((await s.applySinglePurchase(late.tx, extraArgs('t-8', 4863, {
    athlete: {householdId: 'quist', packageId: 't-8',
      billing: {status: 'lapsed'}},
    event: {created: secs('2027-03-01T12:00:00Z')}}))).outcome,
  'issued-single-late');
  assert.equal(s.paidWithoutToken({mode: 'payment', payment_status: 'paid',
    client_reference_id: 'quist__sol__tier'}, 'issued-single-extra-no-plan'),
  false);
});

run();
