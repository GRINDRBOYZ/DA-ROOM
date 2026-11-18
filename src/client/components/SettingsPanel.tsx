import {
  DEFAULT_ANSWER_CAPTION,
  MAX_CAPTION_LENGTH,
  MAX_ROUNDS,
  MAX_PRONOUN_LENGTH,
  MIN_ROUNDS,
  PRONOUN_PRESETS,
  RoomSettings,
} from '../../shared/types';
import {
  renderCallCaption,
  renderCaption,
  settingsValidationErrors,
  timerLabel,
} from '../../shared/settings';
import { MinusIcon, PlusIcon, SparkIcon } from './Icons';

interface SettingsPanelProps {
  settings: RoomSettings;
  dirty: boolean;
  saving: boolean;
  onChange: (settings: RoomSettings) => void;
  onSave: () => void;
  onReset: () => void;
}

interface TimerSelectProps {
  label: string;
  help: string;
  seconds: number;
  onChange: (seconds: number) => void;
}

const TIMER_OPTIONS = [30, 45, 60, 90, 120, 180];

function TimerControl({ label, help, seconds, onChange }: TimerSelectProps) {
  const enabled = seconds > 0;
  const options = TIMER_OPTIONS.includes(seconds) ? TIMER_OPTIONS : [...TIMER_OPTIONS, seconds].sort((a, b) => a - b);
  return (
    <div className="setting-row timer-setting">
      <div className="setting-copy">
        <span className="setting-label">{label}</span>
        <span className="setting-help">{enabled ? timerLabel(seconds) : 'Off — wait for stragglers'}</span>
      </div>
      <div className="setting-control">
        <button
          type="button"
          className={`switch ${enabled ? 'is-on' : ''}`}
          role="switch"
          aria-checked={enabled}
          aria-label={`Toggle ${label}`}
          onClick={() => onChange(enabled ? 0 : 60)}
        >
          <span className="switch-knob" />
        </button>
        {enabled ? (
          <select
            className="select-input compact-select"
            value={seconds}
            onChange={(event) => onChange(Number(event.target.value))}
            aria-label={`${label} length`}
          >
            {options.map((value) => (
              <option key={value} value={value}>
                {timerLabel(value)}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <p className="setting-help setting-help-wide">{help}</p>
    </div>
  );
}

export function SettingsPanel({ settings, dirty, saving, onChange, onSave, onReset }: SettingsPanelProps) {
  const update = <K extends keyof RoomSettings>(key: K, value: RoomSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };
  const errors = settingsValidationErrors(settings);
  const presetActive = (preset: string) => settings.pronoun.toUpperCase() === preset;

  return (
    <section className="card settings-card">
      <div className="card-head">
        <div>
          <span className="eyebrow">Host controls</span>
          <h2>Set the rules</h2>
        </div>
        <span className={`save-state ${dirty ? 'is-dirty' : ''}`}>
          {saving ? 'Saving…' : dirty ? 'Unsaved' : 'Saved'}
        </span>
      </div>

      <div className="settings-section">
        <div className="setting-label-row">
          <span className="setting-label">Pronoun</span>
          <span className="setting-help">Replaces every {'{pronoun}'}</span>
        </div>
        <div className="pronoun-row" role="group" aria-label="Pronoun presets">
          {PRONOUN_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`segment ${presetActive(preset) ? 'is-active' : ''}`}
              onClick={() => update('pronoun', preset)}
            >
              {preset}
            </button>
          ))}
          <input
            className="text-input pronoun-custom"
            value={settings.pronoun}
            onChange={(event) => update('pronoun', event.target.value)}
            placeholder="custom"
            maxLength={MAX_PRONOUN_LENGTH}
            aria-label="Custom pronoun"
          />
        </div>
      </div>

      <div className="settings-section">
        <div className="setting-label-row">
          <span className="setting-label">Call caption</span>
          <span className="setting-help">Locked — only the pronoun changes it</span>
        </div>
        <div className="call-caption-lock" aria-readonly="true">
          <span className="call-lock-badge">CALL</span>
          <strong>{renderCallCaption(settings.pronoun || 'SHE')}</strong>
        </div>
        <p className="micro-help">The call opens the chain and always stays in this format.</p>

        <label className="setting-label-row" htmlFor="answer-caption">
          <span className="setting-label">Answer caption</span>
          <span className="setting-help">Editable — lands under every second image</span>
        </label>
        <input
          id="answer-caption"
          className="text-input caption-input"
          value={settings.answerCaption}
          onChange={(event) => update('answerCaption', event.target.value)}
          maxLength={MAX_CAPTION_LENGTH}
          placeholder={DEFAULT_ANSWER_CAPTION}
        />
        <p className="caption-example">
          <SparkIcon size={14} /> {renderCaption(settings.answerCaption, settings.pronoun || 'SHE')}
        </p>
        <p className="micro-help">
          Blank or overlong answers fall back to the default. {'{pronoun}'} also works here.
        </p>
      </div>

      <div className="settings-section">
        <div className="setting-label-row">
          <span className="setting-label">Total rounds</span>
          <span className="setting-help">Round 1 counts as a round</span>
        </div>
        <div className="rounds-control">
          <button
            type="button"
            className="round-step"
            onClick={() => update('totalRounds', Math.max(MIN_ROUNDS, settings.totalRounds - 1))}
            aria-label="Remove one round"
            disabled={settings.totalRounds <= MIN_ROUNDS}
          >
            <MinusIcon size={18} />
          </button>
          <div className="rounds-value">
            <strong>{settings.totalRounds}</strong>
            <span>panels per chain</span>
          </div>
          <button
            type="button"
            className="round-step"
            onClick={() => update('totalRounds', Math.min(MAX_ROUNDS, settings.totalRounds + 1))}
            aria-label="Add one round"
            disabled={settings.totalRounds >= MAX_ROUNDS}
          >
            <PlusIcon size={18} />
          </button>
          <input
            className="rounds-range"
            type="range"
            min={MIN_ROUNDS}
            max={MAX_ROUNDS}
            step={1}
            value={settings.totalRounds}
            onChange={(event) => update('totalRounds', Number(event.target.value))}
            aria-label="Total rounds"
          />
        </div>
      </div>

      <div className="settings-section settings-toggles">
        <TimerControl
          label="Submission timer"
          help="When it runs out, missing panels are auto-filled with a placeholder."
          seconds={settings.submissionTimerSec}
          onChange={(seconds) => update('submissionTimerSec', seconds)}
        />
        <TimerControl
          label="Voting timer"
          help="Voting closes automatically when this ends, even if not everyone voted."
          seconds={settings.votingTimerSec}
          onChange={(seconds) => update('votingTimerSec', seconds)}
        />

        <div className="setting-row">
          <div className="setting-copy">
            <span className="setting-label">Allow self-voting</span>
            <span className="setting-help">Players can vote for their own chain.</span>
          </div>
          <button
            type="button"
            className={`switch ${settings.allowSelfVote ? 'is-on' : ''}`}
            role="switch"
            aria-checked={settings.allowSelfVote}
            aria-label="Allow self-voting"
            onClick={() => update('allowSelfVote', !settings.allowSelfVote)}
          >
            <span className="switch-knob" />
          </button>
        </div>

        <div className="setting-row">
          <div className="setting-copy">
            <span className="setting-label">Drawing mode</span>
            <span className="setting-help">
              Adds a Draw tab seeded with the previous image, so players can deface it instead of starting fresh.
            </span>
          </div>
          <button
            type="button"
            className={`switch ${settings.drawingMode ? 'is-on' : ''}`}
            role="switch"
            aria-checked={settings.drawingMode}
            aria-label="Enable drawing mode"
            onClick={() => update('drawingMode', !settings.drawingMode)}
          >
            <span className="switch-knob" />
          </button>
        </div>

        <div className="setting-row">
          <div className="setting-copy">
            <span className="setting-label">Sudden-death tiebreak</span>
            <span className="setting-help">
              If the vote ties, run a 30-second vote between the tied chains. Otherwise the host picks.
            </span>
          </div>
          <button
            type="button"
            className={`switch ${settings.suddenDeathEnabled ? 'is-on' : ''}`}
            role="switch"
            aria-checked={settings.suddenDeathEnabled}
            aria-label="Enable sudden-death tiebreak"
            onClick={() => update('suddenDeathEnabled', !settings.suddenDeathEnabled)}
          >
            <span className="switch-knob" />
          </button>
        </div>
      </div>

      {errors.length > 0 ? (
        <div className="inline-alert" role="alert">
          {errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      ) : null}

      <div className="settings-actions">
        <button type="button" className="button button-quiet button-small" onClick={onReset}>
          Reset defaults
        </button>
        <button
          type="button"
          className="button button-dark button-small"
          onClick={onSave}
          disabled={!dirty || saving || errors.length > 0}
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </section>
  );
}
