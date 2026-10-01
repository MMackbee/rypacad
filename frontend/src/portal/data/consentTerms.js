/**
 * The full text behind the consent step's "Read ..." links (owner request,
 * Mike 2026-09-30: the sheets were one sentence each and needed more bulk).
 * Plain language, one heading per section, so a parent can read it on a
 * phone in a minute. The academy owns this copy: edit here, nowhere else.
 *
 * Shape: { [consentId]: [{ heading, lines: [...] }] }. Each line is one
 * paragraph or bullet.
 */
export const CONSENT_TERMS = {
  // Owner 2026-10-01 (Phil): research use rides on the Data collection
  // consent, so the sheet says exactly what that covers.
  dataCollection: [
    {
      heading: 'Research use',
      lines: [
        'RYP Academy may use training and performance numbers, such as attendance, fitness results and swing measurements, in research it may publish, on their own or combined with other data the academy collects.',
        'Names, contact details, dates of birth and anything else that identifies a person are removed first. Video and photos are never published under this consent.',
        'Ask us in writing at any time and we leave your athlete’s numbers out of any future research.',
      ],
    },
  ],
  videoCapture: [
    {
      heading: 'What we record',
      lines: [
        'Multi-angle video of your athlete swinging, plus launch-monitor data, at the Diagnostic and during training blocks.',
        'Recording happens on academy equipment only, in the training bays and on the practice areas.',
      ],
    },
    {
      heading: 'How it is used',
      lines: [
        'Coaches review it with the athlete and compare it against that athlete’s own earlier swings. It is never ranked against other athletes.',
        'Clips are shared inside the portal with the athlete, their parents or guardians, and their coaches. Nothing is posted publicly under this consent.',
      ],
    },
    {
      heading: 'How long we keep it',
      lines: [
        'Video stays for the length of the membership plus 12 months, so an athlete who returns can see their progress.',
        'Ask us in writing at any time and we delete an athlete’s video within 30 days, except clips a coach has already attached to a written diagnostic, which are kept with that record.',
      ],
    },
  ],
  mediaRelease: [
    {
      heading: 'What you are allowing',
      lines: [
        'RYP Academy may use photos and video of your athlete taken at the academy, at academy events and at tournaments we attend.',
        'They may appear on the academy’s website, social media, printed material and in videos about the academy.',
        'We may use a first name and age group with an image. We never publish a last name, school, or contact details of an athlete under 18.',
      ],
    },
    {
      heading: 'What you are not allowing',
      lines: [
        'No third party may use the images for their own advertising without a separate written agreement with you.',
        'Images are never sold.',
      ],
    },
    {
      heading: 'Your choices',
      lines: [
        'This is optional. Declining changes nothing about enrollment, training or how coaches treat your athlete.',
        'You can withdraw it at any time by emailing the academy. We stop new use straight away and remove images we control within 30 days; printed material already produced is not recalled.',
        'There is no payment for the use of images.',
      ],
    },
  ],
  facilityAccess: [
    {
      heading: 'Who may enter',
      lines: [
        'Access is for the athletes in your household, and a parent or guardian may come along. The entry code or key is for your family and must not be shared or lent outside it, including to teammates.',
        'An athlete under 16 must be accompanied by a parent, guardian or an adult the guardian has named to the academy in writing.',
        'One guest may come along, but only to watch. Guests may not hit balls or use equipment.',
      ],
    },
    {
      heading: 'Hours and conduct',
      lines: [
        'The facility is available around the clock outside scheduled academy sessions. When a coached session is running, the bays in use belong to that session.',
        'Leave the bay as you found it: balls picked up, equipment returned, screens and doors closed, lights off if you are the last to leave.',
        'No alcohol, no smoking or vaping, no food in the bays, and no one under the influence of anything.',
        'The building is under camera surveillance at all times for everyone’s safety.',
      ],
    },
    {
      heading: 'Equipment and damage',
      lines: [
        'Use launch monitors, screens and mats only as shown at your induction. Report any fault before you leave, in the portal or by text to the academy.',
        'Damage caused by misuse, or by a guest you brought, is charged to the member.',
      ],
    },
    {
      heading: 'Risk and responsibility',
      lines: [
        'Golf practice carries a risk of injury, including from clubs, balls and equipment. Unsupervised use means no coach is present to prevent or respond to an incident.',
        'By signing, you accept that risk for yourself, or for the athlete you are responsible for, and agree that the academy is not liable for injury or loss during unsupervised use except where caused by the academy’s own negligence.',
        'The academy may suspend or remove facility access at any time for a breach of these rules. Suspended access is not refunded for the month in which it is suspended.',
      ],
    },
    {
      heading: 'Cost and cancelling',
      lines: [
        'Facility access is one monthly add-on per household, billed alongside a membership, and is included with Elite. Cancel any time from Billing; access ends at the end of the paid month.',
      ],
    },
  ],
};

