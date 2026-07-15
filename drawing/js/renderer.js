// Drawing surface. Committed strokes accumulate on an offscreen canvas held at
// analysis resolution and get blitted to the viewport each frame.
//
// Two things the old version got wrong and this fixes: history is never
// redrawn (segments are painted once, onto the offscreen, and stay there), and
// a window resize only recomputes the transform, so it no longer wipes the art.

import { RENDER } from './config.js';

export function createRenderer(canvas) {
    const ctx = canvas.getContext('2d');

    let offscreen = null;
    let offCtx = null;
    let transform = { scale: 1, offsetX: 0, offsetY: 0 };

    function computeTransform() {
        if (offscreen === null) return;

        const scale = Math.min(canvas.width / offscreen.width, canvas.height / offscreen.height);
        transform = {
            scale,
            offsetX: (canvas.width - offscreen.width * scale) / 2,
            offsetY: (canvas.height - offscreen.height * scale) / 2,
        };
    }

    function setDrawing(width, height) {
        offscreen = document.createElement('canvas');
        offscreen.width = width;
        offscreen.height = height;
        offCtx = offscreen.getContext('2d');
        offCtx.lineCap = 'round';
        offCtx.lineJoin = 'round';
        offCtx.globalCompositeOperation = RENDER.composite;
        computeTransform();
    }

    function resize(width, height) {
        canvas.width = width;
        canvas.height = height;
        computeTransform();
    }

    // Paint one segment of a stroke. Colour comes from the destination point so
    // a stroke can shift hue as it crosses the image.
    function drawSegment(stroke, index) {
        if (offCtx === null || index < 1) return;

        const o = index * 3;
        offCtx.strokeStyle = `rgba(${stroke.rgb[o]},${stroke.rgb[o + 1]},${stroke.rgb[o + 2]},${stroke.alpha})`;
        offCtx.lineWidth = stroke.width;
        offCtx.beginPath();
        offCtx.moveTo(stroke.xs[index - 1], stroke.ys[index - 1]);
        offCtx.lineTo(stroke.xs[index], stroke.ys[index]);
        offCtx.stroke();
    }

    function drawPen(x, y) {
        const px = transform.offsetX + x * transform.scale;
        const py = transform.offsetY + y * transform.scale;

        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = RENDER.penColor;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';

        const size = RENDER.penSize;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - size * 0.55, py - size * 1.6);
        ctx.moveTo(px, py);
        ctx.lineTo(px + size * 0.55, py - size * 1.6);
        ctx.stroke();

        ctx.fillStyle = RENDER.penColor;
        ctx.beginPath();
        ctx.arc(px, py, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function present(pen) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (offscreen === null) return;

        ctx.drawImage(
            offscreen,
            transform.offsetX,
            transform.offsetY,
            offscreen.width * transform.scale,
            offscreen.height * transform.scale,
        );

        if (pen) drawPen(pen.x, pen.y);
    }

    function clear() {
        if (offCtx === null) return;
        offCtx.save();
        offCtx.globalCompositeOperation = 'source-over';
        offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
        offCtx.restore();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // JPEG has no alpha. Without painting the background in first, every
    // untouched pixel would come out an arbitrary colour.
    function toJPEG(quality = 0.92) {
        if (offscreen === null) return null;

        const flat = document.createElement('canvas');
        flat.width = offscreen.width;
        flat.height = offscreen.height;

        const flatCtx = flat.getContext('2d');
        flatCtx.fillStyle = '#000';
        flatCtx.fillRect(0, 0, flat.width, flat.height);
        flatCtx.drawImage(offscreen, 0, 0);

        return flat.toDataURL('image/jpeg', quality);
    }

    return { setDrawing, resize, drawSegment, present, clear, toJPEG };
}
