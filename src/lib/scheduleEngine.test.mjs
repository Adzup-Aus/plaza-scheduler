import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSchedule, reconcileRegeneration, proposeReflow, STAGE_TAGS,
} from "./scheduleEngine.js";

// A representative full-scope bathroom job starting on a Monday.
const FULL = {
  electricalRoughIn: true,
  electricalFitOff: true,
  showerNiche: true,
  showerScreen: true,
  showerScreenType: "frameless",
  bathInWetArea: true,
  plastering: true,
  upperStorey: true,
  floorArea: 10,
  glassLeadWorkingDays: 7,
};
const START = "2026-07-13"; // Monday

function build(sig = FULL, opts = {}) {
  return buildSchedule(sig, { startDate: START, ...opts });
}

test("produces a bathroom schedule of a realistic length", () => {
  const { days } = build();
  assert.ok(days.length >= 10 && days.length <= 30, `got ${days.length} days`);
});

test("trade order follows the source-of-truth sequence", () => {
  const { days } = build();
  const order = days.filter((d) => d.dayType !== "cure").map((d) => d.stageTag);
  const firstIdx = (tag) => order.indexOf(tag);
  // stripout -> rough_in -> carpentry -> waterproofing -> tiling -> fixture_install -> final_check
  assert.ok(firstIdx("stripout") < firstIdx("rough_in"), "strip out before rough-in");
  assert.ok(firstIdx("rough_in") < firstIdx("carpentry"), "rough-in before carpentry (source-of-truth order)");
  assert.ok(firstIdx("carpentry") < firstIdx("waterproofing"), "carpentry before waterproofing");
  assert.ok(firstIdx("waterproofing") < firstIdx("tiling"), "waterproofing before tiling");
  assert.ok(firstIdx("tiling") < firstIdx("fixture_install"), "tiling before fit-off");
  assert.ok(firstIdx("fixture_install") < firstIdx("final_check"), "fit-off before final check");
});

test("inserts cure days after waterproofing and after tiling", () => {
  const { days } = build();
  const idxWaterproof = days.findIndex((d) => d.stageKey === "waterproofing");
  assert.equal(days[idxWaterproof + 1].dayType, "cure", "cure day immediately after waterproofing");

  const idxTiling = days.map((d) => d.stageKey).lastIndexOf("tiling");
  assert.equal(days[idxTiling + 1].dayType, "cure", "cure day immediately after tiling");

  // grout cure default is 2 days
  const groutCure = days.filter((d) => d.stageKey === "tiling_cure");
  assert.equal(groutCure.length, 2, "two grout cure days by default");
});

test("cure-day count is overridable", () => {
  const { days } = build(FULL, { cure: { waterproofing_membrane_days: 3, grout_days: 1 } });
  assert.equal(days.filter((d) => d.stageKey === "waterproofing_cure").length, 3);
  assert.equal(days.filter((d) => d.stageKey === "tiling_cure").length, 1);
});

test("electrical stages are conditional", () => {
  const withElec = build({ ...FULL, electricalFitOff: true });
  const noElec = build({ ...FULL, electricalFitOff: false });
  const fitWith = withElec.days.find((d) => d.stageKey === "fit_off");
  const fitNo = noElec.days.find((d) => d.stageKey === "fit_off");
  assert.ok(fitWith.tradesOnSite.includes("Electrician"));
  assert.ok(!fitNo.tradesOnSite.includes("Electrician"));
});

test("no WORK day ever lands on a weekend", () => {
  const { days } = build();
  for (const d of days) {
    if (d.dayType === "cure") continue;
    const g = new Date(d.scheduledDate + "T00:00:00Z").getUTCDay();
    assert.ok(g !== 0 && g !== 6, `${d.title} on ${d.scheduledDate} is a weekend`);
  }
});

test("dates are strictly non-decreasing across the plan", () => {
  const { days } = build();
  for (let i = 1; i < days.length; i++) {
    assert.ok(days[i].scheduledDate >= days[i - 1].scheduledDate,
      `date went backwards at ${i}: ${days[i - 1].scheduledDate} -> ${days[i].scheduledDate}`);
  }
});

