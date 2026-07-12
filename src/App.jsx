import React, { useEffect, useState, useCallback } from "react";
import { api, hasToken, subscribeErrors, getErrors, clearErrors, subscribeCost, getCost } from "./lib/api.js";
import GridView from "./components/GridView.jsx";
import TimelineView from "./components/TimelineView.jsx";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function App() {
  const [authed, setAuthed] = useState(hasToken());
  if (!authed) return <Gate onIn={() => setAuthed(true)} />;
  return <Board />;
}

function Gate({ onIn }) {
  const [step, setStep] = useState("email"); // email | code
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const sendCode = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await api.requestCode(email);
      setChallenge(r.challenge);
      setStep("code");
    } catch (e2) {
      setErr(e2?.data?.message || "Could not send a code to that email.");
    } finally { setBusy(false); }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await api.verifyCode(email, code.trim(), challenge);
      onIn();
    } catch (e2) {
      setErr(e2?.data?.message || "That code is wrong or has expired.");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-full grid place-items-center p-6">
      {step === "email" ? (
        <form onSubmit={sendCode} className="bg-white rounded-xl shadow-sm border border-black/10 p-6 w-full max-w-sm">
          <h1 className="font-head text-xl text-plaza-bluish mb-1">Plaza Works Scheduler</h1>
          <p className="text-sm text-black/60 mb-4">Enter your work email and we'll send you a login code.</p>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-black/15 rounded px-3 py-2 mb-3" placeholder="you@plazaworks.com.au" autoFocus />
          {err && <p className="text-sm text-plaza-maroon mb-3">{err}</p>}
          <button disabled={busy || !email} className="w-full bg-plaza-bluish text-white rounded py-2 font-semibold disabled:opacity-50">
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="bg-white rounded-xl shadow-sm border border-black/10 p-6 w-full max-w-sm">
          <h1 className="font-head text-xl text-plaza-bluish mb-1">Enter your code</h1>
          <p className="text-sm text-black/60 mb-4">We sent a 6-digit code to <b>{email}</b>. It expires in 10 minutes.</p>
          <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)}
            className="w-full border border-black/15 rounded px-3 py-2 mb-3 tracking-widest text-center text-lg" placeholder="000000" autoFocus />
          {err && <p className="text-sm text-plaza-maroon mb-3">{err}</p>}
          <button disabled={busy || code.trim().length < 4} className="w-full bg-plaza-bluish text-white rounded py-2 font-semibold disabled:opacity-50">
            {busy ? "Checking…" : "Verify & enter"}
          </button>
          <button type="button" onClick={() => { setStep("email"); setErr(""); setCode(""); }}
            className="w-full text-xs text-black/50 mt-3 hover:underline">Use a different email</button>
        </form>
      )}
    </div>
  );
}

function Board() {
  const [view, setView] = useState("grid");
  const [data, setData] = useState({ jobs: [], days: [], entries: [], schedules: [] });
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState(getErrors());
  const [cost, setCost] = useState(getCost());
  const [gen, setGen] = useState(null); // job being generated
  const [reflow, setReflow] = useState(null); // { job, entry, day, proposal, delta }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = todayISO();
      const to = new Date(Date.now() + 70 * 86400000).toISOString().slice(0, 10);
      const d = await api.board(from, to);
      setData(d);
    } catch { /* captured in error log */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribeErrors(setErrors), []);
  useEffect(() => subscribeCost(setCost), []);

  const editDay = async (dayId, patch) => { try { await api.patchDay(dayId, patch); await load(); } catch {} };

  const startReflow = async (job, entry, day) => {
    const sortMatch = (entry.notes || "").match(/\[wd:(\d+)\]/);
    const sortOrder = sortMatch ? Number(sortMatch[1]) : null;
    if (sortOrder == null) return;
    const newDate = window.prompt(`Slip "${day?.title || entry.notes}" to which date? (YYYY-MM-DD)`, entry.scheduled_date);
    if (!newDate) return;
    try {
      const r = await api.reflowPropose(job.id, { sortOrder, newDate });
      setReflow({ job, proposal: r.proposal, delta: r.deltaCalendarDays });
    } catch {}
  };
  const applyReflow = async () => {
    try { await api.reflowApply(reflow.job.id, reflow.proposal); setReflow(null); await load(); } catch {}
  };

  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-plaza-bluish text-white px-4 py-3 flex items-center gap-4">
        <h1 className="font-head text-lg">Plaza Works — Scheduler</h1>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <ViewToggle view={view} setView={setView} />
          <button onClick={load} className="px-3 py-1 rounded bg-white/15 hover:bg-white/25">Refresh</button>
        </div>
      </header>

      <div className="px-4 py-2 flex flex-wrap items-center gap-2 text-sm border-b border-black/10 bg-white">
        <span className="text-black/60">Generate a schedule:</span>
        {data.jobs.map((j) => (
          <button key={j.id} onClick={() => setGen(j)}
            className="px-2 py-1 rounded border border-plaza-bluish/30 text-plaza-bluish hover:bg-plaza-paper">
            {j.client_name || j.job_name || j.id.slice(0, 6)}
          </button>
        ))}
        {!data.jobs.length && !loading && <span className="text-black/40">No active jobs found in the store.</span>}
      </div>

      <main className="p-4 flex-1">
        {loading ? <div className="text-black/50 text-sm">Loading the board…</div> :
          view === "grid"
            ? <GridView jobs={data.jobs} entries={data.entries} days={data.days} onEditDay={editDay} />
            : <TimelineView jobs={data.jobs} entries={data.entries} days={data.days} onSlip={startReflow} />
        }
      </main>

      <StatusBar cost={cost} errors={errors} />

      {gen && <GenerateModal job={gen} onClose={() => setGen(null)} onDone={async () => { setGen(null); await load(); }} />}
      {reflow && <ReflowModal reflow={reflow} onApply={applyReflow} onClose={() => setReflow(null)} />}
    </div>
  );
}

