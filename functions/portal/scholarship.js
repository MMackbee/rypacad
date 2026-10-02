/**
 * submitScholarship - the scholarship application on the public website
 * (owner 2026-10-01: "build the scholarship form into the website").
 *
 * A PUBLIC, unauthenticated HTTPS endpoint (us-central1): the marketing site
 * is static and its families have no login yet. It takes one JSON POST,
 * checks every field, stores the application under
 * `scholarshipApplications/{id}` (Admin SDK only - no client rule opens the
 * collection) and emails it to the academy director.
 *
 * Because anyone can call it:
 *  - CORS answers only the site's own origins (SCHOLARSHIP_ORIGINS);
 *  - every field is length-capped and the whole body is size-capped;
 *  - a honeypot field (`website`) that people never see drops bots quietly;
 *  - the same family + athlete resubmitting inside a minute is refused, and
 *    a later resubmission replaces the earlier one (one row per athlete);
 *  - a daily cap protects the director's inbox.
 * It never emails the applicant: an open endpoint that mails any address it
 * is given would be a relay.
 *
 * The owner decides each application in the portal (2026-10-01,
 * /portal/admin/scholarships): firestore.rules lets an owner write `status`
 * ('new' | 'approved' | 'declined'), `decidedBy` and `decidedAt`, nothing
 * else. A resubmission replaces the family's answers and leaves those three
 * fields exactly as they are stored.
 */
'use strict';

const crypto = require('crypto');
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const email = require('./email');
const {MAIL_SECRETS} = require('./secrets');

const SEASON = '2026-27';
const DAILY_CAP = 100;
const RESUBMIT_MS = 60 * 1000;
const MAX_BODY = 20000;
const DEFAULT_ORIGINS =
    'https://www.rypacademy.com,https://rypacademy.com';
const DEFAULT_TO = 'makel@rypgolf.com';

const RELATIONSHIPS = ['Parent', 'Guardian', 'Other'];
const PACKAGES = ['6 tokens', '12 tokens', '16 tokens', 'Elite',
  'Not sure yet'];
const LEVELS = ['Partial', 'Full'];
const STATUSES = ['new', 'approved', 'declined'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** @return {!Object} The admin Firestore. */
function db() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

/** @return {!Array<string>} The origins CORS answers. */
function allowedOrigins() {
  return String(process.env.SCHOLARSHIP_ORIGINS || DEFAULT_ORIGINS)
      .split(',').map((s) => s.trim()).filter(Boolean);
}

/** A refusal the form can show next to the field it names. */
class Refusal extends Error {
  /**
   * @param {string} field The form field's name.
   * @param {string} message What to fix.
   */
  constructor(field, message) {
    super(message);
    this.field = field;
  }
}

/**
 * One trimmed text field.
 * @param {*} v The raw value.
 * @param {string} field Its name.
 * @param {number} max The length cap.
 * @param {?string} needed The message when it is required and empty.
 * @return {string} The clean value ('' when optional and absent).
 */
function text(v, field, max, needed) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s && needed) throw new Refusal(field, needed);
  if (s.length > max) {
    throw new Refusal(field, `Keep this under ${max} characters.`);
  }
  return s;
}

/**
 * One value from a fixed list.
 * @param {*} v The raw value.
 * @param {string} field Its name.
 * @param {!Array<string>} list The allowed values.
 * @return {string} The value.
 */
function choice(v, field, list) {
  if (!list.includes(v)) throw new Refusal(field, 'Pick one of the options.');
  return v;
}

/**
 * The application, checked and trimmed. Throws Refusal on the first bad
 * field.
 * @param {*} body The parsed JSON body.
 * @param {!Date} now The clock.
 * @return {!Object} The clean application.
 */
function validate(body, now) {
  const b = body && typeof body === 'object' ? body : {};
  const out = {
    parent: text(b.parent, 'parent', 120, 'Add your full name.'),
    relationship: choice(b.relationship, 'relationship', RELATIONSHIPS),
    email: text(b.email, 'email', 200,
        'Add an email address we can reply to.').toLowerCase(),
    phone: text(b.phone, 'phone', 40,
        'Add a mobile number with its area code.'),
    athlete: text(b.athlete, 'athlete', 120, 'Add the athlete\'s full name.'),
    dob: text(b.dob, 'dob', 10, 'Add the athlete\'s date of birth.'),
    school: text(b.school, 'school', 120, null),
    grade: text(b.grade, 'grade', 20, null),
    average: text(b.average, 'average', 60,
        'Add a scoring average, or write "none yet".'),
    handicap: text(b.handicap, 'handicap', 20, null),
    events: text(b.events, 'events', 2000, null),
    package: choice(b.package, 'package', PACKAGES),
    level: choice(b.level, 'level', LEVELS),
    need: text(b.need, 'need', 3000, null),
    statement: text(b.statement, 'statement', 6000,
        'Add the personal statement.'),
  };
  if (!EMAIL_RE.test(out.email)) {
    throw new Refusal('email', 'Add an email address we can reply to.');
  }
  if (out.phone.replace(/\D/g, '').length < 10) {
    throw new Refusal('phone', 'Add a mobile number with its area code.');
  }
  if (!DATE_RE.test(out.dob) || isNaN(Date.parse(out.dob)) ||
      Date.parse(out.dob) >= now.getTime()) {
    throw new Refusal('dob', 'Add the athlete\'s date of birth.');
  }
  if (out.statement.length < 40) {
    throw new Refusal('statement',
        'Add the personal statement. A few sentences is the minimum.');
  }
  if (b.confirmed !== true) {
    throw new Refusal('confirm', 'Tick the box to confirm.');
  }
  return out;
}

