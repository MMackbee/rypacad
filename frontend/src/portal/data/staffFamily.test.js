/**
 * The single staff family page (owner 2026-11-16): its paths and copy.
 */
import { athleteFocus, familyPagePath, focusGone, manageLabel, staffAthletePath, staffFamilyRole } from './staffFamily';
import { searchAthletes } from './staffBooking';

describe('paths', () => {
  test('the family page, alone or opened on one athlete', () => {
    expect(familyPagePath('whitfield')).toBe('/portal/admin/households/whitfield');
    expect(familyPagePath('whitfield', 'jordan')).toBe('/portal/admin/households/whitfield?athlete=jordan');
    expect(familyPagePath('h 1', 'a/b')).toBe('/portal/admin/households/h%201?athlete=a%2Fb');
  });

  test('a click on an athlete goes through the route that finds the family', () => {
    expect(staffAthletePath('jordan')).toBe('/portal/admin/athletes/jordan');
    expect(staffAthletePath({ athleteId: 'jordan', householdId: null })).toBe('/portal/admin/athletes/jordan');
  });

  test('a row that already knows the family goes straight to the family page (speed review, 2026-11-17)', () => {
    expect(staffAthletePath({ athleteId: 'jordan', householdId: 'whitfield' })).toBe('/portal/admin/households/whitfield?athlete=jordan');
    expect(staffAthletePath({ athleteId: 'a/b', householdId: 'h 1' })).toBe('/portal/admin/households/h%201?athlete=a%2Fb');
  });

  // Review 2026-11-17 (F4): a direct link is a fast path; the fresh hub decides.
  test('a page opened on an athlete the fresh hub does not list hands over to the redirect', () => {
    const hub = (over = {}) => ({ loading: false, error: null, isRefreshing: false, data: { members: [{ athleteId: 'jordan' }] }, ...over });
    expect(focusGone({ focusId: 'casey', hub: hub() })).toBe(true);
    expect(focusGone({ focusId: 'jordan', hub: hub() })).toBe(false);
    expect(focusGone({ focusId: null, hub: hub() })).toBe(false);
    // Not on data that may be old, nor before or without a read.
    expect(focusGone({ focusId: 'casey', hub: hub({ isRefreshing: true }) })).toBe(false);
    expect(focusGone({ focusId: 'casey', hub: hub({ loading: true, data: null }) })).toBe(false);
    expect(focusGone({ focusId: 'casey', hub: hub({ error: new Error('x'), data: null }) })).toBe(false);
    // The redirect itself landed here: never back again (no loop).
    expect(focusGone({ focusId: 'casey', hub: hub(), resolved: true })).toBe(false);
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
  const ids = (q) => searchAthletes(directory, q, { family: true }).map((a) => a.athleteId);

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
    expect(searchAthletes(directory, 'britta', { family: true })[0]).toEqual({
      athleteId: 'britta', name: 'Britta', householdId: 'schmidt', householdName: 'Schmidt', packageName: '6 tokens', test: false,
    });
    expect(searchAthletes(directory, 'parker', { family: true })[0].test).toBe(true);
  });

  // Review 2026-11-17: every live household is named "<Surname> family".
  test('"family" and "new" in a household\'s name never match: "f" is not everybody', () => {
    const live = [
      { id: 'a', name: 'Adams family', guardianName: 'Pat Adams', athletes: [{ id: 'faith', name: 'Faith Adams' }, { id: 'ned', name: 'Ned' }] },
      { id: 'b', name: 'New family', guardianName: 'Kim Lee', athletes: [{ id: 'zoe', name: 'Zoe' }] },
    ];
    const find = (q) => searchAthletes(live, q, { family: true }).map((x) => x.athleteId);
    expect(find('f')).toEqual(['faith']);
    expect(find('fam')).toEqual([]);
    expect(find('family')).toEqual([]);
    expect(find('n')).toEqual(['ned']);
    expect(find('new')).toEqual([]);
    expect(find('adams')).toEqual(['faith', 'ned']);
  });

  test('an athlete matched by their own name comes before one matched by the family or the parent', () => {
    const dir = [
      { id: 'a', name: 'Zed family', guardianName: 'Dana Zed', athletes: [{ id: 'amy', name: 'Amy Zed' }] },
      { id: 'b', name: 'Young family', guardianName: 'Sam Young', athletes: [{ id: 'dana', name: 'Dana Young' }] },
    ];
    expect(searchAthletes(dir, 'dana', { family: true }).map((x) => x.athleteId)).toEqual(['dana', 'amy']);
  });

  test("the roster's Add athlete (no option) matches the athlete's own name only, as before", () => {
    expect(searchAthletes(directory, 'whitfield').map((a) => a.athleteId)).toEqual(['jordan']);
    expect(searchAthletes(directory, 'ben')).toEqual([]);
    expect(searchAthletes(directory, 'schmidt')).toEqual([]);
    expect(searchAthletes(directory, 'britta').map((a) => a.athleteId)).toEqual(['britta']);
  });
});
