// Configuration
const API_BASE = 'http://localhost:8080/api/v1';
const API_KEY = 'dev_secret_key';

// DOM Elements
const refreshBtn = document.getElementById('refresh-btn');
const syncText = document.getElementById('sync-text');
const lastUpdated = document.getElementById('last-updated');
const searchSummary = document.getElementById('search-summary');
const searchScreener = document.getElementById('search-screener');
const tabs = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// State tracking
let globalMarketData = null; // Cache to avoid refetching /market/summary
let globalScreenerData = null; // Cache to avoid refetching /market/screener
let globalShareholdersData = null; // Cache for AI Engine
let selectedSectors = [];
let selectedIndustries = [];
const loadedTabs = {
    'tab-summary': false,
    'tab-screener': false,
    'tab-shareholders': false
};

// Utilities for Indonesian number format ("1.500" -> 1500)
const parseIndoNum = (str, returnNull = false) => {
    if (!str || str.trim() === '-' || str.trim() === '') return returnNull ? null : 0;
    // Remove all dots, convert commas to dots
    let val = str.replace(/\./g, '').replace(/,/g, '.');
    // Remove newlines and tabs from IDX bad data (e.g. "=\n\t\t\t\t0")
    val = val.replace(/[\n\t= ]/g, '');
    let num = parseFloat(val);
    return isNaN(num) ? (returnNull ? null : 0) : num;
};

// English number format ("3,200,142,830" -> 3200142830, "41.10" -> 41.1)
const parseEngNum = (str) => {
    if (!str) return 0;
    let val = str.replace(/,/g, ''); // Remove thousand-separator commas
    val = val.replace(/[\n\t= ]/g, '');
    let num = parseFloat(val);
    return isNaN(num) ? 0 : num;
};

const formatNum = (num) => new Intl.NumberFormat('en-US').format(num);
const formatMoney = (num) => {
    if (num >= 1e12) return (num / 1e12).toFixed(2) + ' T';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + ' B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + ' M';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);
};
const formatPct = (num) => {
    let sign = num > 0 ? '+' : '';
    return `${sign}${num.toFixed(2)}%`;
};

// Main fetch wrapper
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

// ─────────────────────────────────────────────────────────────
// DATA FETCHING & MOVERS
// ─────────────────────────────────────────────────────────────

async function loadMarketSummary() {
    const data = await fetchAPI('/market/summary');
    if (!data || !data.results || data.results.length === 0) return false;
    
    // Set Trading Date Badge
    const tDate = data.results[0].tanggal_perdagangan_terakhir || '--';
    document.getElementById('trading-date').textContent = `Date: ${tDate}`;
    
    // Process raw strings into clean numbers for sorting and math
    globalMarketData = data.results.map(s => {
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
            open,
            high,
            low,
            freq,
            close,
            prev,
            pct,
            diff,
            vol,
            vol_10d_pct,
            vol_20d_pct,
            vol_3m_pct,
            val,
            fNet
        };
    });

    renderMovers();
    renderMarketActivity();
    const q = searchSummary.value.trim().toUpperCase();
    if (q) {
        renderSummaryTable(globalMarketData.filter(s => s.kode_saham.includes(q)));
    } else {
        renderSummaryTable(globalMarketData);
    }
    loadedTabs['tab-summary'] = true;
    return true;
}

function renderMovers() {
    if (!globalMarketData) return;

    // Filter valid traded stocks
    const traded = globalMarketData.filter(s => s.vol > 0 && s.prev > 0);
    
    // Sort
    const gainers = [...traded].sort((a, b) => b.pct - a.pct).slice(0, 5);
    const losers = [...traded].sort((a, b) => a.pct - b.pct).slice(0, 5);

    // Render Gainers
    document.getElementById('gainers-list').innerHTML = gainers.map(s => `
        <div class="mover-item">
            <div>
                <div class="m-code">${s.kode_saham}</div>
                <div class="m-price">${formatNum(s.close)}</div>
            </div>
            <div class="m-change positive">+${s.diff} (+${s.pct.toFixed(2)}%)</div>
        </div>`).join('');

    // Render Losers
    document.getElementById('losers-list').innerHTML = losers.map(s => `
        <div class="mover-item">
            <div>
                <div class="m-code">${s.kode_saham}</div>
                <div class="m-price">${formatNum(s.close)}</div>
            </div>
            <div class="m-change negative">${s.diff} (${s.pct.toFixed(2)}%)</div>
        </div>`).join('');
}

