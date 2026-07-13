// --------------------------------------------------------------------------
// TradePilot Core Client Application
// --------------------------------------------------------------------------

const API_BASE = 'http://localhost:8080/api/v1';
const API_KEY = 'dev_secret_key';

// Global App State
let globalMarketData = null;
let globalScreenerData = null;
let globalShareholderData = null;
let globalLeaderboardData = null;

let activeTicker = null;
let activeTab = 'tab-summary';
let sectorList = [];

// ApexCharts references
let chartPriceVolume = null;
let chartPEBands = null;
let chartPBVBands = null;
let chartFlowTimeline = null;
let chartOwnershipTimeline = null;

// Helper: Parse Indonesian locale numbers safely
function parseIndoNum(str) {
    if (!str) return 0;
    let clean = str.toString().replace(/\./g, '').replace(/,/g, '.');
    return parseFloat(clean) || 0;
}

// Helper: Format Money
function formatMoney(num) {
    if (num === null || isNaN(num)) return '-';
    if (Math.abs(num) >= 1e12) return (num / 1e12).toFixed(2) + ' T';
    if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(2) + ' B';
    if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(2) + ' M';
    return formatNum(num);
}

// Helper: Format Numbers
function formatNum(num) {
    if (num === null || isNaN(num)) return '-';
    return num.toLocaleString('id-ID');
}

// Helper: Format Percentage
function formatPct(num) {
    if (num === null || isNaN(num)) return '-';
    return (num > 0 ? '+' : '') + num.toFixed(2) + '%';
}

// Helper: Classify Investor Type (Client side classifying for KSEI shareholders)
function inferInvestorType(name, status) {
    const n = name.toUpperCase();
    let type = 'Lain-lain';
    
    if (n.includes('REKSA DANA') || n.includes('MUTUAL FUND') || n.includes('ASSET MANAGEMENT')) {
        type = 'Mutual Fund';
    } else if (n.includes('KUSTODIAN') || n.includes('CUSTODIAN') || n.includes('TRUSTEE') || n.includes('BANK CUST')) {
        type = 'Custodian/Trustee';
    } else if (n.includes('ASURANSI') || n.includes('INSURANCE') || n.includes('PENSION') || n.includes('DAPEN')) {
        type = 'Insurance/Pension';
    } else if (n.includes('PT ') || n.includes(' CORP') || n.includes(' HOLDINGS') || n.includes(' LIMITED') || n.includes(' LTD')) {
        type = 'Corporate Entity';
    } else if (n.includes('PEMERINTAH') || n.includes('REPUBLIK') || n.includes('GOVERNMENT')) {
        type = 'Government';
    }
    
    const nat = status === 'A' ? 'Asing' : 'Lokal';
    return `${type} (${nat})`;
}

// Fetch API Helper
async function fetchAPI(endpoint) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: { 'X-API-Key': API_KEY }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error(`Error fetching ${endpoint}:`, err);
        return null;
    }
}

