import { NextResponse } from "next/server";
import { createSession, deleteSession, getUserBySession } from "./store.js";
import { randomToken, sha256 } from "./crypto.js";

const cookieName = "mmp_session";

export async function currentUser(request) {
  return getUserBySession(request.cookies.get(cookieName)?.value);
}

export async function requireUser(request) {
  const user = await currentUser(request);
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  return { user };
}

export async function requireAdmin(request) {
  const result = await requireUser(request);
  if (result.error) return result;
  if (result.user.role !== "admin") return { error: NextResponse.json({ error: "_admin approval role required" }, { status: 403 }) };
  return result;
}

export async function setSessionCookie(response, userId) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await createSession(userId, sha256(token), expiresAt);
  response.cookies.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt
  });
  return response;
}

export async function clearSessionCookie(request) {
  const token = request.cookies.get(cookieName)?.value;
  if (token) await deleteSession(token);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookieName, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  return response;
}
