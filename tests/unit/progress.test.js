import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_PHASE_SHARE, BADGE_TEXT_LIMIT, PHASES, overallPercent, progressBadgeText, shouldReport, throttleProgress,
} from '../../lib/progress.js';

describe('overallPercent', () => {
  it('fills 0–10 % in the API phase', () => {
    assert.equal(overallPercent(PHASES.API, 0, 1), 0);
    assert.equal(overallPercent(PHASES.API, 1, 2), API_PHASE_SHARE / 2);
    assert.equal(overallPercent(PHASES.API, 1, 1), API_PHASE_SHARE);
  });

  it('fills 10–100 % in the photo phase, in whole percent', () => {
    assert.equal(overallPercent(PHASES.PHOTOS, 0, 80), API_PHASE_SHARE);
    assert.equal(overallPercent(PHASES.PHOTOS, 1, 3), 40);
    assert.equal(overallPercent(PHASES.PHOTOS, 80, 80), 100);
  });

  it('treats an empty phase as complete', () => {
    assert.equal(overallPercent(PHASES.PHOTOS, 0, 0), 100);
  });
});

describe('progressBadgeText', () => {
  it('shows the count while it fits the badge', () => {
    assert.equal(progressBadgeText(9, 80), '9/80');
    assert.equal(progressBadgeText(3, 7), '3/7');
  });

  it('switches to the overall percentage when the count is too long', () => {
    assert.equal(progressBadgeText(10, 80), '21%');
    assert.equal(progressBadgeText(1, 100), '10%');
    assert.equal(progressBadgeText(1000, 1000), '100%');
  });

  it('never exceeds the badge limit', () => {
    for (const total of [1, 9, 10, 99, 100, 999, 1000, 12345]) {
      for (let done = 0; done <= total; done += Math.max(1, Math.floor(total / 50))) {
        assert.ok(progressBadgeText(done, total).length <= BADGE_TEXT_LIMIT, `${done}/${total}`);
      }
    }
  });
});

describe('shouldReport', () => {
  it('reports the first value', () => {
    assert.equal(shouldReport(null, 10), true);
  });

  it('reports only when a new whole percent is reached', () => {
    assert.equal(shouldReport(10, 10), false);
    assert.equal(shouldReport(10, 10.9), false);
    assert.equal(shouldReport(10.9, 11), true);
  });
});

describe('throttleProgress', () => {
  it('reports at most once per whole percent, always including the last entry', () => {
    const reported = [];
    const total = 1000;
    const onProgress = throttleProgress((done) => reported.push(done));
    for (let done = 1; done <= total; done++) {
      onProgress(done, total);
    }
    const percents = reported.map((done) => overallPercent(PHASES.PHOTOS, done, total));
    assert.equal(new Set(percents).size, percents.length);
    assert.equal(reported.at(-1), total);
    assert.equal(reported.length, 100 - API_PHASE_SHARE + 1);
  });

  it('reports every entry of a small ZIP', () => {
    const reported = [];
    const onProgress = throttleProgress((done, total) => reported.push(`${done}/${total}`));
    [1, 2, 3].forEach((done) => onProgress(done, 3));
    assert.deepEqual(reported, ['1/3', '2/3', '3/3']);
  });
});