// --------------------------------------------------------------------------
// Core Initialization & Loading
// --------------------------------------------------------------------------
async function startSync() {
    const refreshBtn = document.getElementById('refresh-btn');
    const syncText = document.getElementById('last-updated');
    
    refreshBtn.classList.add('syncing');
    syncText.textContent = 'Synchronizing...';
    
    // Concurrently fetch summary data matrices
    const [summary, screener, shareholders, leaderboard] = await Promise.all([
        fetchAPI('/market/summary'),
        fetchAPI('/market/screener'),
        fetchAPI('/market/shareholders?page=1&per_page=2000'),
        fetchAPI('/market/leaderboard')
    ]);
    
    refreshBtn.classList.remove('syncing');
    
    if (!summary || !summary.results || summary.results.length === 0) {
        syncText.textContent = 'Sync Failed!';
        return;
    }

    // Set date header badge
    const tDate = summary.results[0].tanggal_perdagangan_terakhir || '--';
    document.getElementById('trading-date').textContent = `Date: ${tDate}`;
    syncText.textContent = `Synced: ${new Date().toLocaleTimeString()}`;

    // Clean and cache Market Overview
    globalMarketData = summary.results.map(s => {
        let open = parseIndoNum(s.open_price);
        let high = parseIndoNum(s.tertinggi);
        let low = parseIndoNum(s.terendah);
        let freq = parseIndoNum(s.frekuensi);
        let close = parseIndoNum(s.penutupan);
        let prev = parseIndoNum(s.sebelumnya);
        let pct = prev > 0 ? ((close - prev) / prev) * 100 : 0;
        let diff = close - prev;
        
        let vol = parseIndoNum(s.volume);
        let v10 = parseFloat(s.vol_10d) || 0;
        let v20 = parseFloat(s.vol_20d) || 0;
        let v3m = parseFloat(s.vol_3m) || 0;
        
        let vol_10d_pct = v10 > 0 ? ((vol - v10) / v10) * 100 : 0;
        let vol_20d_pct = v20 > 0 ? ((vol - v20) / v20) * 100 : 0;
        let vol_3m_pct = v3m > 0 ? ((vol - v3m) / v3m) * 100 : 0;

        let val = parseIndoNum(s.nilai);
        let fBuy = parseIndoNum(s.foreign_buy);
        let fSell = parseIndoNum(s.foreign_sell);
        let fNet = fBuy - fSell;

        return {
            kode_saham: s.kode_saham,
            nama_perusahaan: s.nama_perusahaan,
            open, high, low, freq, close, prev, pct, diff, vol,
            vol_10d_pct, vol_20d_pct, vol_3m_pct, val, fNet
        };
    });

    // Clean and cache Fundamental Screener
    globalScreenerData = screener.results.map(s => {
        let per = parseIndoNum(s.per_);
        let pbv = parseIndoNum(s.pbv);
        let roe = parseIndoNum(s.roe_pct);
        let roa = parseIndoNum(s.roa_pct);
        let npm = parseIndoNum(s.npm_pct);
        let der = parseIndoNum(s.der);
        let mCap = parseIndoNum(s.mkt_cap);

        return {
            kode_saham: s.kode_saham,
            nama_perusahaan: s.nama_perusahaan,
            sektor: s.sektor || 'Unclassified',
            industri: s.industri || 'Unclassified',
            per, pbv, roe, roa, npm, der, mCap
        };
    });

    // Extract unique sectors
    const sectors = new Set(globalScreenerData.map(s => s.sektor));
    sectorList = Array.from(sectors).sort();
    
    // Populate Sector filter dropdown
    const sectorFilter = document.getElementById('sector-filter');
    sectorFilter.innerHTML = '<option value="">All Sectors</option>' + 
        sectorList.map(sec => `<option value="${sec}">${sec}</option>`).join('');

    // Clean and cache Shareholders
    globalShareholderData = shareholders.results.map(s => {
        let shares = parseIndoNum(s.jumlah_saham);
        let pct = parseIndoNum(s.persentase);
        let change = parseIndoNum(s.perubahan);

        return {
            tanggal_laporan: s.tanggal_laporan,
            kode_emiten: s.kode_emiten,
            nama_pemegang_saham: s.nama_pemegang_saham,
            jenis: inferInvestorType(s.nama_pemegang_saham, s.status),
            jumlah_saham: shares,
            persentase: pct,
            perubahan: change
        };
    });

    // Cache Leaderboard listings
    globalLeaderboardData = leaderboard.results || [];

    // Render components
    renderLeaderboard();
    renderMovers();
    applyGlobalFilters();

    // Auto-select the first stock from the Leaderboard on initial load
    if (globalLeaderboardData.length > 0) {
        const topStock = globalLeaderboardData[0].kode_saham;
        setTimeout(() => {
            const topRow = document.querySelector(`tr[data-ticker="${topStock}"]`);
            if (topRow) topRow.classList.add('selected-row');
            showStockDetailPanel(topStock);
        }, 300);
    }
}

// --------------------------------------------------------------------------
// Sidebar Component Renderers
// --------------------------------------------------------------------------
function renderLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;

    if (globalLeaderboardData.length === 0) {
        list.innerHTML = '<div class="center" style="font-size:0.8rem; color:var(--text-muted);">No Leaderboard Data</div>';
        return;
    }

    list.innerHTML = globalLeaderboardData.map(s => {
        const score = s.score || 0;
        const grade = s.grade || 'F';
        let gradeClass = 'grade-f';
        if (score >= 80) gradeClass = 'grade-a';
        else if (score >= 60) gradeClass = 'grade-b';
        else if (score >= 40) gradeClass = 'grade-c';
        else if (score >= 20) gradeClass = 'grade-d';

        return `
        <div class="mover-item clickable-row" data-ticker="${s.kode_saham}" style="cursor:pointer;" title="Score: ${score}/100 • Click to inspect Details">
            <div>
                <div class="m-code">${s.kode_saham}</div>
                <div class="m-price">Score: ${score}</div>
            </div>
            <div class="badge-grade ${gradeClass}">${grade}</div>
        </div>
        `;
    }).join('');
}

function renderMovers() {
    if (!globalMarketData) return;

    const traded = globalMarketData.filter(s => s.vol > 0 && s.prev > 0);
    const gainers = [...traded].sort((a, b) => b.pct - a.pct).slice(0, 5);
    const losers = [...traded].sort((a, b) => a.pct - b.pct).slice(0, 5);

    // Gainers
    document.getElementById('gainers-list').innerHTML = gainers.map(s => `
        <div class="mover-item clickable-row" data-ticker="${s.kode_saham}" style="cursor:pointer;" title="Click to inspect Details">
            <div>
                <div class="m-code">${s.kode_saham}</div>
                <div class="m-price">${formatNum(s.close)}</div>
            </div>
            <div class="m-change positive">${formatPct(s.pct)}</div>
        </div>
    `).join('');

    // Losers
    document.getElementById('losers-list').innerHTML = losers.map(s => `
        <div class="mover-item clickable-row" data-ticker="${s.kode_saham}" style="cursor:pointer;" title="Click to inspect Details">
            <div>
                <div class="m-code">${s.kode_saham}</div>
                <div class="m-price">${formatNum(s.close)}</div>
            </div>
            <div class="m-change negative">${formatPct(s.pct)}</div>
        </div>
    `).join('');
}

