// Wiring: playlist -> planner -> animator -> renderer, plus the controls.

import { ANIMATION } from './config.js';
import { createRenderer } from './renderer.js';
import { createAnimator } from './animator.js';
import { createPlaylist, loadManifest } from './playlist.js';
import { planDrawing } from './planner.js';

const canvas = document.getElementById('canvas');
const startButton = document.getElementById('start-button');
const stage = document.getElementById('stage');
const statusText = document.getElementById('status');
const titleText = document.getElementById('title');
const progressBar = document.getElementById('progress-bar');
const dropHint = document.getElementById('drop-hint');
const fileInput = document.getElementById('file-input');

const pauseButton = document.getElementById('pause-button');
const skipButton = document.getElementById('skip-button');
const speedButton = document.getElementById('speed-button');
const nextButton = document.getElementById('next-button');
const prevButton = document.getElementById('prev-button');
const saveButton = document.getElementById('save-button');
const openButton = document.getElementById('open-button');

const renderer = createRenderer(canvas);

let playlist = createPlaylist([]);
let speedIndex = ANIMATION.defaultSpeedIndex;
let holdTimer = null;
let busy = false;

const animator = createAnimator({
    renderer,
    onProgress: (fraction) => {
        progressBar.style.width = `${(fraction * 100).toFixed(1)}%`;
    },
    onComplete: () => {
        setStatus('Done');
        pauseButton.disabled = true;
        skipButton.disabled = true;
        queueNext();
    },
});

function setStatus(message) {
    statusText.textContent = message;
}

function fitCanvas() {
    renderer.resize(window.innerWidth, window.innerHeight);
    renderer.present(null);
    animator.repaint();
}

function cancelHold() {
    if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
    }
}

function queueNext() {
    cancelHold();
    if (playlist.size() < 2) return;
    holdTimer = setTimeout(() => draw(playlist.next()), ANIMATION.holdAfterCompleteMs);
}

async function draw(item) {
    if (!item || busy) return;

    busy = true;
    cancelHold();
    animator.stop();

    pauseButton.disabled = true;
    skipButton.disabled = true;
    pauseButton.textContent = 'Pause';
    progressBar.style.width = '0%';
    titleText.textContent = `${item.title}  ·  ${playlist.position()}/${playlist.size()}`;

    try {
        setStatus('Loading…');
        const image = await playlist.resolve(item);

        const plan = await planDrawing(image, setStatus);
        if (plan.strokes.length === 0) throw new Error('Nothing in this image to draw');

        renderer.setDrawing(plan.width, plan.height);
        renderer.clear();
        fitCanvas();

        window.__plan = plan; // handy from the console when tuning
        animator.load(plan);
        animator.setSpeed(ANIMATION.speeds[speedIndex]);
        animator.start();

        pauseButton.disabled = false;
        skipButton.disabled = false;
        setStatus(`${plan.stats.contours} contours · ${plan.stats.hatchStrokes} hatch strokes`);
    } catch (error) {
        console.error(error);
        setStatus(error.message);
    } finally {
        busy = false;
    }
}

async function begin() {
    stage.classList.add('running');
    startButton.classList.add('hidden');

    setStatus('Loading playlist…');
    const entries = await loadManifest();
    playlist = createPlaylist(entries);

    if (playlist.size() === 0) {
        setStatus('No playlist found — drop an image anywhere on the page');
        dropHint.classList.add('visible');
        return;
    }

    draw(playlist.current());
}

startButton.addEventListener('click', begin);

pauseButton.addEventListener('click', () => {
    if (animator.isRunning()) {
        animator.stop();
        pauseButton.textContent = 'Resume';
        setStatus('Paused');
    } else {
        animator.start();
        pauseButton.textContent = 'Pause';
        setStatus('Drawing…');
    }
});

skipButton.addEventListener('click', () => {
    cancelHold();
    animator.finishInstantly();
});

speedButton.addEventListener('click', () => {
    speedIndex = (speedIndex + 1) % ANIMATION.speeds.length;
    animator.setSpeed(ANIMATION.speeds[speedIndex]);
    speedButton.textContent = `${ANIMATION.speeds[speedIndex]}×`;
});

nextButton.addEventListener('click', () => draw(playlist.next()));
prevButton.addEventListener('click', () => draw(playlist.previous()));

saveButton.addEventListener('click', () => {
    const data = renderer.toJPEG();
    if (!data) return;

    const link = document.createElement('a');
    link.download = 'drawn.jpg';
    link.href = data;
    link.click();
});

openButton.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (event) => {
    const item = playlist.addFiles(event.target.files);
    if (item) {
        dropHint.classList.remove('visible');
        draw(item);
    }
    fileInput.value = '';
});

['dragenter', 'dragover'].forEach((type) => {
    window.addEventListener(type, (event) => {
        event.preventDefault();
        dropHint.classList.add('visible');
    });
});

window.addEventListener('dragleave', (event) => {
    if (event.relatedTarget === null) dropHint.classList.remove('visible');
});

window.addEventListener('drop', (event) => {
    event.preventDefault();
    dropHint.classList.remove('visible');

    const item = playlist.addFiles(event.dataTransfer.files);
    if (item) {
        if (!stage.classList.contains('running')) {
            stage.classList.add('running');
            startButton.classList.add('hidden');
        }
        draw(item);
    } else {
        setStatus('That was not an image');
    }
});

window.addEventListener('keydown', (event) => {
    if (event.key === ' ') {
        event.preventDefault();
        pauseButton.click();
    }
    if (event.key === 'ArrowRight') nextButton.click();
    if (event.key === 'ArrowLeft') prevButton.click();
});

window.addEventListener('resize', fitCanvas);

speedButton.textContent = `${ANIMATION.speeds[speedIndex]}×`;
fitCanvas();
