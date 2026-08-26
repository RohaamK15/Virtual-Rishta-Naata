// Sends an email to every member in a chosen segment, via Resend's REST API
// (a plain fetch call, no SDK — same pattern as _shared/fcm.ts for push).
// This is the one outreach channel that reaches every member regardless of
// platform or app version — unlike push (Android app only, requires a
// registered token) or a home-page banner (only seen by visitors to that
// specific page), email reaches anyone with a contact_email on file.
//
// Requires these secrets set on the Supabase project:
//   RESEND_API_KEY   (from resend.com > API Keys)
//   EMAIL_FROM        (optional — e.g. "Virtual Rishta Naata <hello@virtualrishtanaata.com>";
//                       falls back to Resend's shared test sender if unset,
//                       which only works for sending to your own verified
//                       Resend account email, not real members)
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";
import { logAdminAction } from "../_shared/logAdminAction.ts";

// deno-lint-ignore no-explicit-any
const SEGMENTS: Record<string, (q: any) => any> = {
  approved_unpaid: (q) => q.eq("profile_status", "approved").eq("is_comped", false).neq("subscription_status", "active"),
  all_active: (q) => q.eq("profile_status", "approved").or("subscription_status.eq.active,is_comped.eq.true"),
  all_members: (q) => q,
};

function wrapHtml(bodyHtml: string): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;color:#2b2b28;">
      <div style="text-align:center;margin-bottom:26px;">
        <strong style="font-family:Georgia,serif;color:#134B35;font-size:1.25rem;letter-spacing:.01em;">Virtual Rishta Naata</strong>
      </div>
      <div style="font-size:15px;line-height:1.65;">${bodyHtml}</div>
      <hr style="margin:34px 0 18px;border:none;border-top:1px solid #e5ddd0;">
      <p style="font-size:12px;color:#8a8578;text-align:center;margin:0;">Virtual Rishta Naata · virtualrishtanaata.com</p>
    </div>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin, user } = await requireAdmin(req);
    const { segment, subject, body, dryRun, testEmail, isHtml, fromAddress } = await req.json();

    let emails: string[];
    if (testEmail) {
      // Bypasses the real member list entirely — lets admin verify Resend
      // setup (domain, EMAIL_FROM, deliverability) without emailing anyone
      // real while debugging.
      emails = [testEmail];
    } else {
      if (!SEGMENTS[segment]) throw new Error("Invalid segment");
      let query = admin.from("profiles").select("contact_email").eq("is_admin", false);
      query = SEGMENTS[segment](query);
      const { data: rows, error } = await query;
      if (error) throw error;
      emails = [...new Set((rows || []).map((r: { contact_email: string }) => r.contact_email).filter(Boolean))];
    }

    if (dryRun) {
      return new Response(JSON.stringify({ success: true, recipientCount: emails.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!subject || !body) throw new Error("Subject and message are required");

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    // A per-send/per-template override, e.g. "memberships@..." for payment
    // emails vs "announcements@..." for general ones — only the domain
    // needs verifying in Resend, not each address, so any local part at a
    // verified domain works with zero extra setup. Falls back to the
    // EMAIL_FROM secret, then to Resend's shared test sender.
    const FROM = fromAddress || Deno.env.get("EMAIL_FROM") || "Virtual Rishta Naata <onboarding@resend.dev>";
    // Plain-text mode (default) converts line breaks to <br> and wraps the
    // result in a minimal branded header/footer, since a bare paragraph
    // with no styling looks unfinished. Raw-HTML mode assumes the admin has
    // written (or pasted) a complete, self-contained email — e.g. matching
    // the EmailJS templates' own full branded layout, logo included — and
    // sends it exactly as written with nothing added, since double-wrapping
    // a complete template in another header/footer would look broken.
    const html = isHtml ? String(body) : wrapHtml(String(body).replace(/\n/g, "<br>"));

    let sent = 0;
    const failures: string[] = [];
    // Resend's batch endpoint accepts up to 100 emails per call.
    for (let i = 0; i < emails.length; i += 100) {
      const chunk = emails.slice(i, i + 100);
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(chunk.map((email) => ({ from: FROM, to: [email], subject, html }))),
      });
      if (!res.ok) {
        failures.push(...chunk);
        console.warn("Resend batch failed:", await res.text());
      } else {
        sent += chunk.length;
      }
    }

    await logAdminAction(admin, user.id, "email_broadcast", null, `segment=${segment} subject="${subject}" sent=${sent} failed=${failures.length}`);

    return new Response(JSON.stringify({ success: true, recipientCount: emails.length, sent, failed: failures.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "Admin access required" ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
