/**
 * Who may do what with assessments (spec 3) - the client half of
 * firestore.rules' assessStaff() / assessReader(). Navigation only: the
 * rules are the boundary. `user` is useAuthSession().user.
 *   staff  - owner, ops, Phil (specialistId 'phil'), and a coach or mental
 *            account the owner gave the Assessments permission
 *            (users.assessor == true): read and write every section.
 *   reader - every other coach: read everything, write the golf section.
 *   null   - families, and anyone else.
 */
export function assessmentAccess(user) {
  if (!user) return null;
  if (user.role === 'owner' || user.role === 'ops') return 'staff';
  if (user.specialistId === 'phil') return 'staff';
  if ((user.role === 'coach' || user.role === 'mental') && user.assessor === true) return 'staff';
  if (user.role === 'coach') return 'reader';
  return null;
}

/** Settings are Phil's and the owner's (spec 4.6). */
export function canEditAssessmentSettings(user) {
  return Boolean(user) && (user.role === 'owner' || user.specialistId === 'phil');
}

/** The Assessments tab replaces Capture for Phil and assessor staff (spec 5); owners and ops reach it from Admin. */
export function showsAssessmentsTab(user) {
  return Boolean(user) && (user.specialistId === 'phil' || ((user.role === 'coach' || user.role === 'mental') && user.assessor === true));
}

/** Seed mode (the review scaffold) shows the assessment screens as Phil sees them. */
export const SEED_VIEWER = { uid: 'phil', role: 'coach', specialistId: 'phil', assessor: false };
