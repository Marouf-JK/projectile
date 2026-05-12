// ------------------------------
// Physics Arcade: Projectile Challenge
// Frontend-only game with beginner-friendly structure.
// ------------------------------

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const speedSlider = document.getElementById("speedSlider");
const angleSlider = document.getElementById("angleSlider");
const gravitySelect = document.getElementById("gravitySelect");
const guideToggle = document.getElementById("guideToggle");
const launchBtn = document.getElementById("launchBtn");
const resetBtn = document.getElementById("resetBtn");
const messageEl = document.getElementById("message");
const breakdownIntro = document.getElementById("breakdownIntro");
const breakdownContent = document.getElementById("breakdownContent");

const speedValue = document.getElementById("speedValue");
const angleValue = document.getElementById("angleValue");

const resultAngle = document.getElementById("resultAngle");
const resultSpeed = document.getElementById("resultSpeed");
const resultGravity = document.getElementById("resultGravity");
const resultRange = document.getElementById("resultRange");
const resultHeight = document.getElementById("resultHeight");
const resultTime = document.getElementById("resultTime");
const resultScore = document.getElementById("resultScore");

const physicsGraphCanvas = document.getElementById("physicsGraphCanvas");
const physicsGraphCtx = physicsGraphCanvas.getContext("2d");
const physicsGraphSeriesSelect = document.getElementById("physicsGraphSeries");

const predictionDistanceInput = document.getElementById("predictionDistanceInput");
const submitPredictionBtn = document.getElementById("submitPredictionBtn");
const predictionOutcomeEl = document.getElementById("predictionOutcome");
const resultPredictionBonus = document.getElementById("resultPredictionBonus");

const levelSelect = document.getElementById("levelSelect");
const levelSummaryLine = document.getElementById("levelSummaryLine");
const movingTargetBadge = document.getElementById("movingTargetBadge");
const resultLevelSummary = document.getElementById("resultLevelSummary");
const resultHitZoneMeters = document.getElementById("resultHitZoneMeters");
const resultTargetDistMeters = document.getElementById("resultTargetDistMeters");
const resultChallengeBonus = document.getElementById("resultChallengeBonus");

const replayLastShotBtn = document.getElementById("replayLastShotBtn");
const replayStatusLine = document.getElementById("replayStatusLine");

const challengeGenerateBtn = document.getElementById("challengeGenerateBtn");
const challengeApplyBtn = document.getElementById("challengeApplyBtn");
const challengeClearBtn = document.getElementById("challengeClearBtn");
const challengeGeneratedText = document.getElementById("challengeGeneratedText");
const challengeActiveText = document.getElementById("challengeActiveText");

// Scene setup values
const groundY = canvas.height - 45;
const launcher = { x: 75, y: groundY };
const target = { x: 0, radius: 18, hitZoneRadius: 22 };

// ------------------------------
// Level System presets (sizes in canvas px; placement uses fractions of canvas width).
// ------------------------------

const LEVEL_PRESETS = {
  1: {
    title: "Beginner",
    targetRadiusPx: 28,
    hitZoneRadiusPx: 44,
    targetMinFrac: 0.33,
    targetMaxFrac: 0.76,
    guideDefaultOn: true,
    hitPoints: 1,
    predictionBonusMul: 1,
    hint: "Big target · roomy hit zone · guide on."
  },
  2: {
    title: "Intermediate",
    targetRadiusPx: 18,
    hitZoneRadiusPx: 17,
    targetMinFrac: 0.43,
    targetMaxFrac: 0.86,
    guideDefaultOn: true,
    hitPoints: 2,
    predictionBonusMul: 1,
    hint: "Normal target · snug hit zone."
  },
  3: {
    title: "Advanced",
    targetRadiusPx: 13,
    hitZoneRadiusPx: 13,
    targetMinFrac: 0.52,
    targetMaxFrac: 0.9,
    guideDefaultOn: false,
    hitPoints: 3,
    predictionBonusMul: 1,
    hint: "Smaller bullseye · farther average distance · guide off by default."
  },
  4: {
    title: "Expert",
    targetRadiusPx: 10,
    hitZoneRadiusPx: 11,
    targetMinFrac: 0.56,
    targetMaxFrac: 0.94,
    guideDefaultOn: false,
    hitPoints: 5,
    predictionBonusMul: 2,
    hint: "Minimal target · long shots · boosted prediction payout."
  }
};

// Simulation/game state
let projectile = null;
let trail = [];
let animationId = null;
let score = 0;
let simulationDone = true;
let launchFlashFrames = 0;
let clouds = [];

// Live physics graph: time series recorded each animation frame during a shot.
/** @type {{ t: number, y: number, x: number }[]} */
let physicsGraphSamples = [];
/** Bounds from analytic pre-launch formulas (stable axes while the projectile is moving). */
let physicsGraphAxisDomain = null;

// Prediction Challenge — separate cumulative bonus from bullseye `score`.
let predictionBonusScore = 0;
/** Last accepted guess (horizontal meters from launcher), shown as a ground marker. */
let submittedPredictionMeters = null;
/** Locked when Launch fires; cleared after landing evaluate. Used so mid-flight edits never change grading. */
let predictionSnapshotForActiveFlight = null;

// Expert (Level 4) — horizontal patrol speed in canvas px/s (moderate pace on a 900px-wide field).
const EXPERT_MOVING_TARGET_SPEED_PX_S = 26;
let expertMovingTargetVx = 0;
let expertMovingIdleLoopId = null;
let expertMovingIdlePrevTs = null;

// ------------------------------
// Replay Last Shot (optional)
// ------------------------------

/** @type {{ level: number, speed: number, angleDeg: number, gravity: number, frames: { targetX: number, px: number, py: number, landed: boolean }[], graphSamples: { t: number, x: number, y: number }[] } | null} */
let lastShotReplayData = null;
/** Per-frame capture while a real (non-replay) shot runs; copied into `lastShotReplayData` on landing. */
let shotReplayAccumulator = null;
let isReplayPlaybackActive = false;
/** Stash for restoring the arena after a cosmetic replay finishes. */
let replayRestoreStash = null;

// ------------------------------
// Challenge Generator (optional)
// ------------------------------

let challengeBonusScore = 0;
// ------------------------------
// Player Progress Save System
// ------------------------------

let playerStats = {
  bestScore: 0,
  totalShots: 0,
  totalHits: 0,
  bestPredictionError: null
};
/** Cleared on reset/level change; user must apply again. */
let pendingGeneratedChallenge = null;
/** Currently tracked mission after Apply; holds completion flag + rule payload. */
let activeAppliedChallenge = null;

// Converts real-world meters to canvas pixels.
// The scale keeps motion visible on this canvas size.
const metersToPixels = 4.2;
const markerEveryMeters = 10;

function getLaunchParams() {
  const speed = Number(speedSlider.value);
  const angleDeg = Number(angleSlider.value);
  const gravity = Number(gravitySelect.value);
  const theta = (angleDeg * Math.PI) / 180;

  // vx = v0 cos(theta), vy = v0 sin(theta)
  const vx = speed * Math.cos(theta);
  const vy = speed * Math.sin(theta);

  return { speed, angleDeg, gravity, theta, vx, vy };
}

function getSelectedLevel() {
  const n = Number(levelSelect.value);
  return LEVEL_PRESETS[n] ? n : 1;
}

function getActivePreset() {
  return LEVEL_PRESETS[getSelectedLevel()];
}

/**
 * Shared horizontal span for spawning and (Level 4) oscillation so the bullseye stays on-screen.
 * @param {number} [forLevel] - defaults to the currently selected level
 */
function computeTargetRailBoundsPx(forLevel) {
  const level = typeof forLevel === "number" ? forLevel : getSelectedLevel();
  const preset = LEVEL_PRESETS[level] ?? LEVEL_PRESETS[1];
  const preferredMin = canvas.width * preset.targetMinFrac;
  const preferredMax = canvas.width * preset.targetMaxFrac;
  let lo = Math.max(launcher.x + 100, preferredMin);
  let hi = Math.min(canvas.width - 52, preferredMax);
  if (hi < lo) {
    const t = lo;
    lo = hi;
    hi = t;
  }
  return { lo, hi };
}

