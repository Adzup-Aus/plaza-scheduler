// Plaza Works Scheduler — deterministic schedule engine.
//
// The single most valuable piece of code in this app (per 03-work-schedule.md).
// It encodes the trade ORDER and the CURE gaps from the framework files as
// executable logic, so neither is ever left to the model to guess:
//
//   Framework/Tradie_Briefs/Trade_Sequence_and_Logic.md   (trade order — source of truth)
//   Framework/Job_Delivery/schedule-generation-rules.md   (bathroom day plan, cure/wait)
//
// The AI's only job is to read the accepted quote scope and return the structured
// `signals` object (what is in scope) plus optional friendly titles. It may NOT
// reorder trades, drop a cure gap, or change a day_type. Those come from here.
//
// Pure ESM, no I/O, no dates-from-clock surprises: `startDate` is always passed in.
// Usable unchanged by the browser (preview) and by the Netlify generate function.

// Stage tags match Bathroom_Reno_Master.md / the assimilation note in 03-work-schedule.md.
export const STAGE_TAGS = [
  "pre_work", "stripout", "rough_in", "carpentry", "waterproofing",
  "tile_prep", "tiling", "painting", "fixture_install", "glass",
  "clean", "final_check", "cure",
];

// Default cure gaps in CALENDAR days. The framework says cure is the tradie's call;
// these are the scheduling defaults the "Perfected" definition names, always inserted,
// always flagged as tradie-confirmable so a human can shrink/grow them.
export const DEFAULT_CURE = {
  waterproofing_membrane_days: 1, // ~24h before tiling
  grout_days: 2,                  // ~48h grout cure before water/sealing sign-off
};

// ---------------------------------------------------------------------------
// The bathroom renovation trade sequence.
// Order follows Trade_Sequence_and_Logic.md (the designated source of truth for
// order): Demo -> rough-ins (walls open) -> Timber -> Sheeting -> Waterproofing
// -> Tiling -> Painting (flexible) -> Fit-offs (concurrent) -> Glass -> Clean ->
// Final verification.
//
// NOTE (flagged conflict): schedule-generation-rules.md lists carpentry/structural
// BEFORE plumbing rough-in, whereas Trade_Sequence_and_Logic.md puts both rough-ins
// before Timber. This engine follows Trade_Sequence_and_Logic.md because that file is
// explicitly the source of truth for trade order. `ORDER_SOURCE_CONFLICT` records it
// so the app can surface it and a human can confirm.
// ---------------------------------------------------------------------------
export const ORDER_SOURCE_CONFLICT = {
  field: "carpentry_vs_roughin_order",
  chosen: "rough-ins before Timber (Trade_Sequence_and_Logic.md)",
  alternative: "carpentry/structural before rough-in (schedule-generation-rules.md)",
  note: "Two framework files disagree. Engine follows the trade-order source of truth; confirm with Cliff.",
};

