/**
 * 纯前端版的学习状态存储（IndexedDB，单 object store 的 KV 设计）。
 *
 * 一个 key 一条记录，JSON 序列化。key 用「命名空间:字段」的形式，比如
 *   progress:<coursePackId>:<courseId>  → { statementIndex }
 *   last-practice:<coursePackId>        → LastPractice
 *   practice-state:<coursePackId>:<courseId>:<mode>:<split>:<stagesKey>
 *
 * 这样不用为每种表维护 schema，直接存对象。
 */

const DB_NAME = "earthworm-web";
const STORE = "kv";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** 单条读写 */
export async function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDel(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 删掉所有以 prefix 开头的 key（例如重置某包的全部进度） */
export async function idbDelByPrefix(prefix: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        if (String(cursor.key).startsWith(prefix)) store.delete(cursor.key);
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 取出所有以 prefix 开头的 [key, value]，按 key 排序 */
export async function idbAllByPrefix<T = unknown>(
  prefix: string,
): Promise<{ key: string; value: T }[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const out: { key: string; value: T }[] = [];
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        if (String(cursor.key).startsWith(prefix)) {
          out.push({ key: String(cursor.key), value: cursor.value as T });
        }
        cursor.continue();
      } else {
        out.sort((a, b) => a.key.localeCompare(b.key));
        resolve(out);
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}