// --------------------------------------------------------------------------
// Main Search & Filter Coordination
// --------------------------------------------------------------------------
function applyGlobalFilters() {
    const query = document.getElementById('search-main').value.trim().toUpperCase();
    const selectedSector = document.getElementById('sector-filter').value;

    let filteredSummary = globalMarketData;
    let filteredScreener = globalScreenerData;
    let filteredShareholders = globalShareholderData;

    // Apply Search
    if (query !== '') {
        filteredSummary = filteredSummary.filter(s => s.kode_saham.includes(query) || s.nama_perusahaan.toUpperCase().includes(query));
        filteredScreener = filteredScreener.filter(s => s.kode_saham.includes(query) || s.nama_perusahaan.toUpperCase().includes(query));
        filteredShareholders = filteredShareholders.filter(s => s.kode_emiten.includes(query) || s.nama_pemegang_saham.toUpperCase().includes(query));
    }

    // Apply Sector
    if (selectedSector !== '') {
        const matchingScreenerTickers = globalScreenerData
            .filter(s => s.sektor === selectedSector)
            .map(s => s.kode_saham);

        filteredSummary = filteredSummary.filter(s => matchingScreenerTickers.includes(s.kode_saham));
        filteredScreener = filteredScreener.filter(s => s.sektor === selectedSector);
        filteredShareholders = filteredShareholders.filter(s => matchingScreenerTickers.includes(s.kode_emiten));
    }

    // Default Sorting: Map confirmation grades from Leaderboard to tables, sort descending by score
    const scoreMap = {};
    const gradeMap = {};
    globalLeaderboardData.forEach(item => {
        scoreMap[item.kode_saham] = item.score;
        gradeMap[item.kode_saham] = item.grade;
    });

    const addSortScores = arr => arr.map(item => ({
        ...item,
        _score: scoreMap[item.kode_saham || item.kode_emiten] || 0,
        _grade: gradeMap[item.kode_saham || item.kode_emiten] || 'F'
    })).sort((a, b) => b._score - a._score);

    renderSummaryTable(addSortScores(filteredSummary));
    renderScreenerTable(addSortScores(filteredScreener));
    renderShareholdersTable(filteredShareholders);
}

// --------------------------------------------------------------------------
// Data Table Renderers
// --------------------------------------------------------------------------
function renderSummaryTable(data) {
    const tbody = document.querySelector('#table-summary tbody');
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="center">No Summary Data Available</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(s => {
        let fNetColor = s.fNet > 0 ? 'txt-green' : (s.fNet < 0 ? 'txt-red' : '');
        let pctColor = s.pct > 0 ? 'txt-green' : (s.pct < 0 ? 'txt-red' : '');
        
        let c10 = s.vol_10d_pct > 0 ? 'txt-green' : (s.vol_10d_pct < 0 ? 'txt-red' : '');
        let c20 = s.vol_20d_pct > 0 ? 'txt-green' : (s.vol_20d_pct < 0 ? 'txt-red' : '');
        let c3m = s.vol_3m_pct > 0 ? 'txt-green' : (s.vol_3m_pct < 0 ? 'txt-red' : '');

        let gradeClass = 'grade-f';
        if (s._score >= 80) gradeClass = 'grade-a';
        else if (s._score >= 60) gradeClass = 'grade-b';
        else if (s._score >= 40) gradeClass = 'grade-c';
        else if (s._score >= 20) gradeClass = 'grade-d';

        return `
        <tr class="clickable-row" data-ticker="${s.kode_saham}">
            <td class="t-code">${s.kode_saham}</td>
            <td style="max-width:200px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${s.nama_perusahaan}">${s.nama_perusahaan}</td>
            <td class="right t-num">${formatNum(s.close)}</td>
            <td class="right t-num ${pctColor}">${formatPct(s.pct)}</td>
            <td class="right t-num">${formatMoney(s.vol)}</td>
            <td class="right t-num ${c10}">${formatPct(s.vol_10d_pct)}</td>
            <td class="right t-num ${c20}">${formatPct(s.vol_20d_pct)}</td>
            <td class="right t-num ${c3m}">${formatPct(s.vol_3m_pct)}</td>
            <td class="right t-num">${formatMoney(s.val)}</td>
            <td class="right t-num">${formatNum(s.freq)}</td>
            <td class="right t-num ${fNetColor}">${formatNum(s.fNet)}</td>
            <td class="center"><span class="badge-grade ${gradeClass}">${s._grade}</span></td>
        </tr>
        `;
    }).join('');
}

