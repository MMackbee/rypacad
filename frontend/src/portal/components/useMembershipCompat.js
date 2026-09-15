import * as hooks from '../hooks';

/**
 * Shared fallback swap for `useMembership()` (Sprint 11 pin D, contract
 * v1.9) — consumed by Membership.js, Reservations.js's sibling screen
 * SpecialistBooking.js, and AthleteDetail's membership card all reading the
 * same not-yet-landed hook. Does not exist in this worktree yet — routing
 * lane's parallel worktree owns hooks/index.js. Calling `hooks.useMembership`
 * conditionally would break rules of hooks, so the swap happens once here at
 * module load (the same fixed-reference pattern Roster.js and
 * TourStandings.js already use for their own missing exports) and every
 * caller imports the SAME resolved binding rather than redefining it.
 *
 * `usingRealMembershipHook` lets a caller tell "real hook, pure pass-through"
 * apart from "fallback in effect, local demo data drives the screen's own
 * `variant` instead" — see Membership.js's own module doc for the full
 * rationale (TourStandings.js set this precedent first).
 *
 * Looked up via a variable key, not `hooks.useMembership` or even
 * `hooks['useMembership']`: CRA's webpack build (unlike esbuild, which only
 * warns) resolves a namespace import's statically-known property accesses —
 * dot access AND bracket access with a literal string both count — against
 * the target module's real export list, and hard-errors "export not found"
 * when the name is genuinely absent (confirmed against the real dev server;
 * both forms failed the same way). Roster.js/TourStandings.js's own copies
 * of this pattern never hit the error because the hooks they name happen to
 * already exist in hooks/index.js by now — their comments describing a
 * "missing export" are stale, not proof either access form is safe for a
 * genuinely absent one. A property name webpack cannot read directly out of
 * the AST (here, a variable) is not statically resolvable, so its harmony
 * export-specifier check does not fire — the property is still read off the
 * real runtime namespace object exactly as before, undefined when absent,
 * so `|| fallback` fires exactly the same way.
 */
function useMembershipFallback() {
  return { data: null, loading: false, error: null };
}

const KEY = 'useMembership';
export const useMembership = hooks[KEY] || useMembershipFallback;
export const usingRealMembershipHook = Boolean(hooks[KEY]);
