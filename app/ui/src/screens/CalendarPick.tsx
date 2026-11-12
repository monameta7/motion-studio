// Responsibility: New video's «از تقویم محتوا» (docs/11 §1): the card of today's calendar topic (or the nearest next one) with «تغییر» to choose another day that has not been made yet.
import { useEffect, useState } from 'react';
import type { CalendarEntry, CalendarRange } from '../api';
import { JALALI_MONTHS, WEEKDAYS_FA, addDays, toJalali, weekdayIndex, ymdOf } from '../../../calendar/jalali';
import { faNum } from '../fa';
import { usePoll } from '../hooks';
import { useBrand } from '../brand';

/** Days whose film can still be started (the server accepts the same ones). */
const STARTABLE = new Set<CalendarEntry['status']>(['planned', 'failed', 'skipped']);

export const dayText = (iso: string): string => {
  const j = toJalali(ymdOf(iso));
  return `${WEEKDAYS_FA[weekdayIndex(iso)]} ${faNum(j.d)} ${JALALI_MONTHS[j.m - 1]}`;
};

interface Props { day: CalendarEntry | null; setDay: (e: CalendarEntry | null) => void }

export function CalendarPick({ day, setDay }: Props) {
  // The range starts a little before today so the server's «today» (the computer's clock) is always inside it.
  const from = addDays(new Date().toISOString().slice(0, 10), -2);
  // The active brand's own calendar (Phase 8).
  const { active } = useBrand();
  const { data } = usePoll<CalendarRange>(active ? `/api/calendar?from=${from}&to=${addDays(from, 120)}&brand=${encodeURIComponent(active.slug)}` : null, 0);
  const mine = data && active && data.brand === active.slug ? data : null;
  const [choosing, setChoosing] = useState(false);
  const days = (mine?.entries ?? []).filter((e) => e.date >= (mine?.today ?? '') && STARTABLE.has(e.status) && e.topic.trim());

  // First visit: today's topic, else the nearest next day.
  useEffect(() => { if (mine && !day && days[0]) setDay(days[0]); }, [mine]);

  if (!mine) return <p className="muted">در حال خواندن تقویم…</p>;
  if (days.length === 0) {
    return (
      <div className="cal-pick empty">
        <p>در تقویم موضوعی برای امروز یا روزهای بعد نیست.</p>
        <a className="btn" href="#/automation">رفتن به تقویم</a>
      </div>
    );
  }
  return (
    <div className="cal-pick stack-sm">
      {day && (
        <div className="cal-pick-card">
          <div className="cal-pick-text">
            <span className="muted small">{day.date === mine.today ? 'امروز، ' : ''}{dayText(day.date)}</span>
            <b className="cal-pick-topic">{day.topic}</b>
            {day.note && <span className="muted small">{day.note}</span>}
          </div>
          {days.length > 1 && <button type="button" className="btn" aria-expanded={choosing} onClick={() => setChoosing(!choosing)}>تغییر</button>}
        </div>
      )}
      {choosing && (
        <fieldset className="cal-pick-list">
          <legend className="sr-only">روز تقویم</legend>
          {days.map((e) => (
            <label key={e.id} className={day?.id === e.id ? 'on' : ''}>
              <input type="radio" name="cal-day" checked={day?.id === e.id} onChange={() => { setDay(e); setChoosing(false); }} />
              <span className="muted small">{dayText(e.date)}</span>
              <span>{e.topic}</span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
