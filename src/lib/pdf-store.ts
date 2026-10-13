/**
 * Original PDFs stay on this device. They are too large for the synced library,
 * which only keeps the extracted text.
 */

const DB_NAME = 'recall-pdfs';
const STORE = 'pdfs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open PDF storage'));
  });
}

export async function putPdf(id: string, bytes: ArrayBuffer): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(bytes, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not save the PDF'));
    });
  } finally {
    db.close();
  }
}

export function copyStoredPdf(value: unknown): ArrayBuffer | null {
  try {
    if (value instanceof ArrayBuffer) return value.slice(0);
    if (!ArrayBuffer.isView(value)) return null;
    const copy = new Uint8Array(value.byteLength);
    copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return copy.buffer;
  } catch {
    return null;
  }
}

export async function getPdf(id: string): Promise<ArrayBuffer | null> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return null;
  }
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => {
        resolve(copyStoredPdf(request.result));
      };
      request.onerror = () => reject(request.error ?? new Error('Could not read the PDF'));
    });
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function deletePdf(id: string): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not delete the PDF'));
    });
  } catch {
    /* the paper is already gone */
  } finally {
    db.close();
  }
}
