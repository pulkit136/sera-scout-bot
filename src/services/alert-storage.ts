import fs from "fs";
import path from "path";

export interface Alert {
  id: string;
  telegram_chat_id: number;
  from_token: string;
  from_address: string;
  from_decimals: number;
  to_token: string;
  to_address: string;
  to_decimals: number;
  condition: "above" | "below";
  target_rate: number;
  created_at: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORAGE_PATH = path.join(DATA_DIR, "alerts.json");

let alertsInMemory: Alert[] = [];

// Initialize storage
function initStorage() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STORAGE_PATH)) {
      const raw = fs.readFileSync(STORAGE_PATH, "utf-8");
      alertsInMemory = JSON.parse(raw);
    } else {
      fs.writeFileSync(STORAGE_PATH, JSON.stringify([], null, 2));
      alertsInMemory = [];
    }
  } catch (error) {
    console.error("[Alert Storage] Failed to initialize storage:", error);
    alertsInMemory = [];
  }
}

// Save alerts to file
function saveStorage() {
  try {
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(alertsInMemory, null, 2));
  } catch (error) {
    console.error("[Alert Storage] Failed to write storage to disk:", error);
  }
}

// Run init on load
initStorage();

export function addAlert(alert: Omit<Alert, "id" | "created_at">): Alert {
  const newAlert: Alert = {
    ...alert,
    id: Math.floor(100 + Math.random() * 900).toString(), // Generate a unique 3-digit numeric ID string
    created_at: new Date().toISOString()
  };
  alertsInMemory.push(newAlert);
  saveStorage();
  return newAlert;
}

export function listAlertsForChat(chatId: number): Alert[] {
  return alertsInMemory.filter(a => a.telegram_chat_id === chatId);
}

export function getAllAlerts(): Alert[] {
  return [...alertsInMemory];
}

export function removeAlert(id: string): boolean {
  const initialLength = alertsInMemory.length;
  alertsInMemory = alertsInMemory.filter(a => a.id !== id);
  if (alertsInMemory.length < initialLength) {
    saveStorage();
    return true;
  }
  return false;
}

export function removeAlerts(ids: string[]): void {
  alertsInMemory = alertsInMemory.filter(a => !ids.includes(a.id));
  saveStorage();
}
