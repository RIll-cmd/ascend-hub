import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const COMMERCIAL_VIDEOS = [
  "/COMMERCIALS/AD1.mp4",
  "/COMMERCIALS/AD2.mp4",
  "/COMMERCIALS/AD3.mp4",
  "/COMMERCIALS/AD4.mp4",
  "/COMMERCIALS/AD6.mp4",
  "/COMMERCIALS/AD7.mp4",
  "/COMMERCIALS/AD8.mp4",
  "/COMMERCIALS/AD9.mp4",
  "/COMMERCIALS/AD10.mp4",
  "/COMMERCIALS/AD11.mp4",
  "/COMMERCIALS/AD12.mp4",
  "/COMMERCIALS/AD13.mp4",
  "/COMMERCIALS/AD14.mp4",
  "/COMMERCIALS/AD15.mp4"
];

export const SHOW_VIDEOS = [
  "/SHOWS/SHOW1.mp4",
  "/SHOWS/SHOW2.mp4",
  "/SHOWS/SHOW3.mp4",
  "/SHOWS/SHOW4.mp4",
  "/SHOWS/SHOW5.mp4",
  "/SHOWS/SGOW6.mp4",
  "/SHOWS/SHO7.mp4",
  "/SHOWS/SHOW%209.mp4",
  "/SHOWS/SHOW9.mp4",
  "/SHOWS/SHOW10.mp4"
];

export async function GET() {
  return NextResponse.json({
    success: true,
    channel: "VIDEO-0",
    commercials: COMMERCIAL_VIDEOS,
    shows: SHOW_VIDEOS,
    all: [...SHOW_VIDEOS, ...COMMERCIAL_VIDEOS],
    total: COMMERCIAL_VIDEOS.length + SHOW_VIDEOS.length
  });
}
