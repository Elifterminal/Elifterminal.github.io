// Wiring: playlist -> planner -> animator -> renderer, plus the controls.

import { ANIMATION } from './config.js?v=2';
import { createRenderer } from './renderer.js?v=2';
import { createAnimator } from './animator.js?v=2';
import { createPlaylist, loadManifest, storedToItem } from './playlist.js?v=2';
import { createStrip } from './strip.js?v=2';
import { addImages, listImages, deleteImage, clearImages } from './store.js?v=2';
import { planDrawing } from './planner.js?v=2';

const canvas = document.getElementById('canvas');
const startButton = document.getElementById('start-button');
const stage = document.getElementById('stage');
const statusText = document.getElementById('status');
const titleText = document.getElementById('title');
const progressBar = document.getElementById('progress-bar');
const dropHint = document.getElementById('drop-hint');
const fileInput = document.getElementById('file-input');
const stripEl = document.getElementById('strip');

const pauseButton = document.getElementById('pause-button');
const skipButton = document.getElementById('skip-button');
const speedButton = document.getElementById('speed-button');
const nextButton = document.getElementById('next-button');
const prevButton = document.getElementById('prev-button');
const saveButton = document.getElementById('save-button');
const clearButton = document.getElementById('clear-button');

const renderer = createRenderer(canvas);

let playlist = createPlaylist([]);
let manifestItems = [];
let speedIndex = ANIMATION.defaultSpeedIndex;
let holdTimer = null;
// Bumped per draw request. Analysis takes a couple of seconds, and whatever the
// user asked for last should win rather than be dropped on the floor.
let drawToken = 0;

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

const strip = createStrip(stripEl, {
    onSelect: (index) => draw(playlist.jumpTo(index)),
    onRemove: (item) => removeUpload(item),
});

function setStatus(message) {
    statusText.textContent = message;
}

function refreshStrip() {
    strip.render(playlist.all(), playlist.indexOfCurrent());
    clearButton.disabled = !playlist.all().some((item) => item.storedId !== undefined);
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
    if (!item) return;

    const token = ++drawToken;
    cancelHold();
    animator.stop();

    pauseButton.disabled = true;
    skipButton.disabled = true;
    pauseButton.textContent = 'Pause';
    progressBar.style.width = '0%';
    titleText.textContent = `${item.title}  ·  ${playlist.position()}/${playlist.size()}`;
    refreshStrip();

    try {
        setStatus('Loading…');
        const image = await playlist.resolve(item);
        if (token !== drawToken) return;

        const plan = await planDrawing(image, setStatus);
        if (token !== drawToken) return;
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
        if (token !== drawToken) return;
        console.error(error);
        setStatus(error.message);
    }
}

async function addFiles(files) {
    const images = [...files].filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) {
        setStatus('That was not an image');
        return;
    }

    setStatus(`Storing ${images.length} image${images.length > 1 ? 's' : ''}…`);

    let items;
    try {
        const saved = await addImages(images);
        items = saved.map(storedToItem);
    } catch (error) {
        // Private mode and a full quota both land here. Still worth drawing them
        // this session, they just will not survive a refresh.
        console.warn('Could not persist uploads:', error.message);
        setStatus('Added for this session only — storage unavailable');
        items = images.map((file) => ({ title: file.name, blob: file }));
    }

    const first = playlist.insert(items);
    refreshStrip();
    draw(first);
}

async function removeUpload(item) {
    const wasCurrent = playlist.remove(item);

    if (item.storedId !== undefined) {
        try {
            await deleteImage(item.storedId);
        } catch (error) {
            console.warn('Could not delete stored image:', error.message);
        }
    }

    refreshStrip();
    if (playlist.size() === 0) {
        setStatus('Queue empty — drop an image to draw it');
        return;
    }
    if (wasCurrent) draw(playlist.current());
}

async function clearUploads() {
    cancelHold();
    try {
        await clearImages();
    } catch (error) {
        console.warn('Could not clear storage:', error.message);
    }

    playlist.replaceAll(manifestItems);
    refreshStrip();
    setStatus('Uploads cleared');
    if (playlist.size() > 0) draw(playlist.current());
}

async function begin() {
    stage.classList.add('running');
    startButton.classList.add('hidden');

    setStatus('Loading playlist…');
    manifestItems = await loadManifest();

    let stored = [];
    try {
        stored = (await listImages()).map(storedToItem);
    } catch (error) {
        console.warn('Stored uploads unavailable:', error.message);
    }

    playlist = createPlaylist([...manifestItems, ...stored]);
    refreshStrip();

    if (playlist.size() === 0) {
        setStatus('Drop images anywhere, or use Open…');
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
clearButton.addEventListener('click', clearUploads);

saveButton.addEventListener('click', () => {
    const data = renderer.toJPEG();
    if (!data) return;

    const link = document.createElement('a');
    link.download = 'drawn.jpg';
    link.href = data;
    link.click();
});

// No click handler for Open… — the label opens the picker itself.
fileInput.addEventListener('change', (event) => {
    addFiles(event.target.files);
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

    // Dropping before pressing the button should just work.
    if (!stage.classList.contains('running')) {
        stage.classList.add('running');
        startButton.classList.add('hidden');
    }
    addFiles(event.dataTransfer.files);
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
