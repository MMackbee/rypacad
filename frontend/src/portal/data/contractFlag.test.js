import { contractEnabled, hideContractParts } from './contractFlag';
import { statusFor } from './billingHub';
import { whatsNextFor } from './whatsNext';
import { ALL_PACKAGES } from './packages';

/**
 * The Commitment Contract's switch (owner ruling 2026-09-30): off unless
 * REACT_APP_CONTRACT_ENABLED is exactly 'true', read at call time, and the
 * pure copy it gates.
 */
afterEach(() => { delete process.env.REACT_APP_CONTRACT_ENABLED; });

test('off by default; only the exact string true turns it on; read at call time', () => {
  delete process.env.REACT_APP_CONTRACT_ENABLED;
  expect(contractEnabled()).toBe(false);
  for (const v of ['false', '1', 'TRUE', 'yes', '']) {
    process.env.REACT_APP_CONTRACT_ENABLED = v;
    expect(contractEnabled()).toBe(false);
  }
  process.env.REACT_APP_CONTRACT_ENABLED = 'true';
  expect(contractEnabled()).toBe(true);
});

test('hideContractParts drops the contract parts of a line only while the contract is hidden', () => {
  expect(hideContractParts('Age 14 · 45 min tier')).toBe('Age 14');
  expect(hideContractParts('Age 14 · contract behind')).toBe('Age 14');
  expect(hideContractParts('Age 12 · 4th month')).toBe('Age 12 · 4th month');
  expect(hideContractParts('Enrolled Nov 3 · 45 min tier · 12 tokens package')).toBe('Enrolled Nov 3 · 12 tokens package');
  expect(hideContractParts('90 min tier')).toBeNull();
  expect(hideContractParts('Age 9 · new Feb 8')).toBe('Age 9 · new Feb 8');
  expect(hideContractParts(null)).toBeNull();
  expect(hideContractParts(undefined)).toBeNull();
  process.env.REACT_APP_CONTRACT_ENABLED = 'true';
  expect(hideContractParts('Age 14 · 45 min tier')).toBe('Age 14 · 45 min tier');
});

test("the lapsed membership copy loses its contract sentence while hidden", () => {
  expect(statusFor({ status: 'lapsed' }).body).toBe("Upcoming bookings were released. Once payment resumes, book again from what's open.");
  process.env.REACT_APP_CONTRACT_ENABLED = 'true';
  expect(statusFor({ status: 'lapsed' }).body).toBe(
    "Upcoming bookings were released. Once payment resumes, book again from what's open. Contract logging is unaffected."
  );
});

test("What's next after a payment never mentions the contract", () => {
  const athlete = { name: 'Jordan Whitfield', loginEmail: 'jordan@email.com', login: { state: 'invited' } };
  for (const now of [Date.parse('2026-10-01T17:00:00Z'), Date.parse('2026-11-20T17:00:00Z')]) {
    for (const p of ALL_PACKAGES) {
      for (const self of [false, true]) {
        const card = whatsNextFor({ packageId: p.id, athlete, self, host: 'portal.test', now });
        const words = card ? [card.title, card.book, ...card.lines].join(' ') : '';
        expect(words).not.toMatch(/contract|commitment|practice minutes/i);
      }
    }
  }
});
