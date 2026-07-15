// Phase 2+: tone. Evenly-spaced streamlines traced through the flow field,
// after Jobard & Lefer — grow a line, then refuse to start or continue any line
// that crowds an existing one.
//
// Spacing is driven by brightness, not darkness. The canvas is black and the
// pen lays down light, so this is chalk on black paper: bright areas get packed
// with strokes, dark areas get left bare and the background shows through.

import { HATCH, HATCH_PASSES } from './config.js';
import { clamp, lerp } from './geometry.js';
import { createSpatialGrid } from './grid.js';
import { sampleAngle, sampleTone, sampleColor } from './fields.js';
import { packStroke } from './stroke.js';

function separationAt(fields, x, y, sepMul) {
    const tone = sampleTone(fields, x, y);
    const target = HATCH.width / Math.max(1e-4, tone * HATCH.inkGain);
    return clamp(target, HATCH.sepMin, HATCH.sepMax) * sepMul;
}

// Push the sampled pixel toward full value, keeping its hue, and lift the
// chroma a little. Density is what carries tone; this just supplies the colour.
function strokeColor(fields, x, y) {
    const raw = sampleColor(fields, x, y);
    const peak = Math.max(raw.r, raw.g, raw.b);
    if (peak < HATCH.valueFloor) return raw;

    const gain = lerp(1, (HATCH.valueTarget * 255) / peak, HATCH.valueMix);
    const lit = { r: raw.r * gain, g: raw.g * gain, b: raw.b * gain };

    const mean = (lit.r + lit.g + lit.b) / 3;
    const boost = HATCH.saturationBoost;
    return {
        r: clamp(Math.round(mean + (lit.r - mean) * boost), 0, 255),
        g: clamp(Math.round(mean + (lit.g - mean) * boost), 0, 255),
        b: clamp(Math.round(mean + (lit.b - mean) * boost), 0, 255),
    };
}

function buildSeeds(fields) {
    const seeds = [];
    const spacing = HATCH.seedSpacing;

    for (let y = 1; y < fields.height - 1; y += spacing) {
        for (let x = 1; x < fields.width - 1; x += spacing) {
            const jx = x + (Math.random() - 0.5) * spacing * HATCH.seedJitter;
            const jy = y + (Math.random() - 0.5) * spacing * HATCH.seedJitter;
            seeds.push({ x: jx, y: jy, tone: sampleTone(fields, jx, jy) });
        }
    }

    // Brightest first, so the glowing bits surface out of the black before the
    // rest of the form fills in.
    return seeds.sort((a, b) => b.tone - a.tone);
}

// Walk the flow field one direction from a seed. Returns the points visited.
function integrate(fields, grid, seed, pass, sign) {
    const points = [];
    let x = seed.x;
    let y = seed.y;
    let previousDx = Math.cos(sampleAngle(fields, x, y)) * sign;
    let previousDy = Math.sin(sampleAngle(fields, x, y)) * sign;

    for (let step = 0; step < HATCH.maxSteps; step++) {
        const angle = sampleAngle(fields, x, y);
        let dx = Math.cos(angle);
        let dy = Math.sin(angle);

        // The field has no sign — flip it to keep travelling the same way.
        if (dx * previousDx + dy * previousDy < 0) {
            dx = -dx;
            dy = -dy;
        }

        // Midpoint step: sample the direction halfway along and use that.
        const midX = x + dx * HATCH.stepLength * 0.5;
        const midY = y + dy * HATCH.stepLength * 0.5;
        const midAngle = sampleAngle(fields, midX, midY);
        let mx = Math.cos(midAngle);
        let my = Math.sin(midAngle);
        if (mx * dx + my * dy < 0) {
            mx = -mx;
            my = -my;
        }

        const nextX = x + mx * HATCH.stepLength;
        const nextY = y + my * HATCH.stepLength;

        if (nextX < 1 || nextY < 1 || nextX >= fields.width - 1 || nextY >= fields.height - 1) break;
        if (sampleTone(fields, nextX, nextY) < HATCH.flowFloor) break;

        const radius = separationAt(fields, nextX, nextY, pass.sepMul) * HATCH.proximityFactor;
        if (grid.hasNeighborWithin(nextX, nextY, radius)) break;

        points.push({ x: nextX, y: nextY });
        x = nextX;
        y = nextY;
        previousDx = mx;
        previousDy = my;
    }

    return points;
}

function growStreamline(fields, grid, seed, pass) {
    const forward = integrate(fields, grid, seed, pass, 1);
    const backward = integrate(fields, grid, seed, pass, -1);
    return [...backward.reverse(), { x: seed.x, y: seed.y }, ...forward];
}

export function generateHatching(fields, onProgress) {
    const grid = createSpatialGrid(fields.width, fields.height, HATCH.gridCell);
    const seeds = buildSeeds(fields);
    const strokes = [];
    let pointBudget = HATCH.maxTotalPoints;

    for (let p = 0; p < HATCH_PASSES.length; p++) {
        const pass = HATCH_PASSES[p];

        for (const seed of seeds) {
            if (pointBudget <= 0) break;
            if (seed.tone < pass.minTone) break; // seeds are sorted, so the rest are darker

            const radius = separationAt(fields, seed.x, seed.y, pass.sepMul) * HATCH.proximityFactor;
            if (grid.hasNeighborWithin(seed.x, seed.y, radius)) continue;

            const points = growStreamline(fields, grid, seed, pass);
            if (points.length < HATCH.minPoints) continue;

            grid.insertAll(points);
            strokes.push(packStroke({
                points,
                colors: points.map((point) => strokeColor(fields, point.x, point.y)),
                alpha: pass.alpha,
                width: HATCH.width,
            }));

            pointBudget -= points.length;
        }

        if (onProgress) onProgress((p + 1) / HATCH_PASSES.length);
        if (pointBudget <= 0) break;
    }

    return strokes;
}
