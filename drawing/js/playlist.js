// The image queue. Reads drawing/images.json at startup; local files dropped
// onto the page get pushed in front of whatever is queued.

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

        const entries = list.map(normalize).filter(Boolean);
        if (entries.length === 0) throw new Error('Manifest is empty');

        return entries;
    } catch (error) {
        console.warn('Playlist unavailable, falling back to drop-a-file:', error.message);
        return [];
    }
}

export function createPlaylist(entries) {
    let items = [...entries];
    let index = 0;

    function current() {
        return items.length > 0 ? items[index] : null;
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

    // Dropped files jump the queue and become the active item.
    function addFiles(files) {
        const added = [...files]
            .filter((file) => file.type.startsWith('image/'))
            .map((file) => ({ src: null, file, title: file.name }));

        if (added.length === 0) return null;

        items = [...items.slice(0, index + 1), ...added, ...items.slice(index + 1)];
        index = Math.min(index + 1, items.length - 1);
        return current();
    }

    async function resolve(item) {
        if (!item) throw new Error('Nothing to draw');
        return item.file ? fileToImage(item.file) : loadImage(item.src);
    }

    return {
        current,
        next,
        previous,
        addFiles,
        resolve,
        size: () => items.length,
        position: () => index + 1,
    };
}
