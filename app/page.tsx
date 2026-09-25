"use client";
import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Rnd } from "react-rnd";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  Columns,
  Crosshair,
  Download,
  Expand,
  Lightbulb,
  LightbulbOff,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  Tv,
  Disc,
  X,
  Check,
  Copy,
  ExternalLink,
  Radio,
  Key,
  RefreshCw,
  Search,
  Video,
  Film
} from "lucide-react";
import { synth } from "./synth";
import { loadLayout, initialLayout, saveMedia, getMedia, type Layout, type Item } from "./storage";
import { PosterArt } from "./art";
import { Digits } from "./digits";
import { useWorkspaceTools } from "./workspace-tools";
import { COLLECTIBLES, COLLECTIBLE_CATEGORIES, type CollectibleCategory, type CollectibleDef } from "./collectibles";
import {
  DEFAULT_SHELF_ROWS,
  loadCabinetRows,
  saveCabinetRows,
  createNewRow,
  ROW_TEMPLATES,
  type ShelfRow,
  type RowTemplateType
} from "./cabinet-data";
import { RetroMediaCenter, RetroTv, DvdPlayer, StudioSpeaker } from "../components/RetroMediaCenter";
import { RetroRoomHero } from "../components/RetroRoomHero";
import { ShelfTrimEditor } from "../components/ShelfTrimEditor";
import { CrtTvDisplay } from "../components/CrtTvDisplay";
import { RetroCdBrowserModal } from "../components/RetroCdBrowserModal";
import { ShelfStatusTv } from "../components/status/ShelfStatusTv";
import { AgentAuxiliaryPanel } from "../components/status/AgentAuxiliaryPanel";
import { VisionEyeNavigator } from "../components/status/VisionEyeNavigator";
import { buildAgentAuxiliaryModel } from "../components/status/agent-auxiliary-model";
import { getShelfSceneCameraMotion, type ShelfSceneCameraMotion } from "../components/status/shelf-tv-focus";
import { getShelfTvAssignment, resolveShelfTvService, type ShelfTvAssignment } from "../components/status/shelf-tv-assignment";
import {
  advanceTvSignalTransition,
  beginTvSignalTransition,
  createTvSignalState,
  findDirectionalVisionEyeTarget,
  getTvSignalScreenMode,
  getVisionEyeCommand,
  isVisionEyeKeyboardTarget,
  type VisionEyeTarget,
  type VisionEyeServiceId,
} from "../components/status/vision-eye-navigation";
import { findCrtConfigByCollectibleId, getCrtProfile } from "../components/crt-tv-config";
import { useStatusShelf } from "./status/use-status-shelf";

const chapters = [
  { id: "core", number: "01", title: "Core Engine", eyebrow: "BUILD YOUR FOUNDATION", tag: "FOUNDATION", color: "#e9aa63", description: "A clear direction. A stronger operating system.", specs: ["Define your personal mission and values", "Create a focused progression roadmap", "Choose the principles that guide your work"], art: "engine" },
  { id: "skills", number: "02", title: "Skill Trees", eyebrow: "UNLOCK YOUR POTENTIAL", tag: "GROWTH", color: "#8bbc8e", description: "Turn curiosity into capability, one branch at a time.", specs: ["Map the skills you want to develop", "Break each skill into deliberate practice", "Track experience and unlock your next level"], art: "tree" },
  { id: "habits", number: "03", title: "Habit Matrix", eyebrow: "SMALL ACTIONS. BIG SHIFTS.", tag: "CONSISTENCY", color: "#cfaa71", description: "Build a rhythm that works even on the ordinary days.", specs: ["Choose repeatable daily rituals", "Connect new habits to existing routines", "Review consistency without chasing perfection"], art: "matrix" },
  { id: "quests", number: "04", title: "System Quests", eyebrow: "MAKE THE NEXT MOVE", tag: "EXECUTION", color: "#ee8b62", description: "Give your ambition a destination and a next step.", specs: ["Turn a goal into a concrete quest", "Choose the next small, meaningful action", "Complete milestones and capture what you learned"], art: "quest" },
  { id: "analytics", number: "05", title: "Analytics", eyebrow: "REFLECT. REFINE. REPEAT.", tag: "INSIGHT", color: "#8ab8ba", description: "Find the signal in your progress. Adjust with intention.", specs: ["Review your completed milestones", "Spot patterns in your weekly rhythm", "Use your reflections to shape the next cycle"], art: "analytics" },
];

function Clock() {
  const [now, setNow] = useState<Date>();
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const value = now ? now.toLocaleTimeString("en-GB", { hour12: false }) : "00:00:00";
  return (
    <div className="clock-case">
      <div className="clock-label">LOCAL TIME <span>QUARTZ · VFD</span></div>
      <div className="clock-digits"><Digits value={value} /><time>{value}</time></div>
      <div className="clock-bottom"><i /> CONTINUOUSLY MOVING FORWARD <span>24H</span></div>
    </div>
  );
}

function Ambient({ playing = true, position = 0 }: { playing?: boolean; position?: number }) {
  return (
    <div className={`ambient ${playing ? "" : "paused"}`} style={{ "--offset": `${position % 60}s` } as CSSProperties}>
      <div className="stars" /><div className="orb" /><div className="mountains back" /><div className="mountains front" />
      <div className="horizon-grid" /><div className="transmission">ASCEND<span>THE NEXT LEVEL IS WITHIN.</span></div>
      <div className="screen-channel">AV 01 <span>● LIVE</span></div><div className="screen-bottom">ENDLESS POSSIBILITIES <span>∞</span></div>
    </div>
  );
}

function Television({ src, playing = true, position = 0, videoRef, onTime, onDuration }: { src?: string; playing?: boolean; position?: number; videoRef?: React.RefObject<HTMLVideoElement | null>; onTime?: (n: number) => void; onDuration?: (n: number) => void }) {
  return (
    <div className="television">
      <div className="tv-body">
        <div className="tv-bezel">
          <div className="crt-screen">
            {src ? (
              <video ref={videoRef} src={src} autoPlay={playing} muted loop playsInline onTimeUpdate={e => onTime?.(e.currentTarget.currentTime)} onLoadedMetadata={e => onDuration?.(e.currentTarget.duration)} />
            ) : (
              <Ambient playing={playing} position={position} />
            )}
            <div className="scanlines" /><div className="glass" />
          </div>
        </div>
        <div className="tv-panel">
          <b>SONORA</b><div className="dial"><i /></div><div className="dial small"><i /></div>
          <div className="speaker" /><div className="tv-power"><i /> POWER</div>
        </div>
      </div>
      <div className="tv-foot" /><div className="tv-caption">TRINITRON COLOR MONITOR <span>EST. 1996</span></div>
    </div>
  );
}

function Terminal() {
  return (
    <div className="terminal">
      <div className="terminal-shell">
        <div className="terminal-face">
          <div className="terminal-screen">
            <span>ASCEND SYSTEM 9</span>
            <pre>{"> boot sequence complete\n> loading your potential...\n> all systems operational\n\nREADY WHEN YOU ARE.\n\n> _"}</pre>
            <div className="scanlines" />
          </div>
          <div className="terminal-chin">◈ <i /></div>
        </div>
      </div>
      <div className="terminal-base" /><div className="keyboard" /><span className="terminal-label">PERSONAL PROGRESSION COMPUTER</span>
    </div>
  );
}

function ShelfItem({ item }: { item: Item }) {
  const cls = "shelf-item" + (item.shelfType === "long" ? " long" : "");
  return <div className={cls}><span>{item.title}</span><i /><i /></div>;
}

function LightItem({ item }: { item: Item }) {
  const c = item.lightColor || "#fea480", a = item.lightIntensity ?? 0.85;
  const r = parseInt(c.slice(1, 3), 16) || 254, g = parseInt(c.slice(3, 5), 16) || 164, b = parseInt(c.slice(5, 7), 16) || 128;
  const bg = `radial-gradient(ellipse 90% 70% at 50% 0%,rgba(${r},${g},${b},${a * 0.75}) 0%,rgba(${r},${g},${b},${a * 0.35}) 35%,rgba(12,8,5,0) 80%)`;
  return (
    <div className="light-item" style={{ position: "relative", width: "100%", height: "100%", pointerEvents: "none" }}>
      <div className="cubby-led-bar" style={{ position: "absolute", top: 0, left: 12, right: 12, height: 7, borderRadius: 4, filter: "blur(5px)", mixBlendMode: "screen", opacity: 0.95, background: `linear-gradient(90deg,transparent 0%,${c} 15%,#fff 50%,${c} 85%,transparent 100%)`, boxShadow: `0 0 10px #fff, 0 0 20px ${c}, 0 4px 30px ${c}` }} />
      <div className="cubby-led-wash" style={{ background: bg }} />
      <div className="cubby-floor-bounce" />
    </div>
  );
}

function CollectibleItem({ item }: { item: Item }) {
  const def = COLLECTIBLES.find(c => c.id === item.collectibleId);
  if (!def) return <div className="collectible-empty">?</div>;

  if (def.id === "media-station") {
    return (
      <div className="collectible-item-custom media-station-desk">
        <RetroMediaCenter mode="all" scale={0.42} />
      </div>
    );
  }
  if (def.id === "retro-tv-pon") {
    return (
      <div className="collectible-item-custom tv-pon-desk">
        <RetroTv channel="pon" className="shelf-fit-tv" />
      </div>
    );
  }
  if (def.id === "oxo-dvd-deck") {
    return (
      <div className="collectible-item-custom dvd-deck-desk">
        <DvdPlayer className="shelf-fit-deck" />
      </div>
    );
  }
  if (def.id === "studio-monitors") {
    return (
      <div className="collectible-item-custom studio-monitors-desk">
        <StudioSpeaker position="left" className="shelf-fit-speaker" />
      </div>
    );
  }

  const crtProfile = getCrtProfile(def.id);
  if (crtProfile) {
    return (
      <div className="collectible-item-custom crt-tv-collectible">
        <CrtTvDisplay
          instanceId={`item-${item.collectibleId || "tv"}`}
          profile={crtProfile}
        />
      </div>
    );
  }

  const inner = (
    <div className="collectible-item">
      <img className="collectible-off" src={def.offSrc} alt={def.label} draggable={false} />
      <img className="collectible-on" src={def.onSrc} alt="" draggable={false} aria-hidden />
      <span className="collectible-label">{item.title || def.label}</span>
    </div>
  );
  return def.href ? <a className="collectible-link" href={def.href} target="_blank" rel="noopener noreferrer">{inner}</a> : <>{inner}</>;
}

