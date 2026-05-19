import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth.js";
import { getLatestDashboard } from "../../../lib/store.js";

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;
  const dashboard = await getLatestDashboard(auth.user);
  return NextResponse.json(dashboard);
}