// ------------------------------
// Level 4 moving target (idle RAF + in-flight stepping)
// ------------------------------

function seedExpertMovingTargetVelocity() {
  expertMovingTargetVx = (Math.random() < 0.5 ? 1 : -1) * EXPERT_MOVING_TARGET_SPEED_PX_S;
}

/**
 * Advances Expert target along the rail; no-op on other levels.
 */
function advanceExpertMovingTarget(dtSeconds) {
  if (getSelectedLevel() !== 4) {
    return;
  }

  target.x += expertMovingTargetVx * dtSeconds;

  const { lo, hi } = computeTargetRailBoundsPx(4);
  if (target.x <= lo) {
    target.x = lo;
    expertMovingTargetVx = Math.abs(EXPERT_MOVING_TARGET_SPEED_PX_S);
  } else if (target.x >= hi) {
    target.x = hi;
    expertMovingTargetVx = -Math.abs(EXPERT_MOVING_TARGET_SPEED_PX_S);
  }
}

function stopExpertMovingTargetIdleLoop() {
  if (expertMovingIdleLoopId !== null) {
    cancelAnimationFrame(expertMovingIdleLoopId);
    expertMovingIdleLoopId = null;
  }
  expertMovingIdlePrevTs = null;
}

function expertMovingTargetIdleTick(ts) {
  if (!simulationDone || getSelectedLevel() !== 4) {
    stopExpertMovingTargetIdleLoop();
    return;
  }

  const prev = expertMovingIdlePrevTs ?? ts;
  expertMovingIdlePrevTs = ts;
  const dt = Math.min(0.045, Math.max(0.001, (ts - prev) / 1000));

  advanceExpertMovingTarget(dt);
  refreshLevelHud();
  renderScene();

  if (simulationDone && getSelectedLevel() === 4) {
    expertMovingIdleLoopId = requestAnimationFrame(expertMovingTargetIdleTick);
  }
}

function primeExpertMovingTargetIdleLoop() {
  stopExpertMovingTargetIdleLoop();
  if (!simulationDone || getSelectedLevel() !== 4) {
    return;
  }
  expertMovingIdlePrevTs = null;
  expertMovingIdleLoopId = requestAnimationFrame(expertMovingTargetIdleTick);
}

/**
 * Re-sizes bullseye + hit halo from sidebar level selection without touching guide prefs.
 */
function applyLevelSizingToTarget() {
  const preset = getActivePreset();
  target.radius = preset.targetRadiusPx;
  target.hitZoneRadius = preset.hitZoneRadiusPx;
}

/**
 * One-line recap under the picker + metrics for the sidebar results card.
 */
function refreshLevelHud() {
  const level = getSelectedLevel();
  const preset = getActivePreset();
  levelSummaryLine.textContent = `Level ${level} · ${preset.hint}`;
  resultLevelSummary.textContent = `${level} · ${preset.title}`;
  const hitDiameterMeters = (2 * target.hitZoneRadius) / metersToPixels;
  resultHitZoneMeters.textContent = `${hitDiameterMeters.toFixed(1)} m`;
  const targetDistMeters = (target.x - launcher.x) / metersToPixels;
  resultTargetDistMeters.textContent = `${Math.max(0, targetDistMeters).toFixed(1)} m`;
  if (movingTargetBadge) {
    movingTargetBadge.hidden = level !== 4;
  }
}

/** Toggle flight-only controls alongside prediction inputs. */
function setLevelPickerLocked(locked) {
  levelSelect.disabled = locked;
}

function getBarrelTip() {
  const angleRad = (Number(angleSlider.value) * Math.PI) / 180;
  const barrelLength = 62;
  return {
    x: launcher.x + barrelLength * Math.cos(angleRad),
    y: launcher.y - 8 - barrelLength * Math.sin(angleRad)
  };
}

function placeRandomTarget() {
  const preset = getActivePreset();
  const { lo: minX, hi: maxX } = computeTargetRailBoundsPx();
  const span = maxX - minX;
  if (span > 12) {
    target.x = Math.random() * span + minX;
  } else {
    const preferredMin = canvas.width * preset.targetMinFrac;
    const preferredMax = canvas.width * preset.targetMaxFrac;
    const mid = Math.max(launcher.x + 120, Math.min((preferredMin + preferredMax) / 2, canvas.width - 80));
    const wobble = canvas.width * 0.048;
    target.x = Math.min(canvas.width - 52, Math.max(launcher.x + 100, mid + (Math.random() * 2 - 1) * wobble));
  }

  if (getSelectedLevel() === 4) {
    seedExpertMovingTargetVelocity();
  }
}

/**
 * Places the bullseye center so ground distance from launcher (meters) lies in [minMeters, maxMeters] when possible.
 * @returns {number} actual placement distance in meters
 */
function placeTargetDistanceInMetersRange(minMeters, maxMeters) {
  const { lo, hi } = computeTargetRailBoundsPx();
  let minPx = launcher.x + minMeters * metersToPixels;
  let maxPx = launcher.x + maxMeters * metersToPixels;
  minPx = Math.max(lo, minPx);
  maxPx = Math.min(hi, maxPx);
  if (maxPx <= minPx + 2) {
    target.x = Math.min(hi, Math.max(lo, (lo + hi) / 2));
    return (target.x - launcher.x) / metersToPixels;
  }
  target.x = Math.random() * (maxPx - minPx) + minPx;
  return (target.x - launcher.x) / metersToPixels;
}

// ------------------------------
// Replay Last Shot — record + playback (no scoring)
// ------------------------------

function updateReplayButtonAvailability() {
  if (!replayLastShotBtn) return;
  replayLastShotBtn.disabled =
    lastShotReplayData === null || !simulationDone || isReplayPlaybackActive;
}

/**
 * Serialises everything we need to restore when the replay animation ends.
 */
function captureUiSnapshotForReplayRestore() {
  return {
    levelValue: levelSelect.value,
    speed: speedSlider.value,
    angle: angleSlider.value,
    gravity: gravitySelect.value,
    guide: guideToggle.checked,
    targetX: target.x,
    expertVx: expertMovingTargetVx,
    samples: physicsGraphSamples.map((s) => ({ t: s.t, x: s.x, y: s.y })),
    projectile: projectile ? { ...projectile } : null,
    trail: trail.map((p) => ({ x: p.x, y: p.y }))
  };
}

function restoreUiSnapshotFromReplayRestore(stash) {
  levelSelect.value = stash.levelValue;
  speedSlider.value = stash.speed;
  angleSlider.value = stash.angle;
  gravitySelect.value = stash.gravity;
  guideToggle.checked = stash.guide;
  target.x = stash.targetX;
  expertMovingTargetVx = stash.expertVx;
  physicsGraphSamples = stash.samples.map((s) => ({ t: s.t, x: s.x, y: s.y }));
  physicsGraphAxisDomain = null;
  projectile = stash.projectile
    ? {
        speed: stash.projectile.speed,
        angleDeg: stash.projectile.angleDeg,
        gravity: stash.projectile.gravity,
        vx: stash.projectile.vx,
        vy: stash.projectile.vy,
        time: stash.projectile.time,
        landed: stash.projectile.landed,
        canvasX: stash.projectile.canvasX,
        canvasY: stash.projectile.canvasY
      }
    : null;
  trail = stash.trail.map((p) => ({ x: p.x, y: p.y }));
  updateControlLabels();
  applyLevelSizingToTarget();
  refreshLevelHud();
  redrawPhysicsGraph();
}

/**
 * Playback loop: restores each recorded timestep (projectile path + Expert target glide).
 */
