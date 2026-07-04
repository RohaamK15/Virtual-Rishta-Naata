// Returns every profile with a photo awaiting review, plus a short-lived
// signed URL for each so the admin dashboard can actually display the image.
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin } = await requireAdmin(req);

    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, ref_code, photo_path, created_at")
      .eq("photo_status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const withUrls = await Promise.all((profiles || []).map(async (p) => {
      const { data: signed } = await admin.storage.from("profile-photos").createSignedUrl(p.photo_path, 300);
      return { ...p, photo_url: signed?.signedUrl || null };
    }));

    return new Response(JSON.stringify({ photos: withUrls }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "Admin access required" ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
