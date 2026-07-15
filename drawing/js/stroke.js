// A stroke is one continuous press of the pen. Coordinates and colour live in
// typed arrays: a busy image runs to a quarter-million points, and holding
// those as {x, y} objects costs tens of megabytes for no benefit.

export function packStroke({ points, colors, alpha, width }) {
    const count = points.length;
    const xs = new Float32Array(count);
    const ys = new Float32Array(count);
    const rgb = new Uint8Array(count * 3);

    let length = 0;

    for (let i = 0; i < count; i++) {
        xs[i] = points[i].x;
        ys[i] = points[i].y;

        const color = colors[i];
        rgb[i * 3] = color.r;
        rgb[i * 3 + 1] = color.g;
        rgb[i * 3 + 2] = color.b;

        if (i > 0) length += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    }

    return Object.freeze({ xs, ys, rgb, alpha, width, count, length });
}

export function totalPoints(strokes) {
    return strokes.reduce((sum, stroke) => sum + stroke.count, 0);
}

export function totalLength(strokes) {
    return strokes.reduce((sum, stroke) => sum + stroke.length, 0);
}