function beginReplayLastShotPlayback() {
  if (!lastShotReplayData || !lastShotReplayData.frames.length || isReplayPlaybackActive || !simulationDone) return;

  replayRestoreStash = captureUiSnapshotForReplayRestore();

  stopExpertMovingTargetIdleLoop();
  stopAnimation();

  levelSelect.value = String(lastShotReplayData.level);
  speedSlider.value = lastShotReplayData.speedSliderValue ?? String(Math.round(lastShotReplayData.speed));
  angleSlider.value =
    lastShotReplayData.angleSliderValue ?? String(Math.round(lastShotReplayData.angleDeg));
  gravitySelect.value = lastShotReplayData.gravitySelectValue ?? String(lastShotReplayData.gravity);
  guideToggle.checked = lastShotReplayData.guideWasOnDuringShot;
  updateControlLabels();
  applyLevelSizingToTarget();

  isReplayPlaybackActive = true;
  simulationDone = false;
  launchFlashFrames = 0;
  predictionSnapshotForActiveFlight = null;
  setPredictionChallengeControlsLocked(true);
  setLevelPickerLocked(true);
  updateReplayButtonAvailability();

  if (replayStatusLine) replayStatusLine.hidden = false;
  messageEl.textContent = "Replaying last shot…";
  messageEl.classList.remove("hit", "miss");

  const frames = lastShotReplayData.frames;
  const graph = lastShotReplayData.graphSamples;
  let replayIndex = -1;

  function replayFrame() {
    if (!isReplayPlaybackActive) return;

    replayIndex += 1;
    if (replayIndex >= frames.length) {
      finishReplayPlayback();
      return;
    }

    const fr = frames[replayIndex];
    target.x = fr.targetX;

    projectile = {
      speed: lastShotReplayData.speed,
      angleDeg: lastShotReplayData.angleDeg,
      gravity: lastShotReplayData.gravity,
      vx: lastShotReplayData.vxRecorded,
      vy: lastShotReplayData.vyRecorded,
      time: lastShotReplayData.dt * replayIndex,
      landed: fr.landed,
      canvasX: fr.px,
      canvasY: fr.py
    };

    trail = [{ x: launcher.x, y: launcher.y }];
    for (let i = 0; i <= replayIndex; i += 1) {
      trail.push({ x: frames[i].px, y: frames[i].py });
    }

    physicsGraphSamples = graph.slice(0, Math.min(graph.length, replayIndex + 2));
    redrawPhysicsGraph();
    renderScene();

    animationId = requestAnimationFrame(replayFrame);
  }

  projectile = null;
  trail = [{ x: launcher.x, y: launcher.y }];
  physicsGraphSamples = graph.length ? [graph[0]] : [{ t: 0, y: 0, x: 0 }];
  redrawPhysicsGraph();
  renderScene();

  animationId = requestAnimationFrame(replayFrame);
}

function finishReplayPlayback() {
  isReplayPlaybackActive = false;
  stopAnimation();

  if (replayRestoreStash) {
    restoreUiSnapshotFromReplayRestore(replayRestoreStash);
    replayRestoreStash = null;
  }

  projectile = null;
  simulationDone = true;
  setPredictionChallengeControlsLocked(false);
  setLevelPickerLocked(false);

  updatePhysicsBreakdown(getLaunchParams());

  updateResultsPanel({
    angle: Number(angleSlider.value),
    speed: Number(speedSlider.value),
    gravity: Number(gravitySelect.value),
    range: 0,
    maxHeight: 0,
    timeOfFlight: 0
  });

  if (replayStatusLine) replayStatusLine.hidden = true;
  messageEl.textContent = "Replay finished.";
  messageEl.classList.remove("hit", "miss");

  updateReplayButtonAvailability();
  renderScene();
  primeExpertMovingTargetIdleLoop();
}

// ------------------------------
// Challenge Generator — random missions / bonus pool
// ------------------------------

/** Clears staged + active challenges when the arena resets via reset or level picker. */
function invalidateAppliedChallengeState() {
  pendingGeneratedChallenge = null;
  activeAppliedChallenge = null;
  refreshChallengeDrawerUi();
}

/** Full clear including UI copy (explicit user action). */
function clearChallengeMode() {
  pendingGeneratedChallenge = null;
  activeAppliedChallenge = null;
  refreshChallengeDrawerUi();
}

function refreshChallengeDrawerUi() {
  if (!challengeGeneratedText || !challengeActiveText || !challengeApplyBtn) return;

  if (pendingGeneratedChallenge) {
    challengeGeneratedText.textContent = pendingGeneratedChallenge.description;
    challengeApplyBtn.disabled = false;
  } else {
    challengeGeneratedText.textContent = "Click Generate Challenge for a random goal, then Apply when ready.";
    challengeApplyBtn.disabled = true;
  }

  challengeActiveText.classList.remove("done");
  if (activeAppliedChallenge) {
    if (activeAppliedChallenge.completed) {
      challengeActiveText.classList.remove("muted");
      challengeActiveText.classList.add("done");
      challengeActiveText.textContent = `Challenge Completed! (+${activeAppliedChallenge.rewardGranted} challenge bonus)`;
    } else {
      challengeActiveText.classList.remove("done");
      challengeActiveText.classList.add("muted");
      challengeActiveText.textContent = `Active: ${activeAppliedChallenge.description}`;
    }
  } else {
    challengeActiveText.textContent = "No mission applied.";
    challengeActiveText.classList.add("muted");
  }
}

/**
 * Awards `challengeBonusScore` when the player's recent shot fulfills the Applied mission predicate.
 */
function evaluateActiveMission(shotCtx) {
  if (!activeAppliedChallenge || activeAppliedChallenge.completed || isReplayPlaybackActive) {
    return;
  }
  const mission = activeAppliedChallenge;
  if (typeof mission.predicate !== "function") {
    return;
  }

  let passed = false;
  try {
    passed = !!mission.predicate(shotCtx, mission);
  } catch (_) {
    return;
  }
  if (!passed) {
    return;
  }

  mission.completed = true;
  mission.rewardGranted = mission.bonusAward;
  challengeBonusScore += mission.bonusAward;

  if (resultChallengeBonus) {
    resultChallengeBonus.textContent = `${challengeBonusScore}`;
  }
  refreshChallengeDrawerUi();
}

function pickRandomMissionSpecFactory() {
  const roll = Math.random();

  if (roll < 0.21) {
    const lo = 82 + Math.random() * 16;
    const hi = Math.max(lo + 22, Math.min(lo + 36, 198));
    const loR = Math.round(lo);
    const hiR = Math.round(hi);
    return {
      type: "earthBand",
      description: `Hit a target between ${loR}m and ${hiR}m using Earth gravity.`,
      bonus: 34,
      apply() {
        levelSelect.value = "2";
        gravitySelect.value = "9.8";
        guideToggle.checked = true;
        applyLevelSizingToTarget();
        updateControlLabels();
        const placementM = placeTargetDistanceInMetersRange(lo, hi);
        return {
          placementM,
          meta: {
            earthBandLoApplied: Math.min(lo, hi),
            earthBandHiApplied: Math.max(lo, hi)
          }
        };
      },
      predicate(ctx, applied) {
        const a = applied.earthBandLoApplied;
        const b = applied.earthBandHiApplied;
        return ctx.wasHit && ctx.gravity === 9.8 && ctx.targetDistanceM >= a - 1.2 && ctx.targetDistanceM <= b + 1.2;
      }
    };
  }

  if (roll < 0.43) {
    return {
      type: "guideOffHit",
      description: "Hit the target with Guide Mode OFF.",
      bonus: 28,
      apply() {
        guideToggle.checked = false;
        placeRandomTarget();
        return (target.x - launcher.x) / metersToPixels;
      },
      predicate(ctx) {
        return ctx.wasHit && ctx.guideOff;
      }
    };
  }

  if (roll < 0.68) {
    const lvlRoll = Math.random() < 0.38 ? 3 : 4;
    const need = lvlRoll === 4 ? 4 : 3;
    return {
      type: "highLevelHit",
      needLevelApplied: need,
      description:
        lvlRoll === 4
          ? "Score a hit on Level 4 (Expert)."
          : "Score a hit on Level 3 or higher (Level 4 also counts).",
      bonus: 40,
      apply() {
        levelSelect.value = String(lvlRoll);
        gravitySelect.value = "9.8";
        applyLevelSizingToTarget();
        if (lvlRoll === 4) seedExpertMovingTargetVelocity();
        guideToggle.checked = lvlRoll === 4 ? false : true;
        updateControlLabels();
        placeRandomTarget();
        return (target.x - launcher.x) / metersToPixels;
      },
      predicate(ctx, applied) {
        return ctx.wasHit && ctx.level >= applied.needLevelApplied;
      }
    };
  }

  if (roll < 0.86) {
    return {
      type: "predictionWindow",
      description: "Predict the landing distance within 5 m (submit prediction before Launch).",
      bonus: 30,
      apply() {
        placeRandomTarget();
        return (target.x - launcher.x) / metersToPixels;
      },
      predicate(ctx) {
        return ctx.predictionAbsErrorM !== null && ctx.predictionAbsErrorM <= 5 + 1e-6;
      }
    };
  }

  return {
    type: "earthBandExpert",
    description: "Score a bullseye hit on Expert (Level 4) using Earth gravity.",
    bonus: 55,
    apply() {
      levelSelect.value = "4";
      gravitySelect.value = "9.8";
      guideToggle.checked = false;
      seedExpertMovingTargetVelocity();
      applyLevelSizingToTarget();
      updateControlLabels();
      placeRandomTarget();
      return (target.x - launcher.x) / metersToPixels;
    },
    predicate(ctx) {
      return ctx.ringScore === 2 && ctx.level === 4 && ctx.gravity === 9.8;
    }
  };
}

