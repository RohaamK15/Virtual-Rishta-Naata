// Sends a "please update the app" push notification to every Android member
// with a registered push token. We have no way to know which specific
// devices are actually still on an old build — profiles only stores a push
// token/platform, never the app's version/build number — so this is a
// broadcast to everyone on Android, not a targeted nudge. Harmless for
// anyone already up to date; for anyone still on an old build (like the one
// that shows the now-disabled Google sign-in button), it's the only lever
// available, since a native build already installed on someone's phone has
// no way to learn about a new update-checking mechanism it predates.
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";
import { sendFcmPush } from "../_shared/fcm.ts";
import { logAdminAction } from "../_shared/logAdminAction.ts";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.virtualrishtanaata.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin, user } = await requireAdmin(req);

    const { data: members, error } = await admin
      .from("profiles")
      .select("id, ref_code, push_token")
      .eq("push_platform", "android")
      .eq("push_enabled", true)
      .not("push_token", "is", null);
    if (error) throw error;

    let sent = 0;
    const failures: { ref_code: string; reason: string }[] = [];
    for (const m of members || []) {
      try {
        await sendFcmPush(
          m.push_token,
          "Please Update Virtual Rishta Naata",
          "A new version is available with important fixes. Please update from the Play Store to keep using the app.",
          { url: PLAY_STORE_URL }
        );
        sent++;
      } catch (pushErr) {
        const reason = pushErr instanceof Error ? pushErr.message : String(pushErr);
        console.warn("Update nudge push failed for", m.ref_code, reason);
        failures.push({ ref_code: m.ref_code, reason });
      }
    }

    await logAdminAction(
      admin, user.id, "update_nudge_broadcast", null,
      `sent=${sent} failed=${failures.length}${failures.length ? " (" + failures.map((f) => f.ref_code).join(", ") + ")" : ""}`
    );

    return new Response(JSON.stringify({ success: true, sent, failed: failures.length, failures }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "Admin access required" ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
