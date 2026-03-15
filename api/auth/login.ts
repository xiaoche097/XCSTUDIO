import crypto from "crypto";

type LoginBody = {
  password?: string;
};

const SESSION_COOKIE_NAME = "xc_admin";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function asJson(body: any): LoginBody {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body as LoginBody;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function signSession(payload: string, secret: string): string {
  const h = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${h}`;
}

function isSecureRequest(req: any): boolean {
  if (process.env.VERCEL) return true;
  const proto = String(req?.headers?.["x-forwarded-proto"] || "").toLowerCase();
  if (proto === "https") return true;
  return false;
}

function buildCookie(value: string, maxAgeSeconds: number, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    `Max-Age=${maxAgeSeconds}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const adminPassword = String(process.env.ADMIN_PASSWORD || "").trim();
  const sessionSecret = String(process.env.SESSION_SECRET || "").trim();
  if (!adminPassword || !sessionSecret) {
    return res.status(500).json({ ok: false, error: "server_not_configured" });
  }

  const body = asJson(req.body);
  const password = String(body.password || "");
  if (!password) {
    return res.status(400).json({ ok: false, error: "password_required" });
  }

  if (!timingSafeEqualString(password, adminPassword)) {
    return res.status(401).json({ ok: false, error: "invalid_credentials" });
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ v: 1, t: now });
  const token = signSession(Buffer.from(payload).toString("base64url"), sessionSecret);

  res.setHeader(
    "Set-Cookie",
    buildCookie(token, SESSION_TTL_SECONDS, isSecureRequest(req)),
  );
  return res.status(200).json({ ok: true });
}