function renderMarketActivity() {
    if (!globalMarketData) return;
    
    let totalVal = 0, totalVol = 0, totalFNet = 0;
    globalMarketData.forEach(s => {
        totalVal += s.val;
        totalVol += s.vol;
        totalFNet += s.fNet;
    });

    document.getElementById('stat-value').textContent = formatMoney(totalVal);
    document.getElementById('stat-volume').textContent = formatMoney(totalVol);
    
    const fNetEl = document.getElementById('stat-foreign');
    fNetEl.textContent = formatMoney(Math.abs(totalFNet));
    fNetEl.className = 'value ' + (totalFNet > 0 ? 'txt-green' : 'txt-red');
    if (totalFNet < 0) fNetEl.textContent = '-' + fNetEl.textContent;
}

// ─────────────────────────────────────────────────────────────
// TAB DATA LOADERS
// ─────────────────────────────────────────────────────────────

async function loadTabContent(targetId) {
    if (loadedTabs[targetId]) return;

    if (targetId === 'tab-screener') {
        const data = await fetchAPI('/market/screener');
        if (data) {
            globalScreenerData = data.results.map(r => ({
                kode_saham: r.kode_saham,
                nama_perusahaan: r.nama_perusahaan,
                sektor: r.sektor || '-',
                industri: r.industri || '-',
                pe: parseIndoNum(r.per, true),
                pbv: parseIndoNum(r.pbv, true),
                roe: parseIndoNum(r.roe_pct, true),
                roa: parseIndoNum(r.roa_pct, true),
                npm: parseIndoNum(r.npm_pct, true),
                der: parseIndoNum(r.der, true),
                mc: parseIndoNum(r.mkt_cap, true)
            }));
            
            const sectors = [...new Set(globalScreenerData.map(r => r.sektor).filter(s => s !== '-'))].sort();
            const industries = [...new Set(globalScreenerData.map(r => r.industri).filter(s => s !== '-'))].sort();
            
            initMultiSelect('ms-sector', sectors, selectedSectors);
            initMultiSelect('ms-industry', industries, selectedIndustries);
            
            applyScreenerFilters();
        }
    } 
    else if (targetId === 'tab-shareholders') {
        if (!globalShareholdersData) {
            const data = await fetchAPI('/market/shareholders?page=1&per_page=2000');
            if (data) globalShareholdersData = data.results;
        }
        if (globalShareholdersData) renderShareholdersTable(globalShareholdersData);
    }

    loadedTabs[targetId] = true;
}

function applyScreenerFilters() {
    if (!globalScreenerData) return;
    const query = searchScreener.value.trim().toUpperCase();
    let filtered = globalScreenerData;
    
    if (query) filtered = filtered.filter(s => s.kode_saham.includes(query));
    if (selectedSectors.length > 0) filtered = filtered.filter(s => selectedSectors.includes(s.sektor));
    if (selectedIndustries.length > 0) filtered = filtered.filter(s => selectedIndustries.includes(s.industri));
    
    renderScreenerTable(filtered);
}

function initMultiSelect(elementId, items, selectedArray) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const header = el.querySelector('.ms-header');
    const dropdown = el.querySelector('.ms-dropdown');
    
    header.innerHTML = `All ${el.getAttribute('data-name')}s \u25BE`;
    dropdown.innerHTML = items.map(t => `<label><input type="checkbox" value="${t}"> ${t.length > 30 ? t.substring(0,30)+'...' : t}</label>`).join('');
    
    header.onclick = (e) => {
        const isHidden = dropdown.style.display === 'none';
        document.querySelectorAll('.ms-dropdown').forEach(d => d.style.display = 'none');
        dropdown.style.display = isHidden ? 'block' : 'none';
        e.stopPropagation();
    };
    
    dropdown.querySelectorAll('input').forEach(chk => {
        chk.addEventListener('change', (e) => {
            if (e.target.checked) selectedArray.push(e.target.value);
            else selectedArray.splice(selectedArray.indexOf(e.target.value), 1);
            
            header.innerHTML = selectedArray.length === 0 ? `All ${el.getAttribute('data-name')}s \u25BE` : `${selectedArray.length} Selected \u25BE`;
            applyScreenerFilters();
        });
    });
}

