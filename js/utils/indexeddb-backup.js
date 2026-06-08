// IndexedDB Backup System for SmartHockey Tracking Team Pro
const DB_NAME = 'SmartHockeyTeamProBackup';
const PREFIX = 'sPro_';

const IDBBackup = (function() {
  function _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('backup')) {
          db.createObjectStore('backup');
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function _put(db, key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('backup', 'readwrite');
      const store = tx.objectStore('backup');
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function _get(db, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('backup', 'readonly');
      const store = tx.objectStore('backup');
      const req = store.get(key);
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function _delete(db, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('backup', 'readwrite');
      const store = tx.objectStore('backup');
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function saveFullBackup() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) {
        data[key] = localStorage.getItem(key);
      }
    }
    // Safety guard: don't overwrite a valid backup with empty data
    const keyCount = Object.keys(data).length;
    if (keyCount === 0) {
      console.log('[IDBBackup] Skipping save — no data to back up');
      return;
    }
    try {
      const db = await _openDB();
      await _put(db, 'fullBackup', data);
      await _put(db, 'backupTimestamp', new Date().toISOString());
      db.close();
      console.log(`[IDBBackup] ✅ Saved ${keyCount} keys to IndexedDB`);
    } catch (e) {
      console.warn('[IDBBackup] Save failed:', e);
    }
  }

  async function loadFullBackup() {
    try {
      const db = await _openDB();
      const data = await _get(db, 'fullBackup');
      db.close();
      return data || null;
    } catch (e) {
      console.warn('[IDBBackup] Load failed:', e);
      return null;
    }
  }

  async function getFullBackup() {
    return loadFullBackup();
  }

  async function getBackupTimestamp() {
    try {
      const db = await _openDB();
      const ts = await _get(db, 'backupTimestamp');
      db.close();
      return ts || null;
    } catch (e) {
      return null;
    }
  }

  async function restoreFullBackup() {
    const data = await loadFullBackup();
    if (!data || Object.keys(data).length === 0) return false;
    Object.keys(data).forEach(key => {
      try { localStorage.setItem(key, data[key]); } catch (e) {}
    });
    return true;
  }

  async function clearBackup() {
    try {
      const db = await _openDB();
      await _delete(db, 'fullBackup');
      await _delete(db, 'backupTimestamp');
      db.close();
      console.log('[IDBBackup] Backup cleared');
    } catch (e) {
      console.warn('[IDBBackup] Clear failed:', e);
    }
  }

  return {
    saveFullBackup,
    loadFullBackup,
    getFullBackup,
    getBackupTimestamp,
    restoreFullBackup,
    clearBackup
  };
})();

// Request persistent storage so the browser doesn't evict IndexedDB
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}
