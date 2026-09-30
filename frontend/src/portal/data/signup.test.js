import {
  ageOnDate, buildAddAthletesPayload, buildCreateFamilyPayload, contractAnswered, emptyEmergencyContact, facilityOptionFor,
  facilityWaiverRequired, isAdultOnDate, joinNames, newAthleteEntry, normalizeHandicap, toAthleteEntry, toEmergencyForm,
  validateAthleteEntry, validateEmergencyContact, wantsFacility,
} from './signup';

const today = '2026-10-01';
const entry = (over) => ({ ...newAthleteEntry(), name: 'Jordan', dob: '2012-06-17', packageId: 't-12', ...over });

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
        { name: 'Jordan', dob: '2012-06-17', packageId: 't-12', contractMinutes: 45, handicap: 12, loginEmail: 'jordan@email.com', facilityRequested: false },
        { name: 'Reese', dob: '2014-03-02', packageId: 't-6', contractMinutes: null, handicap: null, loginEmail: null, facilityRequested: false },
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
      athletes: [{ name: 'Reese', dob: '2014-03-02', packageId: 't-6', contractMinutes: null, handicap: null, loginEmail: null, facilityRequested: false }],
      emergencyContact: null,
      medical: 'Peanut allergy',
    });
  });
  test('facilityRequested: sent true only for a ticked token package, in both bodies', () => {
    const ticked = (over) => entry({ facilityRequested: true, ...over });
    const athletes = [ticked(), ticked({ packageId: 'elite' }), ticked({ packageId: 'single' }), ticked({ packageId: null }), entry()];
    const flags = (body) => body.athletes.map((a) => a.facilityRequested);
    expect(flags(buildCreateFamilyPayload({ ...form, athletes }))).toEqual([true, false, false, false, false]);
    expect(flags(buildAddAthletesPayload({ ...form, athletes }))).toEqual([true, false, false, false, false]);
    // An old draft's entry (no field) sends false, never undefined.
    const { facilityRequested, ...legacy } = entry();
    expect(facilityRequested).toBe(false);
    expect(buildCreateFamilyPayload({ ...form, athletes: [legacy] }).athletes[0].facilityRequested).toBe(false);
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

describe('facility add-on (owner request, Mike 2026-09-30)', () => {
  test('a new entry is unticked; an old draft entry restores unticked, a ticked one stays ticked', () => {
    expect(newAthleteEntry().facilityRequested).toBe(false);
    const { facilityRequested, ...old } = entry();
    expect(old).not.toHaveProperty('facilityRequested');
    expect(toAthleteEntry(old)).toEqual({ ...old, facilityRequested });
    expect(toAthleteEntry(entry({ facilityRequested: true })).facilityRequested).toBe(true);
    expect(toAthleteEntry(entry({ facilityRequested: 'yes' })).facilityRequested).toBe(false);
  });
  test('offered on the token packages, included with Elite, never on the single token or no pick', () => {
    for (const id of ['t-6', 't-12', 't-16']) expect(facilityOptionFor(id)).toBe('offer');
    expect(facilityOptionFor('elite')).toBe('included');
    expect(facilityOptionFor('single')).toBeNull();
    expect(facilityOptionFor(null)).toBeNull();
    expect(facilityOptionFor('t-20')).toBeNull();
  });
  test('a tick counts only where it is offered; the waiver is required once any athlete keeps one', () => {
    expect(wantsFacility(entry({ facilityRequested: true }))).toBe(true);
    expect(wantsFacility(entry({ facilityRequested: true, packageId: 'elite' }))).toBe(false);
    expect(wantsFacility(entry({ facilityRequested: true, packageId: 'single' }))).toBe(false);
    expect(wantsFacility(entry())).toBe(false);
    expect(wantsFacility(null)).toBe(false);
    expect(facilityWaiverRequired([entry(), entry({ facilityRequested: true, packageId: 't-6' })])).toBe(true);
    expect(facilityWaiverRequired([entry(), entry({ facilityRequested: true, packageId: 'elite' })])).toBe(false);
    expect(facilityWaiverRequired([])).toBe(false);
    expect(facilityWaiverRequired(undefined)).toBe(false);
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
