import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";

// Continuous-scroll timeline with smooth zoom (03-work-schedule.md interaction model):
//   shift-scroll pans left/right, ctrl-scroll zooms in/out centred on the cursor.
// One lane per job; day blocks positioned by calendar date, coloured by stage tag.
const DAY_MS = 86400000;
const toUTC = (s) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);

export default function TimelineView({ jobs, entries, days, onSlip }) {
  const wrapRef = useRef(null);
  const [pxPerDay, setPxPerDay] = useState(46);
  const [originMs, setOriginMs] = useState(null);

  // Map entry -> its day (via "[wd:N]" in notes -> day.sort_order).
  const dayBySort = useMemo(() => {
    const m = new Map();
    for (const d of days) m.set(`${d.job_id}:${d.sort_order}`, d);
    return m;
  }, [days]);

  const bounds = useMemo(() => {
    const ds = entries.map((e) => toUTC(e.scheduled_date)).filter(Boolean);
    if (!ds.length) { const now = Date.UTC(2026, 6, 13); return { min: now, max: now + 21 * DAY_MS }; }
    return { min: Math.min(...ds) - 2 * DAY_MS, max: Math.max(...ds) + 4 * DAY_MS };
  }, [entries]);

  useEffect(() => { if (originMs == null) setOriginMs(bounds.min); }, [bounds, originMs]);

  const totalDays = Math.round((bounds.max - bounds.min) / DAY_MS) + 1;

  const onWheel = useCallback((e) => {
    if (!e.ctrlKey && !e.shiftKey) return; // plain scroll left to the page
    e.preventDefault();
    if (e.ctrlKey) {
      const rect = wrapRef.current.getBoundingClientRect();
      const cursorX = e.clientX - rect.left + wrapRef.current.scrollLeft - LANE_W;
      const cursorDay = cursorX / pxPerDay; // day index under cursor
      const next = Math.min(140, Math.max(12, pxPerDay * (e.deltaY < 0 ? 1.12 : 0.89)));
      setPxPerDay(next);
      // keep the cursor day under the cursor after zoom
      requestAnimationFrame(() => {
        if (wrapRef.current) wrapRef.current.scrollLeft = cursorDay * next - (e.clientX - rect.left - LANE_W);
      });
    } else if (e.shiftKey) {
      wrapRef.current.scrollLeft += e.deltaY;
    }
  }, [pxPerDay]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const LANE_W = 170;
  const width = totalDays * pxPerDay;

  const dayIndex = (dateStr) => Math.round((toUTC(dateStr) - bounds.min) / DAY_MS);

  // Axis ticks (every day when zoomed in, else weekly).
  const step = pxPerDay >= 34 ? 1 : 7;
  const ticks = [];
  for (let i = 0; i < totalDays; i += step) ticks.push(i);

  return (
    <div className="border border-black/10 rounded-lg bg-white overflow-hidden">
      <div className="px-3 py-2 text-xs text-plaza-bluish bg-plaza-paper border-b border-black/10">
        Shift-scroll to pan · Ctrl-scroll to zoom · click a block to slip its date
      </div>
      <div ref={wrapRef} className="overflow-x-auto no-select" style={{ maxHeight: "70vh" }}>
        <div style={{ width: width + LANE_W }}>
          {/* axis */}
          <div className="flex sticky top-0 z-10 bg-white border-b border-black/10">
            <div style={{ width: LANE_W }} className="shrink-0 px-2 py-1 text-xs font-semibold text-plaza-bluish border-r border-black/10">Job</div>
            <div className="relative" style={{ width }}>
              {ticks.map((i) => (
                <div key={i} className="absolute top-0 text-[10px] text-black/50 border-l border-black/5 pl-1 py-1"
                     style={{ left: i * pxPerDay, height: "100%" }}>
                  {fromUTC(bounds.min + i * DAY_MS).slice(5)}
                </div>
              ))}
            </div>
          </div>
          {/* lanes */}
          {jobs.map((job) => {
            const jobEntries = entries.filter((e) => e.job_id === job.id);
            return (
              <div key={job.id} className="flex border-b border-black/5 items-stretch" style={{ minHeight: 44 }}>
                <div style={{ width: LANE_W }} className="shrink-0 px-2 py-2 text-xs border-r border-black/10 bg-plaza-paper/60">
                  <div className="font-semibold truncate">{job.client_name || job.job_name || job.id.slice(0, 6)}</div>
                  <div className="text-black/50 truncate">{job.suburb || ""}</div>
                </div>
                <div className="relative" style={{ width }}>
                  {jobEntries.map((e) => {
                    const m = (e.notes || "").match(/\[wd:(\d+)\]/);
                    const day = m ? dayBySort.get(`${job.id}:${Number(m[1])}`) : null;
                    const tag = day?.stage_tag || "work";
                    const left = dayIndex(e.scheduled_date) * pxPerDay;
                    const isMilestone = day?.is_milestone_release_day;
                    return (
                      <button key={e.id} title={day?.title || e.notes || ""}
                        onClick={() => onSlip && onSlip(job, e, day)}
                        className="absolute top-1 bottom-1 rounded text-[10px] text-white px-1 overflow-hidden text-left"
                        style={{ left: left + 1, width: Math.max(pxPerDay - 3, 16), backgroundColor: `var(--stage-${tag}, #15803d)` }}>
                        <span className="opacity-90">{isMilestone ? "$ " : ""}{(day?.title || e.notes || "").slice(0, 18)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!jobs.length && <div className="p-6 text-sm text-black/50">No active jobs on the board yet.</div>}
        </div>
      </div>
    </div>
  );
}
