import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { requireAdmin } from "../../../lib/auth.js";

export const runtime = "nodejs";

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  if (process.env.SOURCE_FILE_STORAGE !== "vercel_blob_public") {
    return NextResponse.json({ error: "Direct Blob upload is not enabled" }, { status: 400 });
  }

  const body = await request.json();
  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (_pathname, _clientPayload, _multipart) => ({
        allowedContentTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
        maximumSizeInBytes: 120 * 1024 * 1024,
        addRandomSuffix: true
      }),
      onUploadCompleted: async () => {}
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