// Each stage: how many working days it takes, its trades, tag, day_type, the cure
// gap to insert AFTER it, the photos required that day, and the `include` predicate
// against the scope signals. `workDays` can be a function of signals.
function bathroomStages(signals) {
  const s = signals || {};
  const stages = [];

  // 0. Pre-work — PC approvals, ordering, delivery, tradesman site visit.
  stages.push({
    key: "pre_work", tag: "pre_work", dayType: "pre-work",
    title: "Pre-work: confirm PC items, order materials, tradesman site visit",
    trades: "Office / PM", workDays: 1, cureAfterDays: 0,
    photos: [],
    checklist: [
      { text: "Tradesman site visit completed — measurements locked in, sign-off obtained, photos uploaded", blocking: true },
      { text: "PC items confirmed and ordered; tiles due before tiling day", blocking: false },
      { text: "Skip bin booked for demolition waste", blocking: false },
    ],
    include: true,
  });

  // 1. Demolition + strip out.
  stages.push({
    key: "stripout", tag: "stripout", dayType: "work",
    title: "Demolition & strip out",
    trades: "Demolition", workDays: 1, cureAfterDays: 0,
    photos: ["Existing conditions before strip out", "Stripped-back bathroom (walls/floor exposed)"],
    checklist: [
      { text: "Door leaf removed, labelled and stored on site for the carpenter", blocking: false },
      { text: "Door and window architraves left in place (carpenter removes them)", blocking: false },
      { text: "Adjacent rooms protected from dust", blocking: false },
    ],
    include: true,
  });

  // 2. Rough-ins (walls open) — plumbing always, electrical conditional.
  stages.push({
    key: "rough_in", tag: "rough_in", dayType: "work",
    title: s.electricalRoughIn
      ? "Rough-in: plumbing + electrical (walls open)"
      : "Rough-in: plumbing (walls open)",
    trades: s.electricalRoughIn ? "Plumber; Electrician" : "Plumber",
    workDays: 1, cureAfterDays: 0,
    photos: [
      "Water & drainage rough-in in place",
      "Puddle flanges fitted at every drainage point",
      "Tapware backing/noggins photographed before sheeting",
      "Pressure test result",
    ],
    checklist: [
      { text: "Puddle flanges fitted at every drainage point (waterproofing cannot start without them)", blocking: true },
      { text: "Tapware backing/noggins fixed and photographed", blocking: true },
      { text: "All water lines pressure tested and result recorded", blocking: true },
      { text: "Rough-in positions marked on studs for the carpenter", blocking: false },
      ...(s.electricalRoughIn
        ? [{ text: "Electrical rough-in: new points/cable runs assessed against layout", blocking: false }]
        : []),
      ...(s.drainageNotifiable
        ? [{ text: "As-constructed data captured before backfill (sizes, depths, tie-in, flow) + open-trench photo", blocking: true }]
        : []),
    ],
    include: true,
  });

  // 3. Carpentry — Timber (framing, hobs, niche insert, noggins).
  stages.push({
    key: "carpentry_timber", tag: "carpentry", dayType: "work",
    title: "Carpentry — timber: framing, hobs, noggins" + (s.showerNiche ? ", niche insert" : ""),
    trades: "Carpenter", workDays: 1, cureAfterDays: 0,
    photos: [
      "All noggins in place before sheeting (vanity, accessories)",
      ...(s.showerNiche ? ["Shower niche insert installed before sheeting"] : []),
    ],
    checklist: [
      { text: "Vanity/accessory noggins fixed at correct heights and photographed before sheeting", blocking: true },
      { text: "Door architrave removed; window architrave removed only if in scope", blocking: false },
      ...(s.showerNiche ? [{ text: "Preformed shower niche insert installed before sheeting", blocking: false }] : []),
      { text: "All framing plumb, straight and square; hob heights confirmed against setout", blocking: false },
    ],
    include: true,
  });

  // 4. Carpentry — Sheeting (wet-area board, tape/seal, prime, pencil line).
  stages.push({
    key: "carpentry_sheeting", tag: "carpentry", dayType: "work",
    title: "Carpentry — sheeting: wet-area board, tape & seal, prime",
    trades: "Carpenter", workDays: 1, cureAfterDays: 0,
    photos: ["Every joint photographed before setting (sheet-to-sheet, sheet-to-wall, corners)"],
    checklist: [
      { text: "Wet-area rated board on all wet-zone walls (never standard plasterboard)", blocking: true },
      { text: "Joints photographed and Back Office go-ahead received before setting", blocking: true },
      { text: "Sheeting primed per the membrane manufacturer's data sheet", blocking: false },
      { text: "Pencil line marked where architraves return, so the tiler knows where to stop tiles", blocking: false },
    ],
    include: true,
  });

  // 5. Waterproofing — membrane + waterstops. Cure gap after.
  stages.push({
    key: "waterproofing", tag: "waterproofing", dayType: "work",
    title: s.upperStorey
      ? "Waterproofing — membrane (upper-storey: before & after bedding)"
      : "Waterproofing — membrane & waterstops",
    trades: "Waterproofer", workDays: 1,
    cureAfterDays: DEFAULT_CURE.waterproofing_membrane_days,
    cureLabel: "Waterproofing membrane cure (tradie confirms per data sheet)",
    photos: ["Finished membrane photographed before tiling covers it", "Waterstops installed per AS 3740:2021"],
    checklist: [
      { text: "Puddle flanges present — if missing, stop and call Back Office", blocking: true },
      { text: "Membrane to min 1800mm on shower walls (or 50mm above rose, whichever higher)", blocking: false },
      { text: "Membrane photos sent to Back Office before tiling", blocking: true },
      { text: "No foot traffic during membrane cure", blocking: true },
      ...(s.upperStorey ? [{ text: "Upper storey: membrane applied both before and after bedding", blocking: true }] : []),
    ],
    include: true,
  });

  // 6. Tiling — bedding, floor/wall tiling, grout, drains, sealing. Grout cure after.
  stages.push({
    key: "tiling", tag: "tiling", dayType: "work",
    title: "Tiling — bedding, floor & wall tiling, grout, drains & sealing",
    trades: "Tiler", workDays: (s.floorArea && s.floorArea > 8) ? 2 : 1,
    cureAfterDays: DEFAULT_CURE.grout_days,
    cureLabel: "Grout/sealant cure (tradie confirms; all sealing cured before water is run)",
    photos: [
      "Digital level on each fall line with reading visible (falls evidence)",
      "Floor waste & linear drain set flush and water-tested",
    ],
    checklist: [
      { text: "Falls photographed with digital level before tiling (min 1:80 wet area, 1:100 to waste)", blocking: true },
      { text: "Floor waste & linear drain set and levelled flush; water-tested", blocking: true },
      { text: "Tiled up to the carpenter's pencil line; architrave space left clear", blocking: false },
      { text: "All wet-area junctions sealed (neutral-cure); ceiling line & architrave edges sealed paintable", blocking: false },
    ],
    include: true,
  });

  // 7. Plastering + Painting (flexible; placed after tiling to fill the cure gap window).
  stages.push({
    key: "painting", tag: "painting", dayType: "work",
    title: s.plastering ? "Plastering then painting (2 coats min)" : "Painting (2 coats min)",
    trades: s.plastering ? "Plasterer; Painter" : "Painter", workDays: 1, cureAfterDays: 0,
    photos: [],
    checklist: [
      ...(s.plastering ? [{ text: "Plaster fully dry before painting", blocking: true }] : []),
      { text: "Paint colour confirmed with Back Office before purchase", blocking: false },
      { text: "Painted straight over paintable sealant at ceiling line and architrave edges", blocking: false },
    ],
    include: true,
  });

  // 8. Fit-off — plumbing + carpentry (+ electrical) concurrent, one day.
  stages.push({
    key: "fit_off", tag: "fixture_install", dayType: "work",
    title: s.electricalFitOff
      ? "Fit-off: plumbing + carpentry + electrical (concurrent)"
      : "Fit-off: plumbing + carpentry (concurrent)",
    trades: s.electricalFitOff ? "Plumber; Carpenter; Electrician" : "Plumber; Carpenter",
    workDays: 1, cureAfterDays: 0,
    photos: ["Vanity/fixtures mounted", "Leak test results"],
    checklist: [
      { text: "Both fit-off trades review rough-in photos before drilling", blocking: true },
      { text: "Plumber: vanity mounted; every flexi hose has an isolating + flood-stop valve; overflows work; leak-tested", blocking: true },
      { text: "Carpenter: mirror/accessories mounted; door trimmed & rehung; architraves refitted", blocking: false },
      ...(s.electricalFitOff ? [{ text: "Electrical: fittings/fan installed; exhaust ducted to exterior; circuits tested & tagged; certificate emailed", blocking: true }] : []),
    ],
    include: true,
  });

  // 9. Shower glass — measure-up after tiling, install on a return visit (5–10 wd later).
  if (s.showerScreen && s.showerScreenType !== "fixed_panel") {
    stages.push({
      key: "glass_measure", tag: "glass", dayType: "work",
      title: "Shower screen measure-up (after tiling)",
      trades: "Glass installer", workDays: 1,
      cureAfterDays: s.glassLeadWorkingDays || 7, // 5–10 working days to fabricate
      cureLabel: "Glass fabrication lead time (return to install)",
      photos: [],
      checklist: [{ text: "Screen measured on site after floor & wall tiling complete", blocking: false }],
      include: true,
    });
    stages.push({
      key: "glass_install", tag: "glass", dayType: "work",
      title: "Shower screen install" + (s.bathInWetArea ? " (after bath is in)" : ""),
      trades: "Glass installer", workDays: 1, cureAfterDays: 0,
      photos: ["Screen installed; Grade A safety markings visible"],
      checklist: [{ text: "Grade A safety glass with visible safety markings", blocking: false }],
      include: true,
    });
  } else if (s.showerScreen) {
    stages.push({
      key: "glass_install", tag: "glass", dayType: "work",
      title: "Fixed-panel shower screen install",
      trades: "Glass installer", workDays: 1, cureAfterDays: 0,
      photos: ["Fixed panel installed"],
      checklist: [{ text: "Fixed panel ordered from floor plan; no measure-up needed", blocking: false }],
      include: true,
    });
  }

  // 10. Final clean.
  stages.push({
    key: "final_clean", tag: "clean", dayType: "work",
    title: "Final clean (all surfaces, tapware, glass, drains)",
    trades: "Cleaner", workDays: 1, cureAfterDays: 0,
    photos: ["Completed clean bathroom"],
    checklist: [{ text: "Every surface cleaned; tapware/grates polished; no grout haze or residue", blocking: false }],
    include: true,
  });

  // 11. Final verification / handover (plumber PM).
  stages.push({
    key: "final_check", tag: "final_check", dayType: "work",
    title: "Final verification & handover prep",
    trades: "Plumber (PM)", workDays: 1, cureAfterDays: 0,
    photos: ["Final before/after set"],
    checklist: [
      { text: "Warranty & QBCC compliance documentation filed", blocking: false },
      ...(s.drainageNotifiable ? [{ text: "Form 4 registered + as-constructed drainage diagram lodged", blocking: true }] : []),
      { text: "All sealing cured before water is run", blocking: true },
    ],
    include: true,
  });

  return stages.filter((st) => st.include !== false);
}

