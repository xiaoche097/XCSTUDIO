import { requireAdmin } from "./_utils/auth";

type RehostRequest = {
  imageUrl?: string;
};

export default async function handler(req: any, res: any) {
  if (!requireAdmin(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body: RehostRequest =
    typeof req.body === "string"
      ? (() => {
          try {
            return JSON.parse(req.body);
          } catch {
            return {};
          }
        })()
      : req.body || {};

  const imageUrl = String(body.imageUrl || "").trim();
  if (!/^https?:\/\//i.test(imageUrl)) {
    return res.status(400).json({ error: "imageUrl must be a valid http(s) url" });
  }

  const keyRaw = process.env.IMGBB_API_KEY || "";
  const key = keyRaw.split(/\r?\n/).map((k) => k.trim()).find(Boolean);
  if (!key) {
    return res.status(200).json({
      imageUrl,
      hostedUrl: imageUrl,
      provider: "passthrough",
      fallback: true,
      reason: "missing_imgbb_api_key",
    });
  }

  try {
    const formData = new FormData();
    formData.append("image", imageUrl);

    const uploadRes = await fetch(
      `https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        body: formData,
      },
    );

    const payload = await uploadRes.json().catch(() => null);
    if (!uploadRes.ok || !payload?.success) {
      return res.status(502).json({
        error: payload?.error?.message || `imgbb_upload_failed_${uploadRes.status}`,
      });
    }

    const hostedUrl =
      payload?.data?.image?.url || payload?.data?.url || payload?.data?.display_url;
    if (!hostedUrl || /^https?:\/\/ibb\.co\//i.test(hostedUrl)) {
      return res.status(502).json({ error: "imgbb_returned_non_direct_url" });
    }

    return res.status(200).json({
      imageUrl,
      hostedUrl,
      provider: "imgbb",
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "rehost_failed" });
  }
}