document.addEventListener('click', () => document.querySelectorAll('.ms-dropdown').forEach(d => d.style.display = 'none'));

// ─────────────────────────────────────────────────────────────
// TABLE RENDERERS
// ─────────────────────────────────────────────────────────────

function renderSummaryTable(results) {
    const tbody = document.querySelector('#table-summary tbody');
    if (!results || !results.length) {
        tbody.innerHTML = '<tr><td colspan="14" class="center">No data available</td></tr>';
        return;
    }

    // Assign data attributes for sorting logic
    tbody.innerHTML = results.map(r => {
        let colorClass = r.pct > 0 ? 'txt-green' : (r.pct < 0 ? 'txt-red' : '');
        let fNetColor = r.fNet > 0 ? 'txt-green' : (r.fNet < 0 ? 'txt-red' : '');
        
        let c10 = r.vol_10d_pct > 0 ? 'txt-green' : (r.vol_10d_pct < 0 ? 'txt-red' : '');
        let c20 = r.vol_20d_pct > 0 ? 'txt-green' : (r.vol_20d_pct < 0 ? 'txt-red' : '');
        let c3m = r.vol_3m_pct > 0 ? 'txt-green' : (r.vol_3m_pct < 0 ? 'txt-red' : '');
        
        return `
        <tr>
            <td class="t-code" data-value="${r.kode_saham}">${r.kode_saham}</td>
            <td data-value="${r.nama_perusahaan}" title="${r.nama_perusahaan}">${r.nama_perusahaan.length > 18 ? r.nama_perusahaan.substring(0,18)+'...' : r.nama_perusahaan}</td>
            <td class="right" data-value="${r.open}">${formatNum(r.open)}</td>
            <td class="right" data-value="${r.high}">${formatNum(r.high)}</td>
            <td class="right" data-value="${r.low}">${formatNum(r.low)}</td>
            <td class="right" data-value="${r.close}">${formatNum(r.close)}</td>
            <td class="right ${colorClass}" data-value="${r.pct}">${formatPct(r.pct)}</td>
            <td class="right" data-value="${r.vol}">${formatNum(r.vol)}</td>
            <td class="right ${c10}" data-value="${r.vol_10d_pct}">${formatPct(r.vol_10d_pct)}</td>
            <td class="right ${c20}" data-value="${r.vol_20d_pct}">${formatPct(r.vol_20d_pct)}</td>
            <td class="right ${c3m}" data-value="${r.vol_3m_pct}">${formatPct(r.vol_3m_pct)}</td>
            <td class="right" data-value="${r.val}">${formatMoney(r.val)}</td>
            <td class="right" data-value="${r.freq}">${formatNum(r.freq)}</td>
            <td class="right ${fNetColor}" data-value="${r.fNet}">${formatNum(r.fNet)}</td>
        </tr>
        `;
    }).join('');
}

function renderScreenerTable(results) {
    const tbody = document.querySelector('#table-screener tbody');
    if (!results || !results.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="center">No data available</td></tr>';
        return;
    }

    tbody.innerHTML = results.map(r => {
        let roeColor = r.roe > 0 ? 'txt-green' : (r.roe < 0 ? 'txt-red' : '');
        let roaColor = r.roa > 0 ? 'txt-green' : (r.roa < 0 ? 'txt-red' : '');
        let npmColor = r.npm > 0 ? 'txt-green' : (r.npm < 0 ? 'txt-red' : '');
        let derColor = r.der > 2 ? 'txt-red' : (r.der > 0 && r.der <= 1 ? 'txt-green' : '');
        let peColor = r.pe > 0 && r.pe < 15 ? 'txt-green' : (r.pe > 25 || r.pe < 0 ? 'txt-red' : '');
        let formatVal = (v) => v === null ? '-' : v.toFixed(2);
        
        return `
        <tr>
            <td class="t-code" data-value="${r.kode_saham}">${r.kode_saham}</td>
            <td data-value="${r.nama_perusahaan}" title="${r.nama_perusahaan}">${r.nama_perusahaan.length > 18 ? r.nama_perusahaan.substring(0,18)+'...' : r.nama_perusahaan}</td>
            <td data-value="${r.sektor}">${r.sektor}</td>
            <td data-value="${r.industri}">${r.industri.length > 18 ? r.industri.substring(0,18)+'...' : r.industri}</td>
            <td class="right ${peColor}" data-value="${r.pe}">${formatVal(r.pe)}</td>
            <td class="right" data-value="${r.pbv}">${formatVal(r.pbv)}</td>
            <td class="right ${roeColor}" data-value="${r.roe}">${formatVal(r.roe)}</td>
            <td class="right ${roaColor}" data-value="${r.roa}">${formatVal(r.roa)}</td>
            <td class="right ${npmColor}" data-value="${r.npm}">${formatVal(r.npm)}</td>
            <td class="right ${derColor}" data-value="${r.der}">${formatVal(r.der)}</td>
            <td class="right" data-value="${r.mc}">${r.mc === null ? '-' : formatMoney(r.mc)}</td>
        </tr>
    `}).join('');
}

