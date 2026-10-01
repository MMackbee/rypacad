/**
 * A stand-in Firestore for the waitlist `*.test.js` files in this folder:
 * documents live in a plain `{'collection/id': body}` map and only the calls
 * the waitlist modules make are answered. A transaction buffers its writes
 * and refuses a read after a write, the rule the real one enforces.
 * Test support only - nothing in index.js requires it.
 */
'use strict';

const millis = (v) =>
  (v && typeof v.toMillis === 'function' ? v.toMillis() : v);

const OPS = {
  '==': (a, b) => a === b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  'in': (a, b) => b.includes(a),
};

/**
 * @param {!Object} docs `{'sessions/s1': {...}}`, written into by the fake.
 * @return {!Object} The stand-in: doc refs, queries, batches, transactions.
 */
function fakeDb(docs) {
  let seq = 0;
  const write = {
    set: (path, data) => {
      docs[path] = data;
    },
    create: (path, data) => {
      if (path in docs) throw new Error(`already exists: ${path}`);
      docs[path] = data;
    },
    update: (path, data) => {
      if (!(path in docs)) throw new Error(`nothing to update: ${path}`);
      docs[path] = Object.assign({}, docs[path], data);
    },
    delete: (path) => {
      delete docs[path];
    },
  };
  const ref = (path) => ({
    id: path.split('/').pop(),
    path,
    get: async () => snapOf(path),
    set: async (data) => write.set(path, data),
    create: async (data) => write.create(path, data),
    update: async (data) => write.update(path, data),
    delete: async () => write.delete(path),
  });
  const snapOf = (path) => ({
    id: path.split('/').pop(),
    exists: path in docs,
    data: () => docs[path],
    ref: ref(path),
  });
  const query = (name, filters, order, max) => ({
    where: (f, op, v) => query(name, filters.concat([[f, op, v]]), order, max),
    orderBy: (f, dir) => query(name, filters, [f, dir === 'desc' ? -1 : 1],
        max),
    limit: (n) => query(name, filters, order, n),
    get: async () => {
      let paths = Object.keys(docs).filter((p) =>
        p.startsWith(`${name}/`) && p.split('/').length === 2 &&
          filters.every(([f, op, v]) => docs[p][f] !== undefined &&
              OPS[op](docs[p][f], v)));
      if (order) {
        const [f, sign] = order;
        paths = paths.filter((p) => docs[p][f] !== undefined).sort((a, b) =>
          sign * (millis(docs[a][f]) < millis(docs[b][f]) ? -1 :
              millis(docs[a][f]) > millis(docs[b][f]) ? 1 : 0));
      }
      if (max) paths = paths.slice(0, max);
      const found = paths.map(snapOf);
      return {docs: found, empty: found.length === 0, size: found.length};
    },
  });
  const buffered = (pending, onWrite) => {
    const b = {};
    for (const op of Object.keys(write)) {
      b[op] = (target, data) => {
        if (onWrite) onWrite();
        pending.push([op, target.path, data]);
        return b;
      };
    }
    return b;
  };
  const apply = (pending) => {
    for (const [op, path, data] of pending) write[op](path, data);
  };
  return {
    collection: (name) => Object.assign(query(name, [], null, 0), {
      doc: (id) => ref(`${name}/${id || `${name}-new-${++seq}`}`),
    }),
    getAll: (...refs) => Promise.all(refs.map((r) => r.get())),
    batch: () => {
      const pending = [];
      return Object.assign(buffered(pending), {
        commit: async () => apply(pending),
      });
    },
    runTransaction: async (fn) => {
      const pending = [];
      let wrote = false;
      const tx = Object.assign(buffered(pending, () => {
        wrote = true;
      }), {
        get: (target) => {
          if (wrote) throw new Error('transaction read after a write');
          return target.get();
        },
      });
      const out = await fn(tx);
      apply(pending);
      return out;
    },
  };
}

module.exports = {fakeDb};
