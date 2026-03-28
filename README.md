# TradePilot Dashboard

A stunning, ultra-premium single-page dashboard built natively with Vanilla HTML, CSS (Glassmorphism), and JavaScript to consume data from the TradePilot IDX API (`StockScrapper`).

## Features

- **Top Movers:** Instantly view the top gainers and losers from the market alongside real-time breadth stats.
- **Market Summary:** A comprehensive view of price changes, trading volume, and foreign flows.
- **Stock Screener:** Fundamental ratios including PER, PBVR, ROE, ROA, DER, and Market Cap.
- **Top Brokers:** Real-time net volume accumulation/distribution per broker.
- **5% Shareholders (KSEI):** The latest institutional and >5% ownership changes dynamically extracted from IDX PDFs.

---

## How to Use Locally

The backend API (`StockScrapper`) must be running on `http://localhost:8080`. 

1. **Start the API:**
   Navigate to your `StockScrapper` project and run:
   ```bash
   make dev
   ```
   *(Ensure your PostgreSQL database is also running via Docker).*

2. **Start the Dashboard:**
   Because this dashboard fetches data via modern ES6 modules (`type="module"`), you cannot simply double-click the `index.html` file due to browser CORS policies. You must run it through a local web server.

   **Using Node.js (npx):**
   ```bash
   npx serve -l 3000
   ```
   *Then open `http://localhost:3000` in your browser.*

   **Using Python (Alternative):**
   ```bash
   python -m http.server 3000
   ```

3. **Explore the Data:**
   - Click the "Sync" button in the top right to refresh all views using the `dev_secret_key`.
   - Switch between the interactive tabs below the Top Movers to explore different market dimensions.

## Architecture

- `index.html` — The structural backbone and Grid layouts.
- `style.css` — High-performance CSS native variables styling the sleek dark mode and glowing glass aesthetics.
- `app.js` — The logic layer mapping `fetch()` sequences to the `StockScrapper` Go backend.

Enjoy your visually flawless market overview!
