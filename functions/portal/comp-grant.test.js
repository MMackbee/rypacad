'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const compGrant = require('./comp-grant');

const TODAY = '2026-11-05';
const grantDoc = (over) => Object.assign({email: 'nate@example.test',
  uid: 'u-nate', until: '2027-02-27', note: 'Owner comp', packages: null,
  revoked: false}, over);
/**
 * readGrant inside a fake transaction.
 * @param {!Object} docs The fake documents.
 * @param {!Object} who Overrides for the caller.
 * @return {!Promise<?Object>} The grant or null.
 */
async function read(docs, who) {
  const store = fakeDb(docs);
  return store.runTransaction((tx) => compGrant.readGrant(tx, store,
      Object.assign({uid: 'u-nate', email: 'nate@example.test',
        todayISO: TODAY}, who)));
}

test('a live grant for the caller reads back, email matched case-blind',
    async () => {
      const g = await read({'compGrants/nate@example.test': grantDoc()},
          {email: ' Nate@Example.TEST '});
      assert.deepEqual(g, {email: 'nate@example.test', until: '2027-02-27',
        note: 'Owner comp', packages: null});
    });

test('no grant, no email, revoked, expired, bad date or another uid: null',
    async () => {
      const at = (over) => ({'compGrants/nate@example.test': grantDoc(over)});
      assert.equal(await read({}, {}), null);
      assert.equal(await read(at(), {email: null}), null);
      assert.equal(await read(at(), {email: ''}), null);
      assert.equal(await read(at({revoked: true}), {}), null);
      assert.equal(await read(at({until: '2026-11-04'}), {}), null);
      assert.equal(await read(at({until: '27/02/2027'}), {}), null);
      assert.equal(await read(at({until: null}), {}), null);
      assert.equal(await read(at({uid: 'u-someone-else'}), {}), null);
    });

test('the last day still counts; no uid on the grant needs a verified email',
    async () => {
      const last = await read({'compGrants/nate@example.test':
        grantDoc({until: TODAY})}, {});
      assert.equal(last.until, TODAY);
      const at = {'compGrants/nate@example.test': grantDoc({uid: null})};
      const verified = await read(at, {uid: 'u-new-login',
        emailVerified: true});
      assert.equal(verified.email, 'nate@example.test');
      assert.equal(await read(at, {uid: 'u-new-login', emailVerified: false}),
          null);
      assert.equal(await read(at, {uid: 'u-new-login'}), null);
      // A bound grant does not need a verified email (Nathan's is not).
      const bound = await read({'compGrants/nate@example.test': grantDoc()},
          {emailVerified: false});
      assert.equal(bound.email, 'nate@example.test');
    });

test('covers every monthly package by default, never the single token',
    () => {
      const g = {packages: null};
      for (const p of ['elite', 't-4', 't-6', 't-8', 't-12', 't-16']) {
        assert.equal(compGrant.covers(g, p), true, p);
      }
      assert.equal(compGrant.covers(g, 'single'), false);
      assert.equal(compGrant.covers(g, null), false);
      assert.equal(compGrant.covers(null, 'elite'), false);
      assert.equal(compGrant.covers({packages: ['elite']}, 't-6'), false);
      assert.equal(compGrant.covers({packages: ['elite']}, 'elite'), true);
    });

test('the billing map is comp-membership.mjs\'s, linked by comp-grant', () => {
  const at = {serverTime: true};
  assert.deepEqual(compGrant.compBilling({until: '2027-02-27',
    note: 'Owner comp'}, at), {
    status: 'active', oneTime: false, customerId: null,
    subscriptionId: null, priceId: null, checkoutSessionId: null,
    comp: true, compUntil: '2027-02-27', compNote: 'Owner comp',
    linkedBy: 'comp-grant', updatedAt: at,
  });
});

run();
