// The image queue. Seeded from drawing/images.json (what any visitor to the
// live URL sees) and extended with whatever has been uploaded into this
// browser's storage.

import { loadImage, fileToImage } from './loader.js';

const MANIFEST_URL = 'drawing/images.json';

function normalize(entry, index) {
    if (typeof entry === 'string') return { src: entry, title: `Image ${index + 1}` };
    if (entry && typeof entry.src === 'string') {
        return { src: entry.src, title: entry.title || `Image ${index + 1}` };
    }
    return null;
}

export async function loadManifest() {
    try {
        const response = await fetch(MANIFEST_URL, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const parsed = await response.json();
        const list = Array.isArray(parsed) ? parsed : parsed.images;
        if (!Array.isArray(list)) throw new Error('Manifest has no image list');

        return list.map(normalize).filter(Boolean);
    } catch (error) {
        console.warn('No playlist manifest, uploads only:', error.message);
        return [];
    }
}

export function storedToItem(record) {
    return {
        storedId: record.id,
        title: record.name,
        blob: record.blob,
        thumb: record.thumb,
    };
}

export function createPlaylist(entries = []) {
    let items = [...entries];
    let index = 0;

    const clampIndex = () => {
        if (items.length === 0) index = 0;
        else index = Math.max(0, Math.min(index, items.length - 1));
    };

    function current() {
        return items.length > 0 ? items[index] : null;
    }

    function jumpTo(target) {
        if (target < 0 || target >= items.length) return null;
        index = target;
        return current();
    }

    function next() {
        if (items.length === 0) return null;
        index = (index + 1) % items.length;
        return current();
    }

    function previous() {
        if (items.length === 0) return null;
        index = (index - 1 + items.length) % items.length;
        return current();
    }

    // New uploads land right after whatever is playing and become current, so a
    // batch drop starts drawing immediately and the rest queue up behind it.
    function insert(newItems) {
        if (newItems.length === 0) return null;

        const at = items.length === 0 ? 0 : index + 1;
        items = [...items.slice(0, at), ...newItems, ...items.slice(at)];
        index = at;
        return current();
    }

    function remove(item) {
        const at = items.indexOf(item);
        if (at === -1) return;

        const wasCurrent = at === index;
        items = items.filter((candidate) => candidate !== item);
        if (at < index) index -= 1;
        clampIndex();
        return wasCurrent;
    }

    function replaceAll(newItems) {
        items = [...newItems];
        clampIndex();
    }

    async function resolve(item) {
        if (!item) throw new Error('Nothing to draw');
        return item.blob ? fileToImage(item.blob) : loadImage(item.src);
    }

    return {
        current,
        next,
        previous,
        jumpTo,
        insert,
        remove,
        replaceAll,
        resolve,
        all: () => [...items],
        size: () => items.length,
        position: () => index + 1,
        indexOfCurrent: () => index,
    };
}