function handleGenerateMissionClick() {
  const spec = pickRandomMissionSpecFactory();
  pendingGeneratedChallenge = {
    description: spec.description,
    bonus: spec.bonus,
    specRef: spec
  };
  refreshChallengeDrawerUi();
}

function handleApplyMissionClick() {
  if (!pendingGeneratedChallenge?.specRef) return;

  const wrap = pendingGeneratedChallenge;
  const spec = wrap.specRef;
  pendingGeneratedChallenge = null;

  const applyOutcome = spec.apply();

  /** @type {Record<string, unknown>} */
  let appliedExtras = {};
  let placedM = (target.x - launcher.x) / metersToPixels;

  if (typeof applyOutcome === "number" && Number.isFinite(applyOutcome)) {
    placedM = applyOutcome;
  } else if (applyOutcome && typeof applyOutcome === "object") {
    if (typeof applyOutcome.placementM === "number") {
      placedM = applyOutcome.placementM;
    }
    if (applyOutcome.meta) {
      appliedExtras = { ...applyOutcome.meta };
    }
  }

  if (spec.needLevelApplied !== undefined) {
    appliedExtras.needLevelApplied = spec.needLevelApplied;
  }

  activeAppliedChallenge = {
    description: wrap.description,
    bonusAward: wrap.bonus,
    rewardGranted: 0,
    completed: false,
    placedTargetDistanceM: placedM,
    predicate: spec.predicate,
    ...appliedExtras
  };

  stopExpertMovingTargetIdleLoop();
  refreshChallengeDrawerUi();
  refreshLevelHud();
  updatePhysicsBreakdown(getLaunchParams());
  renderScene();
  primeExpertMovingTargetIdleLoop();
}

function buildClouds() {
  clouds = [
    { x: 120, y: 80, scale: 1.1 },
    { x: 330, y: 55, scale: 0.9 },
    { x: 560, y: 90, scale: 1.25 },
    { x: 760, y: 65, scale: 0.95 }
  ];
}

function updateControlLabels() {
  speedValue.textContent = speedSlider.value;
  angleValue.textContent = angleSlider.value;
}

function updateResultsPanel(values) {
  resultAngle.textContent = `${values.angle.toFixed(0)}°`;
  resultSpeed.textContent = `${values.speed.toFixed(2)} m/s`;
  resultGravity.textContent = `${values.gravity.toFixed(2)} m/s²`;
  resultRange.textContent = `${values.range.toFixed(2)} m`;
  resultHeight.textContent = `${values.maxHeight.toFixed(2)} m`;
  resultTime.textContent = `${values.timeOfFlight.toFixed(2)} s`;
  resultScore.textContent = `${score}`;
  resultPredictionBonus.textContent = `${predictionBonusScore}`;
  if (resultChallengeBonus) {
    resultChallengeBonus.textContent = `${challengeBonusScore}`;
  }
  refreshLevelHud();
}

function setMessage(text, type = "neutral") {
  messageEl.textContent = text;
  messageEl.classList.remove("hit", "miss");
  if (type === "hit") {
    messageEl.classList.add("hit");
  } else if (type === "miss") {
    messageEl.classList.add("miss");
  }
}

function updatePhysicsBreakdown(params, computed = null) {
  const { speed, angleDeg, gravity, theta, vx, vy } = params;

  if (!computed) {
    breakdownIntro.textContent = "Launch to see short step-by-step substitutions using your values.";
    breakdownContent.textContent = [
      "Formulas used:",
      "vx = v cos(θ)",
      "vy = v sin(θ)",
      "x = vx t",
      "y = vy t - 0.5gt²",
      "range = v² sin(2θ) / g",
      "max height = vy² / 2g",
      "time of flight = 2vy / g"
    ].join("\n");
    return;
  }

  const { range, maxHeight, timeOfFlight } = computed;
  const sinTwoTheta = Math.sin(2 * theta);
  const rangeFormulaResult = (speed * speed * sinTwoTheta) / gravity;

  breakdownIntro.textContent = "Step-by-step with your latest launch values:";
  breakdownContent.textContent = [
    "1) Horizontal velocity:",
    `vx = v cos(θ) = ${speed.toFixed(2)} cos(${angleDeg.toFixed(0)}°) = ${vx.toFixed(2)} m/s`,
    "",
    "2) Vertical velocity:",
    `vy = v sin(θ) = ${speed.toFixed(2)} sin(${angleDeg.toFixed(0)}°) = ${vy.toFixed(2)} m/s`,
    "",
    "3) Position equations (with t in seconds):",
    `x = vx t = ${vx.toFixed(2)}t`,
    `y = vy t - 0.5gt² = ${vy.toFixed(2)}t - 0.5(${gravity.toFixed(2)})t²`,
    "",
    "4) Time of flight:",
    `T = 2vy / g = 2(${vy.toFixed(2)}) / ${gravity.toFixed(2)} = ${timeOfFlight.toFixed(2)} s`,
    "",
    "5) Range:",
    `R = v² sin(2θ) / g = ${speed.toFixed(2)}² sin(${(2 * angleDeg).toFixed(0)}°) / ${gravity.toFixed(2)} = ${rangeFormulaResult.toFixed(2)} m`,
    "",
    "6) Maximum height:",
    `Hmax = vy² / 2g = ${vy.toFixed(2)}² / (2 × ${gravity.toFixed(2)}) = ${maxHeight.toFixed(2)} m`,
    "",
    `Launch summary: Range ${range.toFixed(2)} m, Height ${maxHeight.toFixed(2)} m, Time ${timeOfFlight.toFixed(2)} s`
  ].join("\n");
}

function drawSky() {
  const skyGradient = ctx.createLinearGradient(0, 0, 0, groundY);
  skyGradient.addColorStop(0, "#93deff");
  skyGradient.addColorStop(0.45, "#65beff");
  skyGradient.addColorStop(1, "#4a9fd8");
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, canvas.width, groundY);
}

