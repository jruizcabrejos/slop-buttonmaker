const GIF_TIME_UNIT_MS = 10;
const MINIMUM_FRAME_DELAY_MS = 20;

export const MAX_AUTO_CYCLE_DURATION_MS = 10000;
export const MAX_AUTO_CYCLE_FRAMES = 75;

export function createGifFrameSchedule(durationMs, frameRate) {
  const minimumDelayUnits = Math.ceil(
    MINIMUM_FRAME_DELAY_MS / GIF_TIME_UNIT_MS
  );
  const durationUnits = Math.max(
    minimumDelayUnits,
    Math.round((Number(durationMs) || 0) / GIF_TIME_UNIT_MS)
  );
  const safeFrameRate = Math.max(1, Number(frameRate) || 1);
  const desiredFrameCount = Math.max(
    1,
    Math.round(
      durationUnits * GIF_TIME_UNIT_MS * safeFrameRate / 1000
    )
  );
  const frameCount = Math.min(
    desiredFrameCount,
    Math.max(1, Math.floor(durationUnits / minimumDelayUnits))
  );
  // Rounded cumulative boundaries keep samples and encoded delays on the
  // same clock while preserving the exact selected cycle length.
  const boundaries = Array.from(
    { length: frameCount + 1 },
    (_, index) => Math.round(index * durationUnits / frameCount)
  );
  const frames = Array.from({ length: frameCount }, (_, index) => ({
    timeMs: boundaries[index] * GIF_TIME_UNIT_MS,
    delayMs:
      (boundaries[index + 1] - boundaries[index]) * GIF_TIME_UNIT_MS
  }));
  const resolvedDurationMs = durationUnits * GIF_TIME_UNIT_MS;

  return {
    durationMs: resolvedDurationMs,
    frames,
    frameTimes: frames.map(frame => frame.timeMs),
    key: `${resolvedDurationMs}:${frameCount}`
  };
}

export function resolveAutoCycle(
  durationsMs,
  frameRate,
  {
    maximumDurationMs = MAX_AUTO_CYCLE_DURATION_MS,
    maximumFrames = MAX_AUTO_CYCLE_FRAMES
  } = {}
) {
  const maximumDuration = Math.max(
    GIF_TIME_UNIT_MS,
    Math.floor(maximumDurationMs)
  );
  const periods = durationsMs
    .map(duration => Math.round(Number(duration)))
    .filter(duration => Number.isSafeInteger(duration) && duration > 0);

  if (periods.length === 0) {
    return { durationMs: null, reason: "no-animations" };
  }

  // The cycle must close both every source clock and GIF's 10 ms clock.
  let cycleDuration = GIF_TIME_UNIT_MS;

  for (const period of new Set(periods)) {
    const factor = period / greatestCommonDivisor(cycleDuration, period);

    if (cycleDuration > Math.floor(maximumDuration / factor)) {
      return { durationMs: null, reason: "duration-limit" };
    }

    cycleDuration *= factor;
  }

  const schedule = createGifFrameSchedule(cycleDuration, frameRate);

  if (schedule.frames.length < 2) {
    return { durationMs: null, reason: "frame-rate" };
  }

  if (schedule.frames.length > maximumFrames) {
    return { durationMs: null, reason: "frame-limit" };
  }

  return { durationMs: cycleDuration, reason: null };
}

function greatestCommonDivisor(first, second) {
  let left = Math.abs(first);
  let right = Math.abs(second);

  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }

  return left || 1;
}
