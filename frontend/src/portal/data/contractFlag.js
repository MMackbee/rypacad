/**
 * The Commitment Contract's switch (owner ruling, Mike 2026-09-30): hidden
 * from sign-up and from the app until closer to launch - without a proper
 * explanation it may scare families. Default OFF. Turn it back on with no
 * code change: REACT_APP_CONTRACT_ENABLED=true in Railway (CRA bakes env at
 * build time, so the variable change rebuilds the site).
 *
 * Read at CALL time, never cached at import, so a test can flip
 * process.env in beforeEach. Off hides the surfaces only: the Contract
 * screen, its hooks, the data fields and the firestore rules all stay, and
 * nothing already stored is touched.
 */
export function contractEnabled() {
  return process.env.REACT_APP_CONTRACT_ENABLED === 'true';
}

/** One part of a " · " line that is contract copy: "45 min tier", "contract behind". */
const CONTRACT_PART = /\bmin tier$|\bcontract\b/i;

/**
 * A " · "-joined subline as shown: unchanged while the contract is on; with
 * its contract parts dropped while it is hidden ('Age 14 · 45 min tier' ->
 * 'Age 14'). Null for a line left empty.
 */
export function hideContractParts(line) {
  if (!line || contractEnabled()) return line ?? null;
  return String(line).split(' · ').filter((part) => !CONTRACT_PART.test(part.trim())).join(' · ') || null;
}
