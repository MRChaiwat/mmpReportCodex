import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAdmin } from "../../../lib/auth.js";
import { parseWorkbook } from "../../../lib/excel.js";
import { saveImport } from "../../../lib/store.js";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Please choose an Excel file" }, { status: 400 });
  if (!file.name.match(/\.xlsx$/i)) return NextResponse.json({ error: "Only .xlsx files are allowed" }, { status: 400 });
  if (file.size > 120 * 1024 * 1024) return NextResponse.json({ error: "File is too large. Limit is 120MB." }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const tempPath = path.join(os.tmpdir(), `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
  let blobUrl = null;

  try {
    await fs.writeFile(tempPath, bytes);
    if (process.env.BLOB_READ_WRITE_TOKEN && process.env.SOURCE_FILE_STORAGE === "vercel_blob_public") {
      const blob = await put(`budget-imports/${Date.now()}-${file.name}`, bytes, {
        access: "public",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      blobUrl = blob.url;
    }
    const parsed = await parseWorkbook(tempPath, file.name);
    const importId = await saveImport({ uploadedBy: auth.user.id, fileName: file.name, blobUrl, parsed });
    return NextResponse.json({ ok: true, importId, meta: parsed.meta });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}