function drawClouds() {
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
  for (const cloud of clouds) {
    const s = cloud.scale;
    ctx.beginPath();
    ctx.arc(cloud.x, cloud.y, 18 * s, 0, Math.PI * 2);
    ctx.arc(cloud.x + 22 * s, cloud.y - 8 * s, 15 * s, 0, Math.PI * 2);
    ctx.arc(cloud.x + 42 * s, cloud.y, 20 * s, 0, Math.PI * 2);
    ctx.arc(cloud.x + 22 * s, cloud.y + 8 * s, 18 * s, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawGrassTexture() {
  ctx.save();
  ctx.strokeStyle = "rgba(19, 67, 39, 0.45)";
  ctx.lineWidth = 1;
  for (let x = 6; x < canvas.width; x += 12) {
    const bladeHeight = 7 + (x % 18) * 0.2;
    ctx.beginPath();
    ctx.moveTo(x, groundY + 2);
    ctx.lineTo(x - 2, groundY + bladeHeight);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDistanceMarkers() {
  ctx.save();
  ctx.strokeStyle = "rgba(210, 245, 255, 0.4)";
  ctx.fillStyle = "rgba(236, 248, 255, 0.8)";
  ctx.font = "12px Segoe UI";

  const pixelsPerMarker = markerEveryMeters * metersToPixels;
  for (
    let x = launcher.x + pixelsPerMarker, marker = markerEveryMeters;
    x < canvas.width;
    x += pixelsPerMarker, marker += markerEveryMeters
  ) {
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x, groundY - 10);
    ctx.stroke();
    ctx.fillText(`${marker}m`, x - 13, groundY - 14);
  }
  ctx.restore();
}

function drawGround() {
  const groundGradient = ctx.createLinearGradient(0, groundY, 0, canvas.height);
  groundGradient.addColorStop(0, "#3f8f4f");
  groundGradient.addColorStop(1, "#2b5f3f");
  ctx.fillStyle = groundGradient;
  ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);

  // Decorative ground line.
  ctx.strokeStyle = "#9ee3b5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(canvas.width, groundY);
  ctx.stroke();

  drawGrassTexture();
  drawDistanceMarkers();
}

function drawLauncher() {
  const angleRad = (Number(angleSlider.value) * Math.PI) / 180;
  const barrelLength = 62;
  const barrelStartY = launcher.y - 8;
  const barrelEndX = launcher.x + barrelLength * Math.cos(angleRad);
  const barrelEndY = barrelStartY - barrelLength * Math.sin(angleRad);

  // Cannon base carriage.
  ctx.fillStyle = "#4f5678";
  ctx.fillRect(launcher.x - 34, launcher.y - 14, 38, 13);

  // Rear wheel.
  ctx.fillStyle = "#2d324c";
  ctx.beginPath();
  ctx.arc(launcher.x - 22, launcher.y + 3, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#7e89ba";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Rotating barrel.
  const barrelGradient = ctx.createLinearGradient(launcher.x, barrelStartY, barrelEndX, barrelEndY);
  barrelGradient.addColorStop(0, "#b8c4ff");
  barrelGradient.addColorStop(1, "#6e78a9");
  ctx.strokeStyle = barrelGradient;
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(launcher.x, barrelStartY);
  ctx.lineTo(barrelEndX, barrelEndY);
  ctx.stroke();

  // Barrel ring near muzzle.
  ctx.strokeStyle = "#d8e0ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(barrelEndX, barrelEndY, 4, 0, Math.PI * 2);
  ctx.stroke();

  // Pivot hub.
  ctx.fillStyle = "#2f3555";
  ctx.beginPath();
  ctx.arc(launcher.x, launcher.y - 8, 9, 0, Math.PI * 2);
  ctx.fill();
}

function drawLaunchFlash() {
  if (launchFlashFrames <= 0) return;

  const tip = getBarrelTip();
  const radius = 13 + launchFlashFrames * 1.4;
  const alpha = 0.15 + launchFlashFrames / 18;

  const flash = ctx.createRadialGradient(tip.x, tip.y, 2, tip.x, tip.y, radius);
  flash.addColorStop(0, `rgba(255, 245, 190, ${alpha})`);
  flash.addColorStop(1, "rgba(255, 204, 102, 0)");
  ctx.fillStyle = flash;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, radius, 0, Math.PI * 2);
  ctx.fill();

  launchFlashFrames -= 1;
}

// ------------------------------
// Prediction Challenge helpers
// ------------------------------

function setPredictionChallengeControlsLocked(locked) {
  predictionDistanceInput.disabled = locked;
  submitPredictionBtn.disabled = locked;
}

function landingDistanceMetersFromCanvas(landingXPixels) {
  return Math.max(0, (landingXPixels - launcher.x) / metersToPixels);
}

/**
 * Builds a short player-facing sentence from absolute error (meters).
 */
function formatPredictionFeedback(errorMeters) {
  const e = errorMeters.toFixed(1);
  if (errorMeters <= 3) {
    return `Excellent prediction! Only ${e}m away.`;
  }
  if (errorMeters <= 15) {
    return `Good try! You missed by ${e}m.`;
  }
  return `Far off! Error: ${e}m.`;
}

/**
 * Maps error to bonus points — tighter guesses award more points.
 */
function computePredictionBonus(errorMeters) {
  if (errorMeters <= 1.5) {
    return 60;
  }
  if (errorMeters <= 4) {
    return 42;
  }
  if (errorMeters <= 8) {
    return 28;
  }
  if (errorMeters <= 14) {
    return 18;
  }
  if (errorMeters <= 22) {
    return 10;
  }
  return Math.max(0, Math.round(6 * Math.exp(-errorMeters / 32)));
}

/**
 * Grades the shot after landing against the snapped prediction (if any).
 */
function evaluatePredictionChallenge(predictionMeters, actualMeters) {
  if (predictionMeters === null || !Number.isFinite(predictionMeters)) {
    predictionOutcomeEl.textContent =
      "No prediction submitted for that launch. Lock one in before Launch to compete for bonus.";
    predictionOutcomeEl.className = "prediction-outcome muted";
    return;
  }

  const error = Math.abs(actualMeters - predictionMeters);
  const tier = error <= 3 ? "excellent" : error <= 15 ? "good" : "far";
  const preset = getActivePreset();
  const bonus = Math.max(0, Math.round(computePredictionBonus(error) * preset.predictionBonusMul));

  predictionBonusScore += bonus;
  resultPredictionBonus.textContent = `${predictionBonusScore}`;

  predictionOutcomeEl.textContent = `${formatPredictionFeedback(error)} Bonus +${bonus}.`;
  predictionOutcomeEl.className = `prediction-outcome ${tier}`;
}

function resetPredictionChallengeVisuals({ clearBonus = false } = {}) {
  submittedPredictionMeters = null;
  predictionSnapshotForActiveFlight = null;
  predictionDistanceInput.value = "";
  if (clearBonus) {
    predictionBonusScore = 0;
  }
  predictionOutcomeEl.textContent =
    "Enter distance (m), press Submit Prediction, then Launch to earn bonus points.";
  predictionOutcomeEl.className = "prediction-outcome muted";
}

/**
 * Magenta waypoint on the turf — distinct palette from bullseye target rings.
 */
function drawLandingPredictionMarker() {
  if (submittedPredictionMeters === null || !Number.isFinite(submittedPredictionMeters)) {
    return;
  }

  let x = launcher.x + submittedPredictionMeters * metersToPixels;
  x = Math.min(Math.max(launcher.x + 6, x), canvas.width - 10);
  const pinTop = groundY - 54;

  ctx.save();

  ctx.strokeStyle = "rgba(255, 160, 255, 0.55)";
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x, pinTop);
  ctx.lineTo(x, groundY - 10);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(234, 124, 255, 0.85)";
  ctx.strokeStyle = "rgba(255, 236, 255, 0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, pinTop + 18);
  ctx.lineTo(x - 14, pinTop + 36);
  ctx.lineTo(x + 14, pinTop + 36);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(12, 6, 20, 0.88)";
  ctx.font = "11px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText(`${submittedPredictionMeters.toFixed(1)} m`, x, pinTop + 10);

  ctx.restore();
}

/**
 * Validates the field and stores prediction for UX + marker plotting.
 */
function commitSubmittedPredictionDistance() {
  const raw = String(predictionDistanceInput.value ?? "").trim();
  if (raw === "") {
    predictionOutcomeEl.textContent = "Enter a distance in meters first.";
    predictionOutcomeEl.className = "prediction-outcome far";
    return;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    predictionOutcomeEl.textContent = "Use a non-negative numeric distance.";
    predictionOutcomeEl.className = "prediction-outcome far";
    return;
  }

  submittedPredictionMeters = value;
  predictionOutcomeEl.textContent = `Prediction locked at ${value.toFixed(1)} m. Ready to Launch.`;
  predictionOutcomeEl.className = "prediction-outcome good";

  if (simulationDone) {
    renderScene();
  }
}

function drawTarget() {
  const centerY = groundY - target.radius;

  // Hit zone indicator.
  ctx.strokeStyle = "rgba(131, 226, 255, 0.45)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(target.x, centerY, target.hitZoneRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Bullseye rings.
  const rings = [
    { radius: target.radius, color: "#d62828" },
    { radius: target.radius * 0.68, color: "#ffffff" },
    { radius: target.radius * 0.4, color: "#d62828" },
    { radius: target.radius * 0.17, color: "#ffffff" }
  ];
  for (const ring of rings) {
    ctx.fillStyle = ring.color;
    ctx.beginPath();
    ctx.arc(target.x, centerY, ring.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Target stand.
  ctx.strokeStyle = "#a68a64";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(target.x, centerY + target.radius);
  ctx.lineTo(target.x, groundY);
  ctx.stroke();
}

function getTargetCenterY() {
  return groundY - target.radius;
}

function getTargetRingScore(ballX, ballY) {
  const dx = ballX - target.x;
  const dy = ballY - getTargetCenterY();
  const distance = Math.sqrt(dx * dx + dy * dy);
  const centerRadius = target.radius * 0.17;
  const innerRedRadius = target.radius * 0.4;

  if (distance <= centerRadius) return 2;
  if (distance <= innerRedRadius) return 1;
  return 0;
}

function drawPredictionArc() {
  if (!simulationDone || !guideToggle.checked) return;

  const { vx, vy, gravity } = getLaunchParams();
  const predicted = [];
  const dt = 0.06;

  // Draw a dashed pre-launch trajectory estimate.
  for (let t = 0; t <= 12; t += dt) {
    const xMeters = vx * t;
    const yMeters = vy * t - 0.5 * gravity * t * t;
    if (yMeters < 0) break;

    const x = launcher.x + xMeters * metersToPixels;
    const y = launcher.y - yMeters * metersToPixels;
    if (x > canvas.width) break;

    predicted.push({ x, y });
  }

  if (predicted.length < 2) return;

  ctx.save();
  ctx.setLineDash([7, 6]);
  ctx.strokeStyle = "rgba(20, 110, 220, 0.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(predicted[0].x, predicted[0].y);
  for (let i = 1; i < predicted.length; i += 1) {
    ctx.lineTo(predicted[i].x, predicted[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawSmoothTrailPath(points) {
  if (points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i += 1) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

function drawTrail() {
  if (trail.length < 2) return;

  // Soft base line.
  ctx.strokeStyle = "rgba(190, 239, 255, 0.55)";
  ctx.lineWidth = 1.4;
  drawSmoothTrailPath(trail);

  // Glow overlay.
  ctx.save();
  ctx.shadowColor = "rgba(54, 215, 255, 0.85)";
  ctx.shadowBlur = 8;
  ctx.strokeStyle = "rgba(52, 211, 255, 0.88)";
  ctx.lineWidth = 2.6;
  drawSmoothTrailPath(trail);
  ctx.restore();
}

function drawProjectile() {
  if (!projectile) return;

  // Outer glow.
  ctx.fillStyle = "rgba(95, 210, 255, 0.35)";
  ctx.beginPath();
  ctx.arc(projectile.canvasX, projectile.canvasY, 12, 0, Math.PI * 2);
  ctx.fill();

  // Bright inner ball.
  const core = ctx.createRadialGradient(
    projectile.canvasX - 2,
    projectile.canvasY - 2,
    1,
    projectile.canvasX,
    projectile.canvasY,
    8
  );
  core.addColorStop(0, "#ffffff");
  core.addColorStop(0.45, "#b8ecff");
  core.addColorStop(1, "#57cfff");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(projectile.canvasX, projectile.canvasY, 7, 0, Math.PI * 2);
  ctx.fill();
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ==============================
// Live Physics Graph (canvas 2)
// Progressive Height vs Time (or Horizontal Distance vs Time) sampled from simulation.
// ==============================

const PHYSICS_GRAPH_MARGIN = { top: 12, right: 16, bottom: 32, left: 48 };

/**
 * Reads whether the secondary graph plots height or horizontal displacement.
 */
function getPhysicsGraphSeriesKey() {
  return physicsGraphSeriesSelect.value === "horizontal" ? "horizontal" : "height";
}

/**
 * Y-value for plotting: height above launch (m) or horizontal distance from launch (m).
 */
function getPhysicsGraphSampleValue(sample, seriesKey) {
  return seriesKey === "horizontal" ? sample.x : sample.y;
}

/**
 * Picks axis maxima from recorded samples (used once the projectile has landed / when toggling).
 */
function computePhysicsGraphExtentsFromSamples(samples, seriesKey) {
  if (!samples.length) {
    return { tMax: 1, vMax: 1 };
  }
  let tMax = 0;
  let vMax = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (s.t > tMax) {
      tMax = s.t;
    }
    const v = getPhysicsGraphSampleValue(s, seriesKey);
    if (v > vMax) {
      vMax = v;
    }
  }
  const padT = Math.max(tMax * 0.05, 0.06);
  const padV = Math.max(vMax * 0.1, vMax === 0 ? 0.5 : 0.08);
  return { tMax: tMax + padT, vMax: vMax + padV };
}

/**
 * Combines analytic expectations while airborne with sample-derived bounds after landing
 * so the axes stay steady mid-flight yet shrink-wrap after touchdown for accurate review.
 */
function resolvePhysicsGraphExtents(samples, seriesKey) {
  if (!samples.length) {
    return { tMax: 1, vMax: 1 };
  }
  if (!simulationDone && physicsGraphAxisDomain) {
    const d = physicsGraphAxisDomain;
    const padT = Math.max(d.tMax * 0.06, 0.06);
    const rawVMax = seriesKey === "horizontal" ? d.distanceMax : d.heightMax;
    const padV = Math.max(rawVMax * 0.1, rawVMax === 0 ? 0.75 : 0.12);
    return { tMax: d.tMax + padT, vMax: rawVMax + padV };
  }
  return computePhysicsGraphExtentsFromSamples(samples, seriesKey);
}

/**
 * Converts simulation coordinates into chart pixel coordinates (y grows upward visually).
 */
function physicsGraphMapToPixels(t, value, tMax, vMax, chartX, chartY, chartW, chartH) {
  const x = chartX + (t / tMax) * chartW;
  const y = chartY + chartH - (value / vMax) * chartH;
  return { x, y };
}

/**
 * Fills the graph canvas with a dark panel similar to the rest of the UI.
 */
function clearPhysicsGraphSurface() {
  const w = physicsGraphCanvas.width;
  const h = physicsGraphCanvas.height;
  physicsGraphCtx.clearRect(0, 0, w, h);
  const bg = physicsGraphCtx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#131a38");
  bg.addColorStop(1, "#0f1528");
  physicsGraphCtx.fillStyle = bg;
  physicsGraphCtx.fillRect(0, 0, w, h);
}

/**
 * Draws frame, light grid, and compact axis titles (Time / Height or Distance).
 */
function drawPhysicsGraphDecorations(seriesKey, tMax, vMax, chartX, chartY, chartW, chartH) {
  const g = physicsGraphCtx;
  g.save();
  g.lineWidth = 1;
  g.strokeStyle = "rgba(120, 140, 200, 0.45)";
  g.strokeRect(chartX, chartY, chartW, chartH);

  g.strokeStyle = "rgba(100, 120, 180, 0.22)";
  const gridSteps = 4;
  for (let i = 1; i < gridSteps; i += 1) {
    const gy = chartY + (chartH * i) / gridSteps;
    g.beginPath();
    g.moveTo(chartX, gy);
    g.lineTo(chartX + chartW, gy);
    g.stroke();
  }

  g.fillStyle = "rgba(200, 210, 255, 0.86)";
  g.font = "12px Segoe UI";
  g.textAlign = "center";
  g.fillText("Time (s)", chartX + chartW / 2, physicsGraphCanvas.height - 8);

  g.save();
  const yLabel = seriesKey === "horizontal" ? "Horizontal distance (m)" : "Height (m)";
  g.translate(16, chartY + chartH / 2);
  g.rotate(-Math.PI / 2);
  g.textAlign = "center";
  g.fillText(yLabel, 0, 0);
  g.restore();

  g.textAlign = "right";
  g.font = "10px Segoe UI";
  g.fillStyle = "rgba(160, 175, 220, 0.75)";
  g.fillText(`max t ≈ ${tMax.toFixed(2)} s`, chartX + chartW, chartY - 2);
  g.textAlign = "left";
  const depLabel =
    seriesKey === "horizontal" ? "max distance ≈ " : "max height ≈ ";
  g.fillText(`${depLabel}${vMax.toFixed(2)} m`, chartX, chartY - 2);

  g.restore();
}

/**
 * Placeholder when no shot has been recorded yet.
 */
function drawPhysicsGraphEmptyState(chartX, chartY, chartW, chartH) {
  const g = physicsGraphCtx;
  g.strokeStyle = "rgba(120, 140, 200, 0.32)";
  g.strokeRect(chartX, chartY, chartW, chartH);
  g.fillStyle = "rgba(155, 170, 220, 0.55)";
  g.font = "13px Segoe UI";
  g.textAlign = "center";
  g.fillText("Launch a projectile to plot live physics", chartX + chartW / 2, chartY + chartH / 2);
}

/**
 * Main graph draw: progressive during flight, full trace after landing, respects series toggle.
 */
function redrawPhysicsGraph() {
  clearPhysicsGraphSurface();
  const seriesKey = getPhysicsGraphSeriesKey();

  const w = physicsGraphCanvas.width;
  const h = physicsGraphCanvas.height;
  const m = PHYSICS_GRAPH_MARGIN;
  const chartX = m.left;
  const chartY = m.top;
  const chartW = w - m.left - m.right;
  const chartH = h - m.top - m.bottom;

  if (!physicsGraphSamples.length) {
    drawPhysicsGraphEmptyState(chartX, chartY, chartW, chartH);
    return;
  }

  const { tMax, vMax } = resolvePhysicsGraphExtents(physicsGraphSamples, seriesKey);
  drawPhysicsGraphDecorations(seriesKey, tMax, vMax, chartX, chartY, chartW, chartH);

  const g = physicsGraphCtx;
  g.beginPath();
  for (let i = 0; i < physicsGraphSamples.length; i += 1) {
    const s = physicsGraphSamples[i];
    const v = getPhysicsGraphSampleValue(s, seriesKey);
    const p = physicsGraphMapToPixels(s.t, v, tMax, vMax, chartX, chartY, chartW, chartH);
    if (i === 0) {
      g.moveTo(p.x, p.y);
    } else {
      g.lineTo(p.x, p.y);
    }
  }
  g.strokeStyle = "rgba(52, 211, 255, 0.92)";
  g.lineWidth = 2;
  g.lineJoin = "round";
  g.shadowColor = "rgba(52, 211, 255, 0.42)";
  g.shadowBlur = 7;
  g.stroke();
  g.shadowBlur = 0;
}

function renderScene() {
  clearCanvas();
  drawSky();
  drawClouds();
  drawPredictionArc();
  drawGround();
  drawLandingPredictionMarker();
  drawLauncher();
  drawTarget();
  drawTrail();
  drawProjectile();
  drawLaunchFlash();
}

function stopAnimation() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

function launchProjectile() {
  if (!simulationDone || isReplayPlaybackActive) return;

  stopExpertMovingTargetIdleLoop();

  const params = getLaunchParams();
  const { speed, angleDeg, gravity, vx, vy } = params;
  const replayLevelCaptured = getSelectedLevel();
  const guideCapturedDuringShot = guideToggle.checked;
  const speedSliderValueCaptured = speedSlider.value;
  const angleSliderValueCaptured = angleSlider.value;
  const gravitySelectValueCaptured = gravitySelect.value;

  shotReplayAccumulator = [];

  // time of flight = 2vy/g
  const timeOfFlight = (2 * vy) / gravity;
  // range = vx * time
  const range = vx * timeOfFlight;
  // max height = vy^2 / (2g)
  const maxHeight = (vy * vy) / (2 * gravity);

  projectile = {
    speed,
    angleDeg,
    gravity,
    vx,
    vy,
    time: 0,
    landed: false,
    canvasX: launcher.x,
    canvasY: launcher.y
  };

  trail = [{ x: launcher.x, y: launcher.y }];
  simulationDone = false;
  launchFlashFrames = 9;
  setMessage("Projectile launched...");

  setLevelPickerLocked(true);

  predictionSnapshotForActiveFlight =
    submittedPredictionMeters !== null && Number.isFinite(submittedPredictionMeters)
      ? submittedPredictionMeters
      : null;
  setPredictionChallengeControlsLocked(true);

  // Seed graph series at launch so axes start immediately at (0,0).
  physicsGraphSamples = [{ t: 0, y: 0, x: 0 }];
  physicsGraphAxisDomain = {
    tMax: timeOfFlight,
    heightMax: maxHeight,
    distanceMax: range
  };
  redrawPhysicsGraph();

  updateResultsPanel({
    angle: angleDeg,
    speed,
    gravity,
    range,
    maxHeight,
    timeOfFlight
  });
  updatePhysicsBreakdown(params, { range, maxHeight, timeOfFlight });

  const dt = 1 / 60;
  let landingX = launcher.x;
  let shotRingScore = 0;

  function animate() {
    if (!projectile) return;

    advanceExpertMovingTarget(dt);

    projectile.time += dt;

    // Requested equations for position:
    // x = vx * t
    // y = vy * t - 0.5 * g * t^2
    const xMeters = projectile.vx * projectile.time;
    const yMeters = projectile.vy * projectile.time - 0.5 * projectile.gravity * projectile.time * projectile.time;

    physicsGraphSamples.push({
      t: projectile.time,
      x: Math.max(0, xMeters),
      y: Math.max(0, yMeters)
    });
    redrawPhysicsGraph();

    const xPx = launcher.x + xMeters * metersToPixels;
    const yPx = launcher.y - yMeters * metersToPixels;

    projectile.canvasX = xPx;
    projectile.canvasY = yPx;
    trail.push({ x: xPx, y: yPx });

    shotRingScore = getTargetRingScore(projectile.canvasX, projectile.canvasY);
    if (shotRingScore > 0) {
      landingX = projectile.canvasX;
      projectile.landed = true;
    }

    // Landing condition: projectile reaches ground or goes out of view.
    if (!projectile.landed && (yPx >= groundY || xPx > canvas.width - 5)) {
      projectile.canvasY = groundY;
      landingX = Math.min(xPx, canvas.width - 5);
      projectile.canvasX = landingX;
      trail.push({ x: projectile.canvasX, y: projectile.canvasY });
      projectile.landed = true;
    }

    if (shotReplayAccumulator) {
      shotReplayAccumulator.push({
        targetX: target.x,
        px: projectile.canvasX,
        py: projectile.canvasY,
        landed: projectile.landed
      });
    }

    renderScene();

    if (!projectile.landed) {
      animationId = requestAnimationFrame(animate);
      return;
    }

    simulationDone = true;
    stopAnimation();
    redrawPhysicsGraph();

    const wasHitLanding = shotRingScore > 0;
    if (wasHitLanding) {
      score += shotRingScore;
      setMessage(shotRingScore === 2 ? "Bullseye! +2" : "Hit! +1", "hit");
    } else {
      setMessage("No score. Try again.", "miss");
    }

   
    resultScore.textContent = `${score}`;

    const actualLandingDistanceM = landingDistanceMetersFromCanvas(landingX);
    const predictionAbsErrM =
      predictionSnapshotForActiveFlight !== null &&
      Number.isFinite(predictionSnapshotForActiveFlight)
        ? Math.abs(actualLandingDistanceM - predictionSnapshotForActiveFlight)
        : null;
         playerStats.totalShots += 1;

    if (wasHitLanding) {
      playerStats.totalHits += 1;
    }

if (score > playerStats.bestScore) {
  playerStats.bestScore = score;
}

if (
  predictionAbsErrM !== null &&
  (
    playerStats.bestPredictionError === null ||
    predictionAbsErrM < playerStats.bestPredictionError
  )
) {
  playerStats.bestPredictionError = predictionAbsErrM;
}

savePlayerProgress();
updatePlayerProgressUI();


    evaluateActiveMission({
      wasHit: wasHitLanding,
      gravity: Number(gravitySelect.value),
      level: replayLevelCaptured,
      guideOff: !guideToggle.checked,
      ringScore: shotRingScore,
      targetDistanceM: Math.max(0, (target.x - launcher.x) / metersToPixels),
      predictionAbsErrorM: predictionAbsErrM
    });

    evaluatePredictionChallenge(predictionSnapshotForActiveFlight, actualLandingDistanceM);
    predictionSnapshotForActiveFlight = null;
    submittedPredictionMeters = null;

    if (shotReplayAccumulator && shotReplayAccumulator.length > 0) {
      lastShotReplayData = {
        level: replayLevelCaptured,
        speed,
        angleDeg,
        gravity,
        vxRecorded: vx,
        vyRecorded: vy,
        dt,
        speedSliderValue: speedSliderValueCaptured,
        angleSliderValue: angleSliderValueCaptured,
        gravitySelectValue: gravitySelectValueCaptured,
        guideWasOnDuringShot: guideCapturedDuringShot,
        frames: shotReplayAccumulator.map((f) => ({ ...f })),
        graphSamples: physicsGraphSamples.map((s) => ({ t: s.t, x: s.x, y: s.y }))
      };
    }
    shotReplayAccumulator = null;
    updateReplayButtonAvailability();

    setPredictionChallengeControlsLocked(false);
    setLevelPickerLocked(false);
    renderScene();
    primeExpertMovingTargetIdleLoop();
  }

  animate();
}

/**
 * Core reset workflow shared by manual resets and difficulty switches.
 * @param {string} toast - status line beneath the canvas
 * @param {{ syncGuideDefaults?: boolean }} options - only level changes tweak guide prefs
 */
function resetGameplayRound(toast, { syncGuideDefaults = false } = {}) {
  invalidateAppliedChallengeState();
  stopExpertMovingTargetIdleLoop();
  stopAnimation();
  projectile = null;
  trail = [];
  simulationDone = true;
  launchFlashFrames = 0;
  physicsGraphSamples = [];
  physicsGraphAxisDomain = null;
  redrawPhysicsGraph();
  resetPredictionChallengeVisuals({ clearBonus: false });
  setPredictionChallengeControlsLocked(false);
  setLevelPickerLocked(false);

  if (syncGuideDefaults) {
    guideToggle.checked = getActivePreset().guideDefaultOn;
  }
  applyLevelSizingToTarget();
  placeRandomTarget();

  setMessage(toast);

  updateResultsPanel({
    angle: Number(angleSlider.value),
    speed: Number(speedSlider.value),
    gravity: Number(gravitySelect.value),
    range: 0,
    maxHeight: 0,
    timeOfFlight: 0
  });
  updatePhysicsBreakdown(getLaunchParams());

  renderScene();
  primeExpertMovingTargetIdleLoop();
}

function resetGame() {
  resetGameplayRound("Scene reset. New target placed!");
}

function handleLevelSwitch() {
  const preset = getActivePreset();
  resetGameplayRound(`Level ${getSelectedLevel()} (${preset.title}) — arena refreshed.`, {
    syncGuideDefaults: true
  });
}

function bindEvents() {
  speedSlider.addEventListener("input", () => {
    updateControlLabels();
    if (simulationDone) {
      resultSpeed.textContent = `${Number(speedSlider.value).toFixed(2)} m/s`;
      updatePhysicsBreakdown(getLaunchParams());
      renderScene();
    }
  });

  angleSlider.addEventListener("input", () => {
    updateControlLabels();
    if (simulationDone) {
      resultAngle.textContent = `${Number(angleSlider.value).toFixed(0)}°`;
      updatePhysicsBreakdown(getLaunchParams());
      renderScene();
    }
  });

  gravitySelect.addEventListener("change", () => {
    if (simulationDone) {
      resultGravity.textContent = `${Number(gravitySelect.value).toFixed(2)} m/s²`;
      updatePhysicsBreakdown(getLaunchParams());
      renderScene();
    }
  });

  guideToggle.addEventListener("change", () => {
    if (simulationDone) {
      renderScene();
    }
  });

  physicsGraphSeriesSelect.addEventListener("change", () => {
    redrawPhysicsGraph();
  });

  submitPredictionBtn.addEventListener("click", commitSubmittedPredictionDistance);
  predictionDistanceInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      commitSubmittedPredictionDistance();
    }
  });

  levelSelect.addEventListener("change", handleLevelSwitch);

  if (replayLastShotBtn) {
    replayLastShotBtn.addEventListener("click", beginReplayLastShotPlayback);
  }
  if (challengeGenerateBtn) {
    challengeGenerateBtn.addEventListener("click", handleGenerateMissionClick);
  }
  if (challengeApplyBtn) {
    challengeApplyBtn.addEventListener("click", handleApplyMissionClick);
  }
  if (challengeClearBtn) {
    challengeClearBtn.addEventListener("click", () => {
      clearChallengeMode();
    });
  }

  launchBtn.addEventListener("click", launchProjectile);
  resetBtn.addEventListener("click", resetGame);

  const resetProgressBtn =
  document.getElementById("resetProgressBtn");

if (resetProgressBtn) {
  resetProgressBtn.addEventListener("click", () => {

    localStorage.removeItem("physicsArcadeProgress");

    playerStats = {
      bestScore: 0,
      totalShots: 0,
      totalHits: 0,
      bestPredictionError: null
    };

    updatePlayerProgressUI();
  });
}
}

function savePlayerProgress() {
  localStorage.setItem(
    "physicsArcadeProgress",
    JSON.stringify(playerStats)
  );
}

function loadPlayerProgress() {
  const saved = localStorage.getItem("physicsArcadeProgress");

  if (saved) {
    playerStats = JSON.parse(saved);
  }
}

function updatePlayerProgressUI() {
  document.getElementById("bestScoreStat").textContent =
    playerStats.bestScore;

  document.getElementById("totalShotsStat").textContent =
    playerStats.totalShots;

  document.getElementById("totalHitsStat").textContent =
    playerStats.totalHits;

  const accuracy =
    playerStats.totalShots > 0
      ? (
          (playerStats.totalHits / playerStats.totalShots) *
          100
        ).toFixed(0)
      : 0;

  document.getElementById("accuracyStat").textContent =
    accuracy + "%";

  document.getElementById("bestPredictionStat").textContent =
    playerStats.bestPredictionError !== null
      ? playerStats.bestPredictionError.toFixed(1) + " m"
      : "—";
}

function init() {
  loadPlayerProgress();
  updatePlayerProgressUI();
  updateControlLabels();
  buildClouds();
  bindEvents();
  resetPredictionChallengeVisuals({ clearBonus: true });
  challengeBonusScore = 0;
  refreshChallengeDrawerUi();
  setPredictionChallengeControlsLocked(false);
  setLevelPickerLocked(false);

  guideToggle.checked = getActivePreset().guideDefaultOn;
  applyLevelSizingToTarget();
  placeRandomTarget();

  updateResultsPanel({
    angle: Number(angleSlider.value),
    speed: Number(speedSlider.value),
    gravity: Number(gravitySelect.value),
    range: 0,
    maxHeight: 0,
    timeOfFlight: 0
  });
  updatePhysicsBreakdown(getLaunchParams());
  redrawPhysicsGraph();
  renderScene();
  primeExpertMovingTargetIdleLoop();
  updateReplayButtonAvailability();
}

init();
