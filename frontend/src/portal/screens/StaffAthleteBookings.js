/**
 * The athlete's bookings, staff view (spec 01-spec-admin-booking.md 10.2):
 * /portal/admin/athletes/:athleteId/bookings, for the owner and ops.
 *
 * Task E4 of the staff booking plan (04-plan-admin-booking.md) adds the
 * route (StaffBookingRoutes.js) with this skeleton; Task E5 builds the
 * screen. Until then it renders nothing.
 *
 * @param {string} athleteId
 * @param {'owner'|'ops'} role
 * @param {() => void} onBack  Back to Admin.
 * @param {(householdId: string) => void} onOpenHousehold  The family's staff Billing.
 * @param {boolean} [bare]
 */
export default function StaffAthleteBookings({ athleteId, role, onBack, onOpenHousehold, bare = false }) {
  return null;
}
