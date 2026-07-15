// Turns pixels into the scalar/vector fields the stroke generators read:
// brightness, edge magnitude, and the flow direction hatching follows.
//
// The kernels below fill typed arrays in place. That is deliberate and local —
// each function allocates its own buffers and hands back a frozen result; no
// buffer is ever shared or mutated across module boundaries.

import { FIELDS, TONE } from './config.js';
import { blendAngles, clamp } from './geometry.js';

function gaussianKernel(sigma) {
    const radius = Math.max(1, Math.ceil(sigma * 3));
    const kernel = new Float32Array(radius * 2 + 1);
    const denom = 2 * sigma * sigma;
    let sum = 0;

    for (let i = -radius; i <= radius; i++) {
        const value = Math.exp(-(i * i) / denom);
        kernel[i + radius] = value;
        sum += value;
    }
    for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

    return { kernel, radius };
}

// Separable blur: two 1D passes instead of one 2D pass.
function blur(source, width, height, sigma) {
    const { kernel, radius } = gaussianKernel(sigma);
    const horizontal = new Float32Array(source.length);
    const result = new Float32Array(source.length);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            for (let k = -radius; k <= radius; k++) {
                const sx = clamp(x + k, 0, width - 1);
                sum += source[y * width + sx] * kernel[k + radius];
            }
            horizontal[y * width + x] = sum;
        }
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            for (let k = -radius; k <= radius; k++) {
                const sy = clamp(y + k, 0, height - 1);
                sum += horizontal[sy * width + x] * kernel[k + radius];
            }
            result[y * width + x] = sum;
        }
    }

    return result;
}

function luminanceOf(data, length) {
    const lum = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        const o = i * 4;
        lum[i] = (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;
    }
    return lum;
}

function percentile(values, fraction) {
    const index = Math.min(values.length - 1, Math.max(0, Math.floor(values.length * fraction)));
    return values[index];
}

// Auto-levels. Raw luminance is a bad density signal because it depends on how
// the photo was exposed: this image sits at a median of 0.15, so any fixed
// threshold either ignores the subject or floods the background. Stretching the
// image's own percentiles to 0..1 means every image in the playlist hatches on
// its own terms.
function toneOf(lum) {
    const sample = [];
    for (let i = 0; i < lum.length; i += 7) sample.push(lum[i]);
    sample.sort((a, b) => a - b);

    const low = percentile(sample, TONE.blackPoint);
    const high = percentile(sample, TONE.whitePoint);
    const span = Math.max(1e-4, high - low);

    const tone = new Float32Array(lum.length);
    for (let i = 0; i < lum.length; i++) {
        tone[i] = Math.pow(clamp((lum[i] - low) / span, 0, 1), TONE.gamma);
    }

    return { tone, low, high };
}

function sobel(source, width, height) {
    const gx = new Float32Array(source.length);
    const gy = new Float32Array(source.length);
    const magnitude = new Float32Array(source.length);

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;

            const tl = source[i - width - 1], tc = source[i - width], tr = source[i - width + 1];
            const ml = source[i - 1], mr = source[i + 1];
            const bl = source[i + width - 1], bc = source[i + width], br = source[i + width + 1];

            const dx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
            const dy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);

            gx[i] = dx;
            gy[i] = dy;
            magnitude[i] = Math.sqrt(dx * dx + dy * dy);
        }
    }

    return { gx, gy, magnitude };
}

// Minor eigenvector of the smoothed structure tensor. That is the direction in
// which brightness changes least, i.e. it runs *along* an edge rather than
// across it — so hatching drawn on it follows the form.
function flowFromTensor(gx, gy, width, height) {
    const length = gx.length;
    const exx = new Float32Array(length);
    const exy = new Float32Array(length);
    const eyy = new Float32Array(length);

    for (let i = 0; i < length; i++) {
        exx[i] = gx[i] * gx[i];
        exy[i] = gx[i] * gy[i];
        eyy[i] = gy[i] * gy[i];
    }

    const sigma = FIELDS.tensorBlurSigma;
    const sxx = blur(exx, width, height, sigma);
    const sxy = blur(exy, width, height, sigma);
    const syy = blur(eyy, width, height, sigma);

    const angle = new Float32Array(length);
    const coherence = new Float32Array(length);

    for (let i = 0; i < length; i++) {
        const E = sxx[i], F = sxy[i], G = syy[i];

        const trace = E + G;
        const diff = E - G;
        const root = Math.sqrt(diff * diff + 4 * F * F);
        const major = (trace + root) / 2;
        const minor = (trace - root) / 2;

        // Eigenvector for the minor eigenvalue: (F, minor - E). It degenerates
        // to zero on a diagonal tensor with E < G, where the answer is (1, 0).
        let vx = F;
        let vy = minor - E;
        if (Math.abs(vx) < 1e-9 && Math.abs(vy) < 1e-9) {
            vx = 1;
            vy = 0;
        }

        angle[i] = Math.atan2(vy, vx);
        coherence[i] = trace > 1e-9 ? (major - minor) / trace : 0;
    }

    // Flat regions have no meaningful direction, so lean them toward a single
    // house angle. Otherwise skin hatches like static.
    const resolved = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        const c = coherence[i];
        if (c >= FIELDS.coherenceFloor) {
            resolved[i] = angle[i];
        } else {
            const t = 1 - c / FIELDS.coherenceFloor;
            resolved[i] = blendAngles(angle[i], FIELDS.fallbackAngle, t);
        }
    }

    return { angle: resolved, coherence };
}

export function buildFields(imageData) {
    const { width, height, data } = imageData;
    const length = width * height;

    const lum = luminanceOf(data, length);
    const { tone, low, high } = toneOf(lum);
    const smoothed = blur(lum, width, height, FIELDS.preBlurSigma);
    const { gx, gy, magnitude } = sobel(smoothed, width, height);
    const { angle } = flowFromTensor(gx, gy, width, height);

    return Object.freeze({
        width, height, data, tone, gx, gy, magnitude, angle,
        levels: Object.freeze({ low, high }),
    });
}

// Auto-levelled brightness in 0..1. This, not raw luminance, drives density.
export function sampleTone(fields, x, y) {
    const px = clamp(Math.round(x), 0, fields.width - 1);
    const py = clamp(Math.round(y), 0, fields.height - 1);
    return fields.tone[py * fields.width + px];
}

export function sampleAngle(fields, x, y) {
    const px = clamp(Math.round(x), 0, fields.width - 1);
    const py = clamp(Math.round(y), 0, fields.height - 1);
    return fields.angle[py * fields.width + px];
}

export function sampleColor(fields, x, y) {
    const px = clamp(Math.round(x), 0, fields.width - 1);
    const py = clamp(Math.round(y), 0, fields.height - 1);
    const o = (py * fields.width + px) * 4;
    return { r: fields.data[o], g: fields.data[o + 1], b: fields.data[o + 2] };
}
