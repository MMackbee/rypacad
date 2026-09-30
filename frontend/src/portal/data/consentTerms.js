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
        'Access is for the named athlete only. The entry code or key is personal and must not be shared or lent, including to teammates.',
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
        'Facility access is a separate monthly add-on to a membership, billed with it. Cancel any time from Billing; access ends at the end of the paid month.',
      ],
    },
  ],
};
