// Approves or rejects a pending profile. This is the ONLY way profile_status
// ever becomes 'approved' — members have no direct write access to that
// column at all (see schema.sql's trg_reset_profile_status). Rejecting never
// touches subscription_status or deletes anything: the member keeps their
// subscription and can simply edit their profile to resubmit for review.
//
// The photo is part of the profile decision, not a separate review: approving
// the profile approves its photo, and a rejection can be flagged as being
// because of the photo (photo_issue: true), which marks the photo rejected too
// so the member is told to upload a new one. Uploading a new photo sends the
// whole profile back to 'pending' (see trg_reset_photo_status in schema.sql).
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

// Sends a push notification via Firebase Cloud Messaging's HTTP v1 API,
// authenticating as a service account. No external JWT library needed — the
// Deno runtime's built-in Web Crypto API can do the RS256 signing directly.
// Requires the FIREBASE_SERVICE_ACCOUNT_JSON secret (the full JSON key
// downloaded from Firebase Console > Project Settings > Service Accounts >
// Generate new private key).
let cachedToken: { value: string; expiresAt: number } | null = null;

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getAccessToken(serviceAccount: { client_email: string; private_key: string }): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`FCM auth failed: ${JSON.stringify(body)}`);

  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.value;
}

// `data` becomes available client-side on the tapped notification's
// notification.data (see the pushNotificationActionPerformed listener in
// assets/js/app.js) — used to route the tap to a specific in-app page.
// FCM requires every data value to be a string; a boolean/number here would
// silently fail to send.
async function sendFcmPush(token: string, title: string, body: string, data?: Record<string, string>) {
  const serviceAccount = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON")!);
  const accessToken = await getAccessToken(serviceAccount);

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: { token, notification: { title, body }, ...(data ? { data } : {}) },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`FCM send failed: ${await res.text()}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin, user } = await requireAdmin(req);
    const { profile_id, action, reason, photo_issue } = await req.json();
    if (!profile_id) throw new Error("profile_id is required");
    if (!["approve", "reject"].includes(action)) throw new Error("action must be 'approve' or 'reject'");
    const photoRejected = action === "reject" && photo_issue === true;
    const rejectionReason = action !== "reject"
      ? null
      : (reason || (photoRejected
          ? "Your profile photo didn't meet our photo guidelines — please upload a clear, recent photo of just yourself."
          : "Did not meet our community standards"));

    const { data: photoRow } = await admin.from("profiles").select("photo_path").eq("id", profile_id).single();
    const hasPhoto = !!photoRow?.photo_path;
    if (photoRejected && !hasPhoto) throw new Error("This member has no photo on file, so it can't be the reason for rejecting.");

    // Launch promo: the first `member_cap` active members get comped
    // automatically instead of having to pay — see FREE ACCESS PROMO in
    // schema.sql. Only ever relevant on approval, and only for a profile
    // that isn't already active — an already-paying (or already-comped)
    // member re-approved after an edit/resubmission must never get
    // re-flagged as a fresh promo grant.
    let promoComped = false;
    let promoJustEnded = false;
    let promo: { enabled: boolean; member_cap: number } | null = null;
    const updateFields: Record<string, unknown> = {
      profile_status: action === "approve" ? "approved" : "rejected",
      profile_rejection_reason: rejectionReason,
    };
    // Approving the profile approves the photo the admin just reviewed with
    // it. A rejection for other reasons puts the photo back to 'pending' — it
    // gets judged again with the resubmitted profile. That also keeps
    // photo_status='rejected' meaning exactly "the latest rejection was
    // because of the photo", which account.html and the resend-email button
    // rely on (otherwise an earlier photo rejection would linger).
    if (hasPhoto && action === "approve") {
      updateFields.photo_status = "approved";
      updateFields.photo_rejection_reason = null;
    } else if (photoRejected) {
      updateFields.photo_status = "rejected";
      updateFields.photo_rejection_reason = rejectionReason;
    } else if (hasPhoto) {
      updateFields.photo_status = "pending";
      updateFields.photo_rejection_reason = null;
    }

    // Recorded in admin_action_log so "was this member verified when
    // approved?" stays answerable after the verification row is deleted below.
    let verificationNote: string | null = null;

    if (action === "approve") {
      const { data: current } = await admin.from("profiles").select("subscription_status, is_comped, verified_by_admin").eq("id", profile_id).single();

      // Safeguard: never approve a profile that has neither submitted
      // Ahmadi verification (answers + video) nor been marked as pre-verified
      // by an admin. Without this, an incomplete signup (e.g. the video upload
      // failed and the member never retried) could be approved by mistake.
      const { data: verifRow } = await admin
        .from("profile_verification")
        .select("video_path")
        .eq("profile_id", profile_id)
        .maybeSingle();
      if (current?.verified_by_admin) {
        verificationNote = "approved: member claimed verified_by_admin (no verification submitted)";
      } else if (verifRow?.video_path) {
        verificationNote = "approved: verification answers + video were on file";
      } else {
        throw new Error("Can't approve: this member hasn't completed Ahmadi verification (no answers/video on file) and isn't marked verified by admin. Ask them to resubmit verification, or reject.");
      }

      const alreadyActive = current?.subscription_status === "active" || current?.is_comped === true;
      if (!alreadyActive) {
        const { data: promoRow } = await admin.from("free_access_promo").select("enabled, member_cap").eq("id", true).maybeSingle();
        promo = promoRow;
        if (promo?.enabled) {
          const { count } = await admin.from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("profile_status", "approved")
            .eq("is_admin", false)
            .eq("is_hidden_from_browse", false)
            .or("subscription_status.eq.active,is_comped.eq.true");
          if ((count || 0) < promo.member_cap) {
            promoComped = true;
            updateFields.is_comped = true;
            updateFields.is_promo_comped = true;
          }
        }
      }
    }

    // Returns the member's contact_email/ref_code alongside success so the
    // caller (admin.html) can send the profile-decision notification email
    // without a second round-trip — see notifyProfileDecision().
    const { data: updated, error } = await admin.from("profiles").update(updateFields)
      .eq("id", profile_id).select("contact_email, ref_code").single();
    if (error) throw error;
    await logAdminAction(
      admin, user.id, `profile_${action}`, profile_id,
      photoRejected ? `photo: ${rejectionReason}` : (reason || verificationNote),
    );

    // If this approval just filled the last promo slot, end the promo
    // immediately for everyone who got in on it — never for a manual
    // admin-granted comp, hence the is_promo_comped filter (see schema.sql).
    if (promoComped && promo) {
      const { count: newCount } = await admin.from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("profile_status", "approved")
        .eq("is_admin", false)
        .eq("is_hidden_from_browse", false)
        .or("subscription_status.eq.active,is_comped.eq.true");
      if ((newCount || 0) >= promo.member_cap) {
        // Fetch who's actually affected BEFORE revoking, so they can be
        // notified — a comp silently disappearing with no explanation would
        // read as a bug, not the promo working as promised.
        const { data: affected } = await admin.from("profiles")
          .select("push_token, push_platform, push_enabled")
          .eq("is_promo_comped", true).eq("is_comped", true);
        await admin.from("free_access_promo").update({ enabled: false, updated_at: new Date().toISOString() }).eq("id", true);
        await admin.from("profiles").update({ is_comped: false }).eq("is_promo_comped", true).eq("is_comped", true);
        promoJustEnded = true;
        await logAdminAction(admin, user.id, "free_access_promo_ended", null, `member_cap of ${promo.member_cap} reached`);

        for (const member of affected || []) {
          if (member.push_token && member.push_enabled !== false && member.push_platform === "android") {
            try {
              await sendFcmPush(
                member.push_token,
                "Our free launch offer has ended",
                "We've reached our target number of members — complete your membership from My Account to keep full access.",
                { url: "/account.html" },
              );
            } catch (pushErr) {
              console.warn("Promo-ended push notification failed:", pushErr);
            }
          }
        }
      }
    }

    // Ahmadi verification answers (including the intro video) are one-time-
    // viewing data for this decision only — never retained past the moment a
    // decision is made, approve or reject, regardless of what happens below.
    // Deleting the DB row alone wouldn't remove the video file itself, so
    // fetch its path first and remove the storage object too.
    const { data: verification } = await admin
      .from("profile_verification")
      .select("video_path")
      .eq("profile_id", profile_id)
      .maybeSingle();
    if (verification?.video_path) {
      await admin.storage.from("verification-videos").remove([verification.video_path]);
    }
    await admin.from("profile_verification").delete().eq("profile_id", profile_id);

    // Best-effort push notification — previously a member only found out
    // their profile had been reviewed if they happened to open the app and
    // check account.html themselves. A failure here should never fail the
    // review action itself, same reasoning as send-message-push.
    try {
      const { data: member } = await admin
        .from("profiles")
        .select("push_token, push_platform, push_enabled")
        .eq("id", profile_id)
        .single();
      if (member?.push_token && member.push_enabled !== false && member.push_platform === "android") {
        const title = action === "approve"
          ? "Your profile has been approved!"
          : (photoRejected ? "Your profile photo needs updating" : "Your profile needs a small update");
        // promoJustEnded means THIS SAME approval filled the last slot and
        // was immediately converted back — the "you have free access"
        // wording would be false by the time they read it, so it falls
        // through to the normal payment-needed message instead.
        const body = action === "approve"
          ? (promoComped && !promoJustEnded
              ? "You're one of our first members and have free access — start browsing and messaging now."
              : "Complete your membership from the app to start browsing and messaging.")
          : (reason || (photoRejected
              ? "Please upload a new photo from My Account."
              : "Please review and resubmit your profile from My Account."));
        await sendFcmPush(member.push_token, title, body, { url: "/account.html" });
      }
    } catch (pushErr) {
      console.warn("Profile review push notification failed:", pushErr);
    }

    return new Response(JSON.stringify({
      success: true,
      contact_email: updated?.contact_email,
      ref_code: updated?.ref_code,
      promo_comped: promoComped,
      promo_ended: promoJustEnded,
      photo_rejected: photoRejected,
      rejection_reason: rejectionReason,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "Admin access required" ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