function renderShareholdersTable(results) {
    const tbody = document.querySelector('#table-shareholders tbody');
    if (!results || !results.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="center">No data available</td></tr>';
        return;
    }

    tbody.innerHTML = results.map(r => {
        let sharesCurr = parseEngNum(r.jumlah_saham_current);
        let pctCurr = parseEngNum(r.pct_current);
        let pctPrev = parseEngNum(r.pct_previous);
        
        // Ownership percentage point change (e.g. 22.67% → 21.50% = -1.17 pp)
        let changePct = pctPrev > 0 ? (pctCurr - pctPrev) : 0;
        
        // Share change: use raw KSEI 'perubahan' field if available, else compute
        let changeShares = 0;
        if (r.perubahan && r.perubahan.trim() !== '') {
            changeShares = parseEngNum(r.perubahan);
        } else {
            let sharesPrev = parseEngNum(r.jumlah_saham_previous);
            changeShares = sharesCurr - sharesPrev;
        }
        
        // Color based on share change direction
        let sign = changeShares > 0 ? '+' : '';
        let colorClass = changeShares > 0 ? 'txt-green' : (changeShares < 0 ? 'txt-red' : '');
        let rDate = r.report_date.split('T')[0];

        // Format change cell
        let changeDisplay;
        if (changeShares === 0 && changePct === 0) {
            changeDisplay = `<span class="txt-muted">—</span>`;
        } else {
            let pctSign = changePct > 0 ? '+' : '';
            let pctDisplay = pctPrev > 0 ? `<br><small>(${pctSign}${changePct.toFixed(2)} pp)</small>` : '';
            changeDisplay = `${sign}${formatNum(changeShares)}${pctDisplay}`;
        }

        return `
        <tr>
            <td data-value="${rDate}">${rDate}</td>
            <td class="t-code" data-value="${r.kode_emiten}">${r.kode_emiten}</td>
            <td data-value="${r.nama_pemegang_saham}" title="${r.nama_pemegang_saham}">${r.nama_pemegang_saham.length > 20 ? r.nama_pemegang_saham.substring(0,20)+'...' : r.nama_pemegang_saham}</td>
            <td data-value="${r.jenis}">${r.jenis || '-'} ${r.status || ''}</td>
            <td class="right" data-value="${sharesCurr}">${formatNum(sharesCurr)}</td>
            <td class="right" data-value="${pctCurr}">${pctCurr.toFixed(2)}</td>
            <td class="right ${colorClass}" data-value="${changeShares}">
                ${changeDisplay}
            </td>
        </tr>
    `}).join('');
}

// ─────────────────────────────────────────────────────────────
// COLUMN SORTING
// ─────────────────────────────────────────────────────────────

function setupTableSorting() {
    document.querySelectorAll('table.sortable th').forEach(th => {
        th.addEventListener('click', () => {
            const table = th.closest('table');
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            if (rows.length === 0 || rows[0].querySelector('.center')) return; // empty or loading

            const index = Array.from(th.parentNode.children).indexOf(th);
            const isAsc = th.classList.contains('asc');
            const type = th.getAttribute('data-type') || 'string';

            // Reset all th classes
            table.querySelectorAll('th').forEach(h => h.classList.remove('asc', 'desc'));
            th.classList.toggle('asc', !isAsc);
            th.classList.toggle('desc', isAsc);

            rows.sort((a, b) => {
                let cellA = a.children[index];
                let cellB = b.children[index];
                if(!cellA || !cellB) return 0;

                let valA = cellA.getAttribute('data-value') || cellA.textContent.trim();
                let valB = cellB.getAttribute('data-value') || cellB.textContent.trim();

                if (type === 'number') {
                    return isAsc ? valA - valB : valB - valA;
                } else {
                    return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
                }
            });

            rows.forEach(r => tbody.appendChild(r));
        });
    });
}

