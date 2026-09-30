import React from 'react';
import { renderScreen } from './testRender';
import OnboardingFlow from './OnboardingFlow';
import { athleteSteps, parentSteps } from './OnboardingSteps';

/**
 * The walkthrough with the Commitment Contract hidden (owner ruling
 * 2026-09-30): the athlete track skips its log step and no copy names the
 * contract. Flag on, both tracks are exactly as before.
 */
afterEach(() => { delete process.env.REACT_APP_CONTRACT_ENABLED; });

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
