"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
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
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X
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
      <div className="cubby-led-bar" style={{ position: "absolute", top: 0, left: 12, right: 12, height: 4, background: `linear-gradient(90deg,transparent 0%,${c} 10%,#fff 50%,${c} 90%,transparent 100%)`, boxShadow: `0 0 10px #fff, 0 0 20px ${c}, 0 4px 30px ${c}` }} />
      <div className="cubby-led-wash" style={{ background: bg }} />
    </div>
  );
}

function CollectibleItem({ item }: { item: Item }) {
  const def = COLLECTIBLES.find(c => c.id === item.collectibleId);
  if (!def) return <div className="collectible-empty">?</div>;
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

  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef("tv");
  const urls = useRef<Record<string, string>>({});
  const notify = (s: string) => setToast(s);

  useEffect(() => {
    const saved = loadLayout();
    setLayout(saved);
    const savedRows = loadCabinetRows();
    setRows(savedRows);
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
    const ro = new ResizeObserver(entries => setScale(Math.min(1, entries[0].contentRect.width / 1160)));
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
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

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
    ? Math.max(728, rows.length * 390 + (edit ? 160 : 70))
    : 728;

  return (
    <main className={edit ? "os edit-mode" : "os"} onPointerDown={e => { if ((e.target as HTMLElement).closest("button")) synth.play("click"); }}>
      <header className="topbar">
        <a href="#" className="wordmark" aria-label="Ascend OS home"><span className="logo-mark">⏣</span> ASCEND <span>OS</span></a>
        <div className="top-status"><i /> SYSTEM ONLINE <span className="top-divider" /> V.1.0.26</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button className={`view-switch ${presetMode === "reference" ? "active" : ""}`} onClick={() => setPresetMode(m => m === "workspace" ? "reference" : "workspace")}>
            {presetMode === "reference" ? "▣ WORKOS CABINET" : "⏣ WORKSTATION"}
          </button>
          <Link href="/design-system" className="view-switch" style={{ textDecoration: "none" }}>
            📐 DESIGN SYSTEM
          </Link>
          {presetMode === "reference" && (
            <button className="view-switch" onClick={() => setRowTemplateModalOpen(true)}>
              <Plus size={11} /> ADD SHELF ROW
            </button>
          )}
        </div>
        <button className="sound-switch" onClick={() => { setSound(v => !v); if (!sound) synth.unlock(); }} aria-pressed={sound}>
          {sound ? <Volume2 size={15} /> : <VolumeX size={15} />} SOUND {sound ? "ON" : "OFF"}
        </button>
      </header>

      <section className="intro">
        <div className="intro-meta"><span>YOUR PERSONAL OPERATING SYSTEM</span><span>EST. 2026 <i /> {date}</span></div>
        <div className="intro-main">
          <div><h1>Continuous <em>progression.</em></h1><p>A little more capable. Every single day.</p></div>
          <div className="neon-sign"><span>CONTINUOUS</span><strong>PROGRESSION</strong><i /></div>
        </div>
      </section>

      <div className="cabinet-shell">
        <div className="cabinet-top">
          <span>{presetMode === "reference" ? `WORKOS LAUNCH CABINET · ${rows.length} TIERS LOADED` : "THE WORKSTATION"}</span>
          <span>∞ &nbsp; ALWAYS A WORK IN PROGRESS</span>
          <i />
        </div>
        <div className="stage-viewport" ref={stageRef} style={{ height: dynamicStageHeight * scale }}>
          <div className="stage" style={{ transform: `scale(${scale})` }}>
            {presetMode === "reference" ? (
              <div className="cabinet-multi-rows">
                {rows.map((row, rIdx) => (
                  <div key={row.id} className="shelf-row-wrapper">
                    <div className="shelf-row-bar">
                      <span>⏣ {row.title}</span>
                      {edit && (
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
                      )}
                    </div>
                    <div className="shelf-row-grid">
                      {row.bays.map(bay => (
                        <div
                          key={bay.id}
                          className={`bay-col bay-${bay.layout}`}
                          style={{ flex: bay.flex || 1 }}
                        >
                          {bay.slots.map(slot => {
                            const def = slot.collectibleId
                              ? COLLECTIBLES.find(c => c.id === slot.collectibleId)
                              : null;
                            return (
                              <div
                                key={slot.id}
                                className={`cubby-cell ${slot.ledOn === false ? "led-off" : ""}`}
                                title={def ? def.label : slot.customTitle || "Cubby Slot"}
                              >
                                <div className="cubby-led-strip">
                                  <div className="cubby-led-bar" />
                                  <div className="cubby-led-wash" />
                                </div>
                                {def ? (
                                  <div className="cubby-prop">
                                    <img className="prop-off" src={def.offSrc} alt={def.label} draggable={false} />
                                    <img className="prop-on" src={def.onSrc} alt="" draggable={false} aria-hidden />
                                  </div>
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
                            );
                          })}
                        </div>
                      ))}
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
          <span>{presetMode === "reference" ? `${rows.length} SHELF TIERS ACTIVE` : `${String(completed).padStart(2, "0")} / 05 MILESTONES COMPLETE`}</span>
          <span>DESIGNED TO EVOLVE ↗</span>
        </div>
      </div>

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

      {!edit && (
        <button className="floating-edit" onClick={toggleEdit}>
          <Settings2 size={16} /> Edit workspace <kbd>Ctrl E</kbd>
        </button>
      )}

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
        <Modal title="SONORA / AV 01 — ENDLESS POSSIBILITIES" onClose={() => setActive(null)}>
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
    </main>
  );
}