// ---------------------------------------------------------------------------
// Date helpers. Weekend = Sat(6)/Sun(0). blackout = array of "YYYY-MM-DD".
// All dates handled as UTC to avoid timezone drift; we only care about the day.
// ---------------------------------------------------------------------------
function toDate(d) {
  if (d instanceof Date) return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const [y, m, day] = String(d).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
function iso(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
function isWeekend(d) { const g = d.getUTCDay(); return g === 0 || g === 6; }
function nextWorkingDay(d, blackout) {
  let x = new Date(d);
  const bo = new Set(blackout || []);
  while (isWeekend(x) || bo.has(iso(x))) x = addDays(x, 1);
  return x;
}

// ---------------------------------------------------------------------------
// buildSchedule(signals, options) -> { days, unmatchedMilestones, orderConflict }
//
// signals: structured scope flags (from the AI or a test). See bathroomStages().
// options:
//   startDate        "YYYY-MM-DD" (required)
//   jobType          "renovation" (default) — only bathroom is fully modelled here
//   milestones       [{ id, name, sortOrder, amount, stageKey?, stageTag? }] optional
//   blackout         ["YYYY-MM-DD", ...] optional non-working days
//   cure             { waterproofing_membrane_days, grout_days } optional overrides
// ---------------------------------------------------------------------------
export function buildSchedule(signals, options = {}) {
  const opts = options || {};
  if (!opts.startDate) throw new Error("buildSchedule needs options.startDate (YYYY-MM-DD)");
  const cure = { ...DEFAULT_CURE, ...(opts.cure || {}) };
  const sig = { ...(signals || {}) };

  // Apply cure overrides into the stage list by tweaking DEFAULT_CURE-derived values.
  const stages = bathroomStages(sig).map((st) => {
    if (st.key === "waterproofing") return { ...st, cureAfterDays: cure.waterproofing_membrane_days };
    if (st.key === "tiling") return { ...st, cureAfterDays: cure.grout_days };
    return st;
  });

  const blackout = opts.blackout || [];
  const days = [];
  let cursor = nextWorkingDay(toDate(opts.startDate), blackout);
  let sortOrder = 0;
  let dayNumber = 0;

  for (const st of stages) {
    const n = typeof st.workDays === "function" ? st.workDays(sig) : (st.workDays || 1);
    for (let i = 0; i < n; i++) {
      cursor = nextWorkingDay(cursor, blackout);
      dayNumber += 1;
      days.push({
        stageKey: st.key,
        dayNumber,
        sortOrder: sortOrder++,
        dayType: st.dayType,
        stageTag: st.tag,
        title: n > 1 ? `${st.title} (day ${i + 1} of ${n})` : st.title,
        tradesOnSite: st.trades,
        sectionHeading: st.title,
        scheduledDate: iso(cursor),
        photoRequirements: (st.photos || []).map((p, idx) => ({ description: p, sortOrder: idx, isRequired: true })),
        checklistItems: (st.checklist || []).map((c, idx) => ({
          text: c.text, isBlocking: !!c.blocking, sortOrder: idx,
          visibility: "internal", aiGenerated: false,
        })),
      });
      cursor = addDays(cursor, 1);
    }

    // Insert cure day rows on consecutive CALENDAR days after the stage's last work day.
    const cureN = st.cureAfterDays || 0;
    for (let c = 0; c < cureN; c++) {
      dayNumber += 1;
      days.push({
        stageKey: `${st.key}_cure`,
        dayNumber,
        sortOrder: sortOrder++,
        dayType: "cure",
        stageTag: "cure",
        title: st.cureLabel || "Cure / wait period",
        tradesOnSite: "",
        sectionHeading: st.cureLabel || "Cure / wait period",
        scheduledDate: iso(cursor),
        isCure: true,
        photoRequirements: [],
        checklistItems: [{ text: "No site work during this cure period", isBlocking: false, sortOrder: 0, visibility: "internal", aiGenerated: false }],
      });
      cursor = addDays(cursor, 1);
    }
    // Work resumes on the next working day after any cure.
    cursor = nextWorkingDay(cursor, blackout);
  }

  // Link payment milestones to their release day.
  const unmatchedMilestones = attachMilestones(days, opts.milestones || []);

  return { days, unmatchedMilestones, orderConflict: ORDER_SOURCE_CONFLICT };
}

// Attach each milestone to the LAST work day of its stage. Matching order:
// explicit stageKey, then stageTag, then a name->tag heuristic. Unmatched are returned.
function attachMilestones(days, milestones) {
  const unmatched = [];
  const workDays = days.filter((d) => d.dayType !== "cure");
  const lastOfStage = (pred) => {
    let found = null;
    for (const d of workDays) if (pred(d)) found = d;
    return found;
  };
  for (const m of milestones) {
    let target = null;
    if (m.stageKey) target = lastOfStage((d) => d.stageKey === m.stageKey);
    if (!target && m.stageTag) target = lastOfStage((d) => d.stageTag === m.stageTag);
    if (!target && m.name) {
      const tag = milestoneNameToTag(m.name);
      if (tag) target = lastOfStage((d) => d.stageTag === tag);
    }
    if (!target) { unmatched.push(m); continue; }
    target.quotePaymentScheduleId = m.id || null;
    target.milestoneName = m.name || null;
    target.milestoneAmount = m.amount != null ? m.amount : null;
    target.milestoneSortOrder = m.sortOrder != null ? m.sortOrder : null;
    target.isMilestoneReleaseDay = true;
  }
  return unmatched;
}

function milestoneNameToTag(name) {
  const n = String(name).toLowerCase();
  if (n.includes("deposit")) return "pre_work";
  if (n.includes("demo") || n.includes("strip")) return "stripout";
  if (n.includes("rough")) return "rough_in";
  if (n.includes("waterproof")) return "waterproofing";
  if (n.includes("tile") || n.includes("tiling")) return "tiling";
  if (n.includes("fit") || n.includes("fixture")) return "fixture_install";
  if (n.includes("final") || n.includes("complet") || n.includes("practical") || n.includes("handover") || n.includes("hand over")) return "final_check";
  return null;
}

// ---------------------------------------------------------------------------
// Regeneration that preserves human work: any existing day with submittedAt set
// (field staff already submitted it) is LOCKED and carried through unchanged;
// the freshly generated plan fills only the unlocked positions. Also never
// overwrites a day a human has manually edited (manualEdit flag).
// existing: array of day rows already in the DB (camelCase).
// ---------------------------------------------------------------------------
export function reconcileRegeneration(freshDays, existing) {
  const locked = (existing || []).filter((d) => d.submittedAt || d.manualEdit);
  const lockedBySort = new Map(locked.map((d) => [d.sortOrder, d]));
  const warnings = [];
  const merged = freshDays.map((fresh) => {
    const keep = lockedBySort.get(fresh.sortOrder);
    if (keep) {
      if (keep.stageKey && fresh.stageKey && keep.stageKey !== fresh.stageKey) {
        warnings.push({ sortOrder: fresh.sortOrder, kept: keep.stageKey, wouldBe: fresh.stageKey });
      }
      return { ...keep, _locked: true };
    }
    return fresh;
  });
  return { merged, warnings, lockedCount: locked.length };
}

// ---------------------------------------------------------------------------
// Reflow-on-approval: a day slipped to a new date. Propose shifting every LATER
// day by the same number of working days, KEEPING cure gaps intact (cure rows
// move with the stage they follow). Returns a proposal; nothing is written until
// a human accepts. Never silently cascades.
// days: current day rows sorted by sortOrder (camelCase, with scheduledDate).
// slip: { sortOrder, newDate } the edited day and its new date.
// ---------------------------------------------------------------------------
export function proposeReflow(days, slip, blackout = []) {
  const sorted = [...days].sort((a, b) => a.sortOrder - b.sortOrder);
  const idx = sorted.findIndex((d) => d.sortOrder === slip.sortOrder);
  if (idx === -1) throw new Error("proposeReflow: slipped day not found");

  const oldDate = toDate(sorted[idx].scheduledDate);
  const newDate = nextWorkingDay(toDate(slip.newDate), blackout);
  const deltaCalendarDays = Math.round((newDate - oldDate) / 86400000);
  if (deltaCalendarDays === 0) return { proposal: [], deltaCalendarDays: 0 };

  const proposal = [];
  // Shift the slipped day and everything after it by the same calendar delta, then
  // renormalise each WORK day onto a working day (cure days may sit on any calendar day).
  let prevNewDate = null;
  for (let i = idx; i < sorted.length; i++) {
    const d = sorted[i];
    let shifted = addDays(toDate(d.scheduledDate), deltaCalendarDays);
    if (d.dayType !== "cure") shifted = nextWorkingDay(shifted, blackout);
    // Keep chronological order (a cure day must not overtake the next work day).
    if (prevNewDate && shifted < prevNewDate) shifted = new Date(prevNewDate);
    proposal.push({ sortOrder: d.sortOrder, from: d.scheduledDate, to: iso(shifted), dayType: d.dayType });
    prevNewDate = shifted;
  }
  return { proposal, deltaCalendarDays };
}
