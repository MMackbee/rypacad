/**
 * useChangePackage over a mocked adapter: live mode delegates to live.js's
 * changePendingPackage; seed mode is a local echo that writes nothing.
 */
const mockChangePendingPackage = jest.fn();
let mockLive = true;
jest.mock('./live', () => ({
  isLive: () => mockLive,
  changePendingPackage: (...args) => mockChangePendingPackage(...args),
}));

import { useChangePackage } from './packageChange';

beforeEach(() => {
  mockChangePendingPackage.mockReset();
  mockChangePendingPackage.mockResolvedValue({ athleteId: 'a2', packageId: 't-12' });
});

test('live: the adapter writes, and its refusal reaches the caller', async () => {
  mockLive = true;
  const { change } = useChangePackage();
  await expect(change('a2', 't-12')).resolves.toEqual({ athleteId: 'a2', packageId: 't-12' });
  expect(mockChangePendingPackage).toHaveBeenCalledWith('a2', 't-12');
  mockChangePendingPackage.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
  await expect(change('a2', 'elite')).rejects.toMatchObject({ code: 'permission-denied' });
});

test('seed: a local echo, no write', async () => {
  mockLive = false;
  const { change } = useChangePackage();
  await expect(change('a2', 't-6')).resolves.toEqual({ athleteId: 'a2', packageId: 't-6', simulated: true });
  expect(mockChangePendingPackage).not.toHaveBeenCalled();
});
