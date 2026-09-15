import "jsr:@supabase/functions-js/edge-runtime.d.ts";

console.info("send-application-decision-email started");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendResendEmail(args: { to: string; subject: string; html: string }) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("Missing RESEND_API_KEY");

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "no-reply@fairquestapp.com",
      to: args.to,
      subject: args.subject,
      html: args.html,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Resend error: ${resp.status} ${text}`);
  }
}

async function dbFetch(path: string) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`DB fetch failed: ${resp.status} ${text}`);
  }
  return resp.json();
}

function typeLabel(applicationType: boolean | null, isFoodVendor: boolean | null): string {
  if (applicationType === true) return "Performer";
  if (isFoodVendor === true) return "Food Vendor";
  return "Artisan & Craft Vendor";
}

function buildEmailHtml(args: {
  fairName: string;
  contactName: string;
  applicantType: string;
  isApproved: boolean;
  fairEmail: string;
}): string {
  const headline = args.isApproved
    ? `🎉 You're In! Your application to ${esc(args.fairName)} has been Approved`
    : `Update on your application to ${esc(args.fairName)}`;

  const bodyMsg = args.isApproved
    ? `Congratulations, ${esc(args.contactName)}! Your <b>${esc(args.applicantType)}</b> application to <b>${esc(args.fairName)}</b> has been <span style="color:#2e7d32;font-weight:bold;">approved</span>. The fair will follow up with next steps (payment, booth assignment, etc. if applicable).`
    : `Hello ${esc(args.contactName)}, thank you for applying to <b>${esc(args.fairName)}</b>. After review, your <b>${esc(args.applicantType)}</b> application was <span style="color:#a83232;font-weight:bold;">not approved</span> this time.`;

  const footerNote = args.isApproved
    ? `Questions? Reach out to the fair directly${args.fairEmail ? ` at ${esc(args.fairEmail)}` : ""}.`
    : `If you have questions about this decision, you can reach out to the fair directly${args.fairEmail ? ` at ${esc(args.fairEmail)}` : ""}.`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0d0a04;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0a04;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">

          <tr>
            <td style="background:linear-gradient(135deg,#1a1208,#2d1f0a);padding:28px 32px;border-radius:14px 14px 0 0;border-bottom:3px solid #bb9457;text-align:center;">
              <div style="font-family:'Georgia',serif;font-size:26px;font-weight:bold;color:#f1df99;letter-spacing:0.05em;">
                ⚔️ FairQuest
              </div>
              <div style="color:#c8aa6e;font-size:13px;margin-top:6px;letter-spacing:0.08em;">
                APPLICATION ${args.isApproved ? "APPROVED" : "DECLINED"}
              </div>
            </td>
          </tr>

          <tr>
            <td style="background:rgba(241,223,153,0.95);padding:28px 32px;border-radius:0 0 14px 14px;">
              <div style="font-family:'Georgia',serif;font-size:19px;font-weight:bold;color:#3b1f1f;margin-bottom:14px;">
                ${headline}
              </div>
              <p style="margin:0 0 18px;color:#3b1f1f;font-size:15px;line-height:1.6;">
                ${bodyMsg}
              </p>
              <p style="margin:0;color:rgba(59,31,31,0.65);font-size:13px;font-style:italic;line-height:1.6;">
                ${footerNote}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:18px;text-align:center;">
              <div style="color:#bb9457;font-size:12px;">
                FairQuest &nbsp;|&nbsp; <a href="https://fairquestapp.com" style="color:#bb9457;">fairquestapp.com</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const payload = await req.json();
    const r = payload?.record;
    const old = payload?.old_record;

    const isDecision = r && (r.status === "approved" || r.status === "rejected");
    const changed = !old || old.status !== r?.status;

    if (!isDecision || !changed) {
      return new Response(JSON.stringify({ ok: true, skipped: "not a decision event" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const fairId = r.fair_id;
    const vpaId = r.vendor_performer_application_id;
    const applicantEmail = (r.applicant_email ?? "").trim();
    const applicantName = r.applicant_name ?? "";

    const vpaRows = await dbFetch(
      `vendor_performer_applications?id=eq.${vpaId}&select=name,contact_name,contact_email,application_type,is_food_vendor`
    );
    const vpa = vpaRows[0];

    const applicantType = typeLabel(vpa?.application_type, vpa?.is_food_vendor);
    const contactName = vpa?.contact_name ?? applicantName;
    const contactEmail = (vpa?.contact_email ?? applicantEmail).trim();

    if (!contactEmail) {
      return new Response(JSON.stringify({ ok: true, skipped: "no applicant email" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const fairRows = await dbFetch(`renaissance_fairs?id=eq.${fairId}&select=name,contact_email`);
    const fair = fairRows[0];
    const fairName = fair?.name ?? "The Fair";
    const fairEmail = (fair?.contact_email ?? "").trim();

    const isApproved = r.status === "approved";

    await sendResendEmail({
      to: contactEmail,
      subject: isApproved
        ? `You're approved! — ${fairName} — FairQuest`
        : `Application update — ${fairName} — FairQuest`,
      html: buildEmailHtml({ fairName, contactName, applicantType, isApproved, fairEmail }),
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("send-application-decision-email failed:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
