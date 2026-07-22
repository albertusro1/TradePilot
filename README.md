# 🚀 TradePilot v1.0 — IDX Market Intelligence Dashboard

A high-performance single-page market intelligence dashboard built natively with Vanilla HTML5, CSS3 (Glassmorphism), ES6 JavaScript, and ApexCharts. Consumes real-time and fundamental data from the **TradePilot IDX Engine (`StockScrapper`)**.

---

## ✨ Key Features

- **📊 Market Overview**: Real-time ticker prices, daily percentage change, trading volume, 10D/20D/3M relative volume shifts, frequency, and net foreign flow.
- **📈 IHSG Composite Proxy**: Dynamic market-cap weighted composite index simulating real-time IDX Composite performance directly in the sidebar.
- **🔍 Fundamental Screener**: Deep valuation ratios including P/E, PBV, ROE (%), ROA (%), NPM (%), DER, and Market Capitalization.
- **⭐ Watchlist Zone**: 
  - Bookmark stocks directly from table rows (`★` / `☆`) or the stock detail drawer.
  - Automatically records exact **Entry Price**, **Added Date**, and **Initial Grade**.
  - Live tracking of **`% vs Entry`**, **`Max % High`** (peak gain), and **`Max % Low`** (deepest drawdown) relative to your entry price.
  - Persistent session storage in `localStorage` across page refreshes.
- **🏛 5% Shareholders (KSEI)**: Real-time major shareholder changes and entity ownership movements (>5%).
- **🔥 Top Movers**: Immediate sidebar visibility into top gainers, top losers, and volume surges.
- **📊 Interactive Stock Detail Drawer**: Sticky header drawer offering 30-day Price & Volume charts, Valuation PE/PBV bands, Foreign Net Flow timelines, OJK Free Float compliance gauge, and HHI concentration analysis.
- **⚡ High-Density Sortable Tables**: Click any column header to toggle ascending/descending sorting with indicator arrows.

---

## 🛠 Installation & Local Setup Guide

Follow these steps to set up and run TradePilot on your local computer or network device.

### Prerequisites

1. **Backend Engine**:
   - [Go (1.20+)](https://golang.org/dl/)
   - [Docker Desktop](https://www.docker.com/products/docker-desktop/) *(for PostgreSQL database)*
2. **Frontend Dashboard**:
   - [Node.js (v16+)](https://nodejs.org/) OR Python (3.x)

---

### Step 1: Start the Backend API & Database (`StockScrapper`)

1. Open your terminal / PowerShell and navigate to the backend folder:
   ```bash
   cd StockScrapper
   ```

2. Start the PostgreSQL database via Docker:
   ```bash
   docker-compose up -d
   ```

3. Run the Go API server:
   ```bash
   go run ./cmd/api
   ```
   *(The API server will listen on `http://localhost:8080` with API Key `dev_secret_key`).*

> 💡 **Automated One-Click Startup (Windows)**:
> Alternatively, you can run the automated PowerShell orchestrator script:
> ```powershell
> powershell -ExecutionPolicy Bypass -File .\run_tradepilot.ps1
> ```

---

### Step 2: Launch the TradePilot Dashboard

Because the dashboard uses modern ES6 modules (`type="module"`), it must be served via a local web server rather than opening `index.html` directly (to satisfy browser CORS security policies).

1. Navigate to the dashboard directory:
   ```bash
   cd TradePilot-Dashboard
   ```

2. Serve using **Node.js (npx)** *(Recommended)*:
   ```bash
   npx serve -p 3000
   ```
   *Alternatively, use Python:*
   ```bash
   python -m http.server 3000
   ```

3. Open your browser and go to:
   ```
   http://localhost:3000
   ```

---

### 🌐 Accessing from Mobile or Other Local Network Devices

To access TradePilot from a tablet, phone, or another laptop on the same Wi-Fi network:

1. Find your computer's local IPv4 address (e.g. `192.168.1.5`):
   - **Windows**: Run `ipconfig` in Command Prompt.
   - **Mac/Linux**: Run `ifconfig` or `ip a`.
2. Start `npx serve` bound to network access:
   ```bash
   npx serve -l 3000
   ```
3. Open `http://<your-ip-address>:3000` on your mobile device or tablet.

---

## 📁 Repository Structure

```
TradePilot-Dashboard/
├── index.html       # Main Tabbed Data Hub, Sidebar, & Drawer Markup
├── admin.html       # Gateway Orchestrator & Scraper Admin Console
├── style.css        # Responsive Dark Theme, Glassmorphism, & High-Density Tables
├── app.js           # Core JS Architecture, Watchlist State, Sorting, & ApexCharts
├── admin.js         # Admin Panel Management Logic
└── README.md        # Documentation & Setup Guide
```

---

## 🤝 License & Support

TradePilot v1.0 — Built for precision IDX stock analytics and fast market decision making.
