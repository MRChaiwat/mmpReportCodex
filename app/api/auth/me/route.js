import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth.js";

export async function GET(request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user });
}
