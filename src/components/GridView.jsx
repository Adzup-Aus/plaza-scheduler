import React, { useMemo, useState } from "react";

// Grid view: rows are days (calendar dates), columns are jobs — matching the current
// Google Sheet. Same rows underneath as the timeline (one dataset). Every cell is a
// real schedule_entry/work-day but you can type into it freely.
const DAY_MS = 86400000;
const toUTC = (s) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
const weekday = (s) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(s + "T00:00:00Z").getUTCDay()];

export default function GridView({ jobs, entries, days, onEditDay }) {
  const dayBySort = useMemo(() => {
    const m = new Map();
    for (const d of days) m.set(`${d.job_id}:${d.sort_order}`, d);
    return m;
  }, [days]);

  const dates = useMemo(() => {
    const ds = entries.map((e) => e.scheduled_date).filter(Boolean);
    if (!ds.length) return [];
    const min = Math.min(...ds.map(toUTC)), max = Math.max(...ds.map(toUTC));
    const out = [];
    for (let t = min; t <= max; t += DAY_MS) out.push(fromUTC(t));
    return out;
  }, [entries]);

  // date+job -> { entry, day }
  const cell = useMemo(() => {
    const m = new Map();
    for (const e of entries) {
      const mo = (e.notes || "").match(/\[wd:(\d+)\]/);
      const day = mo ? dayBySort.get(`${e.job_id}:${Number(mo[1])}`) : null;
      m.set(`${e.scheduled_date}:${e.job_id}`, { entry: e, day });
    }
    return m;
  }, [entries, dayBySort]);

  if (!dates.length) return <div className="p-6 text-sm text-black/50">No scheduled days yet. Generate a schedule for a job to populate the board.</div>;

  return (
    <div className="border border-black/10 rounded-lg bg-white overflow-auto" style={{ maxHeight: "72vh" }}>
      <table className="text-xs border-collapse w-full">
        <thead className="sticky top-0 z-10 bg-plaza-bluish text-white">
          <tr>
            <th className="px-2 py-2 text-left sticky left-0 bg-plaza-bluish z-20 w-28">Day</th>
            {jobs.map((j) => (
              <th key={j.id} className="px-2 py-2 text-left min-w-[150px] border-l border-white/10">
                <div className="font-semibold truncate">{j.client_name || j.job_name || j.id.slice(0, 6)}</div>
                <div className="opacity-80 font-normal truncate">{j.suburb || ""}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => {
            const wend = ["Sat", "Sun"].includes(weekday(date));
            return (
              <tr key={date} className={wend ? "bg-black/[0.03]" : ""}>
                <td className="px-2 py-1 sticky left-0 bg-white z-10 border-t border-black/5 whitespace-nowrap">
                  <span className="font-semibold">{weekday(date)}</span> <span className="text-black/50">{date.slice(5)}</span>
                </td>
                {jobs.map((j) => {
                  const c = cell.get(`${date}:${j.id}`);
                  return (
                    <td key={j.id} className="align-top border-t border-l border-black/5 p-0">
                      {c ? <Cell c={c} onEditDay={onEditDay} /> : <div className="h-8" />}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ c, onEditDay }) {
  const { day, entry } = c;
  const tag = day?.stage_tag || "work";
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(day?.title || entry.notes || "");

  const save = () => {
    setEditing(false);
    if (day && text !== day.title) onEditDay(day.id, { title: text });
  };

  return (
    <div className="p-1 min-h-[2rem]" style={{ borderLeft: `3px solid var(--stage-${tag}, #15803d)` }}>
      {editing ? (
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && save()}
          className="w-full text-xs border border-plaza-gold rounded px-1 py-0.5" />
      ) : (
        <button onClick={() => setEditing(true)} className="text-left w-full">
          {day?.is_milestone_release_day && <span className="text-plaza-maroon font-bold">$ </span>}
          <span>{text || <span className="text-black/30">+ add</span>}</span>
          {day?.trades_on_site && <div className="text-[10px] text-black/50">{day.trades_on_site}</div>}
          {day?.day_type === "cure" && <div className="text-[10px] italic text-black/40">cure</div>}
        </button>
      )}
    </div>
  );
}
