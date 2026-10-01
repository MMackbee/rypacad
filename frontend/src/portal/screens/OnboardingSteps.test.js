import React from 'react';
import { renderScreen } from './testRender';
import OnboardingFlow from './OnboardingFlow';
import { athleteSteps, parentSteps } from './OnboardingSteps';

/**
 * The walkthrough with the Commitment Contract hidden (owner ruling
 * 2026-09-30): the athlete track skips its log step and no copy names the
 * contract. Flag on, both tracks are exactly as before.
 */
// Is the signed-in family all Elite (hooks/elite.js)? false, like seed mode,
// unless a test says otherwise.
let mockAllElite = false;
jest.mock('../hooks/elite', () => ({ __esModule: true, default: () => mockAllElite }));

afterEach(() => {
  delete process.env.REACT_APP_CONTRACT_ENABLED;
  mockAllElite = false;
});

const copyOf = (steps) => steps.map((s) => [s.title, s.gateLabel, s.instruction?.body, s.instructionDone?.body].join(' ')).join(' ');

test('off: the athlete track has no log step, and no step copy mentions the contract', () => {
  expect(athleteSteps().map((s) => s.id)).toEqual(['welcome', 'dashboard', 'book', 'pools', 'done']);
  expect(parentSteps().map((s) => s.id)).toEqual(['welcome', 'family', 'book', 'tour', 'done']);
  expect(copyOf(athleteSteps())).not.toMatch(/contract|commitment|log today/i);
  expect(copyOf(parentSteps())).not.toMatch(/contract|commitment/i);
});

test('on: the log step and its copy are back, unchanged', () => {
  process.env.REACT_APP_CONTRACT_ENABLED = 'true';
  expect(athleteSteps().map((s) => s.id)).toEqual(['welcome', 'dashboard', 'book', 'log', 'pools', 'done']);
  expect(athleteSteps()[3].gateLabel).toBe('Log today to continue');
  expect(athleteSteps()[1].instruction.body).toContain('your Commitment Contract');
});

test('off: the chooser, the welcome bullets and the recap say nothing about the contract', async () => {
  const chooser = await renderScreen(<OnboardingFlow track={null} />);
  expect(chooser.text()).toContain('Your view: the dashboard, booking a block, and how your tokens work.');
  expect(chooser.text()).not.toMatch(/contract/i);
  await chooser.unmount();
  const welcome = await renderScreen(<OnboardingFlow track="athlete" />);
  expect(welcome.text()).toContain('Step 1 of 5');
  expect(welcome.text()).not.toMatch(/contract|practice minutes/i);
  await welcome.unmount();
  const parent = await renderScreen(<OnboardingFlow track="parent" />);
  expect(parent.text()).not.toMatch(/contract/i);
  await parent.unmount();
  const done = await renderScreen(<OnboardingFlow track="athlete" initialStep={4} />);
  expect(done.text()).toContain('That was practice');
  expect(done.text()).toContain('Your real schedule and your token balance are exactly as they were.');
  expect(done.text()).not.toMatch(/contract|practice day/i);
  await done.unmount();
});

test('on: the chooser and the recap name the contract again', async () => {
  process.env.REACT_APP_CONTRACT_ENABLED = 'true';
  const chooser = await renderScreen(<OnboardingFlow track={null} />);
  expect(chooser.text()).toContain('logging your Commitment Contract day');
  await chooser.unmount();
  const done = await renderScreen(<OnboardingFlow track="athlete" initialStep={5} />);
  expect(done.text()).toContain('No practice day was logged');
  expect(done.text()).toContain('Your real schedule, the Commitment Contract, and your token balance are exactly as they were.');
  await done.unmount();
});

// Tester Mike 2026-09-30, review 2026-10-01: an Elite member holds no tokens,
// so their walkthrough has no tokens step and its own copy names none. The
// practice screens still show the sample (token) family.
describe('an Elite family', () => {
  test('no tokens step, and no step copy mentions tokens', () => {
    expect(athleteSteps(true).map((s) => s.id)).toEqual(['welcome', 'dashboard', 'book', 'done']);
    expect(parentSteps(true).map((s) => s.id)).toEqual(['welcome', 'family', 'book', 'tour', 'done']);
    expect(copyOf(athleteSteps(true))).not.toMatch(/token|balance/i);
    expect(copyOf(parentSteps(true))).not.toMatch(/token|balance/i);
    expect(athleteSteps(true)[2].instruction.body).toContain('Each block says what it includes before you commit.');
    expect(parentSteps(true)[2].instruction.body).toContain('Each block says what it includes before you commit.');
    // The family step still names the sample athlete its screen shows.
    expect(parentSteps(true)[1].instruction.title).toBe('Look at the cards');
    expect(parentSteps(true)[1].instruction.body).toContain('Notice Reese');
  });

  test('contract on: the log step stays, the tokens step still goes', () => {
    process.env.REACT_APP_CONTRACT_ENABLED = 'true';
    expect(athleteSteps(true).map((s) => s.id)).toEqual(['welcome', 'dashboard', 'book', 'log', 'done']);
    expect(copyOf(athleteSteps(true))).not.toMatch(/token/i);
    expect(athleteSteps(true)[1].instruction.body).toContain('your Commitment Contract');
  });

  test('the flow: the chooser, the welcome bullets and the recap say nothing of tokens', async () => {
    mockAllElite = true;
    const chooser = await renderScreen(<OnboardingFlow track={null} />);
    expect(chooser.text()).toContain('Your view: the dashboard and booking a block.');
    expect(chooser.text()).not.toMatch(/token/i);
    await chooser.unmount();
    const welcome = await renderScreen(<OnboardingFlow track="athlete" />);
    expect(welcome.text()).toContain('Step 1 of 4');
    expect(welcome.text()).toContain('Book training blocks and Tour events.');
    expect(welcome.text()).not.toMatch(/token/i);
    await welcome.unmount();
    const parent = await renderScreen(<OnboardingFlow track="parent" />);
    expect(parent.text()).toContain('Book training blocks and Tour events for your athletes.');
    expect(parent.text()).not.toMatch(/token/i);
    await parent.unmount();
    const done = await renderScreen(<OnboardingFlow track="athlete" initialStep={3} />);
    expect(done.text()).toContain('That was practice');
    expect(done.text()).toContain('Your real schedule is exactly as it was.');
    expect(done.text()).not.toMatch(/token/i);
    await done.unmount();
  });

  test('while the family is still being read (null) no token wording is shown; a token family gets it once known', async () => {
    mockAllElite = null;
    const loading = await renderScreen(<OnboardingFlow track="athlete" />);
    expect(loading.text()).not.toMatch(/token/i);
    await loading.unmount();
    mockAllElite = false;
    const member = await renderScreen(<OnboardingFlow track="athlete" />);
    expect(member.text()).toContain('Step 1 of 5');
    expect(member.text()).toContain('every session spends one token from your period.');
    await member.unmount();
  });

  test('a token family keeps the token wording, with hyphens', () => {
    expect(athleteSteps()[2].instruction.body).toContain('Each block says what it spends - one token - before you commit.');
    expect(parentSteps()[2].instruction.body).toContain('Each block says what it spends - one token - before you commit.');
    expect(athleteSteps()[2].instructionDone.body).toContain('exactly what a real booking shows - including the token it spends.');
    expect(parentSteps()[1].instruction.title).toBe('Look at the balances');
  });
});