// ─────────────────────────────────────────────────────────────
// INITIALIZATION & EVENTS
// ─────────────────────────────────────────────────────────────

function updateTimestamp() {
    const now = new Date();
    lastUpdated.textContent = `Last Updated: ${now.toLocaleTimeString()}`;
}

function initTabs() {
    tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');

            loadTabContent(targetId);
        });
    });
}

function setSyncing(isSyncing) {
    if(isSyncing) {
        refreshBtn.classList.add('syncing');
        syncText.textContent = "Syncing...";
        lastUpdated.textContent = "Fetching new data...";
    } else {
        refreshBtn.classList.remove('syncing');
        syncText.textContent = "Sync";
        updateTimestamp();
    }
}

async function startSync() {
    setSyncing(true);
    
    // Reset state
    Object.keys(loadedTabs).forEach(k => loadedTabs[k] = false);
    document.querySelectorAll('tbody').forEach(el => el.innerHTML = '<tr><td colspan="8" class="center"><div class="loader inline"></div></td></tr>');
    
    // Concurrently fetch all baseline models to power the UI & AI Recommendation Engine
    const [marketOK, rawScreener, rawShares] = await Promise.all([
        loadMarketSummary(),
        fetchAPI('/market/screener'),
        fetchAPI('/market/shareholders?page=1&per_page=2000')
    ]);

    if (rawScreener && rawScreener.results) globalScreenerData = rawScreener.results;
    if (rawShares && rawShares.results) globalShareholdersData = rawShares.results;

    // Fire Trade Recommender (reads from backend API)
    await generateTradeRecommendations();

    // Reload currently active tab if not summary
    const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-target');
    if (activeTab !== 'tab-summary') {
        await loadTabContent(activeTab);
    }
    
    setSyncing(false);
}

// ─────────────────────────────────────────────────────────────
// AI TRADE RECOMMENDATIONS ENGINE  (Unified — reads from backend)
// ─────────────────────────────────────────────────────────────
async function generateTradeRecommendations() {
    const elWhale = document.getElementById('signal-whale');
    const elForeign = document.getElementById('signal-foreign');
    const elTech = document.getElementById('signal-tech');
    const elLedger = document.getElementById('ai-ledger-compact');
    if (!elWhale) return;

    const data = await fetchAPI('/recommendations/history');
    const recs = (data && data.results) ? data.results : [];

    const byType = {};

    // Group by signal type, prioritize the first active one we see
    recs.forEach(r => {
        if (!byType[r.signal_type]) {
            byType[r.signal_type] = r;
        } else if (!byType[r.signal_type].is_active && r.is_active) {
            // Prefer active over stopped if both exist in history
            byType[r.signal_type] = r;
        }
    });

    const renderCard = (el, r, fallbackMsg) => {
        if (!r) {
            el.innerHTML = `<div class="txt-muted" style="font-size: 0.8rem; height: 100%; display: flex; align-items: center;">${fallbackMsg}</div>`;
            return;
        }
        
        const pnl = parseFloat(r.pct_change) || 0;
        const pnlColor = pnl > 0 ? 'var(--neon-green)' : pnl < 0 ? '#ef4444' : 'var(--text-muted)';
        const badgeColor = r.is_active ? 'rgba(56, 189, 248, 0.2)' : '#ef444422';
        const badgeText = r.is_active ? `Entry: ${formatNum(r.entry_price)}` : `STOPPED @ ${formatNum(r.current_price)}`;
        const textColor = r.is_active ? 'var(--neon-blue)' : '#ef4444';

        el.innerHTML = `
            <div>
                <div style="display:flex; justify-content:space-between; margin-bottom: 5px;">
                    <span class="t-code" style="font-size: 1.1rem;">${r.kode_saham}</span> 
                    <span class="badge" style="background:${badgeColor}; color:${textColor}; border: 1px solid ${textColor}44;">${badgeText}</span>
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;">
                    ${r.is_active ? `Current: <span style="color:#a9b7c6">${formatNum(r.current_price)}</span>` : `<span style="color:#ef4444">Exit: ${r.stop_out_date}</span>`} 
                    &bull; P&L: <span style="color:${pnlColor}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%</span>
                </div>
                <div style="background: rgba(0,0,0,0.3); padding: 5px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05); font-size: 0.75rem; color: var(--text-muted); margin-top: auto;">
                    <strong style="color:var(--text-main)">Strategy:</strong> <br>${r.target_zone}
                </div>
            </div>
        `;
    };

    renderCard(elWhale, byType['Whale Accumulation'], 'No Whale accumulation traits detected today.');
    renderCard(elForeign, byType['Institutional Flow'], 'Sideways flow. No high-volume foreign buying.');
    renderCard(elTech, byType['Technical Pulse'], 'No valid volume breakouts detected.');

    renderCompactLedger(recs);
}