function renderScreenerTable(data) {
    const tbody = document.querySelector('#table-screener tbody');
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="center">No Screener Data Available</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(s => {
        let peColor = s.per > 0 && s.per < 15 ? 'txt-green' : (s.per > 25 || s.per < 0 ? 'txt-red' : '');
        let pbvColor = s.pbv > 0 && s.pbv < 1.5 ? 'txt-green' : (s.pbv > 3 ? 'txt-red' : '');
        let roeColor = s.roe > 15 ? 'txt-green' : (s.roe < 5 ? 'txt-red' : '');
        let npmColor = s.npm > 15 ? 'txt-green' : (s.npm < 5 ? 'txt-red' : '');

        return `
        <tr class="clickable-row" data-ticker="${s.kode_saham}">
            <td class="t-code">${s.kode_saham}</td>
            <td style="max-width:180px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${s.nama_perusahaan}">${s.nama_perusahaan}</td>
            <td>${s.sektor}</td>
            <td style="max-width:180px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${s.industri}">${s.industri}</td>
            <td class="right t-num ${peColor}">${s.per.toFixed(2)}</td>
            <td class="right t-num ${pbvColor}">${s.pbv.toFixed(2)}</td>
            <td class="right t-num ${roeColor}">${formatPct(s.roe)}</td>
            <td class="right t-num">${formatPct(s.roa)}</td>
            <td class="right t-num ${npmColor}">${formatPct(s.npm)}</td>
            <td class="right t-num">${s.der.toFixed(2)}</td>
            <td class="right t-num">${formatMoney(s.mCap)}</td>
        </tr>
        `;
    }).join('');
}

function renderShareholdersTable(data) {
    const tbody = document.querySelector('#table-shareholders tbody');
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="center">No Shareholders Data Available</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(s => {
        let changeColor = s.perubahan > 0 ? 'txt-green' : (s.perubahan < 0 ? 'txt-red' : '');
        let ppText = '';
        
        if (Math.abs(s.perubahan) > 0.0001) {
            ppText = ` (${s.perubahan > 0 ? '+' : ''}${s.perubahan.toFixed(2)} pp)`;
        }

        return `
        <tr class="clickable-row" data-ticker="${s.kode_emiten}">
            <td>${s.tanggal_laporan}</td>
            <td class="t-code">${s.kode_emiten}</td>
            <td style="max-width:240px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${s.nama_pemegang_saham}">${s.nama_pemegang_saham}</td>
            <td>${s.jenis}</td>
            <td class="right t-num">${formatNum(s.jumlah_saham)}</td>
            <td class="right t-num">${s.persentase.toFixed(2)}%</td>
            <td class="right t-num ${changeColor}">${formatNum(s.perubahan)}${ppText}</td>
        </tr>
        `;
    }).join('');
}

// --------------------------------------------------------------------------
// Circular SVG Gauge Maker (Confirmation Gauges)
// --------------------------------------------------------------------------
function createCircularGauge(containerId, score, maxScore, color) {
    const pct = Math.min(100, Math.max(0, (score / maxScore) * 100));
    const container = document.getElementById(containerId);
    if (!container) return;
    const radius = 18;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (pct / 100) * circumference;
    
    container.innerHTML = `
        <svg viewBox="0 0 44 44" style="width:100%; height:100%;">
            <circle cx="22" cy="22" r="${radius}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="3" />
            <circle cx="22" cy="22" r="${radius}" fill="none" stroke="${color}" stroke-width="3.5" 
                    stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}"
                    stroke-linecap="round" style="transform: rotate(-90deg); transform-origin: 50% 50%; transition: stroke-dashoffset 0.4s ease;" />
            <text x="22" y="26" text-anchor="middle" fill="#fff" font-size="8.5" font-family="'JetBrains Mono', monospace" font-weight="700">${score}</text>
        </svg>
    `;
}

// --------------------------------------------------------------------------
// Stock Detail Drawer & ApexCharts Visualizations
// --------------------------------------------------------------------------
async function showStockDetailPanel(ticker) {
    if (!globalMarketData) return;
    const stock = globalMarketData.find(s => s.kode_saham === ticker);
    if (!stock) return;

    activeTicker = ticker;

    // Highlight row selections
    document.querySelectorAll('tr[data-ticker]').forEach(r => r.classList.remove('selected-row'));
    document.querySelectorAll(`tr[data-ticker="${ticker}"]`).forEach(r => r.classList.add('selected-row'));

    // Populate drawer header
    document.getElementById('detail-ticker').textContent = ticker;
    document.getElementById('detail-name').textContent = stock.nama_perusahaan;
    document.getElementById('detail-close').textContent = formatNum(stock.close);
    document.getElementById('detail-change').textContent = `${stock.diff > 0 ? '+' : ''}${stock.diff} (${formatPct(stock.pct)})`;
    document.getElementById('detail-change').className = stock.pct > 0 ? 'txt-green' : (stock.pct < 0 ? 'txt-red' : '');

    // Reset charts
    destroyCharts();

    // Open Drawer panel
    const panel = document.getElementById('stock-detail-panel');
    panel.classList.add('open');

    // Fetch deep-dive statistics concurrently
    const [historyData, confirmData, valuationData, ownershipData] = await Promise.all([
        fetchAPI(`/stocks/${ticker}/history?limit=30`),
        fetchAPI(`/stocks/${ticker}/confirmation`),
        fetchAPI(`/stocks/${ticker}/valuation-bands`),
        fetchAPI(`/stocks/${ticker}/ownership-timeline`)
    ]);

    // 1. Render Price/Volume Chart + 5-Day Trend Analyzer Card
    renderPriceVolumeChart(historyData);

    // 2. Render Confirmation Gauges & Checklist
    renderConfirmationDetails(confirmData);

    // 3. Render Valuation Bands
    renderValuationBands(valuationData);

    // 4. Render Net Flow Summary
    renderNetFlowSummary(ticker, historyData);

    // 5. Render Ownership Float gauges & timelines
    renderOwnershipTimeline(ownershipData);
}

