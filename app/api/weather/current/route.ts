import { NextResponse } from "next/server";
import { weatherService } from "@/lib/weather";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(await weatherService.current(), { headers: { "Cache-Control": "no-store" } }); }
