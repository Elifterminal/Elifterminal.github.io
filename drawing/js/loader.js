// Loading images and getting pixels back out of them.
//
// The trap here is canvas tainting: reading pixels from an image served by
// another origin without CORS headers throws a SecurityError and there is no
// way to recover after the fact. Same-origin files and blob: URLs from a local
// file pick are both safe.

import { ANALYSIS } from './config.js?v=2';

export function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();

        // Harmless for same-origin; lets a properly configured remote host work
        // instead of silently tainting the canvas.
        image.crossOrigin = 'anonymous';

        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Could not load image: ${src}`));
        image.src = src;
    });
}

// Takes a File from a drop, or a bare Blob rehydrated out of storage — a Blob
// carries a type but no name, so don't reach for one.
export function fileToImage(blob) {
    if (!blob || !String(blob.type).startsWith('image/')) {
        return Promise.reject(new Error(`Not an image: ${blob?.name || 'file'}`));
    }

    const url = URL.createObjectURL(blob);
    return loadImage(url).finally(() => URL.revokeObjectURL(url));
}

// Resample to the analysis size and hand back the pixels. Everything downstream
// works in this space, and the renderer scales the result up to the viewport.
export function toImageData(image) {
    const scale = Math.min(1, ANALYSIS.maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, width, height);

    try {
        return ctx.getImageData(0, 0, width, height);
    } catch (error) {
        throw new Error(
            'Cannot read pixels from this image. It is served from another origin ' +
            'without CORS headers, which taints the canvas.',
        );
    }
}
