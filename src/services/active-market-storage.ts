import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const STORAGE_PATH = path.join(DATA_DIR, "active_markets.json");

interface ActiveMarketsData {
  last_scan_time: string;
  active_symbols: string[];
}

// Pre-populate with the 6 known active stablecoin pairs using the slash symbol format matching the API
const DEFAULT_ACTIVE_SYMBOLS = [
  "EUR0/XSGD",
  "MYRT/XSGD",
  "MYRT/USDT",
  "XSGD/USDC",
  "XSGD/USDT",
  "USDC/USDT"
];

let activeMarketsData: ActiveMarketsData = {
  last_scan_time: new Date().toISOString(),
  active_symbols: [...DEFAULT_ACTIVE_SYMBOLS]
};

// Initialize storage
function initStorage() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STORAGE_PATH)) {
      const raw = fs.readFileSync(STORAGE_PATH, "utf-8");
      activeMarketsData = JSON.parse(raw);
      // Ensure active_symbols is present and non-empty, otherwise default it
      if (!activeMarketsData.active_symbols || activeMarketsData.active_symbols.length === 0) {
        activeMarketsData.active_symbols = [...DEFAULT_ACTIVE_SYMBOLS];
      }
    } else {
      saveStorage();
    }
  } catch (error) {
    console.error("[Active Market Storage] Failed to initialize storage:", error);
    activeMarketsData.active_symbols = [...DEFAULT_ACTIVE_SYMBOLS];
  }
}

// Save storage to disk
function saveStorage() {
  try {
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(activeMarketsData, null, 2));
  } catch (error) {
    console.error("[Active Market Storage] Failed to write storage to disk:", error);
  }
}

// Run init on load
initStorage();

export function getActiveSymbols(): string[] {
  // If cache is empty or unavailable, return fallback active markets directly
  if (!activeMarketsData.active_symbols || activeMarketsData.active_symbols.length === 0) {
    return [...DEFAULT_ACTIVE_SYMBOLS];
  }
  return [...activeMarketsData.active_symbols];
}

export function setActiveSymbols(symbols: string[]): void {
  activeMarketsData.active_symbols = [...symbols];
  activeMarketsData.last_scan_time = new Date().toISOString();
  saveStorage();
}

export function getLastScanTime(): string {
  return activeMarketsData.last_scan_time;
}