// ─────────────────────────────────────────────────────────────
// COMPACT AI PERFORMANCE LEDGER (right-side card)
// ─────────────────────────────────────────────────────────────
function renderCompactLedger(data) {
    const el = document.getElementById('ai-ledger-compact');
    if (!el) return;

    if (!data || data.length === 0) {
        el.innerHTML = '<div class="txt-muted" style="font-size: 0.78rem; text-align:center; padding: 20px 0;">No signals yet. Trigger a scrape to generate AI picks.</div>';
        return;
    }

    // Only show top 5 on dashboard — full list on tracker.html
    const displayData = data.slice(0, 5);

    el.innerHTML = displayData.map(r => {
        const pnl = parseFloat(r.pct_change) || 0;
        const pnlColor = pnl > 0 ? 'var(--neon-green)' : pnl < 0 ? '#ef4444' : 'var(--text-muted)';
        const pnlText = `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`;

        const signalColor = r.signal_type === 'Whale Accumulation' ? '#8b5cf6'
            : r.signal_type === 'Institutional Flow' ? 'var(--neon-blue)'
            : 'var(--neon-green)';

        const shortLabel = r.signal_type === 'Whale Accumulation' ? 'WHALE'
            : r.signal_type === 'Institutional Flow' ? 'FLOW'
            : 'TECH';

        let statusBadge = '';
        if (!r.is_active) {
            statusBadge = `<span style="font-size:0.65rem; padding: 1px 4px; border-radius:3px; background:#ef444422; color:#ef4444; border:1px solid #ef444444; margin-left: 5px;">STOPPED (${r.stop_out_date})</span>`;
        }

        let peakInfo = '';
        if (r.max_profit_pct > 0) {
            peakInfo = `<div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 2px;">Peak: <span style="color:var(--neon-green)">+${r.max_profit_pct.toFixed(2)}%</span> on ${r.max_profit_date || '--'}</div>`;
        }

        return `
        <div class="ai-rec-row" style="flex-direction: column; align-items: stretch; padding: 8px 10px; height: auto;">
            <div style="display:flex; align-items:center; justify-content: space-between;">
                <div style="display:flex; align-items:center;">
                    <span class="ai-rec-code">${r.kode_saham}</span>
                    <span class="ai-rec-signal" style="background:${signalColor}18; color:${signalColor}; border:1px solid ${signalColor}44; margin-left:8px;">${shortLabel}</span>
                    ${statusBadge}
                </div>
                <span class="ai-rec-pnl" style="color:${pnlColor}; font-weight:bold;">${pnlText}</span>
            </div>
            <div style="display:flex; justify-content: space-between; margin-top: 4px; font-size: 0.75rem; color: #a9b7c6;">
                <span>Entry: ${formatNum(r.entry_price)} <span style="color:var(--text-muted); font-size:0.65rem;">(${r.date})</span> &bull; Current: ${formatNum(r.current_price)}</span>
            </div>
            ${peakInfo}
        </div>`;
    }).join('');
}

function init() {
    initTabs();
    setupTableSorting();
    
    // Setup Isolated Search Logic
    searchSummary.addEventListener('input', (e) => {
        const query = e.target.value.trim().toUpperCase();
        if (globalMarketData) {
            if (query === '') {
                renderSummaryTable(globalMarketData);
            } else {
                renderSummaryTable(globalMarketData.filter(s => s.kode_saham.includes(query)));
            }
        }
    });

    searchScreener.addEventListener('input', () => {
        applyScreenerFilters();
    });
    
    // Initial Load
    startSync();

    // Refresh btn
    refreshBtn.addEventListener('click', () => {
        if (!refreshBtn.classList.contains('syncing')) {
            startSync();
        }
    });
}

document.addEventListener('DOMContentLoaded', init);
