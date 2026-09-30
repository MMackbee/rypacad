// Usage: node scripts/register-calendly-webhook.mjs [--status]   (run AFTER the six functions are public; --status only lists subscriptions)
// Calendly webhook for Yannick, end to end, never displaying a secret:
// 1. asks for Yannick's Calendly personal access token (hidden);
// 2. checks the portal's calendlyWebhook is public (needs Mike's org fix);
// 3. makes a NEW signing key in memory, saves it to Firebase Secret Manager
//    through stdin, and redeploys calendlyWebhook to use it;
// 4. proves the deployed function accepts a message signed with the new key
//    (a harmless 'key.check' event: verified, then ignored, nothing written);
// 5. replaces any existing Calendly subscription for this URL and registers
//    invitee.created + invitee.canceled with the new key, then lists it.
// The key exists only in this process. To rotate later, run this again.
import readline from 'node:readline';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_HOOK = 'https://us-central1-rypacad.cloudfunctions.net/calendlyWebhook';
const API = 'https://api.calendly.com';
const MOCK = process.env.REGISTER_CALENDLY_MOCK === '1';

function ask(q, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({input: process.stdin, output: process.stdout, terminal: true});
    let muted = false;
    rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); };
    rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()); });
    muted = Boolean(hidden);
  });
}
function die(msg) { console.log(`\nSTOPPED: ${msg}`); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, MOCK ? 0 : ms));

function run(cmd, stdinText) {
  if (MOCK) { console.log(`  [mock] ${cmd}`); return Promise.resolve(0); }
  return new Promise((resolve) => {
    const p = spawn(cmd, {cwd: REPO, shell: true, stdio: [stdinText ? 'pipe' : 'inherit', 'inherit', 'inherit']});
    if (stdinText) { p.stdin.write(stdinText); p.stdin.end(); }
    p.on('close', resolve);
  });
}
async function cal(token, method, path, body) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method, headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json'},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return {status: res.status, ok: res.ok, json};
}
function signed(key, bodyText, tSec) {
  const t = tSec || Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', key).update(`${t}.`).update(bodyText).digest('hex');
  return `t=${t},v1=${v1}`;
}
async function probe(key) {
  const body = JSON.stringify({event: 'key.check', payload: {}});
  const headers = {'Content-Type': 'application/json'};
  if (key) headers['Calendly-Webhook-Signature'] = signed(key, body);
  const res = await fetch(URL_HOOK, {method: 'POST', headers, body});
  const text = await res.text().catch(() => '');
  return {status: res.status, text: text.slice(0, 120)};
}

console.log('Calendly webhook setup for the RYP portal\n');
const token = process.env.CALENDLY_TOKEN || await ask("Paste Yannick's Calendly personal access token (hidden), then Enter: ", true);
if (!token) die('no token entered.');

const me = await cal(token, 'GET', '/users/me');
if (!me.ok) die(`Calendly rejected the token (HTTP ${me.status}). Check it was copied in full and is Yannick's.`);
const user = me.json.resource;
console.log(`Calendly account: ${user.name} <${user.email}>`);
if (process.argv.includes('--status')) {
  const org = user.current_organization;
  for (const [label, q] of [['user scope', `scope=user&user=${encodeURIComponent(user.uri)}`], ['organization scope', 'scope=organization']]) {
    const r = await cal(token, 'GET', `/webhook_subscriptions?organization=${encodeURIComponent(org)}&${q}&count=100`);
    if (!r.ok) { console.log(`${label}: HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`); continue; }
    const rows = r.json.collection || [];
    console.log(`${label}: ${rows.length} subscription(s)`);
    for (const s of rows) console.log(`  ${s.state}  ${s.callback_url}  events=${(s.events || []).join(',')}  created=${s.created_at}`);
  }
  console.log('Status only: nothing was changed.');
  process.exit(0);
}
const ok = process.env.REGISTER_CALENDLY_YES === '1' ? 'y' : await ask('Is this Yannick\'s account, the one that owns "RYP Academy - Mental Game 1:1"? (y/N) ', false);
if (!/^y/i.test(ok)) die('not confirmed. Nothing was changed.');

