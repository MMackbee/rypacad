/**
 * The Slack half of submitFeedback (feedback.js, 2026-10-15): the message
 * the channel reads, and the Web API calls that post it. Every call is
 * form-encoded with the bot token; Slack's `ok: false` throws a SlackError
 * carrying Slack's own error code, which feedback.js logs. Nothing here
 * logs anything, and the token goes only in the Authorization header of a
 * slack.com call - never to the pre-signed upload URL.
 */
'use strict';

const SLACK_API = 'https://slack.com/api/';
const SLACK_TIMEOUT_MS = 15000;
const DOT = '·';

/**
 * @param {*} s Text for a Slack message.
 * @return {string} The text with Slack's three control characters escaped,
 *     so a note can never become a link, a mention or a channel ping.
 */
function slackEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
}

/**
 * A user agent in a few words: "iPhone (iOS 17.5), Safari 17".
 * @param {string} ua The browser's user agent.
 * @return {string} The short form.
 */
function shortAgent(ua) {
  const s = String(ua || '');
  if (!s) return 'unknown device';
  const ios = /OS (\d+)_(\d+)/.exec(s);
  const iosVersion = ios ? ` (iOS ${ios[1]}.${ios[2]})` : '';
  const android = /Android (\d+(?:\.\d+)?)/.exec(s);
  const androidVersion = android ? ` ${android[1]}` : '';
  let os = null;
  if (/iPhone/.test(s)) os = `iPhone${iosVersion}`;
  else if (/iPad/.test(s)) os = `iPad${iosVersion}`;
  else if (/Android/.test(s)) os = `Android${androidVersion}`;
  else if (/CrOS/.test(s)) os = 'ChromeOS';
  else if (/Macintosh|Mac OS X/.test(s)) os = 'Mac';
  else if (/Windows/.test(s)) os = 'Windows';
  else if (/Linux/.test(s)) os = 'Linux';
  const browsers = [
    [/Edg(?:A|iOS)?\/(\d+)/, 'Edge'],
    [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/(?:CriOS|Chrome)\/(\d+)/, 'Chrome'],
    [/(?:FxiOS|Firefox)\/(\d+)/, 'Firefox'],
    [/Version\/(\d+)[\d.]*.*Safari\//, 'Safari'],
  ];
  let browser = null;
  for (const [re, name] of browsers) {
    const m = re.exec(s);
    if (m) {
      browser = `${name} ${m[1]}`;
      break;
    }
  }
  if (!os && !browser) return s.slice(0, 80);
  return [os, browser].filter(Boolean).join(', ');
}

/**
 * @param {!Date} now The clock.
 * @return {string} "Oct 15, 2026, 9:41 AM CDT" in America/Chicago.
 */
function chicagoStamp(now) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZoneName: 'short',
  }).format(now);
}

/**
 * The message the channel reads. Every value the caller or the users doc
 * supplies is escaped.
 * @param {{name: string, role: string, email: string}} sender The sender.
 * @param {!Object} fb The validated feedback.
 * @param {!Date} now The clock.
 * @return {string} The Slack mrkdwn text.
 */
function messageText(sender, fb, now) {
  const e = slackEscape;
  return [
    `*Portal feedback* from ${e(sender.name)} (${e(sender.role)}, ` +
        `${e(sender.email)})`,
    `Page: ${e(fb.page || 'unknown')}`,
    `Device: ${e(shortAgent(fb.userAgent))} ${DOT} ` +
        `${e(fb.viewport || 'unknown')}`,
    `App: ${e(fb.appVersion || 'unknown')} ${DOT} ${chicagoStamp(now)}`,
    '',
    fb.note ? e(fb.note) : '_No note - screenshot only._',
  ].join('\n');
}

/** A Slack call that failed: the method and Slack's own error code. */
class SlackError extends Error {
  /**
   * @param {string} method The Slack method (or 'upload').
   * @param {string} code Slack's `error`, or `http-<status>`.
   */
  constructor(method, code) {
    super(`${method}: ${code}`);
    this.method = method;
    this.code = code;
  }
}

/**
 * One Slack Web API call, form-encoded (the encoding every method used
 * here accepts). Resolves with the body only when Slack says `ok: true`.
 * @param {!Function} fetchFn fetch.
 * @param {string} token The bot token.
 * @param {string} method The Slack method.
 * @param {!Object<string, string>} params Its arguments.
 * @return {!Promise<!Object>} Slack's answer.
 */
async function slackCall(fetchFn, token, method, params) {
  const res = await fetchFn(SLACK_API + method, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
  });
  let body = null;
  try {
    body = await res.json();
  } catch (err) {
    body = null;
  }
  if (!body || body.ok !== true) {
    throw new SlackError(method, (body && typeof body.error === 'string' &&
        body.error) || `http-${res.status}`);
  }
  return body;
}

/**
 * The screenshot and the message as one post: Slack's external upload.
 * @param {!Function} fetchFn fetch.
 * @param {{token: string, channel: string}} cfg The Slack settings.
 * @param {!Object} image The validated image.
 * @param {string} text The message.
 * @param {!Date} now The clock, for the file name.
 * @return {!Promise<void>} Resolves once the post is in the channel.
 */
async function postWithImage(fetchFn, cfg, image, text, now) {
  const filename = `portal-feedback-${now.toISOString().slice(0, 16)
      .replace(/[:T]/g, '-')}.${image.ext}`;
  const ticket = await slackCall(fetchFn, cfg.token,
      'files.getUploadURLExternal',
      {filename, length: String(image.bytes.length)});
  let target = null;
  try {
    target = new URL(ticket.upload_url);
  } catch (err) {
    target = null;
  }
  if (!target || target.protocol !== 'https:' || !ticket.file_id) {
    throw new SlackError('files.getUploadURLExternal', 'bad-upload-url');
  }
  // The upload URL is pre-signed: it takes the bytes and no token.
  const up = await fetchFn(target.href, {
    method: 'POST',
    headers: {'Content-Type': 'application/octet-stream'},
    body: image.bytes,
    signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
  });
  if (!up.ok) throw new SlackError('upload', `http-${up.status}`);
  await slackCall(fetchFn, cfg.token, 'files.completeUploadExternal', {
    files: JSON.stringify([{id: ticket.file_id, title: 'Screenshot'}]),
    channel_id: cfg.channel,
    initial_comment: text,
  });
}

/**
 * The message on its own.
 * @param {!Function} fetchFn fetch.
 * @param {{token: string, channel: string}} cfg The Slack settings.
 * @param {string} text The message.
 * @return {!Promise<void>} Resolves once the post is in the channel.
 */
async function postText(fetchFn, cfg, text) {
  await slackCall(fetchFn, cfg.token, 'chat.postMessage', {
    channel: cfg.channel, text,
    unfurl_links: 'false', unfurl_media: 'false',
  });
}

module.exports = {
  SlackError, messageText, postText, postWithImage, shortAgent, slackEscape,
};
