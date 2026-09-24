"use client";

import type { TvSignalScreenMode, VisionEyeDirection } from "./vision-eye-navigation";

interface VisionEyeEntityProps {
  mode: Exclude<TvSignalScreenMode, "default">;
  direction: VisionEyeDirection | null;
  channel: string;
  activating?: boolean;
}

export function VisionEyeEntity({ mode, direction, channel, activating = false }: VisionEyeEntityProps) {
  const id = channel.replaceAll(" ", "-").toLowerCase();

  return (
    <div className={`vision-eye-receiver vision-eye-receiver--${mode} vision-eye-receiver--${direction ?? "still"}${activating ? " is-activating" : ""}`} aria-hidden="true">
      <div className="vision-eye-receiver__atmosphere" />
      <div className="vision-eye-receiver__flash" />
      <div className="vision-eye-receiver__static" />
      <div className="vision-eye-receiver__scanline" />

      <div className="vision-eye-entity">
        <svg className="fairy-eye" viewBox="0 0 200 200" role="presentation">
          <defs>
            <radialGradient id={`fairy-aura-${id}`} cx="50%" cy="48%" r="52%">
              <stop offset="0" stopColor="#f8fdff" stopOpacity=".9" />
              <stop offset=".18" stopColor="#80c9ff" stopOpacity=".72" />
              <stop offset=".52" stopColor="#2478ed" stopOpacity=".36" />
              <stop offset="1" stopColor="#061b55" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`fairy-aperture-${id}`} x1=".18" y1=".12" x2=".84" y2=".9">
              <stop offset="0" stopColor="#274aaf" />
              <stop offset=".5" stopColor="#102f7d" />
              <stop offset="1" stopColor="#071b54" />
            </linearGradient>
            <linearGradient id={`fairy-iris-${id}`} x1=".2" y1=".08" x2=".78" y2=".9">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset=".52" stopColor="#e9f7ff" />
              <stop offset="1" stopColor="#9ed7ff" />
            </linearGradient>
            <radialGradient id={`fairy-pupil-${id}`} cx="40%" cy="34%" r="64%">
              <stop offset="0" stopColor="#173d80" />
              <stop offset=".64" stopColor="#0a2b66" />
              <stop offset="1" stopColor="#061b49" />
            </radialGradient>
            <filter id={`fairy-soft-glow-${id}`} x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="8" />
            </filter>
            <filter id={`fairy-hot-glow-${id}`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2.8" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <circle className="fairy-eye__aura" cx="100" cy="100" r="91" fill={`url(#fairy-aura-${id})`} filter={`url(#fairy-soft-glow-${id})`} />
          <circle className="fairy-eye__orbit" cx="100" cy="100" r="83" fill="none" stroke="#bde9ff" strokeWidth="1.4" />
          <circle className="fairy-eye__orbit fairy-eye__orbit--broken" cx="100" cy="100" r="76" fill="none" stroke="#54a8ff" strokeWidth="1" strokeDasharray="2 7 18 8" />

          <g className="fairy-eye__orbital-fins" fill={`url(#fairy-aperture-${id})`} stroke="#498dff" strokeWidth="1">
            <path className="fairy-eye__orbital-fin fairy-eye__orbital-fin--nw" d="M43 69 31 50 51 31 70 43 62 61Z" />
            <path className="fairy-eye__orbital-fin fairy-eye__orbital-fin--ne" d="m130 43 19-12 20 19-12 19-19-8Z" />
            <path className="fairy-eye__orbital-fin fairy-eye__orbital-fin--se" d="m157 131 12 19-20 19-19-12 8-18Z" />
            <path className="fairy-eye__orbital-fin fairy-eye__orbital-fin--sw" d="m70 157-19 12-20-19 12-19 19 8Z" />
          </g>

          <g className="fairy-eye__assembly" filter={`url(#fairy-hot-glow-${id})`}>
            <circle className="fairy-eye__aperture" cx="100" cy="100" r="68" fill={`url(#fairy-aperture-${id})`} stroke="#3e7fe0" strokeWidth="2" />
            <circle className="fairy-eye__iris" cx="100" cy="100" r="51" fill="none" stroke={`url(#fairy-iris-${id})`} strokeWidth="25" />
            <circle className="fairy-eye__iris-edge" cx="100" cy="100" r="63.5" fill="none" stroke="#f4fcff" strokeWidth="1.5" opacity=".82" />
            <circle className="fairy-eye__iris-inner" cx="100" cy="100" r="37.5" fill="none" stroke="#78b9f4" strokeWidth="6" opacity=".92" />
            <g className="fairy-eye__pupil">
              <circle cx="100" cy="100" r="31" fill={`url(#fairy-pupil-${id})`} stroke="#66b8f3" strokeWidth="2" />
              <circle cx="100" cy="100" r="22" fill="#071a45" opacity=".72" />
              <ellipse className="fairy-eye__pupil-depth" cx="94" cy="92" rx="12" ry="9" fill="#2f68af" opacity=".24" />
            </g>
            <circle className="fairy-eye__specular" cx="126" cy="126" r="13" fill="#f6fcff" />
          </g>

          <g className="fairy-eye__ticks" stroke="#caefff" strokeWidth="2" strokeLinecap="round">
            <path d="M100 8v8M100 184v8M8 100h8M184 100h8" />
          </g>
        </svg>
        <span className="fairy-eye__baseline" />
      </div>

      <div className="vision-eye-receiver__readout"><span>{channel}</span><strong>FAIRY LINK</strong></div>
    </div>
  );
}
