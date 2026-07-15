// Image in, ordered stroke list out. Contours first for structure, then the
// hatching passes coarse to fine, which is roughly the order a person works in.

import { buildFields } from './fields.js';
import { generateContours } from './contours.js';
import { generateHatching } from './hatching.js';
import { toImageData } from './loader.js';
import { totalPoints, totalLength } from './stroke.js';

// Analysis blocks the main thread for a second or two. Yielding between phases
// lets the status text actually paint instead of updating after the fact.
function yieldToBrowser() {
    return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

export async function planDrawing(image, onStatus) {
    const report = (message) => {
        if (onStatus) onStatus(message);
    };

    report('Reading image…');
    await yieldToBrowser();
    const imageData = toImageData(image);

    report('Finding the form…');
    await yieldToBrowser();
    const fields = buildFields(imageData);

    report('Tracing contours…');
    await yieldToBrowser();
    const contours = generateContours(fields);

    report('Planning hatching…');
    await yieldToBrowser();
    const hatching = generateHatching(fields);

    const strokes = [...contours, ...hatching];

    return Object.freeze({
        strokes,
        width: fields.width,
        height: fields.height,
        stats: Object.freeze({
            contours: contours.length,
            hatchStrokes: hatching.length,
            points: totalPoints(strokes),
            length: totalLength(strokes),
        }),
    });
}
