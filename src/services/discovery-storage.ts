import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const STORAGE_PATH = path.join(DATA_DIR, "discovery.json");

interface DiscoveryData {
  subscribed_chats: number[];
  known_markets: string[];
  newest_market?: string;
  newest_market_time?: string;
}

let discoveryData: DiscoveryData = {
  subscribed_chats: [],
  known_markets: []
};

// Initialize storage
function initStorage() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STORAGE_PATH)) {
      const raw = fs.readFileSync(STORAGE_PATH, "utf-8");
      discoveryData = JSON.parse(raw);
      // Ensure arrays are initialized
      if (!discoveryData.subscribed_chats) discoveryData.subscribed_chats = [];
      if (!discoveryData.known_markets) discoveryData.known_markets = [];
    } else {
      saveStorage();
    }
  } catch (error) {
    console.error("[Discovery Storage] Failed to initialize storage:", error);
  }
}

// Save data to disk
function saveStorage() {
  try {
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(discoveryData, null, 2));
  } catch (error) {
    console.error("[Discovery Storage] Failed to write storage to disk:", error);
  }
}

// Run init on load
initStorage();

export function subscribeChat(chatId: number): boolean {
  if (!discoveryData.subscribed_chats.includes(chatId)) {
    discoveryData.subscribed_chats.push(chatId);
    saveStorage();
    return true;
  }
  return false;
}

export function unsubscribeChat(chatId: number): boolean {
  const index = discoveryData.subscribed_chats.indexOf(chatId);
  if (index !== -1) {
    discoveryData.subscribed_chats.splice(index, 1);
    saveStorage();
    return true;
  }
  return false;
}

export function getSubscribedChats(): number[] {
  return [...discoveryData.subscribed_chats];
}

export function getKnownMarkets(): string[] {
  return [...discoveryData.known_markets];
}

export function setKnownMarkets(markets: string[]): void {
  discoveryData.known_markets = [...markets];
  saveStorage();
}

export function getNewestMarket(): { symbol: string; discoveredAt: string } | null {
  if (!discoveryData.newest_market) return null;
  return {
    symbol: discoveryData.newest_market,
    discoveredAt: discoveryData.newest_market_time || ""
  };
}

export function setNewestMarket(symbol: string, time: string): void {
  discoveryData.newest_market = symbol;
  discoveryData.newest_market_time = time;
  saveStorage();
}
