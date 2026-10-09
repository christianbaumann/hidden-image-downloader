export const PHASES = { API: 'api', PHOTOS: 'photos' };
export const API_PHASE_SHARE = 10;
export const BADGE_TEXT_LIMIT = 4;
const FULL_PERCENT = 100;

// Whole percent of the whole job: the API phase fills 0–10 %, the photo phase 10–100 %.
export function overallPercent(phase, done, total) {
  const fraction = total > 0 ? done / total : 1;
  if (phase === PHASES.API) {
    return Math.floor(fraction * API_PHASE_SHARE);
  }
  return Math.floor(API_PHASE_SHARE + fraction * (FULL_PERCENT - API_PHASE_SHARE));
}

// Photo phase: the count while it fits the badge, the overall percentage otherwise.
export function progressBadgeText(done, total) {
  const count = `${done}/${total}`;
  return count.length <= BADGE_TEXT_LIMIT ? count : `${overallPercent(PHASES.PHOTOS, done, total)}%`;
}

// prevPercent is null before the first report.
export function shouldReport(prevPercent, nextPercent) {
  return prevPercent === null || Math.floor(nextPercent) > Math.floor(prevPercent);
}

// Wraps report(done, total) for buildZip's onProgress, so it runs at most once per whole percent.
export function throttleProgress(report) {
  let lastPercent = null;
  return (done, total) => {
    const percent = overallPercent(PHASES.PHOTOS, done, total);
    if (shouldReport(lastPercent, percent)) {
      lastPercent = percent;
      report(done, total);
    }
  };
}