// 1. Price & Volume Chart Rendering + 5-Day Correlation Analysis
function renderPriceVolumeChart(data) {
    const trendCard = document.getElementById('detail-trend-card');
    const badge = document.getElementById('trend-status-badge');
    const desc = document.getElementById('trend-synthesis-text');
    const chartContainer = document.getElementById('price-history-chart');

    if (!data || !data.history || data.history.length === 0) {
        chartContainer.innerHTML = '<div class="center" style="padding:40px; color:var(--text-muted);">No Price History Available</div>';
        trendCard.style.display = 'none';
        return;
    }

    trendCard.style.display = 'flex';
    const h = data.history;

    // Calculate 5-Day Correlation and Sizing
    // Grab the last 5 days
    const len = h.length;
    const last5 = h.slice(Math.max(0, len - 5));

    if (last5.length >= 2) {
        const first = last5[0];
        const last = last5[last5.length - 1];

        // Vol growth: Latest session volume vs volume 5 sessions ago
        const volChange = first.volume > 0 ? ((last.volume - first.volume) / first.volume) * 100 : 0;
        // Price change over those 5 sessions
        const priceChange = first.close > 0 ? ((last.close - first.close) / first.close) * 100 : 0;

        let trend = 'NEUTRAL';
        let alertClass = 'neutral';
        let alertMsg = '';

        if (volChange > 10 && priceChange > 0.5) {
            trend = 'BULLISH';
            alertClass = 'bullish';
            alertMsg = `✅ <strong>Bullish Accumulation</strong>: Daily volume has surged by <strong>${volChange.toFixed(1)}%</strong> over the past 5 sessions, supporting an upward price movement of <strong>${formatPct(priceChange)}</strong>. Indicates strong institutional interest.`;
        } else if (volChange > 10 && priceChange < -0.5) {
            trend = 'BEARISH';
            alertClass = 'bearish';
            alertMsg = `⚠️ <strong>Bearish Distribution</strong>: Volume expanded by <strong>${volChange.toFixed(1)}%</strong> on a downward price trend of <strong>${formatPct(priceChange)}</strong>. Indicates heavy retail liquidation or distribution.`;
        } else if (volChange < -10 && priceChange > 0.5) {
            trend = 'DIVERGENT';
            alertClass = 'neutral';
            alertMsg = `⚠️ <strong>Volume Divergence</strong>: Price rose by <strong>${formatPct(priceChange)}</strong> but volume fell by <strong>${Math.abs(volChange).toFixed(1)}%</strong>. Rally lacks liquidity backing; possible exhaustion zone.`;
        } else {
            trend = 'CONSOLIDATION';
            alertClass = 'neutral';
            alertMsg = `⚖️ <strong>Sideways Trend</strong>: Vol growth (<strong>${volChange.toFixed(1)}%</strong>) and price changes (<strong>${formatPct(priceChange)}</strong>) are consolidating within normal bounds.`;
        }

        badge.className = `trend-badge ${alertClass}`;
        badge.textContent = `${trend} VOLUME MATCH`;
        desc.innerHTML = alertMsg;
    } else {
        trendCard.style.display = 'none';
    }

    // Chart Options
    const dates = h.map(x => x.date);
    const prices = h.map(x => x.close);
    const volumes = h.map(x => x.volume);

    const options = {
        series: [
            { name: 'Close Price', type: 'line', data: prices },
            { name: 'Volume', type: 'column', data: volumes }
        ],
        chart: {
            height: 250,
            type: 'line',
            toolbar: { show: false },
            background: 'transparent'
        },
        stroke: {
            width: [3, 0],
            curve: 'smooth'
        },
        colors: ['#00f2fe', 'rgba(0, 242, 254, 0.15)'],
        dataLabels: { enabled: false },
        xaxis: {
            categories: dates,
            axisBorder: { show: false },
            labels: {
                style: { colors: '#94a3b8', fontSize: '10px' },
                rotate: -30,
                rotateAlways: false
            }
        },
        yaxis: [
            {
                title: { text: 'Price (IDR)', style: { color: '#00f2fe' } },
                labels: { style: { colors: '#94a3b8' } }
            },
            {
                opposite: true,
                title: { text: 'Volume', style: { color: 'rgba(0, 242, 254, 0.6)' } },
                labels: {
                    formatter: v => formatMoney(v),
                    style: { colors: '#94a3b8' }
                }
            }
        ],
        grid: { borderColor: 'rgba(255,255,255,0.05)' },
        theme: { mode: 'dark' },
        tooltip: { shared: true }
    };

    chartPriceVolume = new ApexCharts(chartContainer, options);
    chartPriceVolume.render();
}

