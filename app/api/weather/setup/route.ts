import { NextRequest, NextResponse } from "next/server";
import { weatherService } from "@/lib/weather";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(await weatherService.setup(), { headers: { "Cache-Control": "no-store" } }); }
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ success: false, message: "Request origin does not match." }, { status: 403 });
  try {
    const text = await request.text();
    if (text.length > 2048) return NextResponse.json({ success: false, message: "Weather settings are too large." }, { status: 413 });
    const result = await weatherService.save(JSON.parse(text));
    return NextResponse.json(result, { status: result.success ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ success: false, message: "Enter valid weather settings." }, { status: 400 }); }
}
