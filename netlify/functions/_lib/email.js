// Send transactional email via Resend. Used to deliver the login one-time code.
// Env: RESEND_API_KEY (required), RESEND_FROM (verified sender, e.g.
//   "Plaza Works Scheduler <noreply@plazaworks.com.au>"). Defaults to Resend's
//   shared onboarding@resend.dev sender for first testing.
const RESEND_FROM = process.env.RESEND_FROM || "Plaza Works Scheduler <onboarding@resend.dev>";

export async function sendLoginCode(email, code) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Missing RESEND_API_KEY (set it in Netlify env).");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [email],
      subject: `Your Plaza Works Scheduler code: ${code}`,
      html: `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;color:#161616">
        <p>Here is your Plaza Works Scheduler login code:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:3px;color:#2c4045">${code}</p>
        <p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
      </div>`,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend ${res.status}: ${t.slice(0, 200)}`);
  }
  return true;
}
