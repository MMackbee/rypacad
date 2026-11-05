/**
 * Mental performance consent - the version of the form the portal asks
 * families to sign (spec 7). A header module: no form text here, because
 * this file ships in the main bundle; the text lives in
 * ./mentalConsentTerms.js, which only the lazy consent screens import.
 *
 * A record signed under any other version still counts as signed.
 */
export const CONSENT_VERSION = '2026-10-30';
