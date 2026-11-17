/**
 * The single staff family page (owner 2026-11-16): its paths and copy.
 */
import { athleteFocus, familyPagePath, manageLabel, staffAthletePath, staffFamilyRole } from './staffFamily';
import { searchAthletes } from './staffBooking';

describe('paths', () => {
  test('the family page, alone or opened on one athlete', () => {
    expect(familyPagePath('whitfield')).toBe('/portal/admin/households/whitfield');
    expect(familyPagePath('whitfield', 'jordan')).toBe('/portal/admin/households/whitfield?athlete=jordan');
    expect(familyPagePath('h 1', 'a/b')).toBe('/portal/admin/households/h%201?athlete=a%2Fb');
  });

  test('a click on an athlete goes through the route that finds the family', () => {
    expect(staffAthletePath('jordan')).toBe('/portal/admin/athletes/jordan');
  });

  test('the athlete a URL opens on', () => {
    expect(athleteFocus('?athlete=jordan')).toBe('jordan');
    expect(athleteFocus('?other=1&athlete=a%2Fb')).toBe('a/b');
    expect(athleteFocus('')).toBeNull();
    expect(athleteFocus('?athlete=')).toBeNull();
    expect(athleteFocus(undefined)).toBeNull();
  });
});

describe('who and what', () => {
  test('the owner and ops only', () => {
    expect(['owner', 'ops', 'coach', 'mental', 'parent', 'athlete', undefined].map(staffFamilyRole)).toEqual([true, true, false, false, false, false, false]);
  });

  test('the Manage toggle names its athlete', () => {
    expect(manageLabel('Jordan Whitfield')).toBe('Manage Jordan');
    expect(manageLabel('  Reese  ')).toBe('Manage Reese');
    expect(manageLabel('')).toBe('Manage');
    expect(manageLabel(null)).toBe('Manage');
  });
});

describe('the search finds a family as well as an athlete', () => {
  const directory = [
    { id: 'whitfield', name: 'Whitfield family', athletes: [{ id: 'jordan', name: 'Jordan Whitfield', packageName: '12 tokens' }, { id: 'nico', name: 'Nico', packageName: 'Elite' }] },
    { id: 'schmidt', name: 'Schmidt', guardianName: 'Ben Schmidt', athletes: [{ id: 'britta', name: 'Britta', packageName: '6 tokens' }] },
    { id: 'parker', name: 'Parker household', test: true, athletes: [{ id: 'sage', name: 'Sage Parker' }] },
  ];
  const ids = (q) => searchAthletes(directory, q).map((a) => a.athleteId);

  test('an athlete by name, as before', () => {
    expect(ids('jor whit')).toEqual(['jordan']);
    expect(ids('ord')).toEqual([]);
    expect(ids('')).toEqual([]);
  });

  test('the family name finds every athlete in it, whatever their own name says', () => {
    expect(ids('whitfield')).toEqual(['jordan', 'nico']);
    expect(ids('schmidt')).toEqual(['britta']);
    // Words may come from both: the athlete's first name and the family's name.
    expect(ids('nico whit')).toEqual(['nico']);
    expect(ids('britta sch')).toEqual(['britta']);
  });

  test('the parent on file finds the family too', () => {
    expect(ids('ben')).toEqual(['britta']);
    expect(ids('ben schmidt')).toEqual(['britta']);
  });

  test('the row still says whose it is and where it leads', () => {
    expect(searchAthletes(directory, 'britta')[0]).toEqual({
      athleteId: 'britta', name: 'Britta', householdId: 'schmidt', householdName: 'Schmidt', packageName: '6 tokens', test: false,
    });
    expect(searchAthletes(directory, 'parker')[0].test).toBe(true);
  });
});
