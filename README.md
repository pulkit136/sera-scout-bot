# Sera Scout (V2.5.3)

Sera Scout is a Telegram-native market intelligence and trading assistant for **Sera Protocol** on Ethereum Mainnet. Designed for Sera team members, developers, contributors, and users, it provides real-time intent-based price discovery, price alerts, and slippage-protected swap quotes.

Sera Scout is powered directly by the official **Sera Mainnet REST API**, replacing the previous Sepolia testnet Goldsky subgraph workflow to deliver production-grade mainnet data.

---

## Architecture Flow

Sera Scout integrates Telegram interactions with the Sera Protocol Mainnet through a lightweight, high-performance service architecture:

```mermaid
graph TD
    TelegramUser([Telegram User])
    GrammyBot[Grammy Bot Core]
    ScoutEngine[Sera Scout Engine]
    SeraAPI[Sera REST API]
    Mainnet[Sera Protocol Mainnet]
    
    TelegramUser <-->|Commands & Callbacks| GrammyBot
    GrammyBot <-->|Execute Views & Logic| ScoutEngine
    ScoutEngine <-->|REST Queries| SeraAPI
    SeraAPI <-->|State & Quotes| Mainnet
```

---

## Technology Stack

Sera Scout is built with a modern and lightweight JavaScript/TypeScript ecosystem:

*   **Language**: TypeScript (Node.js)
*   **Bot Framework**: Grammy (Telegram Bot Framework)
*   **Infrastructure**: Railway (Cloud deployment platform)
*   **Data Source**: Official Sera Mainnet REST API

---

## Core Features

*   **Interactive Telegram UI** — Navigate through rich screens, paginated lists, and configurable alert controls via inline keyboards.
*   **Live Swap Quotes** — Query and execute real-time, slippage-protected token swap rates.
*   **Active Market Explorer** — Quickly browse high-liquidity active trading markets using `/markets`.
*   **Full Market Registry Browser** — Search and filter the complete catalog of registered trading pairs on Sera Protocol using `/allmarkets`.
*   **Price Alerts** — Schedule price-rate notifications (`/alert`) monitored continuously by the background alert scheduler.
*   **Trending Tokens** — Discover hot tokens ranked by active market connectivity.
*   **Discover Insights** — Access protocol-wide metrics, dominant tokens, and new registry listings instantly.
*   **Stats Dashboard** — Monitor overall registry health, active catalog sizes, and quote asset distributions.
*   **Daily Digest** — Get automated daily market intelligence summaries delivered to subscribed users at 9 AM UTC.
*   **Liquidity-Aware Quote Handling** — Prevents bad UX by hiding actionable buttons (like `Get Quote` or `Set Alert`) on inactive/illiquid markets.
*   **Smart Quote Fallback Logic** — If a swap quote request fails with a `no_liquidity` error, the engine automatically attempts to query smaller trade sizes (`500 ➔ 100 ➔ 50 ➔ 10`) to find execution bounds.
*   **Gas Cost Awareness** — Computes estimated transaction fees and flags warning indicators to the user if estimated gas costs consume 10% or more of the proposed trade value.

---

## Bot Command Reference

*   `/start` — Opens the main interactive greeting dashboard and portal.
*   `/markets [filter]` — List active trading pairs with valid executable liquidity (e.g., `/markets USDC`).
*   `/allmarkets [filter]` — List all registered trading pairs in the full catalog (e.g., `/allmarkets XSGD`).
*   `/quote <from> <to> <amount>` — Fetch a live mainnet swap quote (e.g., `/quote USDC USDT 100`).
*   `/alert <from> <to> <above|below> <rate>` — Configure a price alert trigger (e.g., `/alert XSGD USDC above 0.74`).
*   `/trending` — View tokens ranked by connection count in active markets.
*   `/discover` — View protocol-wide insights, dominant tokens, and new market listings.
*   `/stats` — Monitor general catalog statistics, active market sizes, and asset distribution.
*   `/digest <on|off>` — Enable or disable the automated daily intelligence digest (e.g., `/digest on`).

