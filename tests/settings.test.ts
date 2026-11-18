import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SETTINGS,
  captionKindForIndex,
  normalizeNickname,
  normalizePanelText,
  normalizeSettings,
  normalizeTextPosition,
  renderCallCaption,
  renderCaption,
  renderPanelCaption,
  settingsValidationErrors,
} from '../src/shared/settings';

test('the call caption is fixed and only the pronoun changes it', () => {
  assert.equal(renderCallCaption('HE'), 'AND THEN HE WALKS IN');
  assert.equal(renderCallCaption('THEY'), 'AND THEN THEY WALKS IN');
  assert.equal(renderCallCaption('THE GREMLIN'), 'AND THEN THE GREMLIN WALKS IN');
});

test('the answer caption replaces {pronoun} case-insensitively', () => {
  assert.equal(renderCaption('THEY SAID {PRONOUN} WAS HERE', 'THEY'), 'THEY SAID THEY WAS HERE');
  assert.equal(renderCaption('AND WALKS OUT TF?', 'SHE'), 'AND WALKS OUT TF?');
  assert.equal(renderCaption('   ', 'SHE'), 'AND WALKS OUT TF?');
});

test('captions alternate call and answer by panel index', () => {
  assert.equal(captionKindForIndex(0), 'call');
  assert.equal(captionKindForIndex(1), 'answer');
  assert.equal(captionKindForIndex(2), 'call');
  assert.equal(captionKindForIndex(3), 'answer');

  const settings = { ...DEFAULT_SETTINGS, pronoun: 'HE' };
  assert.equal(renderPanelCaption('call', settings), 'AND THEN HE WALKS IN');
  assert.equal(renderPanelCaption('answer', settings), 'AND WALKS OUT TF?');
});

test('settings normalize invalid values and clamp rounds', () => {
  const settings = normalizeSettings({
    pronoun: '   ',
    answerCaption: '',
    totalRounds: 1,
    submissionTimerSec: -2,
    votingTimerSec: 5,
    allowSelfVote: 'yes',
    suddenDeathEnabled: 0,
    drawingMode: 1,
  });
  assert.equal(settings.pronoun, 'SHE');
  assert.equal(settings.answerCaption, DEFAULT_SETTINGS.answerCaption);
  assert.equal(settings.totalRounds, 2);
  assert.equal(settings.submissionTimerSec, 0);
  assert.equal(settings.votingTimerSec, 15);
  assert.equal(settings.allowSelfVote, true);
  assert.equal(settings.suddenDeathEnabled, false);
  assert.equal(settings.drawingMode, true);
});

test('custom pronouns are trimmed and strip braces', () => {
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, pronoun: '  the gremlin {pronoun}  ' });
  assert.equal(settings.pronoun, 'the gremlin pronoun');
});

test('nicknames require 2 to 20 printable characters', () => {
  assert.equal(normalizeNickname('  A  '), null);
  assert.equal(normalizeNickname('Alex'), 'Alex');
  assert.equal(normalizeNickname('bad\nname'), 'bad name');
  assert.equal(normalizeNickname('x'.repeat(21)), null);
});

test('text panels normalize whitespace and enforce the 280 character limit', () => {
  assert.equal(normalizePanelText('  hello   world  '), 'hello world');
  assert.equal(normalizePanelText('line one\n\n\n\nline two'), 'line one\n\nline two');
  assert.equal(normalizePanelText('tab\there'), 'tab here');
  assert.equal(normalizePanelText(''), null);
  assert.equal(normalizePanelText('x'.repeat(281)), null);
  assert.equal(normalizePanelText('x'.repeat(280)), 'x'.repeat(280));
});

test('text positions accept the four corners and fall back to bottom-left', () => {
  assert.equal(normalizeTextPosition('top-left'), 'top-left');
  assert.equal(normalizeTextPosition('top-right'), 'top-right');
  assert.equal(normalizeTextPosition('bottom-left'), 'bottom-left');
  assert.equal(normalizeTextPosition('bottom-right'), 'bottom-right');
  assert.equal(normalizeTextPosition('middle'), 'bottom-left');
  assert.equal(normalizeTextPosition(undefined), 'bottom-left');
  assert.equal(normalizeTextPosition(42), 'bottom-left');
});

test('settings validation surfaces bad rounds and long captions', () => {
  const errors = settingsValidationErrors({
    ...DEFAULT_SETTINGS,
    totalRounds: 15,
    answerCaption: 'x'.repeat(121),
  });
  assert.ok(errors.some((error) => error.includes('Rounds')));
  assert.ok(errors.some((error) => error.includes('Answer caption')));
});
