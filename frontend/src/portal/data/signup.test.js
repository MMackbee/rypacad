import {
  ageOnDate, buildAddAthletesPayload, buildCreateFamilyPayload, contractAnswered, emptyEmergencyContact, isAdultOnDate,
  joinNames, newAthleteEntry, normalizeHandicap, toEmergencyForm, validateAthleteEntry, validateEmergencyContact,
} from './signup';

const today = '2026-10-01';
const entry = (over) => ({ ...newAthleteEntry(), name: 'Jordan', dob: '2012-06-17', packageId: 't-12', ...over });

// Contract ON unless a test says otherwise; the last describe covers it hidden.
beforeEach(() => { process.env.REACT_APP_CONTRACT_ENABLED = 'true'; });
afterEach(() => { delete process.env.REACT_APP_CONTRACT_ENABLED; });

describe('age', () => {
  test('whole years as of a date, birthday not yet reached', () => {
    expect(ageOnDate('2008-10-02', today)).toBe(17);
    expect(ageOnDate('2008-10-01', today)).toBe(18);
    expect(ageOnDate('', today)).toBeNull();
    expect(ageOnDate('2012-6-1', today)).toBeNull();
  });
  test('18+ boundary', () => {
    expect(isAdultOnDate('2008-10-01', today)).toBe(true);
    expect(isAdultOnDate('2008-10-02', today)).toBe(false);
  });
});

describe('handicap', () => {
  test('blank is null, 0..54 integers pass, anything else is invalid', () => {
    expect(normalizeHandicap('')).toBeNull();
    expect(normalizeHandicap('0')).toBe(0);
    expect(normalizeHandicap('54')).toBe(54);
    expect(normalizeHandicap('55')).toBeUndefined();
    expect(normalizeHandicap('12.5')).toBeUndefined();
    expect(normalizeHandicap('-1')).toBeUndefined();
  });
});

describe('validateAthleteEntry', () => {
  test('a clean parent-mode entry has no errors', () => {
    expect(validateAthleteEntry(entry(), { todayISO: today })).toEqual({});
  });
  test('athlete mode requires 18+', () => {
    const e = validateAthleteEntry(entry(), { todayISO: today, mode: 'athlete' });
    expect(e.dob).toBe('Student sign-up is 18+. A parent or guardian needs to complete this for you.');
    expect(validateAthleteEntry(entry({ dob: '2000-01-01' }), { todayISO: today, mode: 'athlete' })).toEqual({});
  });
  test('future dob and bad handicap', () => {
    const e = validateAthleteEntry(entry({ dob: '2027-01-01', handicap: '99' }), { todayISO: today });
    expect(e.dob).toBe('That date is in the future - check the year.');
    expect(validateAthleteEntry(entry({ dob: '' }), { todayISO: today }).dob).toMatch(/Date of birth is required/);
    expect(e.handicap).toBe('Handicap is a whole number from 0 to 54, or leave it blank.');
  });
  test('own login: required, not the guardian, not a sibling', () => {
    const a = entry({ ownLogin: true, loginEmail: '' });
    expect(validateAthleteEntry(a, { todayISO: today }).loginEmail).toBe('Enter the email the athlete will sign in with.');
    const b = entry({ ownLogin: true, loginEmail: 'Dana@Email.com' });
    expect(validateAthleteEntry(b, { todayISO: today, guardianEmail: 'dana@email.com' }).loginEmail)
      .toBe("Use a different email from the guardian's.");
    const c = entry({ ownLogin: true, loginEmail: 'kid@email.com' });
    const d = entry({ ownLogin: true, loginEmail: 'KID@email.com' });
    expect(validateAthleteEntry(d, { todayISO: today, siblings: [c, d] }).loginEmail).toBe('Each athlete needs their own email.');
    expect(validateAthleteEntry(c, { todayISO: today, siblings: [c] })).toEqual({});
  });
});

