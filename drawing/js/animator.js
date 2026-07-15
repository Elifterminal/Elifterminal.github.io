// The pen. Advances along the stroke list at a real distance-per-second rate,
// so the drawing takes the same wall-clock time on a 60Hz laptop and a 144Hz
// monitor. (The original tied speed to frame count and silently ran 2.4x fast
// on a high-refresh display.)

import { ANIMATION } from './config.js';

export function createAnimator({ renderer, onProgress, onComplete }) {
    let strokes = [];
    let strokeIndex = 0;
    let pointIndex = 1;
    let drawnLength = 0;
    let totalLength = 0;

    let speed = ANIMATION.speeds[ANIMATION.defaultSpeedIndex];
    let running = false;
    let frameId = null;
    let lastTime = 0;
    let pen = null;

    function load(plan) {
        strokes = plan.strokes;
        strokeIndex = 0;
        pointIndex = 1;
        drawnLength = 0;
        totalLength = strokes.reduce((sum, stroke) => sum + stroke.length, 0);
        pen = null;
    }

    function advance(budget) {
        let remaining = budget;

        while (remaining > 0) {
            if (strokeIndex >= strokes.length) return true;

            const stroke = strokes[strokeIndex];

            if (pointIndex >= stroke.count) {
                strokeIndex++;
                pointIndex = 1;
                continue;
            }

            const segment = Math.hypot(
                stroke.xs[pointIndex] - stroke.xs[pointIndex - 1],
                stroke.ys[pointIndex] - stroke.ys[pointIndex - 1],
            );

            renderer.drawSegment(stroke, pointIndex);
            pen = { x: stroke.xs[pointIndex], y: stroke.ys[pointIndex] };

            drawnLength += segment;
            // Floor the cost so a run of zero-length segments can't spin forever.
            remaining -= Math.max(segment, 0.05);
            pointIndex++;
        }

        return false;
    }

    function tick(now) {
        if (!running) return;

        // A backgrounded tab hands back a huge delta on return. Clamp it, or the
        // drawing lurches forward by however long you were away.
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        const done = advance(ANIMATION.pixelsPerSecond * speed * dt);
        renderer.present(done ? null : pen);

        if (onProgress) onProgress(totalLength > 0 ? drawnLength / totalLength : 0);

        if (done) {
            running = false;
            if (onComplete) onComplete();
            return;
        }

        frameId = requestAnimationFrame(tick);
    }

    function start() {
        if (running) return;
        running = true;
        lastTime = performance.now();
        frameId = requestAnimationFrame(tick);
    }

    function stop() {
        running = false;
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
    }

    function finishInstantly() {
        while (!advance(1e6)) { /* consume everything */ }
        stop();
        renderer.present(null);
        if (onProgress) onProgress(1);
        if (onComplete) onComplete();
    }

    return {
        load,
        start,
        stop,
        finishInstantly,
        isRunning: () => running,
        setSpeed: (value) => { speed = value; },
        getSpeed: () => speed,
        repaint: () => renderer.present(running ? pen : null),
    };
}
