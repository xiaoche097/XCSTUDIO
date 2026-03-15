import crypto from "crypto";

const SESSION_COOKIE_NAME = "xc_admin";

export function parseCookies(header: string | undefined): Record<string, string> {
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

export function verifyAdminSession(req: any): boolean {
  const sessionSecret = String(process.env.SESSION_SECRET || "").trim();
  if (!sessionSecret) return false;

  const cookies = parseCookies(req?.headers?.cookie);
  const token = cookies[SESSION_COOKIE_NAME] || "";
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return false;

  const expected = crypto.createHmac("sha256", sessionSecret).update(payloadB64).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;

  try {
    const json = Buffer.from(payloadB64, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    const issuedAt = Number(parsed?.t || 0);
    if (!Number.isFinite(issuedAt) || issuedAt <= 0) return false;
    return true;
  } catch {
    return false;
  }
}

export function requireAdmin(req: any, res: any): boolean {
  const ok = verifyAdminSession(req);
  if (!ok) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return false;
  }
  return true;
}
