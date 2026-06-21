# Sera Scout

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Grammy](https://img.shields.io/badge/GrammyJS-F87171?style=for-the-badge&logo=telegram&logoColor=white)](https://grammy.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)

Sera Scout is a Telegram companion bot for the **Sera Protocol** on Ethereum Mainnet. It focuses on market discovery, real-time quote generation, price/liquidity alerts, and future intent-based trading utilities.

---

## Product Vision

Sera Scout is designed to be the ultimate mobile companion for Sera Protocol users. Because Sera Mainnet utilizes a blind order book where order depth is not publicly exposed, traditional open analytics (such as spread boards or market-depth maps) are replaced by intent-based tools, quote engines, and real-time alerts.

---

## Feature Matrix

| Feature | Description | Status | API Source |
| :--- | :--- | :--- | :--- |
| `/quote` | Fetch slippage-protected swap quotes | **Live** | Mainnet REST API |
| `/markets` | List active trading markets and pairs | **Live** | Mainnet REST API |
| `/alert` | Price alert triggers and notifications | **Planned** | Mainnet REST API |
| `/alpha` | Tightest spread ranking table | *Legacy* | Sepolia Subgraph (GraphQL) |
| `/liquidity` | Leaderboard of deep liquidity pools | *Legacy* | Sepolia Subgraph (GraphQL) |
| `/scan` | Market spread and fee metrics lookup | *Legacy* | Sepolia Subgraph (GraphQL) |

---

## Architecture Flow

Sera Scout operates on a robust API client pipeline directly interfacing with the Sera Protocol Mainnet endpoints.

### Current Architecture: Read-Only Quote Engine
```mermaid
graph TD
    User([Telegram User])
    Bot[Grammy Bot Core]
    Engine[Sera Scout Engine]
    API[Sera REST API]
    Mainnet[Sera Mainnet Protocol]
    
    User <-->|Commands: /quote, /about| Bot
    Bot <-->|Execute Queries & Logic| Engine
    Engine <-->|REST Requests| API
    API <-->|State & Quote Engine| Mainnet
```

### Future Architecture: Intent Signing & Vault Trading
```mermaid
graph TD
    User([Telegram User])
    Bot[Grammy Bot Core]
    Engine[Sera Scout Engine]
    API[Sera REST API]
    Vault[Sera Vault / Contracts]

    User -->|Initiates /quote| Bot
    Bot -->|Queries Swap Quote| Engine
    Engine -->|POST /swap/quote| API
    API -->|Generates EIP-712 Intent| Engine
    Engine -->|Presents signing data| Bot
    Bot -->|Returns Permit/Route params| User
    User -->|Signs & Submits Tx| Vault
```

---

## Bot Command Reference

*   `/start` — Greeting portal and command summary menu.
*   `/about` — Details bot features and architecture.
*   `/quote <FROM> <TO> <AMOUNT>` — Fetches a live swap quote from mainnet (e.g. `/quote USDC USDT 100`).
*   `/alpha` — Retrieves top 10 tightest spread pairs (*Legacy Sepolia*).
*   `/liquidity` — Ranks top 10 pairs by total liquidity volumes (*Legacy Sepolia*).
*   `/scan <TOKEN>` — Displays spot price and fee metrics (*Legacy Sepolia*).

---

## Product Roadmap

*   **Phase 1 (Completed)**: Implement production-grade Mainnet `/quote` command using the official REST API and decimal-safe conversions.
*   **Phase 2**: Add market discovery features, including active trading pairs listing via `/markets`.
*   **Phase 3**: Build notification and alerts engine (`/alert`) allowing users to monitor price thresholds.
*   **Phase 4 (Under Evaluation)**: Build direct account monitoring and trading actions (Balances, Orders, Fills).

---

## Setup & Local Execution

### Prerequisites

- Node.js (version 20.6.0 or higher is recommended for native `.env` loading)
- NPM

### 1. Installation

Clone your repository, navigate to the folder, and install the standalone dependencies:

```bash
cd sera-scout-bot
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
BOT_TOKEN=your_telegram_bot_token_here
API_BASE_URL=https://api.sera.cx/api/v1
```

### 3. Run the Services

- **Start Telegram Bot** (Starts Grammy bot long-polling along with the legacy background scheduler):
  ```bash
  npm run bot
  ```

- **Run CLI Quote Test**:
  ```bash
  npx tsx src/test-quote.ts
  ```

---

## Legacy Features (Sepolia GraphQL Subgraph)

The repository contains historical GraphQL queries and background schedulers designed to run on the Sepolia testnet subgraph. These files are kept for reference under the `src/services/sera.ts`, `src/services/scout.ts`, and `src/services/scheduler.ts` directories. To run them locally:

*   **Run Caching Test Suite**:
    ```bash
    npm run alpha
    ```
*   **Run Liquidity Test Suite**:
    ```bash
    npm run liquidity
    ```
