/**
 * The door callables (spec 5.2, 5.3): unlockDoor and signDoorRules unwrap
 * `result.data`, and a refusal becomes a LiveDataError carrying the server's
 * details.reason and its plain message. unlockDoor gives up well before the
 * SDK's 70 s default: the server stops at 20 s, and a family is standing at
 * the door. Plain functions, not jest.fn(): CRA's resetMocks would clear them.
 */
jest.mock('../../firebase', () => ({ functions: { app: 'test' } }));
jest.mock('firebase/functions', () => ({
  httpsCallable: (fns, name, options) => {
    mockMade.push({ name, options });
    return async (payload) => mockAnswer(name, payload);
  },
}));
jest.mock('firebase/firestore', () => ({}));

const mockMade = [];
let mockAnswer;

// Required after the arrays above exist: callables.js makes its callables at import.
const { ERR, LiveDataError } = require('./live');
const { callSignDoorRules, callUnlockDoor } = require('./callables');

const httpsErr = (code, message, details) => Object.assign(new Error(message), { code, details });

test('both callables exist by the names the server exports', () => {
  const names = mockMade.map((m) => m.name);
  expect(names).toContain('unlockDoor');
  expect(names).toContain('signDoorRules');
});

test('unlockDoor times out at 25 s, under the SDK default and over the server 20 s', () => {
  const made = mockMade.find((m) => m.name === 'unlockDoor');
  expect(made.options).toEqual({ timeout: 25000 });
});

test('a check and a press go out as given and come back as the data', async () => {
  const calls = [];
  mockAnswer = (name, payload) => {
    calls.push([name, payload]);
    return { data: payload.check ? { canUnlock: true, reason: null, staff: false, openSeconds: 5 } : { outcome: 'opened', openSeconds: 5 } };
  };
  await expect(callUnlockDoor({ check: true })).resolves.toEqual({ canUnlock: true, reason: null, staff: false, openSeconds: 5 });
  const press = { pressId: 'abcdef12-3456', location: { lat: 44.9, lng: -93.2, accuracy: 12 } };
  await expect(callUnlockDoor(press)).resolves.toEqual({ outcome: 'opened', openSeconds: 5 });
  expect(calls).toEqual([['unlockDoor', { check: true }], ['unlockDoor', press]]);
});

test('a refusal keeps its reason and the server copy', async () => {
  mockAnswer = () => {
    throw httpsErr('functions/failed-precondition', 'You need to be at the academy to unlock the door.', { reason: 'too-far' });
  };
  const err = await callUnlockDoor({ pressId: 'abcdef12', location: null }).catch((e) => e);
  expect(err).toBeInstanceOf(LiveDataError);
  expect(err).toMatchObject({ code: ERR.INVALID, reason: 'too-far', message: 'You need to be at the academy to unlock the door.' });
});

test('signDoorRules sends the name and version and answers ok', async () => {
  const calls = [];
  mockAnswer = (name, payload) => {
    calls.push([name, payload]);
    return { data: { ok: true, termsVersion: payload.termsVersion } };
  };
  await expect(callSignDoorRules({ name: 'Dana Hart', termsVersion: 'door-2026-11-17' })).resolves.toEqual({ ok: true, termsVersion: 'door-2026-11-17' });
  expect(calls).toEqual([['signDoorRules', { name: 'Dana Hart', termsVersion: 'door-2026-11-17' }]]);
});