---

## Core Engine Designs

### 1. Curated Active Market Registry
To protect the bot from REST API rate limiting and network latency overhead, the automatic background scanner was replaced with a curated registry file ([data/active_markets.json](file:///c:/Users/letsc/Downloads/sera-scout-bot/data/active_markets.json)).
*   **The Concept**: Instead of querying all 780+ registered pairs sequentially to check liquidity (which consumes massive API capacity and starves user commands), the bot references a curated list of active markets.
*   **Why It Replaced Scanning**: Sequentially polling hundreds of markets regularly triggered `429 Too Many Requests` API rejections and led to delayed bot responses.
*   **Key Benefits**:
    *   **Reduced Rate Limiting**: Completely eliminates background scanner API calls.
    *   **Improved Reliability**: Prevents API exhaustion, ensuring that user commands get immediate responses.
    *   **Lower API Usage**: Minimal traffic to the Sera REST API endpoint, running clean and lightweight.

### 2. Sized Quote Engine
*   **Live Quote Generation**: Swap quotes are generated dynamically from the official REST API to ensure accuracy.
*   **Liquidity-Aware Responses**: Classifies pool health dynamically (🟢 Deep, 🟡 Medium, 🔴 Limited) so users are informed of market depth.
*   **Smart Fallback Sizing**: For shallow markets, if a default preset (like 500) fails due to `no_liquidity`, the engine automatically retries smaller sizes (`100`, `50`, `10`) to find the maximum tradable amount and suggests it to the user.
*   **Gas Warnings**: Alerts users with a prominent warning tag if estimated gas costs consume a significant portion ($\ge 10\%$) of their swap value.

---

## Project Journey

*   **Phase 1: Subgraph Exploration**
    *   Subgraph exploration
    *   Alpha board
    *   Liquidity board
*   **Phase 2: Mainnet Migration**
    *   Mainnet migration
    *   REST API integration
*   **Phase 3: Interactive Telegram Assistant**
    *   Interactive Telegram assistant with smart presets, alert scheduler, and gas awareness

---

## Product Roadmap

*   **Richer Market Intelligence** — Advanced price graphs and interactive spread analytics in chat.
*   **Enhanced Token Analytics** — Track real-time liquidity changes, pool reserves, and daily trading volumes.
*   **Community Requested Features** — User-customizable UI shortcuts and custom alert notification filters.
*   **Additional Sera Ecosystem Integrations** — Deeper integration with vaults and other protocol products.

---

## Screenshots

*   **Home Menu**: *[Placeholder: Main screen navigation and dashboard]*
*   **Quote Flow**: *[Placeholder: Quote preset keyboard, fallback output, and gas warning]*
*   **Market Explorer**: *[Placeholder: Paginated active market list and details]*
*   **Alerts**: *[Placeholder: Active price alert configuration and notifications]*
*   **Discover**: *[Placeholder: Dominant tokens and newest registry listings]*

---

## Deployment & Setup

### Prerequisites
*   Node.js (v20.6.0+ recommended for native `.env` support)
*   NPM

### Setup Instructions
1.  Clone the repository and install dependencies:
    ```bash
    npm install
    ```
2.  Compile the TypeScript codebase:
    ```bash
    npm run build
    ```
3.  Configure your environment variables in a `.env` file in the root directory.
4.  Start the Telegram Bot:
    ```bash
    npm start
    ```

---

## Environment Variables

The application is configured using the following environment variables:

| Variable | Description | Default / Required |
| :--- | :--- | :--- |
| `BOT_TOKEN` | Telegram Bot API Token obtained from BotFather | **Required** |
| `API_BASE_URL` | Sera REST API V1 Base URL endpoint | `https://api.sera.cx/api/v1` |
| `NODE_ENV` | Set to `test` to bypass bot polling during automated testing | Optional |
