// IndexedDB wrapper with an in-memory fallback (private mode, blocked storage). The fallback is
// reported through `persistent` so the UI can warn that progress will not survive a reload.
const NAME = 'interviewos';
const VERSION = 1;
export const STORES = {
  progress: { keyPath: 'id' },
  reviews: { autoIncrement: true, indexes: [['qid', 'qid'], ['ts', 'ts']] },
  bookmarks: { keyPath: 'id' },
  sessions: { keyPath: 'sid' },
  goals: { keyPath: 'key' },
};

const wrap = (req) => new Promise((res, rej) => ((req.onsuccess = () => res(req.result)), (req.onerror = () => rej(req.error))));

class IdbBackend {
  persistent = true;
  constructor(db) {
    this.db = db;
  }
  tx(stores, mode = 'readonly') {
    return this.db.transaction(stores, mode);
  }
  get(store, key) {
    return wrap(this.tx(store).objectStore(store).get(key));
  }
  getAll(store) {
    return wrap(this.tx(store).objectStore(store).getAll());
  }
  put(store, val) {
    return wrap(this.tx(store, 'readwrite').objectStore(store).put(val));
  }
  delete(store, key) {
    return wrap(this.tx(store, 'readwrite').objectStore(store).delete(key));
  }
  clear(store) {
    return wrap(this.tx(store, 'readwrite').objectStore(store).clear());
  }
  /** Replace the full contents of several stores in ONE transaction (all or nothing). */
  replaceMany(map) {
    return new Promise((res, rej) => {
      const names = Object.keys(map);
      const t = this.tx(names, 'readwrite');
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Transaction aborted'));
      for (const n of names) {
        const os = t.objectStore(n);
        os.clear();
        for (const v of map[n]) os.put(v);
      }
    });
  }
}

class MemBackend {
  persistent = false;
  data = Object.fromEntries(Object.keys(STORES).map((k) => [k, new Map()]));
  seq = 1;
  keyOf(store, val) {
    const kp = STORES[store].keyPath;
    return kp ? val[kp] : this.seq++;
  }
  async get(s, k) {
    return this.data[s].get(k);
  }
  async getAll(s) {
    return [...this.data[s].values()];
  }
  async put(s, v) {
    const k = this.keyOf(s, v);
    this.data[s].set(k, structuredClone(v));
    return k;
  }
  async delete(s, k) {
    this.data[s].delete(k);
  }
  async clear(s) {
    this.data[s].clear();
  }
  async replaceMany(map) {
    for (const [n, vals] of Object.entries(map)) {
      this.data[n].clear();
      for (const v of vals) await this.put(n, v);
    }
  }
}

export async function openDb() {
  if (!('indexedDB' in globalThis)) return new MemBackend();
  try {
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const [name, def] of Object.entries(STORES)) {
          if (d.objectStoreNames.contains(name)) continue;
          const os = d.createObjectStore(name, def.keyPath ? { keyPath: def.keyPath } : { autoIncrement: true });
          for (const [iname, path] of def.indexes || []) os.createIndex(iname, path);
        }
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
      req.onblocked = () => rej(new Error('IndexedDB blocked'));
    });
    db.onversionchange = () => db.close();
    return new IdbBackend(db);
  } catch {
    return new MemBackend();
  }
}