// 2. Confirmation Matrix Score breakdowns & checklist rendering
function renderConfirmationDetails(data) {
    if (!data) return;

    // Composite grade badge
    const score = data.total_score || 0;
    const grade = data.grade || '--';
    const gradeEl = document.getElementById('detail-grade');
    
    gradeEl.textContent = `Grade: ${grade}`;
    gradeEl.className = 'badge-grade ' + (score >= 80 ? 'grade-a' : (score >= 60 ? 'grade-b' : (score >= 40 ? 'grade-c' : (score >= 20 ? 'grade-d' : 'grade-f'))));

    // Dynamic radial subscore gauges
    createCircularGauge('gauge-technical-container', data.technical?.score || 0, 35, '#00f2fe');
    document.getElementById('txt-score-technical').textContent = `${data.technical?.score || 0} / 35`;

    createCircularGauge('gauge-volume-container', data.volume?.score || 0, 30, '#f59e0b');
    document.getElementById('txt-score-volume').textContent = `${data.volume?.score || 0} / 30`;

    createCircularGauge('gauge-institutional-container', data.institutional?.score || 0, 35, '#10b981');
    document.getElementById('txt-score-institutional').textContent = `${data.institutional?.score || 0} / 35`;

    // Checklist Rows
    const container = document.getElementById('confirmation-checklist-container');
    if (container && data.checklist) {
        container.innerHTML = data.checklist.map(item => {
            let icon = '⚠️';
            let colorClass = 'txt-orange';
            if (item.status === 'pass') {
                icon = '✅';
                colorClass = 'txt-green';
            } else if (item.status === 'fail') {
                icon = '❌';
                colorClass = 'txt-red';
            }
            
            return `
            <div class="mover-item" style="padding:10px 14px; gap:10px; background:rgba(0,0,0,0.1); justify-content:flex-start;">
                <span style="font-size: 1.15rem; line-height:1;">${icon}</span>
                <div style="flex-grow:1;">
                    <div style="font-size:0.82rem; font-weight:600; color:var(--text-main);">${item.label}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${item.detail}</div>
                </div>
            </div>
            `;
        }).join('');
    }
}

// 3. Valuation Bands (ApexCharts Area/Line Standard Deviation Zones)
function renderValuationBands(data) {
    const peCont = document.getElementById('pe-bands-chart');
    const pbvCont = document.getElementById('pbv-bands-chart');

    if (!data) {
        peCont.innerHTML = '<div class="center" style="color:var(--text-muted)">Valuation Unavailable</div>';
        pbvCont.innerHTML = '<div class="center" style="color:var(--text-muted)">Valuation Unavailable</div>';
        return;
    }

    const drawBand = (container, keyData, title) => {
        if (!keyData || !keyData.history) {
            container.innerHTML = '<div class="center">No History</div>';
            return;
        }

        const dates = keyData.history.map(x => x.date);
        const values = keyData.history.map(x => x.value);
        
        const b = keyData.bands;
        const series = [
            { name: 'Current P/E', data: values },
            { name: 'Mean', data: Array(dates.length).fill(b.mean) },
            { name: '+1 SD', data: Array(dates.length).fill(b.plus_1sd) },
            { name: '+2 SD', data: Array(dates.length).fill(b.plus_2sd) },
            { name: '-1 SD', data: Array(dates.length).fill(b.minus_1sd) },
            { name: '-2 SD', data: Array(dates.length).fill(b.minus_2sd) }
        ];

        const options = {
            series: series,
            chart: {
                height: 230,
                type: 'line',
                toolbar: { show: false }
            },
            colors: ['#00f2fe', '#94a3b8', '#f59e0b', '#ef4444', '#10b981', '#047857'],
            stroke: {
                width: [3, 1.5, 1, 1, 1, 1],
                dashArray: [0, 5, 3, 3, 3, 3]
            },
            xaxis: {
                categories: dates,
                labels: { style: { colors: '#94a3b8', fontSize: '9px' } }
            },
            yaxis: {
                labels: { style: { colors: '#94a3b8' } }
            },
            grid: { borderColor: 'rgba(255,255,255,0.05)' },
            theme: { mode: 'dark' },
            legend: { show: false }
        };

        const chart = new ApexCharts(container, options);
        chart.render();
        return chart;
    };

    chartPEBands = drawBand(peCont, data.per, 'P/E Bands');
    chartPBVBands = drawBand(pbvCont, data.pbv, 'PBV Bands');
}

