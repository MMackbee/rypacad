import { SEED_VIEWER, assessmentAccess, canEditAssessmentSettings, showsAssessmentsTab } from './assessmentAccess';

describe('assessment access mirrors firestore.rules assessStaff / assessReader', () => {
  test('owner, ops, Phil and assessor staff are staff', () => {
    expect(assessmentAccess({ role: 'owner' })).toBe('staff');
    expect(assessmentAccess({ role: 'ops' })).toBe('staff');
    expect(assessmentAccess({ role: 'coach', specialistId: 'phil' })).toBe('staff');
    expect(assessmentAccess({ role: 'coach', assessor: true })).toBe('staff');
    expect(assessmentAccess({ role: 'mental', specialistId: 'mental', assessor: true })).toBe('staff');
  });
  test('every other coach reads (and writes golf only); families and mental without the permission have none', () => {
    expect(assessmentAccess({ role: 'coach' })).toBe('reader');
    expect(assessmentAccess({ role: 'mental', specialistId: 'mental' })).toBeNull();
    expect(assessmentAccess({ role: 'parent', assessor: true })).toBeNull();
    expect(assessmentAccess({ role: 'athlete' })).toBeNull();
    expect(assessmentAccess(null)).toBeNull();
  });
  test('Phil and the owner edit the settings; the tab is for Phil and assessor staff', () => {
    expect(canEditAssessmentSettings({ role: 'owner' })).toBe(true);
    expect(canEditAssessmentSettings({ role: 'coach', specialistId: 'phil' })).toBe(true);
    expect(canEditAssessmentSettings({ role: 'ops' })).toBe(false);
    expect(canEditAssessmentSettings({ role: 'coach', assessor: true })).toBe(false);
    expect(showsAssessmentsTab({ role: 'coach', specialistId: 'phil' })).toBe(true);
    expect(showsAssessmentsTab({ role: 'coach', assessor: true })).toBe(true);
    expect(showsAssessmentsTab({ role: 'coach' })).toBe(false);
    expect(showsAssessmentsTab({ role: 'owner' })).toBe(false);
    expect(assessmentAccess(SEED_VIEWER)).toBe('staff');
  });
});
