// Phase 1: the structural lines. Canny-style edge detection, then walk the
// surviving pixels into polylines the pen can draw in one go.

import { CONTOURS } from './config.js';
import { simplify, pathLength } from './geometry.js';
import { sampleColor, sampleTone } from './fields.js';
import { packStroke } from './stroke.js';

function percentileThreshold(magnitude, percentile) {
    const sample = [];
    // Every 7th pixel is plenty to estimate a percentile and keeps the sort cheap.
    for (let i = 0; i < magnitude.length; i += 7) {
        if (magnitude[i] > 0) sample.push(magnitude[i]);
    }
    if (sample.length === 0) return 0;

    sample.sort((a, b) => a - b);
    const index = Math.min(sample.length - 1, Math.floor(sample.length * percentile));
    return sample[index];
}

// Thin thick edges down to single-pixel ridges by keeping only pixels that are
// a local maximum along the gradient.
function nonMaximumSuppression(fields) {
    const { width, height, magnitude, gx, gy } = fields;
    const thin = new Float32Array(magnitude.length);

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            const mag = magnitude[i];
            if (mag === 0) continue;

            const length = Math.hypot(gx[i], gy[i]) || 1;
            const nx = gx[i] / length;
            const ny = gy[i] / length;

            const stepX = Math.round(nx);
            const stepY = Math.round(ny);

            const forward = magnitude[i + stepY * width + stepX];
            const backward = magnitude[i - stepY * width - stepX];

            if (mag >= forward && mag >= backward) thin[i] = mag;
        }
    }

    return thin;
}

function hysteresis(thin, fields, highThreshold, lowThreshold) {
    const { width, height } = fields;
    const edge = new Uint8Array(thin.length);
    const stack = [];

    for (let i = 0; i < thin.length; i++) {
        if (thin[i] >= highThreshold) {
            edge[i] = 1;
            stack.push(i);
        }
    }

    // Grow out from confident edges into weaker connected ones.
    while (stack.length > 0) {
        const i = stack.pop();
        const x = i % width;
        const y = (i - x) / width;

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

                const ni = ny * width + nx;
                if (edge[ni] === 0 && thin[ni] >= lowThreshold) {
                    edge[ni] = 1;
                    stack.push(ni);
                }
            }
        }
    }

    return edge;
}

const NEIGHBORS = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1],
];

function walkFrom(startX, startY, edge, visited, width, height) {
    const points = [{ x: startX, y: startY }];
    let x = startX;
    let y = startY;

    for (;;) {
        let nextX = -1;
        let nextY = -1;

        for (const [dx, dy] of NEIGHBORS) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

            const ni = ny * width + nx;
            if (edge[ni] === 1 && visited[ni] === 0) {
                nextX = nx;
                nextY = ny;
                break;
            }
        }

        if (nextX === -1) break;

        visited[nextY * width + nextX] = 1;
        points.push({ x: nextX, y: nextY });
        x = nextX;
        y = nextY;
    }

    return points;
}

function traceContours(edge, fields) {
    const { width, height } = fields;
    const visited = new Uint8Array(edge.length);
    const contours = [];

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            if (edge[i] === 0 || visited[i] === 1) continue;

            visited[i] = 1;

            // Walk both ways from the seed, then join, so a contour picked up in
            // its middle still comes out as one stroke.
            const forward = walkFrom(x, y, edge, visited, width, height);
            const backward = walkFrom(x, y, edge, visited, width, height);

            const points = backward.length > 1
                ? [...backward.slice(1).reverse(), ...forward]
                : forward;

            if (points.length >= CONTOURS.minPoints) contours.push(points);
        }
    }

    return contours;
}

// Colour the line from the lit side of the edge. Sampling dead on the boundary
// averages the dark side in and mutes everything.
function contourColor(fields, points) {
    let r = 0, g = 0, b = 0, brightest = 0;

    for (const point of points) {
        const i = Math.round(point.y) * fields.width + Math.round(point.x);
        const length = Math.hypot(fields.gx[i] || 0, fields.gy[i] || 0) || 1;
        const ox = point.x + (fields.gx[i] / length) * CONTOURS.colorOffset;
        const oy = point.y + (fields.gy[i] / length) * CONTOURS.colorOffset;

        const color = sampleColor(fields, ox, oy);
        r += color.r;
        g += color.g;
        b += color.b;
        brightest = Math.max(brightest, sampleTone(fields, ox, oy));
    }

    const n = points.length;
    return {
        color: { r: r / n, g: g / n, b: b / n },
        tone: brightest,
    };
}

export function generateContours(fields) {
    const thin = nonMaximumSuppression(fields);
    const high = percentileThreshold(thin, CONTOURS.highPercentile);
    const low = percentileThreshold(thin, CONTOURS.lowPercentile);

    const edge = hysteresis(thin, fields, high, low);
    const traced = traceContours(edge, fields);

    return traced
        .map((points) => {
            const { color, tone } = contourColor(fields, points);
            return {
                points: simplify(points, CONTOURS.simplifyEpsilon),
                color,
                tone,
                length: pathLength(points),
            };
        })
        .filter((contour) => contour.tone >= CONTOURS.minTone)
        .filter((contour) => contour.points.length >= 2)
        .sort((a, b) => b.length - a.length)
        .slice(0, CONTOURS.maxContours)
        .map((contour) => packStroke({
            points: contour.points,
            colors: contour.points.map(() => contour.color),
            alpha: CONTOURS.alpha,
            width: CONTOURS.width,
        }));
}
