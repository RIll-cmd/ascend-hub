import { COLLECTIBLES, type CollectibleDef } from "./collectibles";

export type BayLayoutType = "split" | "tall";

export interface CubbySlot {
  id: string;
  collectibleId?: string;
  customImage?: string;
  customTitle?: string;
  isPoster?: boolean;
  ledOn?: boolean;
  ledIntensity?: number;
  ledColor?: string;
}

export interface ShelfBay {
  id: string;
  layout: BayLayoutType;
  slots: CubbySlot[];
  flex?: number;
}

export interface ShelfRow {
  id: string;
  title: string;
  bays: ShelfBay[];
}

export const DEFAULT_SHELF_ROWS: ShelfRow[] = [
  {
    id: "row-1",
    title: "TIER 01 · HAIL MARY & HARDWARE",
    bays: [
      {
        id: "bay-1-1",
        layout: "split",
        flex: 1,
        slots: [
          { id: "slot-1-1-t", collectibleId: "science-kit", ledOn: true, ledIntensity: 0.85 },
          { id: "slot-1-1-b", collectibleId: "3d-printer", ledOn: true, ledIntensity: 0.85 }
        ]
      },
      {
        id: "bay-1-2",
        layout: "tall",
        flex: 1.85,
        slots: [
          { id: "slot-1-2-m", isPoster: true, customTitle: "Projects Hail Mary", ledOn: true, ledIntensity: 0.9 }
        ]
      },
      {
        id: "bay-1-3",
        layout: "split",
        flex: 1,
        slots: [
          { id: "slot-1-3-t", collectibleId: "imac", ledOn: true, ledIntensity: 0.85 },
          { id: "slot-1-3-b", collectibleId: "ship", ledOn: true, ledIntensity: 0.85 }
        ]
      }
    ]
  },
  {
    id: "row-2",
    title: "TIER 02 · ORBITAL & PROPULSION",
    bays: [
      {
        id: "bay-2-1",
        layout: "tall",
        flex: 1,
        slots: [
          { id: "slot-2-1-m", collectibleId: "rockets", ledOn: true, ledIntensity: 0.85 }
        ]
      },
      {
        id: "bay-2-2",
        layout: "split",
        flex: 1,
        slots: [
          { id: "slot-2-2-t", collectibleId: "helmet", ledOn: true, ledIntensity: 0.85 },
          { id: "slot-2-2-b", collectibleId: "spaceship", ledOn: true, ledIntensity: 0.85 }
        ]
      },
      {
        id: "bay-2-3",
        layout: "tall",
        flex: 1.85,
        slots: [
          { id: "slot-2-3-m", collectibleId: "delorean", customTitle: "DeLorean Time Vehicle", ledOn: true, ledIntensity: 0.85 }
        ]
      }
    ]
  },
  {
    id: "row-3",
    title: "TIER 03 · AUDIO LAB & APPAREL",
    bays: [
      {
        id: "bay-3-1",
        layout: "split",
        flex: 1,
        slots: [
          { id: "slot-3-1-t", collectibleId: "headphones", ledOn: true, ledIntensity: 0.85 },
          { id: "slot-3-1-b", collectibleId: "boombox", ledOn: true, ledIntensity: 0.85 }
        ]
      },
      {
        id: "bay-3-2",
        layout: "tall",
        flex: 1,
        slots: [
          { id: "slot-3-2-m", collectibleId: "cd-player", ledOn: true, ledIntensity: 0.85 }
        ]
      },
      {
        id: "bay-3-3",
        layout: "tall",
        flex: 1,
        slots: [
          { id: "slot-3-3-m", collectibleId: "skateboard", customTitle: "T3 Custom Skateboard", ledOn: true, ledIntensity: 0.85 }
        ]
      }
    ]
  }
];

const STORAGE_KEY = "ascend-cabinet-rows-v2";

export function loadCabinetRows(): ShelfRow[] {
  if (typeof window === "undefined") return DEFAULT_SHELF_ROWS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SHELF_ROWS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.error("Failed to load cabinet rows from localStorage", err);
  }
  return DEFAULT_SHELF_ROWS;
}

