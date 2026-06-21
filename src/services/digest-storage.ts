import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const STORAGE_PATH = path.join(DATA_DIR, "digest.json");

interface DigestData {
  subscribed_chats: number[];
  last_sent_date?: string; // Format: YYYY-MM-DD
}

let digestData: DigestData = {
  subscribed_chats: []
};

// Initialize storage
function initStorage() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STORAGE_PATH)) {
      const raw = fs.readFileSync(STORAGE_PATH, "utf-8");
      digestData = JSON.parse(raw);
      if (!digestData.subscribed_chats) digestData.subscribed_chats = [];
    } else {
      saveStorage();
    }
  } catch (error) {
    console.error("[Digest Storage] Failed to initialize storage:", error);
  }
}

// Save data to disk
function saveStorage() {
  try {
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(digestData, null, 2));
  } catch (error) {
    console.error("[Digest Storage] Failed to write storage to disk:", error);
  }
}

// Run init on load
initStorage();

export function subscribeDigest(chatId: number): boolean {
  if (!digestData.subscribed_chats.includes(chatId)) {
    digestData.subscribed_chats.push(chatId);
    saveStorage();
    return true;
  }
  return false;
}

export function unsubscribeDigest(chatId: number): boolean {
  const index = digestData.subscribed_chats.indexOf(chatId);
  if (index !== -1) {
    digestData.subscribed_chats.splice(index, 1);
    saveStorage();
    return true;
  }
  return false;
}

export function getDigestSubscribedChats(): number[] {
  return [...digestData.subscribed_chats];
}

export function getLastSentDate(): string | null {
  return digestData.last_sent_date || null;
}

export function setLastSentDate(dateStr: string): void {
  digestData.last_sent_date = dateStr;
  saveStorage();
}
