import type { StoredMediaAsset } from "./imagePipeline";

const DATABASE_NAME = "yange-media";
const DATABASE_VERSION = 1;
const ASSET_STORE = "assets";

export interface MediaRepository {
  put(asset: StoredMediaAsset): Promise<void>;
  get(assetId: string): Promise<StoredMediaAsset | undefined>;
  delete(assetId: string): Promise<void>;
  clear(): Promise<void>;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Media transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Media transaction was aborted."));
  });
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (!window.indexedDB) {
    return Promise.reject(new Error("On-device media storage is unavailable in this browser."));
  }
  if (databasePromise) return databasePromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ASSET_STORE)) {
        request.result.createObjectStore(ASSET_STORE, { keyPath: "assetId" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open media storage."));
    request.onblocked = () => reject(new Error("Media storage is blocked by another Yange tab."));
  });
  databasePromise = opening;
  return opening.catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });
}

export const indexedDbMediaRepository: MediaRepository = {
  async put(asset) {
    const database = await openDatabase();
    const transaction = database.transaction(ASSET_STORE, "readwrite");
    transaction.objectStore(ASSET_STORE).put(asset);
    await transactionDone(transaction);
  },
  async get(assetId) {
    const database = await openDatabase();
    const transaction = database.transaction(ASSET_STORE, "readonly");
    const done = transactionDone(transaction);
    const result = await requestResult(
      transaction.objectStore(ASSET_STORE).get(assetId) as IDBRequest<StoredMediaAsset | undefined>,
    );
    await done;
    return result;
  },
  async delete(assetId) {
    const database = await openDatabase();
    const transaction = database.transaction(ASSET_STORE, "readwrite");
    transaction.objectStore(ASSET_STORE).delete(assetId);
    await transactionDone(transaction);
  },
  async clear() {
    const database = await openDatabase();
    const transaction = database.transaction(ASSET_STORE, "readwrite");
    transaction.objectStore(ASSET_STORE).clear();
    await transactionDone(transaction);
  },
};
