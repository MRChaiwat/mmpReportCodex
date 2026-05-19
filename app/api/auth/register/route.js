import { NextResponse } from "next/server";
import { createUser } from "../../../../lib/store.js";

export async function POST(request) {
  try {
    const body = await request.json();
    const user = await createUser({
      email: body.email,
      name: body.name,
      password: body.password,
      requestedRole: body.requestedRole || "sales",
      requestedScopeType: body.requestedScopeType || null,
      requestedScopeValue: body.requestedScopeValue || null
    });
    return NextResponse.json({ user, message: "Registration submitted. _admin approval is required before login." }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