function ViewToggle({ view, setView }) {
  return (
    <div className="inline-flex rounded overflow-hidden border border-white/25">
      {["grid", "timeline"].map((v) => (
        <button key={v} onClick={() => setView(v)}
          className={`px-3 py-1 capitalize ${view === v ? "bg-white text-plaza-bluish" : "bg-transparent"}`}>{v}</button>
      ))}
    </div>
  );
}

function GenerateModal({ job, onClose, onDone }) {
  const [startDate, setStartDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirm, setConfirm] = useState(false);
  const run = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await api.generate({ jobId: job.id, startDate, confirm });
      if (r.needsConfirm) { setMsg(r.message); setConfirm(true); setBusy(false); return; }
      const notes = [];
      if (r.unmatchedMilestones?.length) notes.push(`${r.unmatchedMilestones.length} milestone(s) not auto-linked.`);
      if (r.orderConflict) notes.push(`Order note: ${r.orderConflict.chosen}.`);
      setMsg(`Generated ${r.daysInserted} days${r.lockedDays ? `, kept ${r.lockedDays} submitted` : ""}. ${notes.join(" ")}`);
      setTimeout(onDone, 1200);
    } catch (e) { setMsg(`Failed: ${e.message}`); }
    finally { setBusy(false); }
  };
  return (
    <Modal onClose={onClose} title={`Generate schedule — ${job.client_name || job.job_name || ""}`}>
      <label className="block text-sm mb-2">Start date
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
          className="block mt-1 border border-black/15 rounded px-2 py-1" />
      </label>
      <p className="text-xs text-black/50 mb-3">AI reads the accepted quote scope; trade order and cure gaps come from the framework, not the model.</p>
      {msg && <p className="text-sm mb-3 text-plaza-bluish">{msg}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-3 py-1 text-sm">Cancel</button>
        <button onClick={run} disabled={busy} className="px-4 py-1 text-sm bg-plaza-bluish text-white rounded disabled:opacity-50">
          {busy ? "Working…" : confirm ? "Regenerate (keep submitted)" : "Generate"}
        </button>
      </div>
    </Modal>
  );
}

function ReflowModal({ reflow, onApply, onClose }) {
  return (
    <Modal onClose={onClose} title="Reflow proposal">
      <p className="text-sm mb-2">Shifting later days by <b>{reflow.delta}</b> calendar day(s), cure gaps preserved. Nothing is written until you accept.</p>
      <div className="max-h-56 overflow-auto border border-black/10 rounded text-xs mb-3">
        <table className="w-full">
          <thead className="bg-plaza-paper"><tr><th className="text-left px-2 py-1">Day</th><th className="text-left px-2 py-1">From</th><th className="text-left px-2 py-1">To</th></tr></thead>
          <tbody>
            {reflow.proposal.map((p) => (
              <tr key={p.sortOrder} className="border-t border-black/5">
                <td className="px-2 py-1">#{p.sortOrder}</td><td className="px-2 py-1">{p.from}</td><td className="px-2 py-1 font-semibold">{p.to}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-3 py-1 text-sm">Ignore</button>
        <button onClick={onApply} className="px-4 py-1 text-sm bg-plaza-maroon text-white rounded">Accept reflow</button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg border border-black/10 p-5 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-head text-lg text-plaza-bluish mb-3">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function StatusBar({ cost, errors }) {
  const [open, setOpen] = useState(false);
  const copy = () => navigator.clipboard?.writeText(JSON.stringify(errors, null, 2));
  return (
    <footer className="border-t border-black/10 bg-white px-4 py-2 text-xs flex items-center gap-4">
      <span className="text-black/60">Runtime cost: <b>{cost.generations}</b> generations · est <b>${cost.estUsd?.toFixed(3)}</b> (~${cost.perGenUsd?.toFixed(4)}/gen, sonnet)</span>
      <button onClick={() => setOpen((o) => !o)} className={`ml-auto px-2 py-1 rounded ${errors.length ? "bg-plaza-maroon text-white" : "bg-black/5"}`}>
        Error log ({errors.length})
      </button>
      {open && (
        <div className="fixed right-4 bottom-10 w-[28rem] max-h-80 overflow-auto bg-white border border-black/15 rounded-lg shadow-lg p-3 z-50">
          <div className="flex items-center mb-2">
            <b className="text-sm">Copyable error log</b>
            <button onClick={copy} className="ml-auto text-xs px-2 py-0.5 bg-plaza-bluish text-white rounded">Copy</button>
            <button onClick={clearErrors} className="text-xs px-2 py-0.5 ml-1 bg-black/10 rounded">Clear</button>
          </div>
          {!errors.length && <p className="text-xs text-black/40">No errors.</p>}
          {errors.map((e, i) => (
            <pre key={i} className="text-[10px] whitespace-pre-wrap border-b border-black/5 py-1">{JSON.stringify(e)}</pre>
          ))}
        </div>
      )}
    </footer>
  );
}
