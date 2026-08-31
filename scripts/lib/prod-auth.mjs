/**
 * Production auth for the sanctioned writer scripts: an access token minted
 * from the developer's own firebase-tools CLI login (the refresh token in the
 * CLI's local configstore). Rules do not apply to IAM-authenticated admin
 * traffic, which is the point — and why every caller is PM/user-gated per
 * docs/portal/TEAM.md.
 *
 * The client id/secret are firebase-tools' public installed-app OAuth client,
 * embedded in the open-source CLI. The refresh token is the developer's login.
 * Tokens are never printed.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

function cliRefreshToken() {
  const store = path.join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  try {
    const cfg = JSON.parse(readFileSync(store, 'utf8'));
    const token = cfg?.tokens?.refresh_token;
    if (!token) throw new Error('no refresh_token in configstore');
    return token;
  } catch (e) {
    console.error(`Could not read the firebase-tools login (${store}): ${e.message}`);
    console.error('Run `npx firebase-tools login` first.');
    process.exit(1);
  }
}

export async function prodAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cliRefreshToken(),
      client_id: CLI_CLIENT_ID,
      client_secret: CLI_CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    console.error(`Token exchange failed (${res.status}). Re-run \`npx firebase-tools login\`.`);
    process.exit(1);
  }
  return (await res.json()).access_token;
}
