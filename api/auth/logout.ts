const SESSION_COOKIE_NAME = "xc_admin";

function clearCookie(): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Max-Age=0",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  return parts.join("; ");
}

function isSecureRequest(req: any): boolean {
  if (process.env.VERCEL) return true;
  const proto = String(req?.headers?.["x-forwarded-proto"] || "").toLowerCase();
  if (proto === "https") return true;
  return false;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const cookie = clearCookie();
  res.setHeader(
    "Set-Cookie",
    isSecureRequest(req) ? `${cookie}; Secure` : cookie,
  );
  return res.status(200).json({ ok: true });
}
