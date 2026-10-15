# Portal feedback to Slack - spec (owner-approved 2026-10-15)

Every signed-in portal user (parents, athletes, coaches, specialists, ops,
owners) can send the RYP team a note and a screenshot of the page they are
on. It lands in a **private** Slack channel. Branch `feedback/slack`, off
`develop`.

## 1. What the user sees

- A small **Feedback** button, fixed bottom-right, on every signed-in
  screen. Accessible name "Send feedback", keyboard reachable, hidden when
  printing. Not on sign-in, sign-up or not-provisioned, and not in seed
  mode (the review harness).
- It sits above whatever the screen pins to the bottom - the tab bar or a
  pinned CTA, however tall - and steps aside while one of the screen's own
  bottom sheets is open, so it never covers a tab or a primary button. On a
  wide screen it lines up with the 430 px phone column.
- Tap: the button goes busy while the screenshot is taken; THEN the panel
  opens, so the panel is never in the picture.
- Panel (the CancelSheet bottom-sheet idiom, as a modal dialog): the
  screenshot preview, a note box labelled "What happened, or what would you
  like to change?" (2000 characters at most), an "Include screenshot" switch
  (on by default; off dims the preview and sends no image), Send and Cancel.
- Send needs a note or an included screenshot. While sending, Send shows
  "Sending" with a spinner. Success: the panel closes and "Thanks - sent to
  the RYP team." shows for 4 seconds. Failure: the panel stays open, the
  function's plain message shows under the note, and Send tries again.
- A failed capture opens the panel without a screenshot and says so: "The
  screenshot could not be taken, so only your note will be sent."

## 2. The screenshot

- `html-to-image` (loaded on the first tap, its own chunk) draws `#root` at
  the viewport size. The feedback UI renders into `<body>`, outside
  `#root`, and is filtered out by `data-feedback-ui` as well.
- Scrolled areas come out as the user sees them (the clone has no scroll
  position, so each scrolled element is pinned for the moment of the
  capture and put back).
- Long side at most 1600 px; JPEG 0.8, stepping down to 0.65, 0.5, then 70%
  size, so the image stays under ~1.5 MB.
- Fonts: the latin Raleway / Work Sans faces are embedded, fetched once per
  page load within 2.5 s; past that one shot uses the system font.
- Cross-origin images and iframes (Calendly) come out blank. Accepted.

## 3. The function

`submitFeedback`, a 1st-gen callable in `functions/portal/feedback.js`
(the Slack calls and message text in `feedback-slack.js`), exported from
`functions/index.js` (17 functions in all).

- **Auth required**; an account with no `users/{uid}` doc is refused
  (`permission-denied`, `not-provisioned`).
- **Input** `{note, page, viewport, userAgent, appVersion, image?: {dataUrl,
  width, height}}`. Refused with `invalid-argument`: note over 2000
  characters; page over 300; an image that is not `image/jpeg` or
  `image/png` base64 with a real JPEG/PNG signature, or over 2 MB decoded;
  neither a note nor an image. The page keeps path and query only: anything
  after `#` and any `token` / `code` / `oobCode` / `apiKey` / `session`
  query value is dropped (any case), in the browser and again here.
- **Identity** from `users/{uid}`: `displayName`, `role`, `email` (the
  verified token's email if the doc has none). Never from the payload.
- **Rate limit**: 10 per account per rolling hour, `feedbackLimits/{uid}`,
  in a transaction; the 11th gets `resource-exhausted` "That is a lot of
  feedback in one hour - thank you. Try again a little later." A send Slack
  refuses gives its slot back.
- **Config**: secret `SLACK_FEEDBACK_TOKEN` (bot token, scopes `chat:write`,
  `files:write`), bound with `runWith({secrets})` like the mail secrets;
  channel id `SLACK_FEEDBACK_CHANNEL` in `functions/.env`. Either missing:
  `failed-precondition` "Feedback is not set up yet."
- **Slack**: with an image, `files.getUploadURLExternal` -> POST the bytes to
  `upload_url` -> `files.completeUploadExternal` (`channel_id`,
  `initial_comment` = the message). Without one, `chat.postMessage`. Slack
  `ok: false` (or a network failure) is logged by its error code and
  returned as `unavailable` "Feedback could not be sent right now. Try again
  in a minute."
- **Message** (every supplied value has `&`, `<`, `>` escaped, so a note
  cannot ping or link):

  ```
  *Portal feedback* from <name> (<role>, <email>)
  Page: <page>
  Device: <short user agent> · <viewport>
  App: <app version> · <Chicago time>

  <note>
  ```

  App version is `REACT_APP_VERSION` if Railway sets one, else `build
  <hash>` from the production bundle's file name, which changes with every
  deploy.
- Never logged: the token, the image.

## 4. Data and rules

`feedbackLimits/{uid}`: `{sentAtMs: number[], updatedAtMs: number}`, Admin
SDK only. `firestore.rules` names it with `allow read, write: if false` -
the sender cannot read or reset its own limit. Rules probe:
`scripts/verify-rules.mjs` `taskFeedback`. DATA-MODEL.md has the entry.

## 5. Owner setup and deploy

RUNBOOK-SPRINT-20.md section 11. The secret must exist BEFORE any functions
deploy that includes this code - a declared secret that does not exist
fails the whole deploy.

## 6. Not in scope

Replies or threads back to the sender, attachments other than the one
screenshot, a feedback list inside the portal, feedback from signed-out
visitors.
