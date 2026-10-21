/**
 * 녹음 원본 Blob을 브라우저 IndexedDB에 보관한다. 탭 종료/네트워크 단절 시 유실 방지용.
 * 모든 함수는 예외를 던지지 않는다(private 모드, 쿼터 초과 등).
 */
export interface StoredRecording {
  sessionId: string
  blob: Blob
  durationSec: number
  filename: string
  savedAt: number
}

const DB_NAME = 'ax-recordings'
const STORE = 'recordings'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) {
        reject(new Error('indexedDB unavailable'))
        return
      }
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'sessionId' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('open failed'))
      req.onblocked = () => reject(new Error('open blocked'))
    } catch (e) {
      reject(e)
    }
  })
}

async function run<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = op(tx.objectStore(STORE))
      let result: T
      req.onsuccess = () => {
        result = req.result
      }
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error ?? req.error ?? new Error('tx failed'))
      tx.onabort = () => reject(tx.error ?? new Error('tx aborted'))
    })
  } finally {
    db.close()
  }
}

export async function saveRecording(rec: StoredRecording): Promise<boolean> {
  try {
    await run('readwrite', (s) => s.put(rec))
    return true
  } catch {
    return false
  }
}

export async function loadRecording(sessionId: string): Promise<StoredRecording | null> {
  try {
    const got = await run<StoredRecording | undefined>('readonly', (s) => s.get(sessionId))
    return got ?? null
  } catch {
    return null
  }
}

export async function deleteRecording(sessionId: string): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(sessionId))
  } catch {
    // 보관소 접근 불가 — 무시
  }
}