test("blackout dates are skipped for work days", () => {
  // 2026-07-14 is the Tuesday after START; block it.
  const { days } = build(FULL, { blackout: ["2026-07-14"] });
  const hit = days.find((d) => d.dayType !== "cure" && d.scheduledDate === "2026-07-14");
  assert.equal(hit, undefined, "no work day on a blackout date");
});

test("milestones attach to the correct release day and report unmatched", () => {
  const milestones = [
    { id: "m1", name: "Deposit", sortOrder: 0, amount: 1000 },
    { id: "m2", name: "Stage 2 - Waterproofing", sortOrder: 1, amount: 2000 },
    { id: "m3", name: "Final completion", sortOrder: 2, amount: 3000 },
    { id: "m4", name: "Nonexistent stage", sortOrder: 3, amount: 500 },
  ];
  const { days, unmatchedMilestones } = build(FULL, { milestones });
  const wp = days.find((d) => d.quotePaymentScheduleId === "m2");
  assert.ok(wp, "waterproofing milestone attached");
  assert.equal(wp.stageTag, "waterproofing");
  assert.equal(wp.isMilestoneReleaseDay, true);
  assert.equal(unmatchedMilestones.length, 1, "one milestone unmatched");
  assert.equal(unmatchedMilestones[0].id, "m4");
});

test("explicit stageKey milestone mapping wins over name heuristic", () => {
  const { days } = build(FULL, { milestones: [{ id: "x", stageKey: "fit_off", name: "whatever", amount: 5 }] });
  const day = days.find((d) => d.quotePaymentScheduleId === "x");
  assert.equal(day.stageKey, "fit_off");
});

test("regeneration preserves submitted and manually edited days", () => {
  const first = build().days;
  // Simulate DB rows: mark the rough_in day submitted and give it changed content.
  const existing = first.map((d) => ({ ...d }));
  const submittedIdx = existing.findIndex((d) => d.stageKey === "rough_in");
  existing[submittedIdx].submittedAt = "2026-07-15T02:00:00Z";
  existing[submittedIdx].title = "Rough-in (field edited)";

  const fresh = build().days; // regenerate
  const { merged, lockedCount } = reconcileRegeneration(fresh, existing);
  assert.equal(lockedCount, 1);
  const keptDay = merged.find((d) => d.sortOrder === existing[submittedIdx].sortOrder);
  assert.equal(keptDay.title, "Rough-in (field edited)", "submitted day carried through unchanged");
  assert.equal(keptDay._locked, true);
});

test("reflow proposes shifting later days and keeps earlier ones", () => {
  const { days } = build();
  // Slip the tiling day by pushing it a week later.
  const tiling = days.find((d) => d.stageKey === "tiling");
  const newDate = "2026-08-03"; // a Monday well after original
  const { proposal, deltaCalendarDays } = proposeReflow(days, { sortOrder: tiling.sortOrder, newDate });
  assert.ok(deltaCalendarDays > 0);
  // Every proposed date is >= the slipped day; earlier days are untouched (not in proposal).
  assert.ok(proposal.every((p) => p.sortOrder >= tiling.sortOrder), "only later days move");
  // Work days in the proposal never land on a weekend.
  for (const p of proposal) {
    if (p.dayType === "cure") continue;
    const g = new Date(p.to + "T00:00:00Z").getUTCDay();
    assert.ok(g !== 0 && g !== 6, `reflowed work day ${p.to} is a weekend`);
  }
  // Proposal is chronologically ordered.
  for (let i = 1; i < proposal.length; i++) {
    assert.ok(proposal[i].to >= proposal[i - 1].to, "reflow keeps chronological order");
  }
});

test("fixed-panel screen skips the measure-up + lead time", () => {
  const { days } = build({ ...FULL, showerScreenType: "fixed_panel" });
  assert.equal(days.find((d) => d.stageKey === "glass_measure"), undefined);
  assert.ok(days.find((d) => d.stageKey === "glass_install"));
});

test("all emitted stage tags are in the known vocabulary", () => {
  const { days } = build();
  for (const d of days) assert.ok(STAGE_TAGS.includes(d.stageTag), `unknown tag ${d.stageTag}`);
});
