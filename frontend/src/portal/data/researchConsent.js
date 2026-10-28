/**
 * The research opt-in (assessments spec 7) - PURE. The wording is the
 * owner-approved copy of 2026-10-15, verbatim, and nothing else; `name` is
 * the athlete's first name. The spec words the 18+ checkbox only, so an 18+
 * member on their own login gets that checkbox and the approved line and
 * Read more sheet with their own first name. Second-person rewordings are
 * the owner's to approve first (plan Task 27 Step 1).
 *
 * The rule, the same one functions/portal/family-validate.js
 * normalizeResearch applies: ticked = yes, unticked = no, both recorded; an
 * athlete under 18 is yes only when the assent box is ticked too; 18+
 * answer for themselves and have no assent.
 */
export const RESEARCH_CONTACT = 'makel@rypgolf.com';
export const RESEARCH_SELF_LABEL = 'Research (optional): my results may be used in research.';
export const RESEARCH_CONFIRM_TITLE = 'One quick question about research';
export const RESEARCH_SAVE_LABEL = 'Save my answer';

/** 'Jordan' from 'Jordan Whitfield'. */
export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'your athlete';
}

export const researchLabel = (name) => `Research (optional): ${name}'s results may be used in research.`;
export const researchLine = (name) => `Saying no changes nothing about ${name}'s coaching or testing.`;
export const assentLabel = (name) => `I've talked about this with ${name}, and they agree too.`;
export const confirmBody = (name) =>
  `This season Phil Herder's assessment program measures each athlete's strength, power and growth. We'd like to include ${name}'s results in RYP's research, with names removed. It's optional and changes nothing about their coaching.`;

/** The "Read more" sheet, section by section. */
export function researchSheet(name) {
  const choice = `If you say no, ${name} is tested and coached exactly the same way, and their results are used only to coach them.`;
  return [
    {
      heading: 'What it covers',
      lines: [`RYP Academy and the RYP Golf Research Institute study how junior golfers develop. With your permission we include ${name}'s results in that research: the physical assessment (strength, jump, throw and trunk tests, height and growth measures), clubhead speed and swing-sequencing numbers, attendance, and the training details you tell us about.`],
    },
    {
      heading: 'How it is used',
      lines: ['Names, contact details, dates of birth and anything else that identifies a person are removed first. Findings may be published or shared with research partners only in that form. Video and photos are never used under this consent.'],
    },
    {
      heading: 'Your choice',
      lines: [`This is optional. ${choice} You can change your answer at any time by emailing ${RESEARCH_CONTACT}. A change applies from that date on; results from before a "yes" are never added later.`],
    },
  ];
}

/** The answer recorded: `{ value, assent }`. */
export function researchAnswer({ ticked, assent, minor }) {
  if (!minor) return { value: ticked === true, assent: null };
  const both = ticked === true && assent === true;
  return { value: both, assent: both };
}
