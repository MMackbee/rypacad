/**
 * The single staff family page (owner 2026-11-16: "I click on a family in 3
 * different spots and get different options in each one. This isn't
 * acceptable"). Every click on a family or an athlete by the owner or ops -
 * Admin's lists, the search, an Outstanding or consent row - lands on ONE
 * page, /portal/admin/households/:householdId (screens/Billing.js, staff
 * view), and every staff action is on it: each athlete's tokens and bookings
 * (Book, Move, Cancel), package, facility access, Issue tokens, handicap and
 * consent; the household's billing day and Stripe ids under Advanced.
 *
 * This file is the paths and the copy. Pure.
 */
import { staffCancellable } from './staffCancel';

/** Roles that get the family page (and its actions). */
export const STAFF_FAMILY_ROLES = ['owner', 'ops'];
export const staffFamilyRole = (role) => STAFF_FAMILY_ROLES.includes(role);

/**
 * The family page, opened on one athlete when `athleteId` is given
 * (`?athlete=`): that athlete's Manage section starts open and in view.
 */
export function familyPagePath(householdId, athleteId = null) {
  const base = `/portal/admin/households/${encodeURIComponent(householdId)}`;
  return athleteId ? `${base}?athlete=${encodeURIComponent(athleteId)}` : base;
}

/**
 * Where a click on an ATHLETE goes when only the athlete is known (an
 * Outstanding row, a consent row, an old bookings link): the route finds the
 * household and lands on the family page, opened on that athlete.
 */
export function staffAthletePath(athleteId) {
  return `/portal/admin/athletes/${encodeURIComponent(athleteId)}`;
}

/** The athlete a family page URL asks to open on, or null. */
export function athleteFocus(search) {
  try {
    const id = new URLSearchParams(search || '').get('athlete');
    return id ? id : null;
  } catch (err) {
    return null;
  }
}

/** The first name, for a button that names its athlete. */
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

export const FAMILY_STAFF_LABEL = 'Family · staff view';
export const FIND_FAMILY_LABEL = 'Find a family or athlete';
export const FIND_FAMILY_CARD_LABEL = 'Find a family';
export const FIND_FAMILY_BODY = "Search by an athlete's or the family's name. Everything for the family is on one page.";
export const ADVANCED_LABEL = 'Advanced';
export const ADVANCED_BODY = "The family's billing day and Stripe ids. Rarely changed.";
export const MANAGE_ON_FAMILY_PAGE = 'Manage on the family page';
export const MANAGE_ON_FAMILY_PAGE_BODY = 'Package, tokens, bookings, handicap and consent are on the family page.';
export const COACHING_VIEW = 'Coaching view: attendance and sessions';
export const OPEN_RESULTS = 'Assessment results';
export const OPEN_COMBINE = 'Combine';
export const LATER_BOOKINGS_LABEL = 'Booked further out';
export const ALL_BOOKINGS_LABEL = 'Bookings';
export const ATHLETE_LOADING = 'Loading…';
export const ATHLETE_LOAD_FAILED = "This athlete's details didn't load. Close and open this section to try again.";

/**
 * A Calendly 1:1 the staff would otherwise cancel here (Booked or No-show,
 * this period on): it changes in Calendly, so the row says so instead of
 * offering a Cancel that the server would refuse.
 */
export function inCalendly(row, periodStart) {
  if (!row || row.kind === 'waitlist' || row.source !== 'calendly') return false;
  return staffCancellable({ ...row, source: null, type: null }, { periodStart });
}

/** "Manage Jordan" - the section's toggle, named for its athlete. */
export function manageLabel(name) {
  const first = firstName(name);
  return first ? `Manage ${first}` : 'Manage';
}