/**
 * The 18+ athlete signing for themselves (registration's "I'm the athlete
 * (18+)", form mode 'athlete') reads the consent rows (data/seed.js
 * CONSENTS) and the terms above in the second person (tester report
 * 2026-09-30). Keyed by the guardian wording: a line not listed reads the
 * same for both, including the rules about minors, which still apply. Edit
 * a guardian line and its entry here too - a test fails if a key goes stale.
 */
export const SELF_WORDING = {
  'Name, date of birth, guardian contact, emergency and medical info, and training records. Collected only where a feature needs it. Training and performance numbers may also be used in research, with names removed.':
    'Your name, date of birth, contact details, emergency and medical info, and training records. Collected only where a feature needs it. Your training and performance numbers may also be used in research, with names removed.',
  'Ask us in writing at any time and we leave your athlete’s numbers out of any future research.':
    'Ask us in writing at any time and we leave your numbers out of any future research.',
  'Multi-angle swing video at the Diagnostic and during training blocks, used for coaching review and benchmarked against your athlete’s own progress.':
    'Multi-angle swing video at the Diagnostic and during training blocks, used for coaching review and benchmarked against your own progress.',
  'Permission to use photos or video of your athlete in RYP marketing. Declining does not affect enrollment or training.':
    'Permission to use photos or video of you in RYP marketing. Declining does not affect enrollment or training.',
  'Only needed if you add 24/7 facility access to a package. Signing as the guardian also gives permission for an athlete under 18. You can add access later — the academy will ask for this then.':
    'Only needed if you add 24/7 facility access to a package. Signing as the athlete, you accept the facility rules for yourself. You can add access later - the academy will ask for this then.',
  'Multi-angle video of your athlete swinging, plus launch-monitor data, at the Diagnostic and during training blocks.':
    'Multi-angle video of you swinging, plus launch-monitor data, at the Diagnostic and during training blocks.',
  'Coaches review it with the athlete and compare it against that athlete’s own earlier swings. It is never ranked against other athletes.':
    'Coaches review it with you and compare it against your own earlier swings. It is never ranked against other athletes.',
  'Clips are shared inside the portal with the athlete, their parents or guardians, and their coaches. Nothing is posted publicly under this consent.':
    'Clips are shared inside the portal with you and your coaches. Nothing is posted publicly under this consent.',
  'Video stays for the length of the membership plus 12 months, so an athlete who returns can see their progress.':
    'Video stays for the length of the membership plus 12 months, so if you return you can see your progress.',
  'Ask us in writing at any time and we delete an athlete’s video within 30 days, except clips a coach has already attached to a written diagnostic, which are kept with that record.':
    'Ask us in writing at any time and we delete your video within 30 days, except clips a coach has already attached to a written diagnostic, which are kept with that record.',
  'RYP Academy may use photos and video of your athlete taken at the academy, at academy events and at tournaments we attend.':
    'RYP Academy may use photos and video of you taken at the academy, at academy events and at tournaments we attend.',
  'This is optional. Declining changes nothing about enrollment, training or how coaches treat your athlete.':
    'This is optional. Declining changes nothing about enrollment, training or how coaches treat you.',
  'Access is for the athletes in your household, and a parent or guardian may come along. The entry code or key is for your family and must not be shared or lent outside it, including to teammates.':
    'Access is for you and any other athlete in your household, and a parent or guardian may come along. The entry code or key is for your household and must not be shared or lent outside it, including to teammates.',
  'By signing, you accept that risk for yourself, or for the athlete you are responsible for, and agree that the academy is not liable for injury or loss during unsupervised use except where caused by the academy’s own negligence.':
    'By signing, you accept that risk for yourself and agree that the academy is not liable for injury or loss during unsupervised use except where caused by the academy’s own negligence.',
};

/** A consent row or terms line as `mode` reads it: 'athlete' gets SELF_WORDING, anyone else the text unchanged. */
export function consentWording(text, mode) {
  return mode === 'athlete' ? SELF_WORDING[text] ?? text : text;
}