// 4. Net Volume Flow summary and 5-Day Net Volume charts
function renderNetFlowSummary(ticker, historyData) {
    const summaryStock = globalMarketData.find(s => s.kode_saham === ticker);
    if (!summaryStock) return;

    // Stacked buy/sell heatbar
    const buyVal = parseIndoNum(summaryStock.vol); // Using total volume as helper or calculate net
    // Fetch flow detail
    fetchAPI(`/stocks/${ticker}/flow-summary`).then(data => {
        if (!data) return;

        const fBuy = data.foreign_buy || 0;
        const fSell = data.foreign_sell || 0;
        const total = fBuy + fSell;
        
        let buyPct = 50;
        let sellPct = 50;
        
        if (total > 0) {
            buyPct = (fBuy / total) * 100;
            sellPct = (fSell / total) * 100;
        }

        const heatbar = document.getElementById('flow-net-heatbar');
        if (heatbar) {
            heatbar.innerHTML = `
                <div style="width: ${buyPct}%; background: var(--neon-green); box-shadow: 0 0 10px var(--neon-green-glow); transition: width 0.4s ease;"></div>
                <div style="width: ${sellPct}%; background: var(--neon-red); box-shadow: 0 0 10px var(--neon-red-glow); transition: width 0.4s ease;"></div>
            `;
        }

        document.getElementById('flow-buy-val').textContent = `Buy: ${formatNum(fBuy)}`;
        document.getElementById('flow-sell-val').textContent = `Sell: ${formatNum(fSell)}`;
        
        const netVal = document.getElementById('flow-net-val');
        netVal.textContent = (data.foreign_net >= 0 ? '+' : '') + formatNum(data.foreign_net);
        netVal.className = data.foreign_net >= 0 ? 'txt-green' : 'txt-red';

        // 5-Day net volume bar chart
        const timelineCont = document.getElementById('flow-timeline-chart');
        if (!timelineCont) return;

        if (!data.trend_5d || data.trend_5d.length === 0) {
            timelineCont.innerHTML = '<div class="center" style="padding:30px; color:var(--text-muted);">No 5-Day flow details</div>';
            return;
        }

        const dates = data.trend_5d.map(x => x.date);
        const closes = data.trend_5d.map(x => x.close);
        const volumes = data.trend_5d.map(x => x.volume);

        const options = {
            series: [{
                name: 'Net Flow (Shares)',
                data: volumes
            }],
            chart: {
                height: 200,
                type: 'bar',
                toolbar: { show: false }
            },
            plotOptions: {
                bar: {
                    colors: {
                        ranges: [{
                            from: -999999999999,
                            to: -1,
                            color: '#ef4444'
                        }, {
                            from: 0,
                            to: 999999999999,
                            color: '#10b981'
                        }]
                    }
                }
            },
            xaxis: {
                categories: dates,
                labels: { style: { colors: '#94a3b8' } }
            },
            yaxis: {
                labels: { 
                    formatter: v => formatMoney(v),
                    style: { colors: '#94a3b8' } 
                }
            },
            grid: { borderColor: 'rgba(255,255,255,0.05)' },
            theme: { mode: 'dark' }
        };

        chartFlowTimeline = new ApexCharts(timelineCont, options);
        chartFlowTimeline.render();
    });
}