export function saveCabinetRows(rows: ShelfRow[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch (err) {
    console.error("Failed to save cabinet rows to localStorage", err);
  }
}

export type RowTemplateType = "split-center" | "gallery" | "all-split" | "tall-three" | "custom-longer" | "blank";

export const ROW_TEMPLATES: { type: RowTemplateType; label: string; desc: string }[] = [
  { type: "split-center", label: "Architectural Bay", desc: "Split (2) · Tall Center · Split (2) — Reference Layout" },
  { type: "tall-three", label: "Tall Showcase", desc: "3 Full-height display bays for tall hardware & models" },
  { type: "all-split", label: "Full Grid (6 Cubbies)", desc: "3 Split bays creating 6 stacked cubbies" },
  { type: "custom-longer", label: "Extended Longer Shelf", desc: "Extra wide showcase bay (flex 2.2) + standard split bay" },
  { type: "blank", label: "Custom 2-Bay Shelf", desc: "1 Split bay + 1 Tall bay" },
];

export function createNewRow(template: RowTemplateType = "split-center"): ShelfRow {
  const ts = Date.now();
  if (template === "all-split") {
    return {
      id: `row-${ts}`,
      title: `TIER NEW · FULL WORKBAY GRID`,
      bays: [
        {
          id: `bay-${ts}-1`,
          layout: "split",
          flex: 1,
          slots: [
            { id: `slot-${ts}-1t`, ledOn: true, ledIntensity: 0.85 },
            { id: `slot-${ts}-1b`, ledOn: true, ledIntensity: 0.85 }
          ]
        },
        {
          id: `bay-${ts}-2`,
          layout: "split",
          flex: 1,
          slots: [
            { id: `slot-${ts}-2t`, ledOn: true, ledIntensity: 0.85 },
            { id: `slot-${ts}-2b`, ledOn: true, ledIntensity: 0.85 }
          ]
        },
        {
          id: `bay-${ts}-3`,
          layout: "split",
          flex: 1,
          slots: [
            { id: `slot-${ts}-3t`, ledOn: true, ledIntensity: 0.85 },
            { id: `slot-${ts}-3b`, ledOn: true, ledIntensity: 0.85 }
          ]
        }
      ]
    };
  }
  
  if (template === "tall-three") {
    return {
      id: `row-${ts}`,
      title: `TIER NEW · TALL SHOWCASE`,
      bays: [
        {
          id: `bay-${ts}-1`,
          layout: "tall",
          flex: 1,
          slots: [{ id: `slot-${ts}-1m`, ledOn: true, ledIntensity: 0.85 }]
        },
        {
          id: `bay-${ts}-2`,
          layout: "tall",
          flex: 1,
          slots: [{ id: `slot-${ts}-2m`, ledOn: true, ledIntensity: 0.85 }]
        },
        {
          id: `bay-${ts}-3`,
          layout: "tall",
          flex: 1,
          slots: [{ id: `slot-${ts}-3m`, ledOn: true, ledIntensity: 0.85 }]
        }
      ]
    };
  }

  if (template === "custom-longer") {
    return {
      id: `row-${ts}`,
      title: `TIER NEW · EXTENDED WORKBAY`,
      bays: [
        {
          id: `bay-${ts}-1`,
          layout: "tall",
          flex: 2.2,
          slots: [{ id: `slot-${ts}-1m`, ledOn: true, ledIntensity: 0.85 }]
        },
        {
          id: `bay-${ts}-2`,
          layout: "split",
          flex: 1,
          slots: [
            { id: `slot-${ts}-2t`, ledOn: true, ledIntensity: 0.85 },
            { id: `slot-${ts}-2b`, ledOn: true, ledIntensity: 0.85 }
          ]
        }
      ]
    };
  }

  if (template === "blank") {
    return {
      id: `row-${ts}`,
      title: `TIER NEW · CUSTOM SHELF`,
      bays: [
        {
          id: `bay-${ts}-1`,
          layout: "split",
          flex: 1,
          slots: [
            { id: `slot-${ts}-1t`, ledOn: true, ledIntensity: 0.85 },
            { id: `slot-${ts}-1b`, ledOn: true, ledIntensity: 0.85 }
          ]
        },
        {
          id: `bay-${ts}-2`,
          layout: "tall",
          flex: 1.5,
          slots: [{ id: `slot-${ts}-2m`, ledOn: true, ledIntensity: 0.85 }]
        }
      ]
    };
  }

  // Default: split-center (Split, Tall Center, Split)
  return {
    id: `row-${ts}`,
    title: `TIER NEW · ARCHITECTURAL BAY`,
    bays: [
      {
        id: `bay-${ts}-1`,
        layout: "split",
        flex: 1,
        slots: [
          { id: `slot-${ts}-1t`, ledOn: true, ledIntensity: 0.85 },
          { id: `slot-${ts}-1b`, ledOn: true, ledIntensity: 0.85 }
        ]
      },
      {
        id: `bay-${ts}-2`,
        layout: "tall",
        flex: 1.85,
        slots: [
          { id: `slot-${ts}-2m`, ledOn: true, ledIntensity: 0.85 }
        ]
      },
      {
        id: `bay-${ts}-3`,
        layout: "split",
        flex: 1,
        slots: [
          { id: `slot-${ts}-3t`, ledOn: true, ledIntensity: 0.85 },
          { id: `slot-${ts}-3b`, ledOn: true, ledIntensity: 0.85 }
        ]
      }
    ]
  };
}
