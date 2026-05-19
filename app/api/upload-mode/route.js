import { NextResponse } from "next/server";
import { requireAdmin } from "../../../lib/auth.js";

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  return NextResponse.json({
    directBlobUpload: Boolean(process.env.BLOB_READ_WRITE_TOKEN && process.env.SOURCE_FILE_STORAGE === "vercel_blob_public"),
    maxServerUploadBytes: 4 * 1024 * 1024
  });
}
