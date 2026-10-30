import { familyHint, isFirstNameOnly } from './athleteLabel';

test('isFirstNameOnly: one word only', () => {
  expect(isFirstNameOnly('Brooks')).toBe(true);
  expect(isFirstNameOnly('  Brooks ')).toBe(true);
  expect(isFirstNameOnly('Lucas Rossow')).toBe(false);
  expect(isFirstNameOnly('')).toBe(false);
  expect(isFirstNameOnly('   ')).toBe(false);
  expect(isFirstNameOnly(null)).toBe(false);
  expect(isFirstNameOnly(undefined)).toBe(false);
});

test('familyHint: the family name beside a first-name-only athlete, otherwise null', () => {
  expect(familyHint('Brooks', 'Erickson family')).toBe('Erickson family');
  expect(familyHint('Brooks', '  Erickson family ')).toBe('Erickson family');
  expect(familyHint('Brooks', '  ')).toBeNull();
  expect(familyHint('Brooks', null)).toBeNull();
  expect(familyHint('Brooks', 7)).toBeNull();
  expect(familyHint('Addie Schinka', 'Schinka family')).toBeNull();
  expect(familyHint('', 'Nobody family')).toBeNull();
});
