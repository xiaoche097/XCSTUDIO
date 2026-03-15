import crypto from "crypto";

const SESSION_COOKIE_NAME = "xc_admin";

function parseCookies(header: string | undefined): Record<string, string> {
  const raw = String(header || "");
  const out: Record<string, string> = {};
  raw
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const idx = pair.indexOf("=");
      if (idx <= 0) return;
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      if (!k) return;
      out[k] = decodeURIComponent(v);
    });
  return out;
}

function verifySession(token: string, secret: string): { ok: true; issuedAt: number } | { ok: false } {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return { ok: false };
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return { ok: false };

  const expected = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false };

  try {
    const json = Buffer.from(payloadB64, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    const issuedAt = Number(parsed?.t || 0);
    if (!Number.isFinite(issuedAt) || issuedAt <= 0) return { ok: false };
    return { ok: true, issuedAt };
  } catch {
    return { ok: false };
  }
}

export default async function handler(req: any, res: any) {
  const sessionSecret = String(process.env.SESSION_SECRET || "").trim();
  if (!sessionSecret) {
    return res.status(500).json({ ok: false, error: "server_not_configured" });
  }

  const cookies = parseCookies(req.headers?.cookie);
  const token = cookies[SESSION_COOKIE_NAME] || "";
  const result = verifySession(token, sessionSecret);
  if (!result.ok) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  return res.status(200).json({ ok: true, user: { role: "admin" }, issuedAt: result.issuedAt });
}
