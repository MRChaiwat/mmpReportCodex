import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdmin } from "../../../lib/auth.js";
import { parseWorkbook } from "../../../lib/excel.js";
import { saveImport } from "../../../lib/store.js";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const { url, fileName } = await request.json();
  if (!url || !String(url).startsWith("https://")) return NextResponse.json({ error: "Valid Blob URL is required" }, { status: 400 });
  if (!String(fileName || "").match(/\.xlsx$/i)) return NextResponse.json({ error: "Only .xlsx files are allowed" }, { status: 400 });

  const tempPath = path.join(os.tmpdir(), `${Date.now()}-${String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_")}`);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Unable to fetch uploaded Excel file from Blob");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > 120 * 1024 * 1024) throw new Error("File is too large. Limit is 120MB.");
    await fs.writeFile(tempPath, bytes);
    const parsed = await parseWorkbook(tempPath, fileName);
    const importId = await saveImport({ uploadedBy: auth.user.id, fileName, blobUrl: url, parsed });
    return NextResponse.json({ ok: true, importId, meta: parsed.meta });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}