// 5. OJK Free Float circular indicator and Shareholder timeline area charts
function renderOwnershipTimeline(data) {
    const floatCont = document.getElementById('free-float-gauge');
    const hhiVal = document.getElementById('hhi-value');
    const hhiBar = document.getElementById('hhi-bar');
    const hhiStatus = document.getElementById('hhi-status');
    const timelineCont = document.getElementById('ownership-timeline-chart');

    if (!data) {
        floatCont.innerHTML = '<div class="center">No Float</div>';
        hhiVal.textContent = '0';
        hhiBar.innerHTML = '';
        timelineCont.innerHTML = '<div class="center">No Timeline</div>';
        return;
    }

    // Circular SVG Gauge for Free Float
    const fPct = data.free_float?.current_pct || 0;
    const radius = 18;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (Math.min(100, fPct) / 100) * circumference;
    const floatColor = fPct >= 15 ? 'var(--neon-green)' : 'var(--neon-red)';
    const statusText = fPct >= 15 ? 'Compliant ✅' : 'Non-Compliant ❌';

    floatCont.innerHTML = `
        <svg viewBox="0 0 44 44" style="width:100%; height:100%;">
            <circle cx="22" cy="22" r="${radius}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="3" />
            <circle cx="22" cy="22" r="${radius}" fill="none" stroke="${floatColor}" stroke-width="3.5" 
                    stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}"
                    stroke-linecap="round" style="transform: rotate(-90deg); transform-origin: 50% 50%;" />
            <text x="22" y="24" text-anchor="middle" fill="#fff" font-size="7.5" font-family="'JetBrains Mono', monospace" font-weight="700">${fPct.toFixed(1)}%</text>
            <text x="22" y="32" text-anchor="middle" fill="#94a3b8" font-size="4.5">Free Float</text>
        </svg>
    `;
    document.getElementById('free-float-status').textContent = `OJK Status: ${statusText}`;
    document.getElementById('free-float-status').className = fPct >= 15 ? 'txt-green' : 'txt-red';

    // HHI Index concentration bar
    const hhi = data.concentration_hhi || 0;
    hhiVal.textContent = hhi.toFixed(1);
    
    let concentration = 'Diverse Ownership';
    let hhiColor = 'var(--neon-green)';
    let segments = `<div style="width: 100%; background: var(--neon-green)"></div>`;

    if (hhi > 2500) {
        concentration = 'Highly Concentrated';
        hhiColor = 'var(--neon-red)';
        segments = `<div style="width: 100%; background: var(--neon-red)"></div>`;
    } else if (hhi > 1500) {
        concentration = 'Moderately Concentrated';
        hhiColor = 'var(--neon-orange)';
        segments = `<div style="width: 100%; background: var(--neon-orange)"></div>`;
    }

    hhiBar.innerHTML = segments;
    hhiStatus.innerHTML = `Category: <strong style="color: ${hhiColor}">${concentration}</strong>`;

    // Major Shareholders stacked area chart
    if (!timelineCont) return;

    if (!data.dates || data.dates.length === 0 || !data.holders) {
        timelineCont.innerHTML = '<div class="center" style="padding:40px; color:var(--text-muted);">No shareholder timeline data available</div>';
        return;
    }

    const series = data.holders.map(holder => ({
        name: holder.name,
        data: holder.series
    }));

    const options = {
        series: series,
        chart: {
            height: 260,
            type: 'area',
            stacked: true,
            toolbar: { show: false }
        },
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 2 },
        xaxis: {
            categories: data.dates,
            labels: { style: { colors: '#94a3b8' } }
        },
        yaxis: {
            labels: { style: { colors: '#94a3b8' } }
        },
        grid: { borderColor: 'rgba(255,255,255,0.05)' },
        theme: { mode: 'dark' },
        tooltip: { shared: true }
    };

    chartOwnershipTimeline = new ApexCharts(timelineCont, options);
    chartOwnershipTimeline.render();
}

// Destroy all charts instances to prevent memory leaks or overlay issues
function destroyCharts() {
    if (chartPriceVolume) { chartPriceVolume.destroy(); chartPriceVolume = null; }
    if (chartPEBands) { chartPEBands.destroy(); chartPEBands = null; }
    if (chartPBVBands) { chartPBVBands.destroy(); chartPBVBands = null; }
    if (chartFlowTimeline) { chartFlowTimeline.destroy(); chartFlowTimeline = null; }
    if (chartOwnershipTimeline) { chartOwnershipTimeline.destroy(); chartOwnershipTimeline = null; }
}

// --------------------------------------------------------------------------
// UI Listeners & Orchestration Event Handlers
// --------------------------------------------------------------------------
function setupListeners() {
    const searchMain = document.getElementById('search-main');
    const sectorFilter = document.getElementById('sector-filter');
    const refreshBtn = document.getElementById('refresh-btn');
    const closeDetailBtn = document.getElementById('close-detail-btn');
    const detailPanel = document.getElementById('stock-detail-panel');

    // Global Search & Sector Filter binding
    searchMain.addEventListener('input', applyGlobalFilters);
    sectorFilter.addEventListener('change', applyGlobalFilters);

    // Sync button trigger
    refreshBtn.addEventListener('click', () => {
        if (!refreshBtn.classList.contains('syncing')) {
            startSync();
        }
    });

    // Close detail drawer trigger
    closeDetailBtn.addEventListener('click', () => {
        detailPanel.classList.remove('open');
        document.querySelectorAll('tr[data-ticker]').forEach(r => r.classList.remove('selected-row'));
    });

    // Escape key binds to dismiss drawer
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && detailPanel.classList.contains('open')) {
            detailPanel.classList.remove('open');
            document.querySelectorAll('tr[data-ticker]').forEach(r => r.classList.remove('selected-row'));
        }
    });

    // Tab view selectors
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            const paneId = btn.getAttribute('data-target');
            document.getElementById(paneId).classList.add('active');
            activeTab = paneId;
        });
    });

    // Detailed deep dive tabs selectors
    document.querySelectorAll('.detail-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.detail-tab-pane').forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const paneId = btn.getAttribute('data-target');
            document.getElementById(paneId).classList.add('active');
        });
    });



    // Click triggers for selecting and deep diving details of stocks
    document.addEventListener('click', (e) => {
        const row = e.target.closest('tr[data-ticker]') || e.target.closest('.mover-item[data-ticker]');
        if (row) {
            const ticker = row.getAttribute('data-ticker');
            showStockDetailPanel(ticker);
        }
    });
}

// --------------------------------------------------------------------------
// Initialization Entry point
// --------------------------------------------------------------------------
function init() {
    setupListeners();
    startSync();
}

document.addEventListener('DOMContentLoaded', init);
