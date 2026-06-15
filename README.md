# Sera Scout

Sera Scout is a market intelligence client and Telegram Bot for the Sera Protocol, querying live order book depth and calculating optimal spreads and liquidity leaderboards.

## Getting Started

### Installation

1. Navigate to the project folder:
   ```bash
   cd sera-scout-bot
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Telegram Bot

To launch the Telegram bot, you need to configure the `BOT_TOKEN` environment variable.

#### 1. Configure Bot Token

The bot requires the `BOT_TOKEN` environment variable to connect to the Telegram API.

You can set the environment variable on Windows PowerShell before running:
```powershell
$env:BOT_TOKEN="your_bot_token_here"
```

Or on Linux/macOS:
```bash
export BOT_TOKEN="your_bot_token_here"
```

#### 2. Start the Bot

Run the start command to initialize the bot and begin background scheduling:
```bash
npm run bot
```

The bot will print initialization logs and start listening for updates via long-polling:
```text
🤖 Initializing Sera Scout Telegram Bot...
⏰ Starting background Alpha Scheduler...
🚀 Bot is starting long polling...
```

---

## Commands

- `/start`: Welcomes the user and lists available commands.
- `/alpha`: Ranks the top 10 tightest spread markets (using background scheduler cache).
- `/liquidity`: Ranks the top 10 markets by total liquidity (using top 5 depth levels).
- `/scan <token>`: Looks up all active markets featuring a specific token symbol.
- `/about`: Details the bot's features and core architecture.
