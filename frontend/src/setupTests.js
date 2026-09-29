// Firebase never initialises under jest: src/firebase.js throws on a missing
// API key (firebase.js:35-42, getAuth), and no test needs a real app. Hooks
// keep importing the same names; screens run in seed mode (isLive() false).
// react-scripts test loads frontend/.env, and a developer checkout carries
// REACT_APP_PORTAL_LIVE_DATA=true (the :3000 posture) - force seed mode here
// so every suite sees the same flags as a clean checkout (Sprint 20
// integration: PortalRoutes.test.js hit the real onAuthStateChanged).
process.env.REACT_APP_PORTAL_LIVE_DATA = 'false';
delete process.env.REACT_APP_USE_EMULATORS;
jest.mock('./firebase', () => ({
  __esModule: true,
  default: {},
  auth: { currentUser: null },
  provider: {},
  db: {},
  storage: {},
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