describe('payloads (contract 1.2 / 1.3)', () => {
  const form = {
    mode: 'parent',
    contact: { name: ' Dana Whitfield ', email: 'dana@email.com', phone: '(612) 555-0148', relationship: 'Mother' },
    athletes: [
      entry({ handicap: '12', contractMinutes: 45, ownLogin: true, loginEmail: ' Jordan@Email.com ' }),
      entry({ name: 'Reese', dob: '2014-03-02', packageId: 't-6', handicap: '' }),
    ],
    emergencyContact: '  ',
    medical: 'Peanut allergy',
    consents: { dataCollection: true, videoCapture: true, mediaRelease: false, facilityAccess: false },
    signatureName: 'Dana Whitfield',
  };
  test('createFamily body is exactly the contract shape', () => {
    expect(buildCreateFamilyPayload(form)).toEqual({
      mode: 'parent',
      contact: { name: 'Dana Whitfield', email: 'dana@email.com', phone: '(612) 555-0148', relationship: 'Mother' },
      athletes: [
        { name: 'Jordan', dob: '2012-06-17', packageId: 't-12', contractMinutes: 45, handicap: 12, loginEmail: 'jordan@email.com' },
        { name: 'Reese', dob: '2014-03-02', packageId: 't-6', contractMinutes: null, handicap: null, loginEmail: null },
      ],
      emergencyContact: null,
      medical: 'Peanut allergy',
      consents: { dataCollection: true, videoCapture: true, mediaRelease: false, facilityAccess: false },
      signatureName: 'Dana Whitfield',
    });
  });
  test('athlete mode: relationship null, loginEmail null', () => {
    const p = buildCreateFamilyPayload({ ...form, mode: 'athlete', athletes: [form.athletes[0]] });
    expect(p.contact.relationship).toBeNull();
    expect(p.athletes[0].loginEmail).toBeNull();
  });
  test('addAthletes body', () => {
    expect(buildAddAthletesPayload({ ...form, athletes: [form.athletes[1]] })).toEqual({
      athletes: [{ name: 'Reese', dob: '2014-03-02', packageId: 't-6', contractMinutes: null, handicap: null, loginEmail: null }],
      emergencyContact: null,
      medical: 'Peanut allergy',
    });
  });
  test('the emergency contact is sent trimmed, relationship optional; all blank is null', () => {
    const ec = { name: ' Uncle Bo ', phone: ' (612) 555-0100 ', relationship: ' Uncle ' };
    expect(buildCreateFamilyPayload({ ...form, emergencyContact: ec }).emergencyContact)
      .toEqual({ name: 'Uncle Bo', phone: '(612) 555-0100', relationship: 'Uncle' });
    expect(buildAddAthletesPayload({ ...form, emergencyContact: { ...ec, relationship: '  ' } }).emergencyContact)
      .toEqual({ name: 'Uncle Bo', phone: '(612) 555-0100', relationship: null });
    expect(buildCreateFamilyPayload({ ...form, emergencyContact: emptyEmergencyContact() }).emergencyContact).toBeNull();
    expect(buildAddAthletesPayload({ ...form, emergencyContact: { name: ' ', phone: '', relationship: ' ' } }).emergencyContact).toBeNull();
  });
  test('contractPicked stays in the form; the payload never carries it', () => {
    const picked = entry({ contractMinutes: null, contractPicked: true });
    const body = buildCreateFamilyPayload({ ...form, athletes: [picked] });
    expect(body.athletes[0]).not.toHaveProperty('contractPicked');
    expect(body.athletes[0].contractMinutes).toBeNull();
  });
});