const pre = await probe(null);
if (pre.status === 403) die('the portal webhook is not public yet (403). Wait for the org-policy fix and the "open:" step, then run this again. Nothing was changed.');
if (pre.status !== 400) die(`the portal webhook answered ${pre.status} to an unsigned request (expected 400). Nothing was changed.`);
console.log('Portal webhook is reachable and rejects unsigned requests.');

const key = crypto.randomBytes(32).toString('hex');
console.log('\nSaving a new signing key to Firebase (it is never shown) and redeploying calendlyWebhook...');
const setCode = await run('npx firebase-tools functions:secrets:set CALENDLY_WEBHOOK_SIGNING_KEY --project rypacad --data-file - --force', key);
if (setCode !== 0) die('saving the secret failed (see the Firebase output above). Nothing was registered with Calendly.');

let verified = false;
for (let attempt = 1; attempt <= 8 && !verified; attempt++) {
  const r = await probe(key);
  if (r.status === 200 && /ignored/.test(r.text)) { verified = true; break; }
  console.log(`  check ${attempt}: HTTP ${r.status} ${r.text.includes('mismatch') ? '(still the old key, waiting for the new version to roll out)' : ''}`);
  if (attempt === 4) {
    console.log('  Redeploying calendlyWebhook explicitly...');
    await run('npx firebase-tools deploy --only functions:calendlyWebhook --project rypacad');
  }
  await sleep(20000);
}
if (!verified) die('the deployed function never accepted the new key. Nothing was registered with Calendly. Paste this output to Claude.');
console.log('Deployed function accepts the new key (signed test message: verified, ignored, nothing written).');

const org = user.current_organization;
const list = await cal(token, 'GET', `/webhook_subscriptions?organization=${encodeURIComponent(org)}&scope=user&user=${encodeURIComponent(user.uri)}`);
if (!list.ok) die(`could not list Calendly webhooks (HTTP ${list.status}): ${JSON.stringify(list.json).slice(0, 200)}`);
for (const s of (list.json.collection || []).filter((s) => s.callback_url === URL_HOOK)) {
  const d = await cal(token, 'DELETE', s.uri);
  console.log(`Removed old subscription (${s.state}): HTTP ${d.status}`);
}
const created = await cal(token, 'POST', '/webhook_subscriptions', {
  url: URL_HOOK, events: ['invitee.created', 'invitee.canceled'],
  organization: org, user: user.uri, scope: 'user', signing_key: key,
});
if (!created.ok) die(`Calendly refused the subscription (HTTP ${created.status}): ${JSON.stringify(created.json).slice(0, 300)}`);
let mine = [];
for (let i = 1; i <= 5 && !mine.length; i++) {
  await sleep(i === 1 ? 2000 : 6000);
  const after = await cal(token, 'GET', `/webhook_subscriptions?organization=${encodeURIComponent(org)}&scope=user&user=${encodeURIComponent(user.uri)}&count=100`);
  if (!after.ok) { console.log(`  list attempt ${i}: HTTP ${after.status} ${JSON.stringify(after.json).slice(0, 200)}`); continue; }
  mine = (after.json.collection || []).filter((s) => s.callback_url === URL_HOOK);
  if (!mine.length) console.log(`  list attempt ${i}: ${(after.json.collection || []).length} subscription(s) on the account, none for the portal yet`);
}
console.log(`\nCalendly subscriptions for the portal: ${mine.length}`);
for (const s of mine) console.log(`  state=${s.state}  events=${(s.events || []).join(',')}  scope=${s.scope}`);
console.log(mine.length === 1 && mine[0].state === 'active' ?
  '\nALL SET: Yannick bookings now reach the portal. The key is not stored anywhere else; to rotate, run this script again.' :
  '\nCHECK: expected exactly one active subscription. Paste this output to Claude.');
