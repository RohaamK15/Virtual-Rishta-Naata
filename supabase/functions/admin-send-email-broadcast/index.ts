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

function wrapHtml(bodyHtml: string, unsubscribeUrl: string | null): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;color:#2b2b28;">
      <div style="text-align:center;margin-bottom:26px;">
        <img src="https://virtualrishtanaata.com/assets/img/logo-full.png"
             alt="Virtual Rishta Naata — Connecting Families. Creating Lifelong Bonds."
             width="140" style="display:block;width:140px;max-width:140px;height:auto;margin:0 auto;">
      </div>
      <div style="font-size:15px;line-height:1.65;">${bodyHtml}</div>
      <hr style="margin:34px 0 18px;border:none;border-top:1px solid #e5ddd0;">
      <p style="font-size:12px;color:#8a8578;text-align:center;margin:0;">Virtual Rishta Naata · virtualrishtanaata.com</p>
      ${unsubscribeUrl ? `<p style="font-size:12px;color:#8a8578;text-align:center;margin:8px 0 0;"><a href="${unsubscribeUrl}" style="color:#8a8578;">Unsubscribe</a> from emails like this.</p>` : ""}
    </div>
  `;
}

// PECR (UK e-marketing regulations) requires every marketing email to carry
// a working, honoured opt-out — see the email_marketing_opt_out column and
// the public unsubscribe-email function. Raw-HTML sends (isHtml=true) are
// complete, self-contained templates the admin wrote — this stitches the
// unsubscribe link in just before </body> rather than trusting every
// template to remember to include one itself; falls back to appending at
// the very end if the template has no </body> to anchor to.
function injectUnsubscribeFooter(html: string, unsubscribeUrl: string): string {
  const footer = `<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9AA79A;text-align:center;padding:16px 0;margin:0;"><a href="${unsubscribeUrl}" style="color:#9AA79A;">Unsubscribe</a> from emails like this.</p>`;
  if (html.includes("</body>")) return html.replace(/<\/body>/i, `${footer}</body>`);
  return html + footer;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin, user } = await requireAdmin(req);
    const { segment, subject, body, dryRun, testEmail, isHtml, fromAlias } = await req.json();

    // Recipients carry their own unsubscribe_token so each email gets a
    // working, member-specific unsubscribe link (PECR requirement — see
    // wrapHtml/injectUnsubscribeFooter and the unsubscribe-email function).
    // testEmail has no real profile/token behind it, so it's represented
    // with a null token and skips the opt-out filter entirely — it's a
    // debugging aid the admin sends to themselves, not a real member.
    type Recipient = { id: string | null; contact_email: string; unsubscribe_token: string | null };
    let recipients: Recipient[];
    if (testEmail) {
      recipients = [{ id: null, contact_email: testEmail, unsubscribe_token: null }];
    } else {
      if (!SEGMENTS[segment]) throw new Error("Invalid segment");
      let query = admin.from("profiles").select("id, contact_email, unsubscribe_token")
        .eq("is_admin", false).eq("email_marketing_opt_out", false);
      query = SEGMENTS[segment](query);
      const { data: rows, error } = await query;
      if (error) throw error;
      const seen = new Set<string>();
      recipients = [];
      for (const r of (rows || []) as { id: string; contact_email: string; unsubscribe_token: string }[]) {
        if (!r.contact_email || seen.has(r.contact_email)) continue;
        seen.add(r.contact_email);
        recipients.push(r);
      }
    }

    if (dryRun) {
      return new Response(JSON.stringify({ success: true, recipientCount: recipients.length }), {
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
    const rawHtml = String(body);
    const plainHtml = String(body).replace(/\n/g, "<br>");

    function buildHtmlFor(r: Recipient): string {
      const unsubscribeUrl = r.id && r.unsubscribe_token
        ? `https://virtualrishtanaata.com/unsubscribe.html?id=${r.id}&t=${r.unsubscribe_token}`
        : null;
      // Plain-text mode (default) converts line breaks to <br> and wraps the
      // result in a minimal branded header/footer, since a bare paragraph
      // with no styling looks unfinished. Raw-HTML mode assumes the admin
      // has written (or pasted) a complete, self-contained email — e.g.
      // matching the EmailJS templates' own full branded layout, logo
      // included — and sends it exactly as written except for the
      // unsubscribe link stitched in above.
      if (isHtml) return unsubscribeUrl ? injectUnsubscribeFooter(rawHtml, unsubscribeUrl) : rawHtml;
      return wrapHtml(plainHtml, unsubscribeUrl);
    }

    let sent = 0;
    const failures: string[] = [];
    // Resend's batch endpoint accepts up to 100 emails per call.
    for (let i = 0; i < recipients.length; i += 100) {
      const chunk = recipients.slice(i, i + 100);
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        // reply_to is deliberately fixed to support@ regardless of which
        // alias actually sent the email (announcements@, memberships@,
        // etc.) — one consistent address for members to reply to, forwarded
        // to a real inbox, rather than a different reply target per alias.
        body: JSON.stringify(chunk.map((r) => ({
          from: FROM, to: [r.contact_email], subject, html: buildHtmlFor(r),
          reply_to: "support@virtualrishtanaata.com",
        }))),
      });
      if (!res.ok) {
        failures.push(...chunk.map((r) => r.contact_email));
        console.warn("Resend batch failed:", await res.text());
      } else {
        sent += chunk.length;
      }
    }

    await logAdminAction(admin, user.id, "email_broadcast", null, `segment=${segment} subject="${subject}" sent=${sent} failed=${failures.length}`);

    return new Response(JSON.stringify({ success: true, recipientCount: recipients.length, sent, failed: failures.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "Admin access required" ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
