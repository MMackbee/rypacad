// Firebase never initialises under jest: src/firebase.js throws on a missing
// API key (firebase.js:35-42, getAuth), and no test needs a real app. Hooks
// keep importing the same names; screens run in seed mode (isLive() false).
jest.mock('./firebase', () => ({
  __esModule: true,
  default: {},
  auth: { currentUser: null },
  provider: {},
  db: {},
  storage: {},
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