describe('emergency contact', () => {
  test('toEmergencyForm: an old string becomes the name; anything else is blank', () => {
    expect(toEmergencyForm('Uncle Bo 555')).toEqual({ name: 'Uncle Bo 555', phone: '', relationship: '' });
    expect(toEmergencyForm({ name: 'Bo', phone: '555', relationship: 'Uncle', extra: 1 })).toEqual({ name: 'Bo', phone: '555', relationship: 'Uncle' });
    expect(toEmergencyForm({ name: 'Bo', phone: 555 })).toEqual({ name: 'Bo', phone: '', relationship: '' });
    expect(toEmergencyForm(null)).toEqual(emptyEmergencyContact());
    expect(toEmergencyForm(undefined)).toEqual(emptyEmergencyContact());
  });
  test('validateEmergencyContact: all blank passes; once started, name and mobile are needed', () => {
    const name = 'Add their name, or clear the other emergency fields.';
    const phone = 'Add a mobile number we can call.';
    expect(validateEmergencyContact(emptyEmergencyContact())).toEqual({});
    expect(validateEmergencyContact({ name: ' ', phone: ' ', relationship: ' ' })).toEqual({});
    expect(validateEmergencyContact({ name: 'Bo', phone: '', relationship: '' })).toEqual({ phone });
    expect(validateEmergencyContact({ name: '', phone: '555', relationship: '' })).toEqual({ name });
    expect(validateEmergencyContact({ name: '', phone: '', relationship: 'Uncle' })).toEqual({ name, phone });
    expect(validateEmergencyContact({ name: 'Bo', phone: '555', relationship: '' })).toEqual({});
    expect(validateEmergencyContact('Uncle Bo 555')).toEqual({ phone });
  });
});

describe('contract step', () => {
  test('a new entry has not answered yet', () => {
    expect(newAthleteEntry().contractPicked).toBe(false);
    expect(contractAnswered(newAthleteEntry())).toBe(false);
  });
  test('a goal or "Not yet" answers it; a stale 95 does not', () => {
    expect(contractAnswered(entry({ contractMinutes: 45 }))).toBe(true);
    expect(contractAnswered(entry({ contractMinutes: 45, contractPicked: undefined }))).toBe(true); // an old draft's pick
    expect(contractAnswered(entry({ contractMinutes: null, contractPicked: true }))).toBe(true);
    expect(contractAnswered(entry({ contractMinutes: 95 }))).toBe(false);
    expect(contractAnswered(entry({ contractMinutes: 95, contractPicked: true }))).toBe(false);
  });
  test('joinNames', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Nico'])).toBe('Nico');
    expect(joinNames(['Nico', 'Reese'])).toBe('Nico and Reese');
    expect(joinNames(['Nico', 'Reese', 'Sam'])).toBe('Nico, Reese and Sam');
  });
});

describe('Commitment Contract hidden (owner ruling 2026-09-30)', () => {
  beforeEach(() => { delete process.env.REACT_APP_CONTRACT_ENABLED; });
  const form = {
    mode: 'parent',
    contact: { name: 'Dana', email: 'dana@email.com', phone: '(612) 555-0148', relationship: '' },
    athletes: [entry({ contractMinutes: 45, contractPicked: true }), entry({ name: 'Reese', contractMinutes: 95 })],
    emergencyContact: '', medical: '',
    consents: { dataCollection: true, videoCapture: true, mediaRelease: false, facilityAccess: false },
    signatureName: 'Dana',
  };
  test('off: every athlete is sent with contractMinutes null, whatever the form holds', () => {
    expect(buildCreateFamilyPayload(form).athletes.map((a) => a.contractMinutes)).toEqual([null, null]);
    expect(buildAddAthletesPayload(form).athletes.map((a) => a.contractMinutes)).toEqual([null, null]);
  });
  test('off: a stale contract value is not a validation error', () => {
    expect(validateAthleteEntry(entry({ contractMinutes: 95 }), { todayISO: today })).toEqual({});
  });
  test('the explicit override wins over the flag (the harness contract step)', () => {
    expect(buildCreateFamilyPayload(form, { contract: true }).athletes[0].contractMinutes).toBe(45);
    expect(validateAthleteEntry(entry({ contractMinutes: 95 }), { todayISO: today, contract: true }).contractMinutes)
      .toBe('Pick 20, 45 or 90 minutes.');
  });
  test('on: the goal is sent and a stale 95 is refused, as before', () => {
    process.env.REACT_APP_CONTRACT_ENABLED = 'true';
    expect(buildAddAthletesPayload(form).athletes.map((a) => a.contractMinutes)).toEqual([45, 95]);
    expect(validateAthleteEntry(entry({ contractMinutes: 95 }), { todayISO: today }).contractMinutes).toBe('Pick 20, 45 or 90 minutes.');
  });
});
