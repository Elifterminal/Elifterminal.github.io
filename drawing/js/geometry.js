// Small geometry helpers. All of these return new values; nothing is mutated.

export function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

export function pathLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
    return total;
}

function perpendicularDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) return distance(point, lineStart);

    const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSq;
    const clamped = Math.max(0, Math.min(1, t));
    return distance(point, { x: lineStart.x + clamped * dx, y: lineStart.y + clamped * dy });
}

// Ramer-Douglas-Peucker. Iterative rather than recursive — a long traced
// contour will blow the stack otherwise.
export function simplify(points, epsilon) {
    if (points.length < 3) return [...points];

    const keep = new Uint8Array(points.length);
    keep[0] = 1;
    keep[points.length - 1] = 1;

    const stack = [[0, points.length - 1]];

    while (stack.length > 0) {
        const [first, last] = stack.pop();
        if (last <= first + 1) continue;

        let maxDist = 0;
        let maxIndex = first;

        for (let i = first + 1; i < last; i++) {
            const dist = perpendicularDistance(points[i], points[first], points[last]);
            if (dist > maxDist) {
                maxDist = dist;
                maxIndex = i;
            }
        }

        if (maxDist > epsilon) {
            keep[maxIndex] = 1;
            stack.push([first, maxIndex], [maxIndex, last]);
        }
    }

    return points.filter((_, i) => keep[i] === 1);
}

// Directions are 180-degree ambiguous, so blend them in doubled-angle space.
// Averaging 5deg and 175deg the naive way gives 90deg, which is exactly wrong.
export function blendAngles(angleA, angleB, t) {
    const x = Math.cos(2 * angleA) * (1 - t) + Math.cos(2 * angleB) * t;
    const y = Math.sin(2 * angleA) * (1 - t) + Math.sin(2 * angleB) * t;
    return Math.atan2(y, x) / 2;
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}
