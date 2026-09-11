"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, ExternalLink, Lightbulb, Play, Pause, Power, Tv, Disc, Speaker } from "lucide-react";
import { COLLECTIBLES } from "../collectibles";
import { RetroMediaCenter, RetroTv, DvdPlayer, StudioSpeaker } from "../../components/RetroMediaCenter";

export default function DesignSystemPage() {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [lightsOn, setLightsOn] = useState(true);
  const [lightIntensity, setLightIntensity] = useState(0.85);
  const [mediaMode, setMediaMode] = useState<"all" | "tv-only" | "tv-deck" | "deck-only" | "speakers-only">("all");
  const [mediaChannel, setMediaChannel] = useState<"pon" | "ambient" | "static" | "video">("pon");
  const [mediaPlaying, setMediaPlaying] = useState(true);

  const copy = (val: string, name: string) => {
    navigator.clipboard.writeText(val);
    setCopiedToken(name);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const colors = [
    { name: "Obsidian (Canvas)", token: "--color-black", hex: "#000000", role: "Absolute void background" },
    { name: "Espresso (Section)", token: "--color-bg", hex: "#0c0805", role: "Deep warm neutral surface" },
    { name: "Walnut Dark (Cabinet)", token: "--cabinet-wood-dark", hex: "#140d08", role: "Cabinet wood interior" },
    { name: "Walnut Border", token: "--cabinet-border", hex: "#23160e", role: "Architectural frame borders" },
    { name: "Bevel Highlight", token: "--cabinet-border-light", hex: "#523722", role: "Top chamfer light bounce" },
    { name: "Lavender White", token: "--color-text-1", hex: "#f4f1ff", role: "High-contrast text" },
    { name: "Peach Glow (Primary)", token: "--color-primary", hex: "#fea480", role: "Main accent & interactive" },
    { name: "Bronze (Secondary)", token: "--color-secondary", hex: "#a4805c", role: "Metallic labels & secondary text" },
    { name: "Champagne (Highlight)", token: "--color-accent", hex: "#ffe2b7", role: "LED core & text highlights" },
    { name: "Coffee (Borders)", token: "--color-neutral-200", hex: "#3a3129", role: "Subtle borders & outlines" },
  ];

  const typography = [
    { role: "Display 7xl", face: "SuisseIntl", size: "72px", tracking: "-0.05em", weight: "400", sample: "Technical Noir" },
    { role: "Heading 5xl", face: "SuisseIntl", size: "36px", tracking: "-0.025em", weight: "500", sample: "Continuous Progression" },
    { role: "Subheading 2xl", face: "SuisseIntl", size: "23.52px", tracking: "normal", weight: "500", sample: "Projects Hail Mary" },
    { role: "Digital Readout", face: "digital7Mono", size: "17.2px", tracking: "3.1px", weight: "400", sample: "12:00:26 EST. 2026" },
    { role: "Body Base", face: "SuisseIntl", size: "16px", tracking: "normal", weight: "400", sample: "Every environment tells a different story." },
    { role: "Technical Mono", face: "vt323", size: "16px", tracking: "1px", weight: "400", sample: "> BOOT_SEQUENCE_COMPLETE_SYS9" },
    { role: "Micro Caption", face: "SuisseIntl", size: "11.2px", tracking: "1.34px", weight: "500", sample: "MODULAR WORKSTATION ARCHITECTURE" },
  ];

  return (
    <div style={{ background: "#0c0805", color: "#f4f1ff", minHeight: "100vh", fontFamily: "var(--sans)", padding: "32px 24px 80px" }}>
      {/* Top Header */}
      <div style={{ maxWidth: "1160px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #23160e", paddingBottom: "20px" }}>
        <div>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: "8px", font: "10px var(--mono)", color: "#fea480", textDecoration: "none", marginBottom: "8px" }}>
            <ArrowLeft size={13} /> BACK TO WORKSPACE
          </Link>
          <h1 style={{ font: "600 32px var(--sans)", margin: 0, letterSpacing: "-0.5px" }}>Design System & Live Spec</h1>
          <p style={{ font: "13px var(--sans)", color: "#a4805c", margin: "4px 0 0" }}>
            WorkOS Launch Week Summer 2026 · Extracted Tokens, Shelf Architecture & Retro Props
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button
            onClick={() => setLightsOn(!lightsOn)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              font: "10px var(--mono)",
              background: lightsOn ? "#fea48022" : "#18110b",
              border: `1px solid ${lightsOn ? "#fea480" : "#3a3129"}`,
              color: lightsOn ? "#fea480" : "#a4805c",
              padding: "8px 14px",
              borderRadius: "3px",
              cursor: "pointer"
            }}
          >
            <Lightbulb size={14} /> LED STRIP LIGHTS: {lightsOn ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      <main style={{ maxWidth: "1160px", margin: "40px auto 0", display: "flex", flexDirection: "column", gap: "50px" }}>

        {/* 1. REFERENCE CABINET RECREATION (The User's Photo) */}
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "16px" }}>
            <div>
              <span style={{ font: "9px var(--mono)", color: "#fea480", letterSpacing: "1.5px" }}>COMPONENT SHOWCASE · 01</span>
              <h2 style={{ font: "600 22px var(--sans)", margin: "4px 0 0" }}>WorkOS Reference Cabinet Reconstruction</h2>
              <p style={{ font: "12px var(--sans)", color: "#a4805c", margin: "2px 0 0" }}>
                3-column dark walnut cubby architecture with downward overhead LED strip wash and framed Hail Mary centerpiece.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", font: "10px var(--mono)", color: "#cfaa71" }}>
              <span>Intensity:</span>
              <input
                type="range"
                min="0.2"
                max="1"
                step="0.05"
                value={lightIntensity}
                onChange={e => setLightIntensity(Number(e.target.value))}
                style={{ accentColor: "#fea480", width: "80px" }}
              />
              <span>{Math.round(lightIntensity * 100)}%</span>
            </div>
          </div>

          {/* Authentic Cabinet Frame matching the reference photo */}
          <div
            style={{
              width: "100%",
              height: "560px",
              borderRadius: "4px",
              overflow: "hidden",
              border: "12px solid #140d08",
              boxShadow: "0 25px 60px rgba(0,0,0,0.95), inset 0 0 0 2px #382417",
              background: "#0c0805",
            }}
          >
            <div
              className="cabinet-view"
              style={{
                height: "100%",
                gridTemplateColumns: "280px 1fr 280px",
                opacity: 1,
              }}
            >
              {/* CUBBY 1: Top-Left (Science Kit / Microscope + Flasks) */}
              <div className="cubby-cell" title="Science Kit · Hover to illuminate">
                {lightsOn && (
                  <div className="cubby-led-strip" style={{ opacity: lightIntensity }}>
                    <div className="cubby-led-bar" />
                    <div className="cubby-led-wash" />
                  </div>
                )}
                <div className="cubby-prop">
                  <img
                    className="prop-off"
                    src="https://dotcom.workos.com/images/launch-week/summer-2026/shelf-items/science-kit-off.avif"
                    alt="Science Kit Microscope"
                  />
                  <img
                    className="prop-on"
                    src="https://dotcom.workos.com/images/launch-week/summer-2026/shelf-items/science-kit-on.avif"
                    alt=""
                    aria-hidden
                  />
                </div>
              </div>

              {/* CUBBY 2: Center Tall (Framed Projects Hail Mary Poster) */}
              <div className="cubby-cell tall-center" title="Projects Hail Mary Centerpiece Poster">
                {lightsOn && (
                  <div className="cubby-led-strip" style={{ opacity: lightIntensity }}>
                    <div className="cubby-led-bar" />
                    <div className="cubby-led-wash" />
                  </div>
                )}
                <div className="framed-poster">
                  <div className="framed-poster-art">
                    <div className="poster-galaxy" />
                    <div className="framed-poster-tagline">
                      EVERY ENVIRONMENT<br />TELLS A DIFFERENT STORY
                    </div>
                    <div className="framed-poster-bottom">
                      <p className="framed-poster-desc">
                        MANAGE DEVELOPMENT, STAGING, AND PRODUCTION UNDER ONE PROJECT, WITH UNIQUE BRANDING FOR EACH.
                      </p>
                      <div className="framed-poster-logos">
                        <span>П</span>
                        <span>◇</span>
                        <span>▲</span>
                        <span>◎</span>
                        <span>◈</span>
                        <span>⏣</span>
                        <span>▼</span>
                        <span>H</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* CUBBY 3: Top-Right (Vintage iMac with Astronaut) */}
              <div className="cubby-cell" title="iMac Classic (404 Error Dialog with Astronaut)">
                {lightsOn && (
                  <div className="cubby-led-strip" style={{ opacity: lightIntensity }}>
                    <div className="cubby-led-bar" />
                    <div className="cubby-led-wash" />
                  </div>
                )}
                <div className="cubby-prop">
                  <img
                    className="prop-off"
                    src="https://dotcom.workos.com/images/launch-week/summer-2026/shelf-items/imac-on.avif"
                    alt="iMac Classic with Astronaut"
                  />
                  <img
                    className="prop-on"
                    src="https://dotcom.workos.com/images/launch-week/summer-2026/shelf-items/imac-off.avif"
                    alt=""
                    aria-hidden
                  />
                </div>
              </div>

              {/* CUBBY 4: Bottom-Left (3D Printer with Geodesic Model) */}
              <div className="cubby-cell" title="3D Printer · Hover to illuminate">
                {lightsOn && (
                  <div className="cubby-led-strip" style={{ opacity: lightIntensity }}>
                    <div className="cubby-led-bar" />
                    <div className="cubby-led-wash" />
                  </div>
                )}
                <div className="cubby-prop">
                  <img
                    className="prop-off"
                    src="https://dotcom.workos.com/images/launch-week/summer-2026/shelf-items/3d-printer-off.avif"
                    alt="3D Printer"
                  />
                  <img
                    className="prop-on"
                    src="https://dotcom.workos.com/images/launch-week/summer-2026/shelf-items/3d-printer-on.avif"
                    alt=""
                    aria-hidden
                  />
                </div>
              </div>

              {/* CUBBY 5: Bottom-Right (Spaceship Probe on Museum Stand) */}
              <div className="cubby-cell" title="Hail Mary Model Ship on Stand">
                {lightsOn && (
                  <div className="cubby-led-strip" style={{ opacity: lightIntensity }}>
                    <div className="cubby-led-bar" />
                    <div className="cubby-led-wash" />
                  </div>
                )}
                <div className="cubby-prop">
                  <img
                    className="prop-off"
                    src="https://dotcom.workos.com/images/launch-week/summer-2026/shelf-items/ship-off.avif"
                    alt="Model Ship"
                  />
                  <img
                    className="prop-on"
                    src="https://dotcom.workos.com/images/launch-week/summer-2026/shelf-items/ship-on.avif"
                    alt=""
                    aria-hidden
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. COLOR TOKENS PALETTE */}
        <section>
          <span style={{ font: "9px var(--mono)", color: "#fea480", letterSpacing: "1.5px" }}>TOKENS · 02</span>
          <h2 style={{ font: "600 22px var(--sans)", margin: "4px 0 16px" }}>Color Palette & Surfaces</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "16px" }}>
            {colors.map((c) => (
              <div
                key={c.token}
                onClick={() => copy(c.hex, c.token)}
                style={{
                  background: "#140d08",
                  border: "1px solid #23160e",
                  borderRadius: "4px",
                  padding: "12px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div
                  style={{
                    height: "64px",
                    borderRadius: "3px",
                    background: c.hex,
                    border: "1px solid rgba(255,255,255,0.1)",
                    marginBottom: "10px",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <b style={{ font: "12px var(--sans)", color: "#f4f1ff" }}>{c.name}</b>
                  {copiedToken === c.token ? <Check size={14} color="#8aff71" /> : <Copy size={13} color="#a4805c" />}
                </div>
                <div style={{ font: "10px var(--mono)", color: "#fea480", marginTop: "4px" }}>{c.hex}</div>
                <div style={{ font: "9px var(--mono)", color: "#887153", marginTop: "2px" }}>{c.token}</div>
                <div style={{ font: "9px var(--sans)", color: "#a4805c", marginTop: "6px", lineHeight: 1.3 }}>{c.role}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 3. TYPOGRAPHY SCALE */}
        <section>
          <span style={{ font: "9px var(--mono)", color: "#fea480", letterSpacing: "1.5px" }}>TYPOGRAPHY · 03</span>
          <h2 style={{ font: "600 22px var(--sans)", margin: "4px 0 16px" }}>Type Hierarchy & Mono Font Specs</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", background: "#140d08", border: "1px solid #23160e", borderRadius: "4px", padding: "24px" }}>
            {typography.map((t, idx) => (
              <div
                key={idx}
                style={{
                  display: "grid",
                  gridTemplateColumns: "180px 1fr",
                  alignItems: "baseline",
                  paddingBottom: "14px",
                  borderBottom: idx < typography.length - 1 ? "1px solid #23160e" : "none",
                }}
              >
                <div>
                  <div style={{ font: "11px var(--mono)", color: "#fea480" }}>{t.role}</div>
                  <div style={{ font: "9px var(--mono)", color: "#887153" }}>
                    {t.face} · {t.size} · {t.tracking}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: `var(--${t.face === "digital7Mono" ? "body" : t.face === "vt323" ? "mono" : "sans"})`,
                    fontSize: t.size,
                    letterSpacing: t.tracking,
                    fontWeight: Number(t.weight),
                    color: t.face === "digital7Mono" ? "#8aff71" : "#f4f1ff",
                    textShadow: t.face === "digital7Mono" ? "0 0 8px rgba(138,255,113,0.5)" : "none",
                  }}
                >
                  {t.sample}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4. RETRO COLLECTIBLES CATALOG (All 17 Props) */}
        <section>
          <span style={{ font: "9px var(--mono)", color: "#fea480", letterSpacing: "1.5px" }}>INTERACTIVE PROPS · 04</span>
          <h2 style={{ font: "600 22px var(--sans)", margin: "4px 0 4px" }}>17 Extracted Retro Shelf Collectibles</h2>
          <p style={{ font: "12px var(--sans)", color: "#a4805c", margin: "0 0 16px" }}>
            Hover over any item to preview the dual-state neon crossfade animation directly from the WorkOS shelf engine.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "14px" }}>
            {COLLECTIBLES.map((c) => (
              <div
                key={c.id}
                className="picker-thumb"
                style={{ height: "135px" }}
              >
                <div style={{ width: "75px", height: "75px", position: "relative" }}>
                  <img
                    src={c.offSrc}
                    alt={c.label}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>
                <span style={{ font: "9px var(--mono)", color: "#f4f1ff", textAlign: "center" }}>{c.label}</span>
                <span style={{ font: "7px var(--mono)", color: "#a4805c", textTransform: "uppercase" }}>{c.category}</span>
                {c.href && <i className="picker-link-dot" title="Has action URL" />}
              </div>
            ))}
          </div>
        </section>

        {/* 5. EXTRACTED RETRO MEDIA CENTER (TV, DVD PLAYER & SPEAKERS) */}
        <section style={{ background: "#110b07", border: "1px solid #291b12", borderRadius: "6px", padding: "28px", boxShadow: "0 20px 50px rgba(0,0,0,0.8)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "24px" }}>
            <div>
              <span style={{ font: "9px var(--mono)", color: "#fea480", letterSpacing: "1.5px" }}>EXTRACTED COMPONENT SUITE · 05</span>
              <h2 style={{ font: "600 24px var(--sans)", margin: "4px 0 6px", color: "#f4f1ff" }}>
                Retro Media Center: CRT TV, DVD Player Deck & Studio Monitors
              </h2>
              <p style={{ font: "13px var(--sans)", color: "#a4805c", margin: 0, maxWidth: "700px", lineHeight: "1.5" }}>
                Extracted faithfully from the anime/cyberpunk media workstation reference. Features modular rabbit-ear antennas,
                curved CRT phosphor display with &quot;PON!&quot; comic graphics and 25% SUPER starburst badge, rotary tuning dials,
                motorized red tape slot with rotating reels, dancing LED VU spectrum meters, &quot;OXO&quot; branding, and pulsing studio monitors.
              </p>
            </div>

            {/* Interactive Control Toolbar */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-end" }}>
              {/* Mode Selector */}
              <div style={{ display: "flex", gap: "6px", background: "#1a120b", padding: "4px", borderRadius: "4px", border: "1px solid #3c2a1c" }}>
                {(
                  [
                    { id: "all", label: "Full Station" },
                    { id: "tv-only", label: "TV Only" },
                    { id: "tv-deck", label: "TV + Deck" },
                    { id: "deck-only", label: "Deck Only" },
                    { id: "speakers-only", label: "Speakers" }
                  ] as const
                ).map(m => (
                  <button
                    key={m.id}
                    onClick={() => setMediaMode(m.id)}
                    style={{
                      font: "9px var(--mono)",
                      letterSpacing: "0.8px",
                      padding: "5px 10px",
                      borderRadius: "3px",
                      background: mediaMode === m.id ? "#fea48028" : "transparent",
                      border: `1px solid ${mediaMode === m.id ? "#fea480" : "transparent"}`,
                      color: mediaMode === m.id ? "#fea480" : "#a4805c",
                      cursor: "pointer",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Channel Selector */}
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <span style={{ font: "9px var(--mono)", color: "#cfaa71" }}>CRT Channel:</span>
                {(["pon", "ambient", "static", "video"] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => setMediaChannel(c)}
                    style={{
                      font: "8px var(--mono)",
                      letterSpacing: "0.6px",
                      padding: "4px 8px",
                      borderRadius: "2px",
                      background: mediaChannel === c ? "#c20048" : "#241910",
                      border: `1px solid ${mediaChannel === c ? "#ff3b7c" : "#3c2a1c"}`,
                      color: mediaChannel === c ? "#ffffff" : "#a4805c",
                      cursor: "pointer",
                      textTransform: "uppercase"
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Live Component Stage */}
          <div
            style={{
              background: "radial-gradient(ellipse at 50% 50%, #20140e 0%, #0c0805 100%)",
              border: "1px solid #3c2a1c",
              borderRadius: "4px",
              padding: "40px 20px 30px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: "440px",
              boxShadow: "inset 0 0 40px rgba(0,0,0,0.9)",
              position: "relative",
              overflow: "hidden"
            }}
          >
            {/* Background Ambient Cyberpunk Grid lines */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: "radial-gradient(#fea48014 1px, transparent 1px)",
                backgroundSize: "16px 16px",
                pointerEvents: "none",
                opacity: 0.7
              }}
            />

            <RetroMediaCenter
              mode={mediaMode}
              channel={mediaChannel}
              initialPlaying={mediaPlaying}
              onPlayChange={setMediaPlaying}
              scale={1}
            />
          </div>

          {/* Subcomponent Gallery breakdown */}
          <div style={{ marginTop: "32px" }}>
            <h3 style={{ font: "600 16px var(--sans)", margin: "0 0 14px", color: "#f4f1ff" }}>
              Modular Standalone Subcomponents
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
              {/* 1. CRT Television */}
              <div style={{ background: "#18100a", border: "1px solid #2f1e14", borderRadius: "4px", padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Tv size={14} color="#fea480" />
                    <span style={{ font: "11px var(--mono)", color: "#fea480" }}>&lt;RetroTv /&gt;</span>
                  </div>
                  <span style={{ font: "8px var(--mono)", color: "#a4805c" }}>CRT PHOSPHOR</span>
                </div>
                <div style={{ display: "flex", justifyContent: "center", padding: "10px 0", transform: "scale(0.82)", transformOrigin: "top center", height: "260px" }}>
                  <RetroTv channel={mediaChannel} isPlaying={mediaPlaying} />
                </div>
                <p style={{ font: "11px var(--sans)", color: "#a4805c", margin: "10px 0 0", lineHeight: "1.4" }}>
                  Rotary channel tuner, fine-tuning knobs, triple RGB sliders, and rabbit-ear antenna.
                </p>
              </div>

              {/* 2. DVD / VCR Player Deck */}
              <div style={{ background: "#18100a", border: "1px solid #2f1e14", borderRadius: "4px", padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Disc size={14} color="#fea480" />
                    <span style={{ font: "11px var(--mono)", color: "#fea480" }}>&lt;DvdPlayer /&gt;</span>
                  </div>
                  <span style={{ font: "8px var(--mono)", color: "#a4805c" }}>OXO DECK</span>
                </div>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "20px 0", height: "260px" }}>
                  <DvdPlayer isPlaying={mediaPlaying} onPlayToggle={() => setMediaPlaying(p => !p)} />
                </div>
                <p style={{ font: "11px var(--sans)", color: "#a4805c", margin: "10px 0 0", lineHeight: "1.4" }}>
                  Motorized red tape slot, spinning reels, 8-channel LED VU meter, gold ROM cart, and &quot;Press to Play&quot; glow.
                </p>
              </div>

              {/* 3. Studio Monitor Speaker */}
              <div style={{ background: "#18100a", border: "1px solid #2f1e14", borderRadius: "4px", padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Speaker size={14} color="#fea480" />
                    <span style={{ font: "11px var(--mono)", color: "#fea480" }}>&lt;StudioSpeaker /&gt;</span>
                  </div>
                  <span style={{ font: "8px var(--mono)", color: "#a4805c" }}>LEFT &amp; RIGHT</span>
                </div>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "20px", padding: "15px 0", height: "260px" }}>
                  <StudioSpeaker position="left" isPlaying={mediaPlaying} />
                  <StudioSpeaker position="right" isPlaying={mediaPlaying} />
                </div>
                <p style={{ font: "11px var(--sans)", color: "#a4805c", margin: "10px 0 0", lineHeight: "1.4" }}>
                  Silk dome tweeter, animated pulsing woofer cone, and authentic coiled snake audio cable.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 6. QUICK-COPY SPEC CODE */}
        <section style={{ background: "#140d08", border: "1px solid #23160e", borderRadius: "4px", padding: "24px" }}>
          <span style={{ font: "9px var(--mono)", color: "#fea480", letterSpacing: "1.5px" }}>READY-TO-USE CODE · 06</span>
          <h2 style={{ font: "600 20px var(--sans)", margin: "4px 0 16px" }}>Component Import &amp; Usage Snippets</h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ font: "10px var(--mono)", color: "#cfaa71" }}>React Component Usage</span>
                <button
                  onClick={() => copy(`import { RetroMediaCenter, RetroTv, DvdPlayer, StudioSpeaker } from "@/components/RetroMediaCenter";

// 1. Full All-in-One Media Rig
<RetroMediaCenter mode="all" channel="pon" />

// 2. Individual Modular Components
<RetroTv channel="pon" />
<DvdPlayer />
<StudioSpeaker position="left" />`, "react-usage")}
                  style={{ display: "flex", alignItems: "center", gap: "4px", font: "9px var(--mono)", color: "#fea480", background: "none", border: "none", cursor: "pointer" }}
                >
                  {copiedToken === "react-usage" ? <Check size={11} /> : <Copy size={11} />}
                  {copiedToken === "react-usage" ? "COPIED" : "COPY CODE"}
                </button>
              </div>
              <pre
                style={{
                  background: "#0c0805",
                  border: "1px solid #3a3129",
                  padding: "14px",
                  borderRadius: "3px",
                  font: "11px/1.6 var(--mono)",
                  color: "#fea480",
                  overflowX: "auto",
                  margin: 0
                }}
              >
{`import { RetroMediaCenter, RetroTv, DvdPlayer, StudioSpeaker } from "@/components/RetroMediaCenter";

// 1. Full All-in-One Media Rig (TV, DVD deck, and Studio Monitors)
<RetroMediaCenter mode="all" channel="pon" initialPlaying={true} />

// 2. Individual Modular Components
<RetroTv channel="pon" />
<DvdPlayer />
<StudioSpeaker position="left" />`}
              </pre>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ font: "10px var(--mono)", color: "#cfaa71" }}>CSS Overhead LED Strip Fixture</span>
                <button
                  onClick={() => copy(`/* Overhead Linear LED Strip Fixture */
.cubby-led-bar {
  position: absolute;
  top: 0; left: 12px; right: 12px;
  height: 3px;
  background: linear-gradient(90deg, transparent 2%, #ffe2b7 20%, #ffffff 50%, #ffe2b7 80%, transparent 98%);
  box-shadow: 0 0 10px #fea480, 0 1px 18px #fea480, 0 4px 28px #a4805c;
}

/* Downward Warm Copper Wash */
.cubby-led-wash {
  position: absolute;
  top: 0; left: -10%; right: -10%; height: 100%;
  background: radial-gradient(ellipse at 50% 0%, rgba(254,164,128,0.48) 0%, rgba(164,128,92,0.22) 38%, rgba(12,8,5,0) 78%);
}`, "css-led")}
                  style={{ display: "flex", alignItems: "center", gap: "4px", font: "9px var(--mono)", color: "#fea480", background: "none", border: "none", cursor: "pointer" }}
                >
                  {copiedToken === "css-led" ? <Check size={11} /> : <Copy size={11} />}
                  {copiedToken === "css-led" ? "COPIED" : "COPY CSS"}
                </button>
              </div>
              <pre
                style={{
                  background: "#0c0805",
                  border: "1px solid #3a3129",
                  padding: "14px",
                  borderRadius: "3px",
                  font: "11px/1.6 var(--mono)",
                  color: "#fea480",
                  overflowX: "auto",
                  margin: 0
                }}
              >
{`/* Overhead Linear LED Strip Fixture */
.cubby-led-bar {
  position: absolute;
  top: 0; left: 12px; right: 12px;
  height: 3px;
  background: linear-gradient(90deg, transparent 2%, #ffe2b7 20%, #ffffff 50%, #ffe2b7 80%, transparent 98%);
  box-shadow: 0 0 10px #fea480, 0 1px 18px #fea480, 0 4px 28px #a4805c;
}

/* Downward Warm Copper Wash */
.cubby-led-wash {
  position: absolute;
  top: 0; left: -10%; right: -10%; height: 100%;
  background: radial-gradient(ellipse at 50% 0%, rgba(254,164,128,0.48) 0%, rgba(164,128,92,0.22) 38%, rgba(12,8,5,0) 78%);
}`}
              </pre>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
