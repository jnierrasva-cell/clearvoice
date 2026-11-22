
import { NextRequest, NextResponse } from "next/server";

const UPSTREAM =
  "https://cdn.mezon.ai/AI/models/datas/noise_suppression/deepfilternet3";

const ALLOWED_FILES = [
  "v3/pkg/df_bg.wasm",
  "v3/models/DeepFilterNet3_onnx.tar.gz",
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const requestedPath = path.join("/");

    if (!ALLOWED_FILES.includes(requestedPath)) {
      return NextResponse.json(
        { error: "Asset not allowed" },
        { status: 404 }
      );
    }

    const upstreamResponse = await fetch(
      `${UPSTREAM}/${requestedPath}`,
      { cache: "force-cache" }
    );

    if (!upstreamResponse.ok) {
      return NextResponse.json(
        { error: "Unable to retrieve AI model asset" },
        { status: upstreamResponse.status }
      );
    }

    const contentType = requestedPath.endsWith(".wasm")
      ? "application/wasm"
      : "application/gzip";

    return new NextResponse(upstreamResponse.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("DeepFilter asset proxy error:", error);

    return NextResponse.json(
      { error: "Asset proxy failed" },
      { status: 500 }
    );
  }
}
