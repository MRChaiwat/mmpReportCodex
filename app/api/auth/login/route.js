import { NextResponse } from "next/server";
import { setSessionCookie } from "../../../../lib/auth.js";
import { verifyLogin } from "../../../../lib/store.js";

const attempts = new Map();

function tooManyAttempts(key) {
  const now = Date.now();
  const record = attempts.get(key) || { count: 0, resetAt: now + 10 * 60 * 1000 };
  if (record.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return false;
  }
  record.count += 1;
  attempts.set(key, record);
  return record.count > 10;
}

export async function POST(request) {
  const body = await request.json();
  const key = `${request.headers.get("x-forwarded-for") || "local"}:${body.email || ""}`;
  if (tooManyAttempts(key)) return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429 });

  const result = await verifyLogin(body.email, body.password);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 401 });
  return setSessionCookie(NextResponse.json({ user: result.user }), result.user.id);
}