/**
 * One row per family + athlete + season, so a resubmission replaces.
 * @param {!Object} a The clean application.
 * @return {string} The document id.
 */
function applicationId(a) {
  return crypto.createHash('sha256')
      .update([SEASON, a.email, a.athlete.toLowerCase(), a.dob].join('|'))
      .digest('hex').slice(0, 32);
}

/**
 * The email the director reads.
 * @param {!Object} a The clean application.
 * @return {{subject: string, text: string}} The message.
 */
function directorEmail(a) {
  const line = (k, v) => `${k}: ${v || 'not given'}`;
  return {
    subject: `Scholarship application - ${a.athlete}`,
    text: [
      `Scholarship application, ${SEASON} season`,
      '',
      line('Parent or guardian', `${a.parent} (${a.relationship})`),
      line('Email', a.email),
      line('Phone', a.phone),
      '',
      line('Athlete', a.athlete),
      line('Date of birth', a.dob),
      line('School', a.school),
      line('Grade', a.grade),
      '',
      line('Tournament scoring average', a.average),
      line('Handicap index', a.handicap),
      line('Tournaments in the last 12 months', a.events),
      '',
      line('Package', a.package),
      line('Assistance requested', a.level),
      line('Family situation', a.need),
      '',
      'Personal statement on the Code of Grit:',
      a.statement,
    ].join('\n'),
  };
}

/**
 * The request, answered. Exported for the unit tests, which pass their own
 * store, mailer and clock.
 * @param {!Object} req The Express request.
 * @param {!Object} res The Express response.
 * @param {{db: (!Object|undefined), sendEmail: (!Function|undefined),
 *     now: (!Date|undefined)}=} deps Test seams.
 * @return {!Promise<void>} Resolves when answered.
 */
async function submitScholarshipHandler(req, res, deps) {
  const d = deps || {};
  const now = d.now || new Date();
  const origin = req.get ? req.get('origin') : null;
  const allowed = Boolean(origin) && allowedOrigins().includes(origin);
  if (allowed) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '3600');
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ok: false, message: 'Use POST.'});
    return;
  }
  // A browser on another site is refused outright. A request with no
  // Origin (not a browser) gets no CORS help and is held to the same checks.
  if (origin && !allowed) {
    res.status(403).json({ok: false, message: 'Not allowed from here.'});
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : null;
  if (!body || JSON.stringify(body).length > MAX_BODY) {
    res.status(400).json({ok: false,
      message: 'The application could not be read. Try again.'});
    return;
  }
  // The honeypot: a field no person sees. Bots are told it worked.
  if (typeof body.website === 'string' && body.website.trim()) {
    res.status(200).json({ok: true});
    return;
  }
  let app;
  try {
    app = validate(body, now);
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    res.status(400).json({ok: false, field: err.field, message: err.message});
    return;
  }
  try {
    const store = d.db || db();
    const ref = store.collection('scholarshipApplications')
        .doc(applicationId(app));
    const before = await ref.get();
    const prior = before.exists ? before.data() || {} : null;
    const last = prior && prior.updatedAtMs ? prior.updatedAtMs : 0;
    if (prior && now.getTime() - last < RESUBMIT_MS) {
      res.status(429).json({ok: false,
        message: 'We already have this application. Give it a minute ' +
            'before sending it again.'});
      return;
    }
    const day = now.toISOString().slice(0, 10);
    const capRef = store.collection('scholarshipMeta').doc(day);
    const cap = await capRef.get();
    const count = cap.exists ? Number((cap.data() || {}).count) || 0 : 0;
    if (count >= DAILY_CAP) {
      console.error(`scholarship daily cap reached (${DAILY_CAP})`);
      res.status(429).json({ok: false,
        message: 'We could not take the application right now. Email ' +
            `${DEFAULT_TO} instead.`});
      return;
    }
    await capRef.set({count: count + 1});
    const mail = directorEmail(app);
    const sent = await (d.sendEmail || email.sendEmail)({
      to: process.env.SCHOLARSHIP_TO || DEFAULT_TO,
      subject: mail.subject, text: mail.text, kind: 'scholarship',
    });
    const row = Object.assign({}, app, {
      season: SEASON,
      submissions: (prior && Number(prior.submissions) || 0) + 1,
      createdAtMs: prior && prior.createdAtMs ? prior.createdAtMs :
          now.getTime(),
      updatedAtMs: now.getTime(),
      email_status: sent && sent.status ? sent.status : 'failed',
    });
    // A resubmission is MERGED and names no decision field, so the owner's
    // status, decidedBy and decidedAt stay as stored - a decision made while
    // this request was sending its email included. `row` carries every
    // answer ('' when not given), so the merge still replaces them all. A
    // first submission is 'new'.
    if (prior && STATUSES.includes(prior.status)) {
      await ref.set(row, {merge: true});
    } else {
      await ref.set(Object.assign(row, {status: 'new'}));
    }
    res.status(200).json({ok: true});
  } catch (err) {
    console.error('scholarship application failed:', err);
    res.status(500).json({ok: false,
      message: 'The application did not save. Try again, or email ' +
          `${DEFAULT_TO}.`});
  }
}

/** The HTTPS endpoint. The mail secrets let it email the director. */
const submitScholarship = functions.runWith({secrets: MAIL_SECRETS})
    .https.onRequest((req, res) => submitScholarshipHandler(req, res));

module.exports = {
  DAILY_CAP, applicationId, directorEmail, submitScholarship,
  submitScholarshipHandler, validate,
};
