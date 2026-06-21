import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const STORAGE_PATH = path.join(DATA_DIR, "active_markets.json");

interface ActiveMarketsData {
  last_scan_time: string;
  active_symbols: string[];
}

let activeMarketsData: ActiveMarketsData = {
  last_scan_time: "",
  active_symbols: []
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
      if (!activeMarketsData.active_symbols) activeMarketsData.active_symbols = [];
    } else {
      saveStorage();
    }
  } catch (error) {
    console.error("[Active Market Storage] Failed to initialize storage:", error);
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
