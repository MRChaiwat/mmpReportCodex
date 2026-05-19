import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/auth.js";
import { listUsers, updateUserStatus } from "../../../../lib/store.js";

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  return NextResponse.json({ users: await listUsers() });
}

export async function PATCH(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const user = await updateUserStatus({
      userId: body.userId,
      status: body.status,
      role: body.role,
      scopes: body.scopes || []
    });
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
