/**
 * Flip the server-readable contract switch (spec 6): config/contract
 * { enabled, enabledAt }. The Monday reminder (mentalCheckinReminders)
 * sends nothing while enabled is false. The family-facing switch is still
 * REACT_APP_CONTRACT_ENABLED on Railway; the owner sets both.
 *
 *   node scripts/set-contract-flag.mjs --prod --on --dry-run
 *   node scripts/set-contract-flag.mjs --prod --on --yes      (the owner runs this one)
 *   node --env-file=scripts/emulator.mental.env scripts/set-contract-flag.mjs --on --yes
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commit, docName, fsFields, getDoc, resolveTarget } from './lib/firestore-rest.mjs';

const chicagoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());

export function parseArgs(argv) {
  const out = { prod: false, on: null, dryRun: false, yes: false };
  for (const a of argv) {
    if (a === '--prod') out.prod = true;
    else if (a === '--on') { if (out.on === false) return { error: 'Pass --on or --off, not both.' }; out.on = true; }
    else if (a === '--off') { if (out.on === true) return { error: 'Pass --on or --off, not both.' }; out.on = false; }
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--yes') out.yes = true;
    else return { error: `Unknown argument: ${a}` };
  }
  if (out.on == null) return { error: 'Pass --on or --off.' };
  if (out.dryRun === out.yes) return { error: 'Pass exactly one of --dry-run or --yes.' };
  return out;
}

/**
 * enabledAt is the overdue clock for every never-checked-in athlete (spec 4.4),
 * so a second --on (a rehearsal, a re-run to be sure) must NOT move it: keep
 * the stored date while the switch is already on; otherwise today; null off.
 */
export function enabledAtFor({ on, today, current }) {
  if (!on) return null;
  const kept = current && current.enabled === true && typeof current.enabledAt === 'string' ? current.enabledAt : null;
  return kept || today;
}

export function buildWrite({ on, today, current = null }) {
  return { update: { name: docName('config', 'contract'), fields: fsFields({ enabled: on, enabledAt: enabledAtFor({ on, today, current }) }) } };
}

export async function main(argv = process.argv.slice(2), { today = chicagoToday() } = {}) {
  const args = parseArgs(argv);
  if (args.error) { console.error(args.error); return 1; }
  const target = await resolveTarget({ prod: args.prod });
  console.log(`Target: ${target.label}${args.dryRun ? ' (dry run, nothing is written)' : ''}`);
  const current = await getDoc(target, 'config', 'contract');
  console.log(current ? `config/contract: ${JSON.stringify(current)}` : 'config/contract: not set');
  const enabledAt = enabledAtFor({ on: args.on, today, current });
  const next = { enabled: args.on, enabledAt };
  if (args.on && enabledAt !== today) console.log(`enabledAt kept: already on since ${enabledAt} (the overdue clock does not move on a re-run)`);
  console.log(`Planned: ${JSON.stringify(next)}`);
  if (args.dryRun) { console.log('Would write it. Run again with --yes instead of --dry-run.'); return 0; }
  await commit(target, [buildWrite({ on: args.on, today, current })]);
  const after = await getDoc(target, 'config', 'contract');
  const ok = after && after.enabled === next.enabled && (after.enabledAt ?? null) === next.enabledAt;
  console.log(ok ? `config/contract is now ${JSON.stringify(after)}` : `Read-back differs: ${JSON.stringify(after)}`);
  return ok ? 0 : 1;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
