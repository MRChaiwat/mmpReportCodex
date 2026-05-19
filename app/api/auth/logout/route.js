import { clearSessionCookie } from "../../../../lib/auth.js";

export async function POST(request) {
  return clearSessionCookie(request);
}
