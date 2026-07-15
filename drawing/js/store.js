// Uploaded pictures, kept in IndexedDB so they survive a refresh.
//
// This is a static site — there is no server to upload to, so the browser is
// the only place they can live. They stay on this machine and no visitor to the
// live URL ever sees them.
//
// Blobs go in IndexedDB rather than localStorage: localStorage is ~5MB, string
// only, and a handful of photos would blow it instantly.

const DB_NAME = 'drawn';
const STORE_NAME = 'images';
const VERSION = 1;
const THUMB_SIZE = 120;

function openDatabase() {
    return new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
            reject(new Error('IndexedDB unavailable'));
            return;
        }

        const request = indexedDB.open(DB_NAME, VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Could not open database'));
    });
}

function runTransaction(mode, work) {
    return openDatabase().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        let result;

        try {
            result = work(store);
        } catch (error) {
            reject(error);
            return;
        }

        tx.oncomplete = () => {
            db.close();
            resolve(result && result.__request ? result.__request.result : result);
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error || new Error('Storage transaction failed'));
        };
    }));
}

// A small JPEG preview so the queue strip never has to decode full photos.
async function makeThumbnail(blob) {
    const url = URL.createObjectURL(blob);
    try {
        const image = new Image();
        image.src = url;
        await image.decode();

        const scale = THUMB_SIZE / Math.max(image.width, image.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));

        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.7);
    } finally {
        URL.revokeObjectURL(url);
    }
}

export async function addImages(files) {
    const usable = [...files].filter((file) => file.type.startsWith('image/'));
    const records = [];

    for (const file of usable) {
        // Decode before storing: a corrupt or unsupported file should fail here
        // rather than after it is already in the queue.
        const thumb = await makeThumbnail(file);
        records.push({ name: file.name || 'Untitled', type: file.type, blob: file, thumb, addedAt: Date.now() });
    }

    const saved = [];
    for (const record of records) {
        const id = await runTransaction('readwrite', (store) => ({ __request: store.add(record) }));
        saved.push({ ...record, id });
    }

    return saved;
}

export async function listImages() {
    return runTransaction('readonly', (store) => ({ __request: store.getAll() }));
}

export function deleteImage(id) {
    return runTransaction('readwrite', (store) => ({ __request: store.delete(id) }));
}

export function clearImages() {
    return runTransaction('readwrite', (store) => ({ __request: store.clear() }));
}
