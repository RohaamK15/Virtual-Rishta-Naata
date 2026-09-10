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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Verifies the caller's JWT and checks is_admin using the service-role key —
// never trust an is_admin claim supplied by the client itself.
async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing Authorization header");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !user) throw new Error("Not authenticated");

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (profileError || !profile?.is_admin) throw new Error("Admin access required");

  return { admin, user };
}

// Writes one row to admin_action_log — see schema.sql for why this table
// exists (it backs the Privacy Policy's "administrative access is...
// logged" promise). Deliberately fire-and-forget from the caller's
// perspective: a logging failure must never block or fail the actual admin
// action it's recording.
// deno-lint-ignore no-explicit-any
async function logAdminAction(
  admin: any,
  adminId: string,
  action: string,
  targetProfileId?: string | null,
  detail?: string | null,
) {
  try {
    await admin.from("admin_action_log").insert({
      admin_id: adminId,
      action,
      target_profile_id: targetProfileId || null,
      detail: detail || null,
    });
  } catch (err) {
    console.warn("logAdminAction failed:", err);
  }
}

// deno-lint-ignore no-explicit-any
const SEGMENTS: Record<string, (q: any) => any> = {
  approved_unpaid: (q) => q.eq("profile_status", "approved").eq("is_comped", false).neq("subscription_status", "active"),
  all_active: (q) => q.eq("profile_status", "approved").or("subscription_status.eq.active,is_comped.eq.true"),
  all_members: (q) => q,
};

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Matches the table-based layout/colors used by every other branded email in
// this app (see email-templates/*.html — profile-decision, new-signup,
// discount-announcement, etc.), so a plain-text broadcast reads as the same
// family of email rather than a bare, unstyled fallback. The subject doubles
// as the header heading, same as those templates' status_heading pattern.
// Body paragraphs split on blank lines (a single \n within a paragraph just
// becomes a line break) — not escaped, same as before, so an admin can still
// drop in a raw <a href> or <strong> if they want.
function wrapHtml(subject: string, bodyText: string): string {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#55604F;text-align:left;">${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
  const safeSubject = escapeHtml(subject);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeSubject}</title>
</head>
<body style="margin:0;padding:0;background-color:#F3E8D6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F3E8D6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#FFF9F2;border-radius:14px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background-color:#FFF9F2;padding:34px 40px 28px;text-align:center;border-bottom:1px solid #E4DCC8;">
              <img src="https://virtualrishtanaata.com/assets/img/logo-full.png"
                   alt="Virtual Rishta Naata — Connecting Families. Creating Lifelong Bonds."
                   width="160"
                   style="display:block;width:160px;max-width:160px;height:auto;margin:0 auto 18px;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#134B35;font-weight:bold;">
                ${safeSubject}
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;text-align:left;">
              ${paragraphs}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px;border-top:1px solid #E4DCC8;text-align:left;">
              <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#9AA79A;text-align:left;">
                Questions? Just reply to this email, or reach us anytime at <a href="mailto:contact@virtualrishtanaata.com" style="color:#9AA79A;">contact@virtualrishtanaata.com</a>.
              </p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#9AA79A;text-align:left;">
                Virtual Rishta Naata · virtualrishtanaata.com
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin, user } = await requireAdmin(req);
    const { segment, subject, body, dryRun, testEmail, isHtml, fromAlias } = await req.json();

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
    // Admin only ever types the alias (e.g. "memberships"), not a full
    // address — built into "Virtual Rishta Naata <alias@virtualrishtanaata.
    // com>" here. Only the domain needs verifying in Resend, not each
    // individual alias, so this works for anything with zero extra setup.
    // Stripped down to a safe local-part shape (letters/digits/.  _ -) so a
    // stray @ or space can't produce a malformed From header. Falls back to
    // the EMAIL_FROM secret, then to Resend's shared test sender, when no
    // alias is given.
    const cleanAlias = typeof fromAlias === "string" ? fromAlias.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "") : "";
    const FROM = cleanAlias
      ? `Virtual Rishta Naata <${cleanAlias}@virtualrishtanaata.com>`
      : Deno.env.get("EMAIL_FROM") || "Virtual Rishta Naata <onboarding@resend.dev>";
    if (cleanAlias) {
      // Fire-and-forget: remembering an alias for the autocomplete dropdown
      // must never block or fail the actual send.
      admin.from("email_from_alias").upsert({ alias: cleanAlias, last_used_at: new Date().toISOString() }).then(
        () => {},
        (err: unknown) => console.warn("Could not record from-alias:", err),
      );
    }
    // Plain-text mode (the only mode the admin dashboard's compose box ever
    // sends) wraps the text in the same branded card layout as every other
    // email in this app — see wrapHtml() above. Raw-HTML mode is only ever
    // used by pre-built templates (never composed in the dashboard): it
    // assumes the template is a complete, self-contained email — e.g.
    // matching the EmailJS templates' own full branded layout, logo included
    // — and sends it exactly as written with nothing added, since
    // double-wrapping a complete template in another header/footer would
    // look broken.
    const html = isHtml ? String(body) : wrapHtml(String(subject), String(body));

    let sent = 0;
    const failures: string[] = [];
    // Resend's batch endpoint accepts up to 100 emails per call.
    for (let i = 0; i < emails.length; i += 100) {
      const chunk = emails.slice(i, i + 100);
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        // reply_to is deliberately fixed to support@ regardless of which
        // alias actually sent the email (announcements@, memberships@,
        // etc.) — one consistent address for members to reply to, forwarded
        // to a real inbox, rather than a different reply target per alias.
        body: JSON.stringify(chunk.map((email) => ({
          from: FROM, to: [email], subject, html,
          reply_to: "support@virtualrishtanaata.com",
        }))),
      });
      if (!res.ok) {
        failures.push(...chunk);
        console.warn("Resend batch failed:", await res.text());
      } else {
        sent += chunk.length;
      }
    }

    const target = testEmail ? `to=${testEmail}` : `segment=${segment}`;
    await logAdminAction(admin, user.id, "email_broadcast", null, `${target} subject="${subject}" sent=${sent} failed=${failures.length}`);

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
