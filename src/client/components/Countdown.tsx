import { ClockIcon } from './Icons';
import { formatClock, secondsLeft, useNow } from '../useNow';

interface CountdownProps {
  deadline: number | null;
  label?: string;
}

export function Countdown({ deadline, label }: CountdownProps) {
  const now = useNow();
  const remaining = secondsLeft(deadline, now);
  if (remaining === null) return null;
  const urgent = remaining <= 10;
  return (
    <span className={`countdown ${urgent ? 'is-urgent' : ''}`} aria-label={`${label ?? 'Time'} remaining`}>
      <ClockIcon size={16} />
      {label ? <span className="countdown-label">{label}</span> : null}
      <strong>{formatClock(remaining)}</strong>
    </span>
  );
}
