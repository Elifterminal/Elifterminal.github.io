// Tuning knobs for the whole pipeline. Everything visual lives here.

export const ANALYSIS = Object.freeze({
    // Longest side the image is resampled to before analysis. Bigger = more
    // detail and a lot more strokes; the whole cost curve hangs off this.
    maxSide: 820,
});

// Auto-levels applied before anything reads brightness. Percentiles of the
// image's own histogram, not fixed values.
export const TONE = Object.freeze({
    blackPoint: 0.20,   // this percentile and below draws nothing
    whitePoint: 0.985,
    gamma: 0.75,        // <1 lifts midtones, so skin gets real hatching
});

export const FIELDS = Object.freeze({
    preBlurSigma: 1.4,      // knocks JPEG noise out of the gradients
    tensorBlurSigma: 4.0,   // how far the flow direction stays coherent
    coherenceFloor: 0.12,   // below this the form has no direction worth following
    fallbackAngle: Math.PI * 0.25,
});

export const CONTOURS = Object.freeze({
    highPercentile: 0.94,   // hysteresis thresholds, as percentiles of edge magnitude
    lowPercentile: 0.86,
    minPoints: 8,
    simplifyEpsilon: 0.8,
    maxContours: 900,
    minTone: 0.16,          // an edge between two dark things draws nothing on black
    colorOffset: 1.6,       // sample this far up-gradient, toward the lit side
    alpha: 0.85,
    width: 1.15,
});

// Each pass lays hatching over the last. Early passes are sparse and only touch
// the brightest areas, so the glow surfaces first and the form fills in after.
// minTone is in auto-levelled space, so these track the image, not its exposure.
// sepMul scales the target spacing, so the last pass must land at 1.0 — that is
// the pass that reaches full density.
//
// These halve. They have to: a later pass can only slot a line into the gap
// left by an earlier one if half that gap clears its own proximity radius,
// which needs sepMul[k] > 1.7 * sepMul[k+1]. Tighten the ladder past that and
// every pass permanently locks the next one out, density plateaus wherever
// pass 1 left it, and no amount of tuning elsewhere will brighten the midtones.
export const HATCH_PASSES = Object.freeze([
    Object.freeze({ sepMul: 8.0, minTone: 0.42, alpha: 0.90 }),
    Object.freeze({ sepMul: 4.0, minTone: 0.28, alpha: 0.85 }),
    Object.freeze({ sepMul: 2.0, minTone: 0.16, alpha: 0.80 }),
    Object.freeze({ sepMul: 1.0, minTone: 0.06, alpha: 0.75 }),
]);

export const HATCH = Object.freeze({
    // Spacing comes from the ink coverage a tone needs, not a hand-picked ramp:
    // a 1px line every `sep` px covers 1/sep of the area, so to read as `tone`
    // the lines must sit width/(tone*inkGain) apart.
    //
    // inkGain compensates for the strokes not being solid white — what lands is
    // coverage * alpha * value, roughly 0.72 of the ink, so gain must sit near
    // 1/0.72 to come out at the right brightness. Below 1 the whole drawing
    // reads muddy no matter what else is tuned. Raise for a denser drawing.
    inkGain: 1.4,
    sepMin: 0.9,            // highlights: lines effectively touching
    sepMax: 14.0,           // shadows: sparse, fading to bare canvas
    stepLength: 1.0,
    maxSteps: 260,
    minPoints: 4,
    proximityFactor: 0.80,
    // Seeds must be finer than the tightest spacing they need to reach, or the
    // dense passes have no candidate sitting in the gap to start from.
    seedSpacing: 1.5,
    seedJitter: 0.5,
    width: 1.0,
    // Lines keep flowing until it is properly black. Cutting them at each pass
    // threshold shatters the hatching into dashes; letting them run gives long
    // strokes, and sampled colour goes to near-black anyway so the tail adds
    // nothing visible under additive blending.
    flowFloor: 0.04,
    saturationBoost: 1.3,
    gridCell: 3.0,          // small on purpose; see grid.js
    // Tone is carried by density, so strokes are drawn near full value and only
    // supply hue. Sampling raw colour and hoping it accumulates cannot work:
    // matching the source would need the alphas at a pixel to sum to 1.
    valueTarget: 0.92,
    valueMix: 0.8,          // how far toward valueTarget to push. 1 = fully flat
    valueFloor: 10,         // below this the pixel is black; leave it alone
    maxTotalPoints: 420000, // ceiling so a busy image cannot run for an hour
});

export const RENDER = Object.freeze({
    composite: 'lighter',   // light accumulating on black, not paint covering paper
    penColor: 'rgba(255,255,255,0.9)',
    penSize: 7,
});

export const ANIMATION = Object.freeze({
    // 70% slower than it used to run. ~6.5 min for a typical image at 1x; the
    // speed buttons still go 0.25x to 8x from here.
    pixelsPerSecond: 420,
    speeds: Object.freeze([0.25, 0.5, 1, 2, 4, 8]),
    defaultSpeedIndex: 2,
    holdAfterCompleteMs: 4000,
});