function ComponentPicker({ onAdd, onClose }: { onAdd: (def: CollectibleDef) => void; onClose: () => void }) {
  const [cat, setCat] = useState<CollectibleCategory>("all");
  const filtered = cat === "all" ? COLLECTIBLES : COLLECTIBLES.filter(c => c.category === cat);
  return (
    <Modal title="Component Library · Add to Workspace" onClose={onClose}>
      <div className="picker-cats">
        {COLLECTIBLE_CATEGORIES.map(c => (
          <button key={c} className={cat === c ? "active" : ""} onClick={() => setCat(c)}>{c.toUpperCase()}</button>
        ))}
      </div>
      <div className="picker-grid">
        {filtered.map(def => (
          <button key={def.id} className="picker-thumb" onClick={() => { onAdd(def); onClose(); }} aria-label={`Add ${def.label}`}>
            <img src={def.offSrc} alt={def.label} draggable={false} />
            <span>{def.label}</span>
            {def.href && <i className="picker-link-dot" title="Has action link" />}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function SlotPickerModal({
  onSelect,
  onClear,
  onClose
}: {
  onSelect: (def: CollectibleDef) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [cat, setCat] = useState<CollectibleCategory>("all");
  const filtered = cat === "all" ? COLLECTIBLES : COLLECTIBLES.filter(c => c.category === cat);
  return (
    <Modal title="Assign Collectible to Shelf Bay" onClose={onClose}>
      <div className="slot-dialog-actions">
        <button className="slot-dialog-btn danger" onClick={onClear}>
          <Trash2 size={13} /> Clear / Empty This Cubby
        </button>
      </div>
      <div className="picker-cats">
        {COLLECTIBLE_CATEGORIES.map(c => (
          <button key={c} className={cat === c ? "active" : ""} onClick={() => setCat(c)}>{c.toUpperCase()}</button>
        ))}
      </div>
      <div className="picker-grid">
        {filtered.map(def => (
          <button key={def.id} className="picker-thumb" onClick={() => onSelect(def)} aria-label={`Choose ${def.label}`}>
            <img src={def.offSrc} alt={def.label} draggable={false} />
            <span>{def.label}</span>
            {def.href && <i className="picker-link-dot" title="Has action link" />}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function RowTemplateModal({
  onSelect,
  onClose
}: {
  onSelect: (type: RowTemplateType) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="+ Add New Shelf Tier" onClose={onClose}>
      <div className="template-picker-grid">
        {ROW_TEMPLATES.map(tmpl => (
          <button
            key={tmpl.type}
            className="template-picker-card"
            onClick={() => onSelect(tmpl.type)}
          >
            <strong>+ {tmpl.label}</strong>
            <p>{tmpl.desc}</p>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose, classic = false }: { title: string; children: ReactNode; onClose: () => void; classic?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className={classic ? "modal classic" : "modal"} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-label={title}>
      <div className="modal-title"><span>{title}</span><button onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
      {children}
    </dialog>
  );
}

export default function Home() {
  const shelfStatus = useStatusShelf();
  const reduceMotion = useReducedMotion();
  const [layout, setLayout] = useState<Layout>(initialLayout);
  const [rows, setRows] = useState<ShelfRow[]>(DEFAULT_SHELF_ROWS);
  const [ready, setReady] = useState(false);
  const [edit, setEdit] = useState(false);
  const [sound, setSound] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [media, setMedia] = useState<Record<string, string>>({});
  const [toast, setToast] = useState("");
  const [laser, setLaser] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(120);
  const [volume, setVolume] = useState(.25);
  const [date, setDate] = useState("SEP 11, 2026");
  const [scale, setScale] = useState(1);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [presetMode, setPresetMode] = useState<"workspace" | "reference">("reference");
  const [slotPickerTarget, setSlotPickerTarget] = useState<{ rowId: string; bayId: string; slotId: string } | null>(null);
  const [rowTemplateModalOpen, setRowTemplateModalOpen] = useState(false);
  const [tvModalTab, setTvModalTab] = useState<"media-center" | "standard">("media-center");
  const [lightingMode, setLightingMode] = useState<"amber" | "magenta">("amber");
  const [shelfOffsetY, setShelfOffsetY] = useState<number>(-2);
  const [wallCoverHeight, setWallCoverHeight] = useState<number>(21);
  const [wallWidth, setWallWidth] = useState<number>(610);
  const [wallWidthMode, setWallWidthMode] = useState<"full" | "shelf" | "custom">("custom");
  const [wallOffsetX, setWallOffsetX] = useState<number>(-870);
  const [shelfTopCrop, setShelfTopCrop] = useState<number>(0);
  const [shelfCalibratorOpen, setShelfCalibratorOpen] = useState<boolean>(false);
  const [showTrimGuides, setShowTrimGuides] = useState<boolean>(false);
  const [focusedStatusTv, setFocusedStatusTv] = useState<{
    assignment: ShelfTvAssignment;
    motion: ShelfSceneCameraMotion;
    open: boolean;
  } | null>(null);
  const [tvSignalTransition, setTvSignalTransition] = useState(() =>
    createTvSignalState("ascend-core"),
  );
  const selectedVisionEyeServiceId = tvSignalTransition.activeTvId;
  const [visionEyeTargets, setVisionEyeTargets] = useState<readonly VisionEyeTarget[]>([]);
  const [visionEyeActivating, setVisionEyeActivating] = useState(false);
  const [cameraSceneElement, setCameraSceneElement] = useState<HTMLDivElement | null>(null);
  const [spotifyData, setSpotifyData] = useState<{
    isPlaying?: boolean;
    title?: string;
    artist?: string;
    album?: string;
    albumImageUrl?: string;
    songUrl?: string;
    progressMs?: number;
    durationMs?: number;
    connected?: boolean;
    device?: string;
    demoMode?: boolean;
  } | null>(null);
  const [spotifyModalOpen, setSpotifyModalOpen] = useState(false);
  const [spotifyNotice, setSpotifyNotice] = useState<string | null>(null);
  const [spotifyClientIdInput, setSpotifyClientIdInput] = useState("");
  const [spotifyClientSecretInput, setSpotifyClientSecretInput] = useState("");
  const [spotifySetupLoading, setSpotifySetupLoading] = useState(false);
  const [spotifyHasCreds, setSpotifyHasCreds] = useState<{
    hasClientId: boolean;
    hasClientSecret: boolean;
    demoMode: boolean;
    clientId?: string;
  }>({ hasClientId: false, hasClientSecret: false, demoMode: false });
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [showManualInputs, setShowManualInputs] = useState(false);

  interface YouTubeVideoResult {
    id: string;
    title: string;
    author: string;
    thumbnail: string;
    duration: string;
    views?: string;
    isLive: boolean;
  }

  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false);
  const [youtubeSearchQuery, setYoutubeSearchQuery] = useState("");
  const [youtubeSearchResults, setYoutubeSearchResults] = useState<YouTubeVideoResult[]>([]);
  const [youtubeSearching, setYoutubeSearching] = useState(false);
  const [currentPlayingYouTube, setCurrentPlayingYouTube] = useState<{
    id: string;
    title: string;
    author?: string;
    isLive?: boolean;
  } | null>(null);
  const [youtubeSearchLoaded, setYoutubeSearchLoaded] = useState(false);
  const [cdPlayerModalOpen, setCdPlayerModalOpen] = useState(false);

  const refreshSpotifyStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/spotify/currently-playing");
      if (!res.ok) return;
      const data = await res.json();
      setSpotifyData(data);
      if (zzzFrameRef.current?.contentWindow) {
        zzzFrameRef.current.contentWindow.postMessage(
          { type: "SPOTIFY_UPDATE", data },
          "*"
        );
      }
    } catch (_) {}
  }, []);

  const refreshSpotifySetup = useCallback(async () => {
    try {
      const res = await fetch("/api/spotify/setup");
      if (!res.ok) return;
      const data = await res.json();
      setSpotifyHasCreds(data);
    } catch (_) {}
  }, []);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/spotify/currently-playing");
        if (!res.ok) return;
        const data = await res.json();
        if (active) {
          setSpotifyData(data);
          if (zzzFrameRef.current?.contentWindow) {
            zzzFrameRef.current.contentWindow.postMessage(
              { type: "SPOTIFY_UPDATE", data },
              "*"
            );
          }
        }
      } catch (_) {}
    };

    poll();
    refreshSpotifySetup();
    const interval = setInterval(poll, 3000);

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const spotifyParam = params.get("spotify");
      const msg = params.get("message");
      if (spotifyParam) {
        if (spotifyParam === "missing_client_id") {
          setSpotifyNotice(
            "Spotify Client ID is required to use Spotify's OAuth API. You can enter your credentials below, or toggle Instant Demo Mode to test right away without an account!"
          );
          setSpotifyModalOpen(true);
        } else if (spotifyParam === "error") {
          setSpotifyNotice(`Spotify login error: ${msg || "Authentication was cancelled or failed."}`);
          setSpotifyModalOpen(true);
        } else if (spotifyParam === "connected") {
          setSpotifyNotice("✓ Spotify account connected successfully! Playback is now syncing live to the CRT TV.");
          setSpotifyModalOpen(true);
        }
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [refreshSpotifySetup]);

  const handleToggleDemo = async (enable: boolean) => {
    setSpotifySetupLoading(true);
    try {
      const res = await fetch("/api/spotify/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demoMode: enable }),
      });
      if (res.ok) {
        await refreshSpotifySetup();
        await refreshSpotifyStatus();
        notify(enable ? "⚡ Demo mode activated! Streaming Zenless Zone Zero OST to CRT TV" : "Demo mode turned off");
      }
    } catch (_) {
      notify("Failed to toggle demo mode");
    } finally {
      setSpotifySetupLoading(false);
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spotifyClientIdInput.trim()) {
      notify("Please enter your Spotify Client ID");
      return;
    }
    setSpotifySetupLoading(true);
    try {
      const res = await fetch("/api/spotify/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: spotifyClientIdInput.trim(),
          clientSecret: spotifyClientSecretInput.trim() || undefined,
          demoMode: false,
        }),
      });
      if (res.ok) {
        notify("Credentials saved! Redirecting to Spotify authorization...");
        window.location.href = `/api/spotify/login?client_id=${encodeURIComponent(spotifyClientIdInput.trim())}`;
      } else {
        notify("Failed to save credentials");
        setSpotifySetupLoading(false);
      }
    } catch (_) {
      notify("Error saving credentials");
      setSpotifySetupLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setSpotifySetupLoading(true);
    try {
      const res = await fetch("/api/spotify/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      if (res.ok) {
        await refreshSpotifySetup();
        await refreshSpotifyStatus();
        notify("Spotify disconnected and tokens reset");
      }
    } catch (_) {
      notify("Failed to disconnect");
    } finally {
      setSpotifySetupLoading(false);
    }
  };

  const copyRedirectUri = () => {
    const origin = typeof window !== "undefined" ? window.location.origin.replace("localhost", "127.0.0.1") : "http://127.0.0.1:5173";
    const uri = `${origin}/api/spotify/callback`;
    navigator.clipboard.writeText(uri).then(() => {
      setCopiedRedirect(true);
      notify("Copied 127.0.0.1 callback URL to clipboard!");
      setTimeout(() => setCopiedRedirect(false), 2000);
    });
  };

  const searchYouTube = useCallback(async (query: string) => {
    setYoutubeSearching(true);
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setYoutubeSearchResults(data.results || []);
        setYoutubeSearchLoaded(true);
      }
    } catch (_) {
      notify("Failed to search YouTube");
    } finally {
      setYoutubeSearching(false);
    }
  }, []);

  const handlePlayYouTube = (video: { id: string; title: string; author?: string; isLive?: boolean }) => {
    if (zzzFrameRef.current?.contentWindow) {
      zzzFrameRef.current.contentWindow.postMessage(
        {
          type: "PLAY_YOUTUBE",
          videoId: video.id,
          title: video.title,
          isLive: Boolean(video.isLive),
        },
        "*"
      );
      setCurrentPlayingYouTube({
        id: video.id,
        title: video.title,
        author: video.author,
        isLive: video.isLive,
      });
      notify(`▶ Broadcasting to CRT TV: ${(video.title || "Video").slice(0, 26)}...`);
    }
  };

  const handlePauseYouTube = () => {
    if (zzzFrameRef.current?.contentWindow) {
      zzzFrameRef.current.contentWindow.postMessage({ type: "PAUSE_YOUTUBE" }, "*");
      notify("Paused YouTube TV broadcast");
    }
  };

  const handleResumeYouTube = () => {
    if (zzzFrameRef.current?.contentWindow) {
      zzzFrameRef.current.contentWindow.postMessage({ type: "RESUME_YOUTUBE" }, "*");
      notify("Resumed YouTube TV broadcast");
    }
  };

  const handleStopYouTube = () => {
    if (zzzFrameRef.current?.contentWindow) {
      zzzFrameRef.current.contentWindow.postMessage({ type: "PAUSE_YOUTUBE" }, "*");
      setCurrentPlayingYouTube(null);
      notify("Stopped YouTube broadcast");
    }
  };

  const YOUTUBE_PRESETS = [
    { label: "☕ 24/7 Lofi Beats", query: "lofi hip hop radio live" },
    { label: "🌌 Synthwave Radio", query: "synthwave radio live" },
    { label: "🎮 Zenless Zone Zero OST", query: "zenless zone zero ost drowning in tears" },
    { label: "⚡ Cyberpunk 2077", query: "cyberpunk 2077 radio ost" },
    { label: "🎭 Persona 5 OST", query: "persona 5 beneath the mask" },
    { label: "☕ Chillhop Cafe", query: "chillhop cafe beats live" },
  ];

  const handleShelfOffsetChange = (val: number) => {
    setShelfOffsetY(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("ascend_shelf_offset_y", String(val));
    }
  };

  const handleWallCoverChange = (val: number) => {
    const clamped = Math.max(0, Math.min(650, val));
    setWallCoverHeight(clamped);
    if (typeof window !== "undefined") {
      localStorage.setItem("ascend_wall_cover_height", String(clamped));
    }
  };

  const handleWallWidthChange = (val: number) => {
    const clamped = Math.max(100, Math.min(2600, val));
    setWallWidth(clamped);
    setWallWidthMode("custom");
    if (typeof window !== "undefined") {
      localStorage.setItem("ascend_wall_width", String(clamped));
      localStorage.setItem("ascend_wall_width_mode", "custom");
    }
  };

  const handleWallWidthModeChange = (mode: "full" | "shelf" | "custom") => {
    setWallWidthMode(mode);
    if (mode === "shelf") {
      setWallWidth(1160);
      setWallOffsetX(0);
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("ascend_wall_width_mode", mode);
    }
  };

  const handleWallOffsetXChange = (val: number) => {
    const clamped = Math.max(-1400, Math.min(1400, val));
    setWallOffsetX(clamped);
    if (typeof window !== "undefined") {
      localStorage.setItem("ascend_wall_offset_x", String(clamped));
    }
  };

  const handleShelfTopCropChange = (val: number) => {
    const clamped = Math.max(0, Math.min(150, val));
    setShelfTopCrop(clamped);
    if (typeof window !== "undefined") {
      localStorage.setItem("ascend_shelf_top_crop", String(clamped));
    }
  };

  const handleResetAllTrim = () => {
    handleWallCoverChange(21);
    handleWallWidthChange(610);
    handleWallWidthModeChange("custom");
    handleWallOffsetXChange(-870);
    handleShelfOffsetChange(-2);
    handleShelfTopCropChange(0);
    notify("Trim restored to CB calibrated values");
  };

  const handleCopyTrimValues = () => {
    const text = `Wall Height: ${wallCoverHeight}px | Width: ${wallWidthMode === "full" ? "100%" : `${wallWidth}px`} | Offset X: ${wallOffsetX}px | Shelf Y: ${shelfOffsetY}px`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      notify("Trim calibration values copied to clipboard!");
    } else {
      notify(text);
    }
  };

  const stageRef = useRef<HTMLDivElement>(null);
  const cameraSceneRef = useRef<HTMLDivElement>(null);
  const cameraControlsRef = useRef<HTMLDivElement>(null);
  const cameraExitRef = useRef<HTMLButtonElement>(null);
  const cameraTriggerRef = useRef<HTMLButtonElement>(null);
  const visionEyeActivationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef("tv");
  const urls = useRef<Record<string, string>>({});
  const notify = (s: string) => setToast(s);
  const zzzFrameRef = useRef<HTMLIFrameElement>(null);
  const setCameraSceneNode = useCallback((node: HTMLDivElement | null) => {
    cameraSceneRef.current = node;
    setCameraSceneElement(node);
  }, []);
  const cameraMounted = focusedStatusTv !== null;
  const focusedService = focusedStatusTv
    ? shelfStatus.current?.services.find(
        service => service.serviceId === focusedStatusTv.assignment.serviceId,
      ) ?? null
    : null;
  const focusedAgentModel = focusedStatusTv
    ? buildAgentAuxiliaryModel({
        assignment: focusedStatusTv.assignment,
        service: focusedService,
        loading: shelfStatus.loading && !shelfStatus.current,
        error: shelfStatus.error,
        stale: Boolean(shelfStatus.stale),
        nowMs: shelfStatus.current ? Date.parse(shelfStatus.current.generatedAt) : 0,
      })
    : null;
  const selectedVisionEyeTarget = visionEyeTargets.find(
    target => target.serviceId === selectedVisionEyeServiceId,
  ) ?? null;

  const activateStatusTv = useCallback((
    assignment: ShelfTvAssignment,
    trigger: HTMLButtonElement,
    withEyeTransition: boolean,
  ) => {
    const scene = cameraSceneRef.current;
    const screen = trigger.querySelector<HTMLElement>(".shelf-status-tv__screen");
    if (!scene || !screen || focusedStatusTv) return;

    setTvSignalTransition(createTvSignalState(assignment.serviceId));
    if (visionEyeActivationTimerRef.current) {
      clearTimeout(visionEyeActivationTimerRef.current);
    }

    const openCamera = () => {
      const targetBounds = screen.getBoundingClientRect();
      const sceneBounds = scene.getBoundingClientRect();
      const focusArea = window.innerWidth > 860
        ? { left: 0, top: 0, width: window.innerWidth * 0.64, height: window.innerHeight }
        : undefined;

      cameraTriggerRef.current = trigger;
      setFocusedStatusTv({
        assignment,
        open: true,
        motion: getShelfSceneCameraMotion(
          { left: targetBounds.left, top: targetBounds.top, width: targetBounds.width, height: targetBounds.height },
          { left: sceneBounds.left, top: sceneBounds.top, width: sceneBounds.width, height: sceneBounds.height },
          { width: window.innerWidth, height: window.innerHeight },
          focusArea,
        ),
      });
      setVisionEyeActivating(false);
      visionEyeActivationTimerRef.current = null;
    };

    if (!withEyeTransition || reduceMotion) {
      openCamera();
      return;
    }

    setVisionEyeActivating(true);
    visionEyeActivationTimerRef.current = setTimeout(openCamera, 220);
  }, [focusedStatusTv, reduceMotion]);

  useEffect(() => {
    if (!cameraMounted) return;

    const previousOverflow = document.body.style.overflow;
    const focusFrame = requestAnimationFrame(() => cameraExitRef.current?.focus());
    const keepCameraFocused = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setFocusedStatusTv(current => current ? { ...current, open: false } : null);
      } else if (event.key === "Tab") {
        const focusables = Array.from(
          cameraControlsRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", keepCameraFocused);

    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keepCameraFocused);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => cameraTriggerRef.current?.focus());
      });
    };
  }, [cameraMounted]);

  const handleZzzLoad = () => {
    if (zzzFrameRef.current?.contentWindow) {
      zzzFrameRef.current.contentWindow.postMessage(
        { type: "SET_MUTE", muted: !sound },
        "*"
      );
    }
  };

  useEffect(() => {
    if (zzzFrameRef.current?.contentWindow) {
      zzzFrameRef.current.contentWindow.postMessage(
        { type: "SET_MUTE", muted: !sound },
        "*"
      );
    }
  }, [sound]);

  useEffect(() => {
    const saved = loadLayout();
    setLayout(saved);
    const savedRows = loadCabinetRows();
    setRows(savedRows);
    const savedLighting = typeof window !== "undefined" ? (localStorage.getItem("ascend_shelf_lighting") as "amber" | "magenta" | null) : null;
    if (savedLighting === "amber" || savedLighting === "magenta") {
      setLightingMode(savedLighting);
    }
    const savedShelfOffset = typeof window !== "undefined" ? localStorage.getItem("ascend_shelf_offset_y") : null;
    if (savedShelfOffset !== null) {
      const parsed = parseInt(savedShelfOffset, 10);
      if (!isNaN(parsed)) setShelfOffsetY(parsed);
    }
    const savedWallCover = typeof window !== "undefined" ? localStorage.getItem("ascend_wall_cover_height") : null;
    if (savedWallCover !== null) {
      const parsed = parseInt(savedWallCover, 10);
      if (!isNaN(parsed)) setWallCoverHeight(parsed);
    }
    const savedTopCrop = typeof window !== "undefined" ? localStorage.getItem("ascend_shelf_top_crop") : null;
    if (savedTopCrop !== null) {
      const parsed = parseInt(savedTopCrop, 10);
      if (!isNaN(parsed)) setShelfTopCrop(parsed);
    }
    const savedWallWidth = typeof window !== "undefined" ? localStorage.getItem("ascend_wall_width") : null;
    if (savedWallWidth !== null) {
      const parsed = parseInt(savedWallWidth, 10);
      if (!isNaN(parsed)) setWallWidth(parsed);
    }
    const savedWallWidthMode = typeof window !== "undefined" ? (localStorage.getItem("ascend_wall_width_mode") as "full" | "shelf" | "custom" | null) : null;
    if (savedWallWidthMode) setWallWidthMode(savedWallWidthMode);
    const savedWallOffsetX = typeof window !== "undefined" ? localStorage.getItem("ascend_wall_offset_x") : null;
    if (savedWallOffsetX !== null) {
      const parsed = parseInt(savedWallOffsetX, 10);
      if (!isNaN(parsed)) setWallOffsetX(parsed);
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("trim") === "true" || params.get("trim") === "1" || params.get("dev") === "true") {
      setShelfCalibratorOpen(true);
    }
    setReady(true);
    setDate(new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase());
    let disposed = false;
    Promise.all(Object.entries(saved.items).filter(([, i]) => i.mediaId).map(async ([id, item]) => {
      try {
        const blob = await getMedia(item.mediaId!);
        if (blob && !disposed) {
          const url = URL.createObjectURL(blob);
          urls.current[id] = url;
          setMedia(p => ({ ...p, [id]: url }));
        }
      } catch {
        if (!disposed) setToast("A saved media file could not be restored.");
      }
    }));
    return () => {
      disposed = true;
      Object.values(urls.current).forEach(URL.revokeObjectURL);
    };
  }, []);

  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem("ascend-os-layout-v1", JSON.stringify(layout));
      } catch {
        setToast("Storage is full. Export your layout to keep your changes.");
      }
    }
  }, [layout, ready]);

  useEffect(() => {
    if (ready) {
      saveCabinetRows(rows);
    }
  }, [rows, ready]);

  useEffect(() => {
    const ro = new ResizeObserver(entries => setScale(entries[0].contentRect.width / 1160));
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setActive(null);
        setEdit(v => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setShelfCalibratorOpen(v => !v);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  useEffect(() => () => {
    if (visionEyeActivationTimerRef.current) {
      clearTimeout(visionEyeActivationTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (tvSignalTransition.phase === "idle") return;
    const delay = reduceMotion
      ? 0
      : tvSignalTransition.phase === "collapsing"
        ? 100
        : tvSignalTransition.phase === "traveling"
          ? 60
          : 140;
    const timer = window.setTimeout(() => {
      setTvSignalTransition(current => advanceTvSignalTransition(current));
    }, delay);

    return () => window.clearTimeout(timer);
  }, [reduceMotion, tvSignalTransition]);

  const scrollTvIntoView = useCallback((serviceId: VisionEyeServiceId) => {
    const trigger = cameraSceneRef.current?.querySelector<HTMLElement>(
      `[data-status-service-id="${serviceId}"]`,
    );
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const headerHeight = 60;
    const isComfortablyVisible =
      rect.top >= headerHeight + 15 &&
      rect.bottom <= window.innerHeight - 15;

    if (!isComfortablyVisible) {
      trigger.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      });
    }
  }, [reduceMotion]);

  useEffect(() => {
    if (edit || focusedStatusTv || active || rowTemplateModalOpen || slotPickerTarget || shelfCalibratorOpen || cdPlayerModalOpen) return;

    const handleVisionEyeKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented
        || event.isComposing
        || event.ctrlKey
        || event.metaKey
        || event.altKey
        || visionEyeActivating
        || tvSignalTransition.phase !== "idle"
      ) return;
      const targetElement = event.target instanceof Element ? event.target : null;
      const isStatusTvTrigger = Boolean(targetElement?.closest("[data-status-service-id]"));
      if (!isStatusTvTrigger && isVisionEyeKeyboardTarget(event.target)) return;

      const command = getVisionEyeCommand(event);
      if (!command) return;

      if (command === "activate") {
        if (event.repeat || visionEyeActivating) return;
        const selectedTarget = visionEyeTargets.find(
          target => target.serviceId === selectedVisionEyeServiceId,
        );
        const trigger = cameraSceneRef.current?.querySelector<HTMLButtonElement>(
          `[data-status-service-id="${selectedVisionEyeServiceId}"]`,
        );
        if (!selectedTarget || !trigger) return;

        event.preventDefault();
        scrollTvIntoView(selectedVisionEyeServiceId);
        activateStatusTv({
          channel: selectedTarget.channel,
          serviceId: selectedTarget.serviceId,
        }, trigger, true);
        return;
      }

      const nextTarget = findDirectionalVisionEyeTarget(
        selectedVisionEyeServiceId,
        command,
        visionEyeTargets,
      );
      if (!nextTarget) {
        event.preventDefault();
        scrollTvIntoView(selectedVisionEyeServiceId);
        return;
      }

      event.preventDefault();
      setTvSignalTransition(current => reduceMotion
        ? createTvSignalState(nextTarget.serviceId)
        : beginTvSignalTransition(current, nextTarget.serviceId, command));
      scrollTvIntoView(nextTarget.serviceId);
    };

    window.addEventListener("keydown", handleVisionEyeKey);
    return () => window.removeEventListener("keydown", handleVisionEyeKey);
  }, [
    activateStatusTv,
    active,
    rowTemplateModalOpen,
    slotPickerTarget,
    shelfCalibratorOpen,
    edit,
    focusedStatusTv,
    selectedVisionEyeServiceId,
    reduceMotion,
    tvSignalTransition.phase,
    visionEyeActivating,
    visionEyeTargets,
    scrollTvIntoView,
    cdPlayerModalOpen,
  ]);

  useEffect(() => {
    synth.setEnabled(sound);
    synth.setHum(active === "tv" && playing, volume);
    return () => synth.setHum(false, 0);
  }, [sound, active, playing, volume]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (active !== "tv" || !playing || media.tv) return;
    const t = setInterval(() => setPosition(p => (p + .25) % 120), 250);
    return () => clearInterval(t);
  }, [active, playing, media.tv]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.volume = volume;
      v.muted = !sound;
      if (playing) v.play().catch(() => setPlaying(false));
      else v.pause();
    }
  }, [playing, volume, sound, active]);

  const patch = (id: string, change: Partial<Item>) => setLayout(p => ({ ...p, items: { ...p.items, [id]: { ...p.items[id], ...change } } }));
  const open = (id: string) => {
    if (edit) return;
    synth.play(id === "tv" ? "thump" : "click");
    if (id === "tv") {
      synth.unlock();
      setSound(true);
      setPlaying(true);
      setPosition(0);
    }
    setActive(id);
  };

  const toggleEdit = () => {
    synth.play("click");
    setActive(null);
    setEdit(v => !v);
  };

  // Cabinet multi-row operations
  const handleAddRow = (template: RowTemplateType) => {
    const newR = createNewRow(template);
    setRows(prev => [...prev, newR]);
    setRowTemplateModalOpen(false);
    synth.play("click");
    notify(`Shelf tier added (${template})`);
  };

  const handleRemoveRow = (rowId: string) => {
    if (rows.length <= 1) {
      notify("Cabinet must have at least one shelf row.");
      return;
    }
    setRows(prev => prev.filter(r => r.id !== rowId));
    synth.play("click");
    notify("Shelf tier removed");
  };

  const handleMoveRow = (rowId: string, direction: -1 | 1) => {
    const idx = rows.findIndex(r => r.id === rowId);
    if (idx < 0) return;
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= rows.length) return;
    const updated = [...rows];
    const [moved] = updated.splice(idx, 1);
    updated.splice(nextIdx, 0, moved);
    setRows(updated);
    synth.play("click");
  };

  const handleToggleBayLayout = (rowId: string, bayId: string) => {
    setRows(prev =>
      prev.map(row => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          bays: row.bays.map(bay => {
            if (bay.id !== bayId) return bay;
            const targetLayout = bay.layout === "split" ? "tall" : "split";
            if (targetLayout === "tall") {
              const existingCollectible = bay.slots[0]?.collectibleId || bay.slots[1]?.collectibleId;
              return {
                ...bay,
                layout: "tall",
                slots: [
                  {
                    id: `${bay.id}-tall`,
                    collectibleId: existingCollectible,
                    ledOn: true,
                    ledIntensity: 0.85
                  }
                ]
              };
            } else {
              const existing = bay.slots[0]?.collectibleId;
              return {
                ...bay,
                layout: "split",
                slots: [
                  { id: `${bay.id}-t`, collectibleId: existing, ledOn: true, ledIntensity: 0.85 },
                  { id: `${bay.id}-b`, ledOn: true, ledIntensity: 0.85 }
                ]
              };
            }
          })
        };
      })
    );
    synth.play("click");
    notify("Shelf bay layout updated");
  };

  const handleToggleSlotLed = (rowId: string, bayId: string, slotId: string) => {
    setRows(prev =>
      prev.map(row => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          bays: row.bays.map(bay => {
            if (bay.id !== bayId) return bay;
            return {
              ...bay,
              slots: bay.slots.map(slot => {
                if (slot.id !== slotId) return slot;
                const current = slot.ledOn !== false;
                return { ...slot, ledOn: !current };
              })
            };
          })
        };
      })
    );
    synth.play("click");
  };

  const handleSetSlotVideo = (rowId: string, bayId: string, slotId: string, newSrc: string) => {
    setRows(prev =>
      prev.map(row => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          bays: row.bays.map(bay => {
            if (bay.id !== bayId) return bay;
            return {
              ...bay,
              slots: bay.slots.map(slot => {
                if (slot.id !== slotId) return slot;
                return { ...slot, customVideo: newSrc };
              })
            };
          })
        };
      })
    );
  };

  const handleToggleLighting = (mode: "amber" | "magenta") => {
    setLightingMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("ascend_shelf_lighting", mode);
    }
    synth.play("click");
    notify(`Shelf ambiance set to ${mode === "amber" ? "Cozy Amber (Default)" : "CRT Magenta Spill"}`);
  };

  const handleAssignCollectible = (def: CollectibleDef) => {
    if (!slotPickerTarget) return;
    const { rowId, bayId, slotId } = slotPickerTarget;
    setRows(prev =>
      prev.map(row => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          bays: row.bays.map(bay => {
            if (bay.id !== bayId) return bay;
            return {
              ...bay,
              slots: bay.slots.map(slot => {
                if (slot.id !== slotId) return slot;
                return {
                  ...slot,
                  collectibleId: def.id,
                  customTitle: def.label,
                  isPoster: false
                };
              })
            };
          })
        };
      })
    );
    setSlotPickerTarget(null);
    synth.play("click");
    notify(`${def.label} placed in cubby`);
  };

  const handleClearSlot = (rowId?: string, bayId?: string, slotId?: string) => {
    const targetRow = rowId || slotPickerTarget?.rowId;
    const targetBay = bayId || slotPickerTarget?.bayId;
    const targetSlot = slotId || slotPickerTarget?.slotId;
    if (!targetRow || !targetBay || !targetSlot) return;

    setRows(prev =>
      prev.map(row => {
        if (row.id !== targetRow) return row;
        return {
          ...row,
          bays: row.bays.map(bay => {
            if (bay.id !== targetBay) return bay;
            return {
              ...bay,
              slots: bay.slots.map(slot => {
                if (slot.id !== targetSlot) return slot;
                return {
                  ...slot,
                  collectibleId: undefined,
                  customTitle: undefined,
                  isPoster: false
                };
              })
            };
          })
        };
      })
    );
    setSlotPickerTarget(null);
    synth.play("click");
    notify("Cubby cleared");
  };

  const handleResetCabinet = () => {
    setRows(DEFAULT_SHELF_ROWS);
    saveCabinetRows(DEFAULT_SHELF_ROWS);
    synth.play("click");
    notify("Cabinet restored to default reference tiers");
  };

  const addShelf = () => {
    const id = "shelf-" + Date.now();
    setLayout(p => ({ ...p, items: { ...p.items, [id]: { x: 400, y: 310, width: 280, height: 26, title: "Shelf", itemType: "shelf" as const, shelfType: "standard" as const } } }));
    synth.play("click");
    notify("Shelf added — drag to position");
  };

  const addLight = () => {
    const id = "light-" + Date.now();
    setLayout(p => ({ ...p, items: { ...p.items, [id]: { x: 200, y: 40, width: 400, height: 280, title: "Spotlight", itemType: "light" as const, lightColor: "#bb7f38", lightIntensity: 0.4 } } }));
    synth.play("click");
    notify("Light added — drag to position");
  };

  const addCollectible = (def: CollectibleDef) => {
    const id = "collectible-" + Date.now();
    setLayout(p => ({ ...p, items: { ...p.items, [id]: { x: 480, y: 180, width: 120, height: 120, title: def.label, itemType: "collectible" as const, collectibleId: def.id } } }));
    synth.play("click");
    notify(`${def.label} added — drag to shelf`);
  };

  const removeItem = (id: string) => {
    setLayout(p => {
      const items = { ...p.items };
      delete items[id];
      return { ...p, items };
    });
    synth.play("click");
    notify("Removed");
  };

  const upload = (id: string) => {
    uploadTarget.current = id;
    if (inputRef.current) {
      inputRef.current.accept = id === "tv" ? "video/mp4" : "image/*";
      inputRef.current.click();
    }
  };

  async function handleUpload(file?: File) {
    if (!file) return;
    const id = uploadTarget.current;
    if (id === "tv" ? !(/video\/mp4/.test(file.type) || /\.mp4$/i.test(file.name)) : !file.type.startsWith("image/")) {
      notify("Choose an image, or an MP4 for the television.");
      return;
    }
    try {
      const key = `ascend-media-${id}`;
      await saveMedia(key, file);
      if (urls.current[id]) URL.revokeObjectURL(urls.current[id]);
      const url = URL.createObjectURL(file);
      urls.current[id] = url;
      setMedia(p => ({ ...p, [id]: url }));
      patch(id, { mediaId: key, mediaName: file.name });
      synth.play("thump");
      notify(`${file.name} saved on this device`);
    } catch {
      notify("Could not save this file. Try a smaller file.");
    }
  }

  async function exportLayout() {
    const json = JSON.stringify(layout, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      notify("Layout JSON copied to clipboard");
    } catch {
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "ascend-layout.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Layout JSON downloaded");
    }
  }

  function wrap(id: string, children: ReactNode) {
    const item = layout.items[id];
    return (
      <Rnd
        key={id}
        size={{ width: item.width, height: item.height }}
        position={{ x: item.x, y: item.y }}
        scale={scale}
        bounds="parent"
        minWidth={item.itemType === "shelf" ? 60 : item.itemType === "light" ? 80 : item.itemType === "collectible" ? 60 : 120}
        minHeight={item.itemType === "shelf" ? 20 : item.itemType === "light" ? 60 : item.itemType === "collectible" ? 60 : 80}
        disableDragging={!edit}
        enableResizing={edit}
        cancel="button,input,[contenteditable]"
        resizeHandleStyles={edit ? Object.fromEntries(["topLeft", "topRight", "bottomLeft", "bottomRight"].map(key => [key, { width: 8, height: 8, background: "#a4ffd4", border: "1px solid #123d2c" }])) : {}}
        className={`artifact ${edit ? "editable" : ""} artifact-${id}`}
        onDragStop={(_, d) => patch(id, { x: d.x, y: d.y })}
        onResizeStop={(_, __, el, ___, p) => patch(id, { width: parseFloat(el.style.width), height: parseFloat(el.style.height), ...p })}
      >
        {edit && <span className="edit-handle">{id.toUpperCase()} · DRAG / RESIZE</span>}
        {children}
        {edit && ["tv", "clock", "terminal", "turret"].includes(id) && (
          <div className="hardware-edit-label">
            {editingLabel === id ? (
              <input autoFocus aria-label={`Edit ${id} label`} defaultValue={item.title} onBlur={e => { patch(id, { title: e.target.value.trim() || item.title }); setEditingLabel(null); }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
            ) : (
              <span onDoubleClick={() => setEditingLabel(id)}>{item.title}</span>
            )}
            <button aria-label={`Edit ${id} label`} onClick={() => setEditingLabel(id)}><Pencil size={9} /></button>
          </div>
        )}
        {edit && item.itemType === "shelf" && (
          <div className="shelf-edit-bar">
            <button onClick={() => patch(id, { shelfType: item.shelfType === "long" ? "standard" : "long" })}>{item.shelfType === "long" ? "▬ Long" : "▬ Std"}</button>
            <button className="remove-item-btn" title="Remove shelf" onClick={e => { e.stopPropagation(); removeItem(id); }}><Trash2 size={9} /></button>
          </div>
        )}
        {edit && item.itemType === "light" && (
          <div className="light-edit-bar">
            <label>Color<input type="color" value={item.lightColor || "#bb7f38"} onChange={e => patch(id, { lightColor: e.target.value })} /></label>
            <label>Intensity<input type="range" min="0" max="1" step=".05" value={item.lightIntensity ?? 0.4} onChange={e => patch(id, { lightIntensity: Number(e.target.value) })} /></label>
            <button className="remove-item-btn" title="Remove light" onClick={e => { e.stopPropagation(); removeItem(id); }}><Trash2 size={9}/></button>
          </div>
        )}
        {edit && item.itemType === "collectible" && (
          <div className="collectible-edit-bar">
            <button className="remove-item-btn" title="Remove collectible" onClick={e => { e.stopPropagation(); removeItem(id); }}><Trash2 size={9} /></button>
          </div>
        )}
      </Rnd>
    );
  }

  useWorkspaceTools(layout);
  const chapter = chapters.find(c => c.id === active);
  const completed = chapters.filter(c => layout.items[c.id].completed).length;

  const dynamicStageHeight = presetMode === "reference"
    ? Math.max(728, rows.length * 644 + (edit ? 180 : 80))
    : 728;

  return (
    <div className={`os zzz-workspace-shell ${edit ? "edit-mode" : ""} ${presetMode === "reference" ? "full-bleed-mode" : ""} lighting-${lightingMode}`} onPointerDown={e => { if ((e.target as HTMLElement).closest("button")) synth.play("click"); }}>
      <header className="topbar">
        <a
          href="#"
          className="wordmark"
          aria-label="Ascend OS home"
          onClick={e => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <span className="logo-mark">⏣</span> ASCEND <span>OS</span>
        </a>
        <div className="top-status"><i /> SYSTEM ONLINE <span className="top-divider" /> V.1.0.26</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div className="lighting-choice-toggle" role="radiogroup" aria-label="Shelf compartment lighting choice">
            <button
              type="button"
              role="radio"
              aria-checked={lightingMode === "amber"}
              className={`lighting-choice-btn ${lightingMode === "amber" ? "active amber" : ""}`}
              onClick={() => handleToggleLighting("amber")}
              title="Option A: Cozy Amber (Warm Incandescent)"
            >
              <span className="choice-dot amber" />
              COZY AMBER
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={lightingMode === "magenta"}
              className={`lighting-choice-btn ${lightingMode === "magenta" ? "active magenta" : ""}`}
              onClick={() => handleToggleLighting("magenta")}
              title="Option B: CRT Magenta (Ambient Spill)"
            >
              <span className="choice-dot magenta" />
              CRT MAGENTA
            </button>
          </div>
          <button
            className={`view-switch ${presetMode === "reference" ? "active" : ""}`}
            onClick={() => {
              const cab = document.querySelector("#ascend-cabinet-section");
              if (cab) {
                cab.scrollIntoView({ behavior: "smooth", block: "start" });
              } else {
                setPresetMode(m => m === "workspace" ? "reference" : "workspace");
              }
            }}
          >
            {presetMode === "reference" ? "▣ WORKOS CABINET" : "⏣ WORKSTATION"}
          </button>
          <Link href="/design-system" className="view-switch" style={{ textDecoration: "none" }}>
            📐 DESIGN SYSTEM
          </Link>
          <button className="view-switch" onClick={() => setRowTemplateModalOpen(true)}>
            <Plus size={11} /> ADD SHELF ROW
          </button>
          <button
            className={`view-switch ${spotifyData?.isPlaying ? "spotify-playing" : ""}`}
            onClick={() => setSpotifyModalOpen(true)}
            title={spotifyData?.connected ? (spotifyData.isPlaying ? `Spotify: ${spotifyData.title} by ${spotifyData.artist}` : "Spotify Connected (Idle)") : "Setup Spotify Sync"}
            style={spotifyData?.isPlaying ? { borderColor: "rgba(16, 185, 129, 0.6)", color: "#34d399" } : undefined}
          >
            <Disc size={11} className={spotifyData?.isPlaying ? "animate-spin" : ""} />
            {spotifyData?.isPlaying ? `SPOTIFY: ${(spotifyData.title || "").slice(0, 14)}` : (spotifyData?.connected ? "SPOTIFY IDLE" : "SPOTIFY SYNC")}
          </button>
          <button
            className={`view-switch ${currentPlayingYouTube ? "youtube-playing" : ""}`}
            onClick={() => {
              setYoutubeModalOpen(true);
              if (!youtubeSearchLoaded) searchYouTube("");
            }}
            title={currentPlayingYouTube ? `YouTube: ${currentPlayingYouTube.title}` : "Search & Broadcast YouTube on CRT TV"}
            style={currentPlayingYouTube ? { borderColor: "rgba(239, 68, 68, 0.7)", color: "#f87171" } : undefined}
          >
            <Video size={11} className={currentPlayingYouTube ? "animate-pulse" : ""} />
            {currentPlayingYouTube ? `YT: ${(currentPlayingYouTube.title || "").slice(0, 14)}` : "YOUTUBE CRT"}
          </button>
        </div>
        <button className="sound-switch" onClick={() => { setSound(v => !v); if (!sound) synth.unlock(); }} aria-pressed={sound}>
          {sound ? <Volume2 size={15} /> : <VolumeX size={15} />} SOUND {sound ? "ON" : "OFF"}
        </button>
      </header>

      {/* Main clean workspace running the authentic Zenless Zone Zero TV web project */}
      <section className="zzz-tv-workspace" id="zzz-tv-workspace">
        <iframe
          ref={zzzFrameRef}
          id="zzz-tv-frame"
          src="/zzz-tv/index.html"
          className="zzz-tv-embed-frame"
          title="Zenless Zone Zero TV"
          allow="autoplay; encrypted-media; fullscreen"
          onLoad={handleZzzLoad}
        />
        {/* Authentic Background Wood Wall Extension to freely cover bottom of top workplace */}
        {wallCoverHeight > 0 && (
          <div
            className={`workplace-wall-extension ${wallWidthMode !== "full" ? "custom-width" : ""}`}
            style={{
              height: `${wallCoverHeight}px`,
              ...(wallWidthMode === "full"
                ? { left: 0, right: 0, width: "100%" }
                : wallWidthMode === "shelf"
                ? { width: "min(1160px, 96vw)", left: "50%", transform: `translateX(calc(-50% + ${wallOffsetX}px))` }
                : { width: `${wallWidth}px`, left: "50%", transform: `translateX(calc(-50% + ${wallOffsetX}px))` }),
            }}
            aria-hidden="true"
          >
            {showTrimGuides && (
              <>
                <div className="workplace-wall-seam-bar" />
                <div className="workplace-wall-guide-badge">
                  <span>WALL: {wallWidthMode === "full" ? "FULL (100%)" : wallWidthMode === "shelf" ? "SHELF (1160px)" : `${wallWidth}px`} × {wallCoverHeight}px {wallOffsetX !== 0 ? `(X: ${wallOffsetX > 0 ? `+${wallOffsetX}` : wallOffsetX}px)` : ""}</span>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {focusedStatusTv && (
        <>
          <motion.button
            type="button"
            tabIndex={-1}
            className="shelf-camera-backdrop fixed inset-0"
            aria-label="Zoom out to the full status shelf"
            initial={{ opacity: 0 }}
            animate={{ opacity: focusedStatusTv.open ? 1 : 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 1.4, ease: [0.77, 0, 0.175, 1] }}
            onClick={() => setFocusedStatusTv(current => current ? { ...current, open: false } : null)}
          />
          <motion.div
            ref={cameraControlsRef}
            className="shelf-camera-controls fixed inset-0"
            role="dialog"
            aria-modal="true"
            aria-label={`${focusedStatusTv.assignment.channel} ${focusedStatusTv.assignment.serviceId.replaceAll("-", " ")} camera view`}
            initial={{ opacity: 0 }}
            animate={{ opacity: focusedStatusTv.open ? 1 : 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.7, delay: focusedStatusTv.open && !reduceMotion ? 0.7 : 0 }}
          >
            <div className="shelf-camera-readout" aria-hidden="true">
              <span>CAMERA LOCK</span>
              <strong>{focusedStatusTv.assignment.channel} · {focusedStatusTv.assignment.serviceId.replaceAll("-", " ")}</strong>
            </div>
            <button
              ref={cameraExitRef}
              type="button"
              className="shelf-camera-exit absolute right-6 top-6"
              onClick={() => setFocusedStatusTv(current => current ? { ...current, open: false } : null)}
            >
              <X size={18} /> ZOOM OUT
            </button>
            {focusedAgentModel ? (
              <AgentAuxiliaryPanel
                model={focusedAgentModel}
                open={focusedStatusTv.open}
                reduceMotion={Boolean(reduceMotion)}
                onClose={() => setFocusedStatusTv(current => current ? { ...current, open: false } : null)}
              />
            ) : null}
          </motion.div>
        </>
      )}

      {/* Scrollable WorkOS Multi-Tier Shelves Stack (100% Uncovered & Clean) */}
      <motion.div
        ref={setCameraSceneNode}
        className={`cabinet-shell shelf-camera-scene lighting-${lightingMode} ${presetMode === "reference" ? "launch-cabinet-stack" : ""}`}
        id="ascend-cabinet-section"
        animate={focusedStatusTv?.open ? {
          x: focusedStatusTv.motion.translateX,
          y: focusedStatusTv.motion.translateY,
          scale: focusedStatusTv.motion.scale,
        } : { x: 0, y: 0, scale: 1 }}
        transition={{ duration: reduceMotion ? 0.01 : 1.4, ease: [0.77, 0, 0.175, 1] }}
        onAnimationComplete={() => {
          if (focusedStatusTv && !focusedStatusTv.open) setFocusedStatusTv(null);
        }}
        style={{
          marginTop: `${shelfOffsetY}px`,
          position: "relative",
          zIndex: focusedStatusTv ? 95 : 15,
          transformOrigin: "0 0",
        }}
      >
        {(presetMode !== "reference" || edit) && (
          <div className="cabinet-top">
            <span>{presetMode === "reference" ? `WORKOS LAUNCH CABINET · ${rows.length} TIERS LOADED` : "THE WORKSTATION"}</span>
            <span>∞ &nbsp; ALWAYS A WORK IN PROGRESS</span>
            <i />
          </div>
        )}
        {!edit ? (
          <>
            <VisionEyeNavigator
              sceneElement={cameraSceneElement}
              transition={tvSignalTransition}
              hidden={Boolean(focusedStatusTv)}
              reduceMotion={Boolean(reduceMotion)}
              layoutVersion={JSON.stringify(rows)}
              onTargetsChange={setVisionEyeTargets}
            />
            <div className="vision-eye-controls" aria-hidden="true" style={{ visibility: focusedStatusTv ? "hidden" : "visible" }}>
              WASD / ARROWS MOVE <span>·</span> SPACE OPEN
            </div>
            <p className="sr-only" aria-live={focusedStatusTv ? "off" : "polite"}>
              {selectedVisionEyeTarget
                ? `${selectedVisionEyeTarget.channel}, ${selectedVisionEyeTarget.serviceId.replaceAll("-", " ")} selected. Press Space to open.`
                : "Status TV navigation loading."}
            </p>
          </>
        ) : null}
        <div className="stage-viewport cabinet-wall-bg" ref={stageRef} style={{ height: dynamicStageHeight * scale }}>
          <div className="stage" style={{ transform: `scale(${scale})` }}>
            {presetMode === "reference" ? (
              <div className="cabinet-multi-rows">
                {rows.map((row, rIdx) => (
                  <div key={row.id} className="shelf-row-wrapper">
                    {edit && (
                      <div className="shelf-row-bar">
                        <span>⏣ {row.title}</span>
                        <div className="shelf-row-controls">
                          <button
                            className="shelf-row-btn"
                            disabled={rIdx === 0}
                            onClick={() => handleMoveRow(row.id, -1)}
                            title="Move tier up"
                          >
                            <ArrowUp size={11} /> Up
                          </button>
                          <button
                            className="shelf-row-btn"
                            disabled={rIdx === rows.length - 1}
                            onClick={() => handleMoveRow(row.id, 1)}
                            title="Move tier down"
                          >
                            <ArrowDown size={11} /> Down
                          </button>
                          <button
                            className="shelf-row-btn danger"
                            onClick={() => handleRemoveRow(row.id)}
                            title="Remove tier"
                          >
                            <Trash2 size={11} /> Remove
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="shelf-rail-h top" aria-hidden="true">
                      <img src="https://dotcom.workos.com/images/launch-week/summer-2026/shelf/border-horizontal.avif" alt="" draggable={false} />
                    </div>
                    <div className="shelf-row-grid">
                      <div className="shelf-wall-v left" aria-hidden="true">
                        <img src="https://dotcom.workos.com/images/launch-week/summer-2026/shelf/border-vertical.avif" alt="" draggable={false} />
                      </div>
                      {row.bays.map((bay, bIdx) => {
                        const isThreeCol = row.bays.length === 3;
                        const bayStyle: CSSProperties = isThreeCol
                          ? (bIdx === 1
                              ? { flex: 1, minWidth: 320 }
                              : { flex: "0 0 280px", width: "280px" })
                          : { flex: bay.flex || 1 };
                        const isSplit = bay.layout === "split";
                        const isWide = !isSplit && (bay.flex !== undefined ? bay.flex > 1 : isThreeCol && bIdx === 1);
                        const texture = isSplit
                          ? {
                              off: "https://dotcom.workos.com/images/launch-week/summer-2026/shelf/small-off.webp",
                              on: "https://dotcom.workos.com/images/launch-week/summer-2026/shelf/small-on.webp",
                            }
                          : isWide
                          ? {
                              off: "https://dotcom.workos.com/images/launch-week/summer-2026/shelf/large-off.webp",
                              on: "https://dotcom.workos.com/images/launch-week/summer-2026/shelf/large-on.webp",
                            }
                          : {
                              off: "https://dotcom.workos.com/images/launch-week/summer-2026/shelf/long-off.webp",
                              on: "https://dotcom.workos.com/images/launch-week/summer-2026/shelf/long-on.webp",
                            };

                        return (
                          <Fragment key={bay.id}>
                            {bIdx > 0 && (
                              <div className="shelf-divider-v" aria-hidden="true">
                                <img src="https://dotcom.workos.com/images/launch-week/summer-2026/shelf/border-vertical.avif" alt="" draggable={false} />
                              </div>
                            )}
                            <div
                              className={`bay-col bay-${bay.layout}`}
                              style={bayStyle}
                            >
                              {bay.slots.map((slot, sIdx) => {
                                const def = slot.collectibleId
                                  ? COLLECTIBLES.find(c => c.id === slot.collectibleId)
                                  : null;
                                const statusAssignment = getShelfTvAssignment(slot.id);
                                const statusService = statusAssignment
                                  ? resolveShelfTvService(slot.id, shelfStatus.current?.services ?? [])
                                  : null;
                                const statusSignalMode = statusAssignment
                                  ? getTvSignalScreenMode(statusAssignment.serviceId, tvSignalTransition)
                                  : "default";
                                return (
                                  <Fragment key={slot.id}>
                                    {sIdx > 0 && (
                                      <div className="shelf-divider-h" aria-hidden="true">
                                        <img src="https://dotcom.workos.com/images/launch-week/summer-2026/shelf/border-horizontal.avif" alt="" draggable={false} />
                                      </div>
                                    )}
                                    <div
                                      className={`cubby-cell ${slot.ledOn === false ? "led-off" : ""}`}
                                      title={def ? def.label : slot.customTitle || "Cubby Slot"}
                                    >
                                      {/* Authentic Photographic Cubby Backdrop Layers */}
                                      <div className="cubby-bg-layer" aria-hidden="true">
                                        <img className="cubby-bg-off" src={texture.off} alt="" draggable={false} />
                                        <img
                                          className="cubby-bg-on"
                                          src={texture.on}
                                          alt=""
                                          draggable={false}
                                          style={{ opacity: slot.ledOn === false ? 0 : 1 }}
                                        />
                                      </div>

                                      {/* Signature Overhead LED Light Bar Fixture & Volumetric Lighting */}
                                      <div className="cubby-led-strip" style={{ opacity: slot.ledOn === false ? 0 : 1 }}>
                                        <div className="cubby-led-bar" />
                                        <div className="cubby-led-wash" />
                                        <div className="cubby-floor-bounce" />
                                      </div>

                                      {def ? (
                                        def.id === "media-station" ? (
                                          <div className="cubby-prop cubby-media-station">
                                            <RetroMediaCenter mode="all" scale={0.38} />
                                          </div>
                                        ) : def.id === "retro-tv-pon" ? (
                                          <div className="cubby-prop cubby-tv-pon">
                                            <RetroTv channel="pon" className="shelf-fit-tv" />
                                          </div>
                                        ) : def.id === "oxo-dvd-deck" ? (
                                          <div className="cubby-prop cubby-dvd-deck">
                                            <DvdPlayer className="shelf-fit-deck" />
                                          </div>
                                        ) : def.id === "studio-monitors" ? (
                                          <div className="cubby-prop cubby-speaker">
                                            <StudioSpeaker position="left" className="shelf-fit-speaker" />
                                          </div>
                                        ) : getCrtProfile(def.id) ? (
                                          <div className="cubby-prop cubby-crt-interactive">
                                            {statusAssignment ? (
                                              <button
                                                type="button"
                                                  className={`shelf-status-tv-trigger ${
                                                   statusSignalMode !== "default"
                                                     ? "is-vision-eye-selected"
                                                     : ""
                                                }`}
                                                data-status-service-id={statusAssignment.serviceId}
                                                data-status-channel={statusAssignment.channel}
                                                disabled={Boolean(focusedStatusTv)}
                                                aria-label={`Focus ${statusAssignment.channel} ${statusAssignment.serviceId.replaceAll("-", " ")} status TV`}
                                                onClick={(event) => activateStatusTv(statusAssignment, event.currentTarget, false)}
                                              >
                                                <ShelfStatusTv
                                                  assignment={statusAssignment}
                                                  profile={getCrtProfile(def.id)!}
                                                  service={statusService}
                                                  loading={shelfStatus.loading && !shelfStatus.current}
                                                  error={shelfStatus.error}
                                                  stale={Boolean(shelfStatus.stale)}
                                                  signalMode={statusSignalMode}
                                                  signalDirection={tvSignalTransition.direction}
                                                  signalActivating={visionEyeActivating && statusSignalMode === "active"}
                                                />
                                                <span className="shelf-status-tv-trigger__hint" aria-hidden="true">FOCUS</span>
                                              </button>
                                            ) : (
                                              <CrtTvDisplay
                                                instanceId={slot.id}
                                                profile={getCrtProfile(def.id)!}
                                                videoSrc={slot.customVideo}
                                                onVideoChange={(newSrc) => handleSetSlotVideo(row.id, bay.id, slot.id, newSrc)}
                                              />
                                            )}
                                          </div>
                                        ) : def.id === "cd-player" ? (
                                          <button
                                            type="button"
                                            className="cubby-cd-player-trigger"
                                            aria-label="Open CD Player Spring 2026 launch week experience"
                                            onClick={() => setCdPlayerModalOpen(true)}
                                          >
                                            <div className={`cubby-prop ${def.offSrc === def.onSrc ? "single-prop-img" : ""}`}>
                                              <img className="prop-off" src={def.offSrc} alt={def.label} draggable={false} />
                                              {def.onSrc !== def.offSrc && (
                                                <img className="prop-on" src={def.onSrc} alt="" draggable={false} aria-hidden />
                                              )}
                                            </div>
                                            <span className="cubby-cd-player-trigger__badge" aria-hidden="true">
                                              PLAY CD · SPRING 2026
                                            </span>
                                          </button>
                                        ) : (
                                          <div className={`cubby-prop ${def.offSrc === def.onSrc ? "single-prop-img" : ""}`}>
                                            <img className="prop-off" src={def.offSrc} alt={def.label} draggable={false} />
                                            {def.onSrc !== def.offSrc && (
                                              <img className="prop-on" src={def.onSrc} alt="" draggable={false} aria-hidden />
                                            )}
                                          </div>
                                        )
                                      ) : slot.isPoster ? (
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
                                                <span>П</span><span>◇</span><span>▲</span><span>◎</span><span>◈</span><span>⏣</span><span>▼</span><span>H</span>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      ) : (
                                        <div
                                          className="empty-cubby-prompt"
                                          onClick={() => {
                                            if (edit) setSlotPickerTarget({ rowId: row.id, bayId: bay.id, slotId: slot.id });
                                          }}
                                        >
                                          <Plus size={16} />
                                          <span>EMPTY BAY</span>
                                          {edit && <span style={{ fontSize: "8px", opacity: 0.6 }}>CLICK TO ASSIGN</span>}
                                        </div>
                                      )}

                                      {edit && (
                                        <div className="cubby-edit-overlay">
                                          <button
                                            className="cubby-action-btn"
                                            onClick={() =>
                                              setSlotPickerTarget({
                                                rowId: row.id,
                                                bayId: bay.id,
                                                slotId: slot.id
                                              })
                                            }
                                          >
                                            <Sparkles size={11} /> {def ? "Change Item" : "Assign Item"}
                                          </button>
                                          <button
                                            className="cubby-action-btn secondary"
                                            onClick={() => handleToggleBayLayout(row.id, bay.id)}
                                          >
                                            <Columns size={11} />
                                            {bay.layout === "split" ? "Make Tall Bay" : "Make Split (2)"}
                                          </button>
                                          <button
                                            className="cubby-action-btn secondary"
                                            onClick={() => handleToggleSlotLed(row.id, bay.id, slot.id)}
                                          >
                                            {slot.ledOn === false ? <LightbulbOff size={11} /> : <Lightbulb size={11} />}
                                            {slot.ledOn === false ? "LED On" : "LED Off"}
                                          </button>
                                          {def && getCrtProfile(def.id) && (
                                            <button
                                              className="cubby-action-btn secondary"
                                              onClick={() => {
                                                const channels = ["/videos/tv-1.mp4", "/videos/tv-2.mp4", "/videos/tv-3.mp4", "/videos/tv-4.mp4"];
                                                const curSrc = slot.customVideo || getCrtProfile(def.id)!.defaultVideo;
                                                const curIdx = channels.indexOf(curSrc);
                                                const nextSrc = channels[(curIdx + 1) % channels.length];
                                                handleSetSlotVideo(row.id, bay.id, slot.id, nextSrc);
                                                synth.play("click");
                                                notify(`Video feed changed to Channel 0${((curIdx + 1) % channels.length) + 1}`);
                                              }}
                                              title="Switch video feed on this CRT"
                                            >
                                              <Tv size={11} /> Next Feed (CH)
                                            </button>
                                          )}
                                          {(slot.collectibleId || slot.isPoster) && (
                                            <button
                                              className="cubby-action-btn secondary"
                                              onClick={() => handleClearSlot(row.id, bay.id, slot.id)}
                                            >
                                              <Trash2 size={11} /> Clear
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </Fragment>
                                );
                              })}
                            </div>
                          </Fragment>
                        );
                      })}
                      <div className="shelf-wall-v right" aria-hidden="true">
                        <img src="https://dotcom.workos.com/images/launch-week/summer-2026/shelf/border-vertical.avif" alt="" draggable={false} />
                      </div>
                    </div>
                    <div className="shelf-rail-h bottom" aria-hidden="true">
                      <img src="https://dotcom.workos.com/images/launch-week/summer-2026/shelf/border-horizontal.avif" alt="" draggable={false} />
                    </div>
                  </div>
                ))}

                <div className="add-row-zone">
                  <button
                    className="add-row-big-btn"
                    onClick={() => setRowTemplateModalOpen(true)}
                  >
                    <Plus size={16} /> + ADD SHELF ROW
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="hardware-bay"><div className="spotlight a" /><div className="shelf-label hardware-label">01 / THE HARDWARE DECK</div><div className="wall-grid" /><span className="wall-note">STAY CURIOUS.<br />KEEP BUILDING.</span><div className="cassettes"><span>PROGRESS VOL. 01</span><span>THE LONG GAME</span><span>SIDE A — KEEP GOING</span></div></div><div className="shelf-rail upper"><span>GOOD THINGS TAKE ITERATIONS.</span><i /><i /></div><div className="poster-bay">{chapters.map(c => <div key={c.id} className="compartment"><span>{c.number}</span><i /></div>)}</div><div className="shelf-rail lower"><i /><i /></div>
                {wrap("tv", <><button className="hardware-button tv-button" onClick={() => open("tv")} aria-label="Focus CRT television"><Television src={media.tv} /><span className="hardware-hint"><Expand size={12} /> CLICK TO TUNE IN</span></button>{edit && <button className="upload-button" onClick={() => upload("tv")}><Upload size={13} /> Upload MP4</button>}</>)}
                {wrap("clock", <Clock />)}
                {wrap("turret", <button className={`turret-button ${laser ? "firing" : ""}`} aria-label="Fire collectible laser turret" onClick={() => { if (edit) return; synth.play("laser"); setLaser(true); setTimeout(() => setLaser(false), 450); }}><div className="turret"><div className="turret-head"><i /><span /><b /></div><div className="turret-neck" /><div className="turret-leg left" /><div className="turret-leg right" /><div className="turret-platform" /></div><span className="prop-label">SENTINEL / MK. 01</span>{laser && <div className="laser-beam" />}</button>)}
                {wrap("terminal", <button className="hardware-button" onClick={() => open("terminal")} aria-label="Open iMac system diagnostics"><Terminal /></button>)}
                {chapters.map(c => wrap(c.id, <div className="poster-wrap" style={{ "--poster-color": c.color } as CSSProperties}><button className={`poster poster-${c.id}`} aria-label={`Open ${layout.items[c.id].title}`} onClick={() => open(c.id)} onPointerMove={e => { if (edit || e.pointerType === "touch") return; const r = e.currentTarget.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; e.currentTarget.style.transform = `perspective(700px) rotateX(${(.5 - y) * 10}deg) rotateY(${(x - .5) * 10}deg)`; e.currentTarget.style.setProperty("--glare-x", `${x * 100}%`); e.currentTarget.style.setProperty("--glare-y", `${y * 100}%`); }} onPointerLeave={e => e.currentTarget.style.transform = ""}>{media[c.id] ? <img src={media[c.id]} alt={layout.items[c.id].title} className="custom-poster" /> : <><div className="poster-top"><span>ASCEND OS</span><span>MODULE / {c.number}</span></div><span className="poster-eyebrow">{c.eyebrow}</span><h2>{layout.items[c.id].title}</h2><PosterArt kind={c.art} /><div className="poster-bottom"><span>{c.tag}</span><span>↗</span></div><span className="poster-edition">CONTINUOUS PROGRESSION SERIES / 2026</span></>}<div className="poster-glare" />{layout.items[c.id].completed && <span className="completed-stamp">COMPLETE ✓</span>}</button><div className="poster-label"><span className="module-number">{c.number}</span>{editingLabel === c.id ? <input autoFocus defaultValue={layout.items[c.id].title} aria-label={`Edit ${c.title} label`} onBlur={e => { patch(c.id, { title: e.target.value.trim() || c.title }); setEditingLabel(null); }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditingLabel(null); }} /> : <span onDoubleClick={() => { if (edit) setEditingLabel(c.id); }}>{layout.items[c.id].title}</span>}<button aria-label={edit ? `Edit ${c.title} label` : `Explore ${c.title}`} onClick={() => edit ? setEditingLabel(c.id) : open(c.id)}>{edit ? <Pencil size={12} /> : <ArrowUpRight size={13} />}</button></div>{edit && <button className="upload-button" onClick={() => upload(c.id)}><Upload size={13} /> Change image</button>}</div>))}
                {Object.entries(layout.items).filter(([, i]) => i.itemType === "shelf").map(([id]) => wrap(id, <ShelfItem item={layout.items[id]} />))}
                {Object.entries(layout.items).filter(([, i]) => i.itemType === "light").map(([id]) => wrap(id, <LightItem item={layout.items[id]} />))}
                {Object.entries(layout.items).filter(([, i]) => i.itemType === "collectible").map(([id]) => wrap(id, <CollectibleItem item={layout.items[id]} />))}
              </>
            )}
          </div>
        </div>
        <div className="cabinet-bottom">
          <span><i /> ALL SYSTEMS OPERATIONAL</span>
          <div className="lighting-choice-toggle" role="radiogroup" aria-label="Cabinet lighting ambiance">
            <button
              type="button"
              role="radio"
              aria-checked={lightingMode === "amber"}
              className={`lighting-choice-btn ${lightingMode === "amber" ? "active amber" : ""}`}
              onClick={() => handleToggleLighting("amber")}
              title="Option A: Cozy Amber"
            >
              <span className="choice-dot amber" />
              COZY AMBER
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={lightingMode === "magenta"}
              className={`lighting-choice-btn ${lightingMode === "magenta" ? "active magenta" : ""}`}
              onClick={() => handleToggleLighting("magenta")}
              title="Option B: CRT Magenta"
            >
              <span className="choice-dot magenta" />
              CRT MAGENTA
            </button>
          </div>
          <span>{presetMode === "reference" ? `${rows.length} SHELF TIERS ACTIVE` : `${String(completed).padStart(2, "0")} / 05 MILESTONES COMPLETE`}</span>
          <span>DESIGNED TO EVOLVE ↗</span>
        </div>
      </motion.div>

      <section className="below-shelf">
        <div><span className="tiny-cross">+</span><p>Not a destination.<br /><strong>A way of moving forward.</strong></p></div>
        <p className="interaction-note"><Crosshair size={14} /> Explore the objects. Find your next step.</p>
        <details onToggle={() => synth.play("thump")}>
          <summary>SYSTEM CHANGELOG <span>V.1.0.26</span><ChevronDown size={14} /></summary>
          <div className="changelog"><b>11.09.2026 — Initial transmission</b><p>Five progression modules, procedural sound, CRT playback, and a workspace that you can make your own.</p></div>
        </details>
      </section>

      <footer className="page-footer">
        <span>© 2026 ASCEND OS</span>
        <span>BUILT FOR THE LONG GAME.</span>
        <button onClick={toggleEdit}><Settings2 size={13} /> CUSTOMIZE YOUR SPACE</button>
      </footer>

      {edit && (
        <aside className="editor-bar" aria-label="Layout editor">
          <div><i /> EDIT MODE <span>Customize shelves · Swap items · Reorder</span></div>
          {presetMode === "reference" ? (
            <>
              <button onClick={() => {
                const btn = document.querySelector<HTMLButtonElement>(".room-dock-btn.crop-btn");
                if (btn) btn.click();
              }}>
                <Scissors size={14} /> Crop & Move Hero
              </button>
              <button onClick={() => setRowTemplateModalOpen(true)}><Plus size={14} /> Add Shelf Row</button>
              <button onClick={handleResetCabinet}><RotateCcw size={14} /> Reset Shelves</button>
            </>
          ) : (
            <>
              <button onClick={() => setActive("picker")}><Plus size={14} /> Add Component</button>
              <button onClick={addShelf}><Plus size={14} /> Add Shelf</button>
              <button onClick={addLight}><Plus size={14} /> Add Light</button>
              <button onClick={exportLayout}><Download size={14} /> Export JSON</button>
              <button onClick={() => setActive("reset")}><RotateCcw size={14} /> Reset</button>
            </>
          )}
          <button className="done-button" onClick={toggleEdit}>Done <span>✓</span></button>
        </aside>
      )}

      <ShelfTrimEditor
        open={shelfCalibratorOpen}
        onClose={() => setShelfCalibratorOpen(false)}
        wallCoverHeight={wallCoverHeight}
        wallWidthMode={wallWidthMode}
        wallWidth={wallWidth}
        wallOffsetX={wallOffsetX}
        shelfOffsetY={shelfOffsetY}
        shelfTopCrop={shelfTopCrop}
        showTrimGuides={showTrimGuides}
        onWallCoverChange={handleWallCoverChange}
        onWallWidthModeChange={handleWallWidthModeChange}
        onWallWidthChange={handleWallWidthChange}
        onWallOffsetXChange={handleWallOffsetXChange}
        onShelfOffsetChange={handleShelfOffsetChange}
        onShelfTopCropChange={handleShelfTopCropChange}
        onToggleTrimGuides={setShowTrimGuides}
        onResetAll={handleResetAllTrim}
        onCopyValues={handleCopyTrimValues}
      />

      <input ref={inputRef} type="file" hidden onChange={e => { handleUpload(e.target.files?.[0]); e.target.value = ""; }} />
      {toast && <div className="toast" role="status">{toast}</div>}

      {slotPickerTarget && (
        <SlotPickerModal
          onSelect={handleAssignCollectible}
          onClear={() => handleClearSlot()}
          onClose={() => setSlotPickerTarget(null)}
        />
      )}

      {rowTemplateModalOpen && (
        <RowTemplateModal
          onSelect={handleAddRow}
          onClose={() => setRowTemplateModalOpen(false)}
        />
      )}

      {chapter && (
        <Modal title={`MODULE ${chapter.number} / ${chapter.tag}`} onClose={() => setActive(null)}>
          <div className="module-detail" style={{ "--poster-color": chapter.color } as CSSProperties}>
            <div className="detail-art"><PosterArt kind={chapter.art} /></div>
            <span className="detail-kicker">YOUR NEXT LEVEL</span>
            <h2>{layout.items[chapter.id].title}</h2>
            <p>{chapter.description}</p>
            <ul>{chapter.specs.map(s => <li key={s}><span>↗</span>{s}</li>)}</ul>
            <button className="primary-action" onClick={() => { patch(chapter.id, { completed: !layout.items[chapter.id].completed }); synth.play("thump"); notify(layout.items[chapter.id].completed ? "Milestone reopened" : "Milestone complete. Keep moving forward."); }}>
              {layout.items[chapter.id].completed ? "Reopen milestone" : "Mark milestone complete"}
              <ArrowUpRight size={17} />
            </button>
            <button className="secondary-action" onClick={() => setActive(chapters[(chapters.indexOf(chapter) + 1) % 5].id)}>
              Explore next module →
            </button>
          </div>
        </Modal>
      )}

      {active === "terminal" && (
        <Modal title="Ascend System Profiler" classic onClose={() => setActive(null)}>
          <div className="mac-menu">File &nbsp; Edit &nbsp; View &nbsp; Special</div>
          <div className="mac-content">
            <div className="happy-mac">▣</div>
            <h2>Welcome to Ascend OS.</h2>
            <p>Your potential is online.</p>
            <dl>
              <dt>System version</dt><dd>Ascend System 9 / 1.0.26</dd>
              <dt>Cabinet tiers</dt><dd>{rows.length} loaded</dd>
              <dt>Audio engine</dt><dd>{sound ? "Web Audio · enabled" : "Web Audio · standby"}</dd>
              <dt>Local storage</dt><dd>{ready ? "Ready" : "Loading"}</dd>
              <dt>Workspace objects</dt><dd>{Object.keys(layout.items).length} available</dd>
              <dt>Display</dt><dd>{Math.round(scale * 100)}% · responsive</dd>
            </dl>
            <button onClick={() => { notify("Diagnostics complete. All systems ready."); synth.play("thump"); }}>Run diagnostics</button>
          </div>
          <div className="mac-status">◈ &nbsp; There is always room to grow.</div>
        </Modal>
      )}

      {active === "tv" && (
        <Modal title="MEDIA CENTER · PON! CRT & AUDIO RIG" onClose={() => setActive(null)}>
          <div style={{ display: "flex", gap: "8px", padding: "12px 20px", borderBottom: "1px solid #3c2a1c", background: "#140e0a" }}>
            <button
              onClick={() => { synth.play("click"); setTvModalTab("media-center"); }}
              style={{
                font: "9px var(--mono)",
                letterSpacing: "1px",
                padding: "6px 14px",
                borderRadius: "3px",
                background: tvModalTab === "media-center" ? "#fea48022" : "transparent",
                border: `1px solid ${tvModalTab === "media-center" ? "#fea480" : "#3c2a1c"}`,
                color: tvModalTab === "media-center" ? "#fea480" : "#a4805c",
                cursor: "pointer"
              }}
            >
              ★ PON! RETRO MEDIA CENTER (REFERENCE SETUP)
            </button>
            <button
              onClick={() => { synth.play("click"); setTvModalTab("standard"); }}
              style={{
                font: "9px var(--mono)",
                letterSpacing: "1px",
                padding: "6px 14px",
                borderRadius: "3px",
                background: tvModalTab === "standard" ? "#fea48022" : "transparent",
                border: `1px solid ${tvModalTab === "standard" ? "#fea480" : "#3c2a1c"}`,
                color: tvModalTab === "standard" ? "#fea480" : "#a4805c",
                cursor: "pointer"
              }}
            >
              SONORA TRINITRON 1996
            </button>
          </div>

          {tvModalTab === "media-center" ? (
            <div style={{ padding: "30px 10px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "440px" }}>
              <RetroMediaCenter mode="all" scale={0.92} videoSrc={media.tv} />
            </div>
          ) : (
            <>
              <div className="tv-focus">
                <Television src={media.tv} playing={playing} position={position} videoRef={videoRef} onTime={setPosition} onDuration={setDuration} />
              </div>
              <div className="osd">
                <button aria-label={playing ? "Pause playback" : "Play playback"} onClick={() => setPlaying(v => !v)}>
                  {playing ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <span>{Math.floor(position / 60)}:{String(Math.floor(position % 60)).padStart(2, "0")}</span>
                <input type="range" aria-label="Playback position" min="0" max={Number.isFinite(duration) ? duration : 120} step=".1" value={position} onChange={e => { const n = Number(e.target.value); setPosition(n); if (videoRef.current) videoRef.current.currentTime = n; }} />
                <button onClick={() => { setSound(v => !v); synth.unlock(); }} aria-label={sound ? "Mute audio" : "Enable audio"}>
                  {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
                <input className="volume-range" type="range" aria-label="Volume" min="0" max="1" step=".01" value={volume} onChange={e => setVolume(Number(e.target.value))} />
              </div>
              <p className="tv-modal-note">{media.tv ? layout.items.tv.mediaName : "AMBIENT TRANSMISSION · PROCEDURALLY GENERATED"}</p>
            </>
          )}
        </Modal>
      )}

      {active === "reset" && (
        <Modal title="Restore the original workstation?" onClose={() => setActive(null)}>
          <div className="reset-content">
            <p>This resets positions, labels, media references, and milestone progress on this device.</p>
            <button className="primary-action" onClick={() => { setLayout(initialLayout); setMedia({}); setActive(null); notify("Original workstation restored"); }}>Restore original layout</button>
            <button className="secondary-action" onClick={() => setActive(null)}>Keep my workspace</button>
          </div>
        </Modal>
      )}

      {active === "picker" && (
        <ComponentPicker onAdd={addCollectible} onClose={() => setActive(null)} />
      )}

      {spotifyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl text-zinc-100 font-mono my-8 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSpotifyModalOpen(false)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-white transition p-1"
              aria-label="Close Spotify setup modal"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-1 text-emerald-400 text-sm font-semibold tracking-wider">
              <Disc size={18} className={spotifyData?.isPlaying ? "animate-spin" : ""} />
              SPOTIFY "NOW PLAYING" SYNC
            </div>
            <p className="text-[11px] text-zinc-400 mb-4">
              Retro CRT TV Channel 1 Vinyl Record Integration
            </p>

            {spotifyNotice && (
              <div
                className={`mb-4 p-3 rounded-lg border text-xs flex items-start justify-between gap-2 ${
                  spotifyNotice.includes("✓") || spotifyNotice.includes("successfully")
                    ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-200"
                    : "bg-amber-950/40 border-amber-800/60 text-amber-200"
                }`}
              >
                <div className="flex-1 leading-relaxed">{spotifyNotice}</div>
                <button
                  onClick={() => setSpotifyNotice(null)}
                  className="text-zinc-400 hover:text-white shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {spotifyData?.connected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
                  {spotifyData.albumImageUrl ? (
                    <img
                      src={spotifyData.albumImageUrl}
                      alt={spotifyData.album || "Album cover"}
                      className="w-16 h-16 rounded-lg object-cover shadow-lg border border-zinc-700/50"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-500">
                      <Disc size={28} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {spotifyData.demoMode ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold tracking-wider">
                          ⚡ DEMO STREAMING
                        </span>
                      ) : spotifyData.isPlaying ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold tracking-wider flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                          LIVE PLAYING
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px] font-bold tracking-wider">
                          PAUSED / IDLE
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-white truncate">
                      {spotifyData.title}
                    </div>
                    <div className="text-xs text-zinc-400 truncate">
                      {spotifyData.artist}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-zinc-400 space-y-1 bg-zinc-900/40 p-3 rounded-lg border border-zinc-800/60">
                  <p className="text-emerald-400 font-semibold">✓ Sync Active with CRT TV</p>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    {spotifyData.demoMode
                      ? "Currently demonstrating Zenless Zone Zero OST with live vinyl rotation, album artwork, and beat visualizer."
                      : "Ascend Hub is actively reading your Spotify playback and rendering album art, marquee titles, and audio visualizer onto CRT Screen 1."}
                  </p>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  {spotifyData.demoMode ? (
                    <>
                      <button
                        onClick={() => setShowManualInputs((v) => !v)}
                        className="w-full py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition"
                      >
                        {showManualInputs ? "Hide Spotify API Setup" : "Connect Real Spotify Account"}
                      </button>
                      <button
                        onClick={() => handleToggleDemo(false)}
                        disabled={spotifySetupLoading}
                        className="w-full py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition"
                      >
                        Turn Off Demo Mode
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <a
                          href="/api/spotify/login"
                          className="flex-1 text-center py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition"
                        >
                          Re-Authenticate
                        </a>
                        <button
                          onClick={handleDisconnect}
                          disabled={spotifySetupLoading}
                          className="py-2 px-3 rounded-lg bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-200 text-xs transition"
                        >
                          Disconnect
                        </button>
                      </div>
                      <button
                        onClick={() => handleToggleDemo(true)}
                        disabled={spotifySetupLoading}
                        className="w-full py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition"
                      >
                        Switch to Instant Demo Mode
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : null}

            {(!spotifyData?.connected || showManualInputs) && (
              <div className="space-y-4 pt-2">
                {!spotifyData?.connected && (
                  <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                        <Sparkles size={14} /> OPTION 1: INSTANT PREVIEW
                      </span>
                      <span className="text-[10px] uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-bold border border-emerald-500/30">
                        1-Click Ready
                      </span>
                    </div>
                    <p className="text-zinc-300 text-[11px] leading-relaxed">
                      Experience live spinning vinyl, album art, audio waves, and track marquee right now with Zenless Zone Zero OST without setting up API keys.
                    </p>
                    <button
                      onClick={() => handleToggleDemo(true)}
                      disabled={spotifySetupLoading}
                      className="w-full mt-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition flex items-center justify-center gap-2 shadow"
                    >
                      <Play size={13} />
                      Launch Instant Vinyl Demo
                    </button>
                  </div>
                )}

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-800" />
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-wider">
                    <span className="bg-zinc-950 px-3 text-zinc-500">
                      {spotifyData?.connected ? "Spotify Developer Credentials" : "Option 2: Connect Real Spotify Account"}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-2 text-[11px] text-zinc-300">
                    <p className="font-semibold text-zinc-200">Quick 2-Step Setup:</p>
                    <ol className="list-decimal list-inside space-y-1.5 text-zinc-400">
                      <li>
                        Open{" "}
                        <a
                          href="https://developer.spotify.com/dashboard"
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-400 underline inline-flex items-center gap-0.5"
                        >
                          Spotify Developer Dashboard <ExternalLink size={11} />
                        </a>{" "}
                        and create an App (or open an existing one).
                      </li>
                      <li>
                        In App Settings &gt; Redirect URIs, add:
                        <div className="mt-1 flex items-center gap-1.5">
                          <code className="flex-1 bg-black/60 p-1.5 rounded border border-zinc-800 text-emerald-400 font-mono text-[10px] truncate">
                            {typeof window !== "undefined"
                              ? `${window.location.origin.replace("localhost", "127.0.0.1")}/api/spotify/callback`
                              : "http://127.0.0.1:5173/api/spotify/callback"}
                          </code>
                          <button
                            type="button"
                            onClick={copyRedirectUri}
                            className="shrink-0 p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
                            title="Copy Redirect URI"
                          >
                            {copiedRedirect ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                          </button>
                        </div>
                      </li>
                    </ol>
                  </div>

                  <form onSubmit={handleSaveCredentials} className="space-y-3">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">
                        Spotify Client ID <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Paste Client ID from Spotify Dashboard"
                        value={spotifyClientIdInput}
                        onChange={(e) => setSpotifyClientIdInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-black/60 border border-zinc-800 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">
                        Spotify Client Secret <span className="text-zinc-500">(Optional if in .env.local)</span>
                      </label>
                      <input
                        type="password"
                        placeholder="Paste Client Secret"
                        value={spotifyClientSecretInput}
                        onChange={(e) => setSpotifyClientSecretInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-black/60 border border-zinc-800 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={spotifySetupLoading}
                      className="w-full py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs transition flex items-center justify-center gap-2"
                    >
                      {spotifySetupLoading ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" /> Saving...
                        </>
                      ) : (
                        "Save & Authorize with Spotify →"
                      )}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <RetroCdBrowserModal
        open={cdPlayerModalOpen}
        onOpenChange={setCdPlayerModalOpen}
        spotifyData={spotifyData}
      />

      {youtubeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl border border-red-950/80 bg-zinc-950 p-6 shadow-2xl text-zinc-100 font-mono my-8 max-h-[90vh] flex flex-col">
            <button
              onClick={() => setYoutubeModalOpen(false)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-white transition p-1"
              aria-label="Close YouTube studio modal"
            >
              <X size={18} />
            </button>

            {/* Header */}
            <div className="flex items-center gap-2 mb-1 text-red-400 text-sm font-semibold tracking-wider">
              <Video size={18} className={currentPlayingYouTube ? "animate-pulse" : ""} />
              YOUTUBE CRT BROADCAST STUDIO
            </div>
            <p className="text-[11px] text-zinc-400 mb-4">
              Search any song, artist, album, MV, or paste any YouTube URL to stream directly into the CRT TV.
            </p>

            {/* Active On-Air Bar */}
            {currentPlayingYouTube && (
              <div className="mb-4 p-3 rounded-xl bg-red-950/30 border border-red-800/60 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold tracking-wider flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
                      ON AIR ON CRT TV
                    </span>
                    {currentPlayingYouTube.isLive && (
                      <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-bold">
                        LIVE
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-white truncate">
                    {currentPlayingYouTube.title}
                  </div>
                  {currentPlayingYouTube.author && (
                    <div className="text-[11px] text-zinc-400 truncate">
                      {currentPlayingYouTube.author}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleResumeYouTube}
                    className="p-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
                    title="Play"
                  >
                    <Play size={14} />
                  </button>
                  <button
                    onClick={handlePauseYouTube}
                    className="p-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
                    title="Pause"
                  >
                    <Pause size={14} />
                  </button>
                  <button
                    onClick={handleStopYouTube}
                    className="p-2 rounded bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 text-xs transition px-2.5"
                    title="Stop Broadcast"
                  >
                    Stop
                  </button>
                </div>
              </div>
            )}

            {/* Search Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                searchYouTube(youtubeSearchQuery);
              }}
              className="flex gap-2 mb-3"
            >
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search song, artist, album, or paste YouTube link..."
                  value={youtubeSearchQuery}
                  onChange={(e) => setYoutubeSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-black/70 border border-zinc-800 text-white font-mono text-xs focus:outline-none focus:border-red-500 placeholder:text-zinc-600"
                />
              </div>
              <button
                type="submit"
                disabled={youtubeSearching}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold text-xs transition flex items-center gap-1.5 shrink-0 shadow-lg shadow-red-950/50"
              >
                {youtubeSearching ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Search size={14} />
                )}
                Search
              </button>
            </form>

            {/* Direct Link Detection Banner */}
            {/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|live\/))([a-zA-Z0-9_-]{11})/.test(youtubeSearchQuery) && (
              <div className="mb-3 p-2.5 rounded-lg bg-red-950/40 border border-red-700/60 flex items-center justify-between gap-2 text-xs">
                <span className="text-red-300 text-[11px] truncate">
                  ⚡ Direct YouTube URL detected in input!
                </span>
                <button
                  type="button"
                  onClick={() => {
                    searchYouTube(youtubeSearchQuery);
                  }}
                  className="shrink-0 px-3 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold transition"
                >
                  Broadcast Now →
                </button>
              </div>
            )}

            {/* Quick Preset Chips */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {YOUTUBE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setYoutubeSearchQuery(preset.query);
                    searchYouTube(preset.query);
                  }}
                  className="px-2.5 py-1 rounded-full bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-[10.5px] text-zinc-300 hover:text-white transition flex items-center gap-1"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Results Grid */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar min-h-[260px] max-h-[420px]">
              {youtubeSearching ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-2">
                  <RefreshCw size={24} className="animate-spin text-red-500" />
                  <span className="text-xs">Scanning YouTube frequency...</span>
                </div>
              ) : youtubeSearchResults.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {youtubeSearchResults.map((video) => {
                    const isCurrent = currentPlayingYouTube?.id === video.id;
                    return (
                      <div
                        key={video.id}
                        onClick={() => handlePlayYouTube(video)}
                        className={`group relative flex gap-3 p-2.5 rounded-xl border cursor-pointer transition ${
                          isCurrent
                            ? "bg-red-950/40 border-red-700/80 shadow-md shadow-red-950/50"
                            : "bg-zinc-900/50 border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700"
                        }`}
                      >
                        <div className="relative w-24 h-16 shrink-0 rounded-lg overflow-hidden bg-black/60 border border-zinc-800">
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          />
                          <span
                            className={`absolute bottom-1 right-1 px-1 py-0.2 rounded text-[9px] font-bold ${
                              video.isLive
                                ? "bg-red-600 text-white"
                                : "bg-black/80 text-zinc-300"
                            }`}
                          >
                            {video.duration}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="text-xs font-semibold text-white line-clamp-2 leading-tight group-hover:text-red-300 transition">
                              {video.title}
                            </div>
                            <div className="text-[11px] text-zinc-400 truncate mt-1">
                              {video.author}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1">
                            <span>{video.views ? `${video.views}` : ""}</span>
                            <span className="text-red-400 group-hover:translate-x-0.5 transition font-semibold flex items-center gap-0.5">
                              {isCurrent ? "Playing ●" : "Tune in →"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-zinc-500 text-xs">
                  No broadcast streams found. Try searching for a track, artist, or pasting a YouTube link.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
