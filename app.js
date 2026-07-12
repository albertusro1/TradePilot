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
    
    // Auto-select and inspect the first stock to showcase the institutional upgrade
    if (globalMarketData && globalMarketData.length > 0) {
        const firstTicker = globalMarketData[0].kode_saham;
        setTimeout(() => {
            const firstRow = document.querySelector(`.clickable-row[data-ticker="${firstTicker}"]`);
            if (firstRow) {
                firstRow.classList.add('selected-row');
                showStockDetailPanel(firstTicker);
            }
        }, 500);
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

    renderLeaderboard();
}

function getGrade(score) {
    if (score >= 80) return 'A';
    if (score >= 60) return 'B';
    if (score >= 40) return 'C';
    if (score >= 20) return 'D';
    return 'F';
}

function renderLeaderboard() {
    if (!globalMarketData) return;
    
    // Calculate a composite confirmation score for each stock based on cached market data
    const scored = globalMarketData.map(s => {
        let tech = 0;
        if (s.pct > 0) tech += 15;
        if (s.vol_10d_pct > 0) tech += 10;
        if (s.vol_20d_pct > 0) tech += 10;
        
        let vol = 0;
        if (s.vol_10d_pct > 0) vol += 10;
        if (s.vol_20d_pct > 0) vol += 10;
        if (s.val >= 5e9) vol += 10;
        else if (s.val >= 1e9) vol += 5;
        
        let inst = 0;
        if (s.fNet > 0) inst += 20;
        const ratio = s.vol > 0 ? (s.fNet / s.vol) : 0;
        if (ratio > 0.15) inst += 15;
        else if (ratio > 0.05) inst += 10;
        else if (ratio > 0) inst += 5;
        
        const score = tech + vol + inst;
        return { ...s, score };
    });
    
    // Sort by score descending, filter out inactive / untraded
    const traded = scored.filter(s => s.vol > 0 && s.prev > 0);
    const leaders = traded.sort((a, b) => b.score - a.score).slice(0, 30);
    
    const container = document.getElementById('leaderboard-list');
    if (!container) return;
    
    container.innerHTML = leaders.map(s => {
        const grade = getGrade(s.score);
        let badgeColor = s.score >= 80 ? 'var(--neon-green)' : (s.score >= 40 ? '#f59e0b' : 'var(--neon-red)');
        
        return `
        <div class="mover-item clickable-leaderboard" onclick="showStockDetailPanel('${s.kode_saham}')" style="cursor:pointer;" title="Score: ${s.score}/100 • Click to inspect details">
            <div>
                <div class="m-code">${s.kode_saham}</div>
                <div class="m-price" style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">Score: ${s.score}</div>
            </div>
            <div class="m-change" style="color:${badgeColor}; font-weight:700; font-size:1.15rem; font-family:'Outfit',sans-serif;">${grade}</div>
        </div>
        `;
    }).join('');
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
        <tr class="clickable-row" data-ticker="${r.kode_saham}" title="Click to inspect deep-dive institutional analytics for ${r.kode_saham}">
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

function inferInvestorType(name, status) {
    const n = name.toUpperCase();
    if (n.includes("REKSA DANA") || n.includes("REKSADANA") || n.includes("MUTUAL FUND") || n.includes("FUND ") || n.includes("ASSET MANAGEMENT") || n.includes("INVESTMENT")) {
        return "Mutual Fund";
    }
    if (n.includes("ASURANSI") || n.includes("INSURANCE") || n.includes("PENSION") || n.includes("BPJS") || n.includes("TASPEN") || n.includes("DAPEN")) {
        return "Insurance/Pension";
    }
    if (n.includes("BANK") || n.includes("CUSTODIAN") || n.includes("NOMINEES") || n.includes("TRUST") || n.includes("S/A")) {
        return "Custodian/Trustee";
    }
    if (n.includes("PEMERINTAH") || n.includes("REPUBLIK INDONESIA") || n.includes("STATE OF") || n.includes("GOVERNMENT")) {
        return "Government/Sovereign";
    }
    if (n.startsWith("PT ") || n.startsWith("PT.") || n.includes(" TBK") || n.includes(" LTD") || n.includes(" CORP") || n.includes(" INC") || n.includes(" HOLDINGS") || n.includes(" CO ")) {
        return "Corporate Entity";
    }
    return status === "Lokal" ? "Local Entity" : "Foreign Entity";
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
        let changePct = parseFloat((pctCurr - pctPrev).toFixed(4));
        
        // Share change: parse using clean english parser
        let changeShares = parseEngNum(r.perubahan);
        if (changeShares === 0 && sharesCurr !== parseEngNum(r.jumlah_saham_previous)) {
            // fallback to calculation if raw perubahan field has parsing mismatch
            changeShares = sharesCurr - parseEngNum(r.jumlah_saham_previous);
        }
        
        // Color based on share change direction
        let sign = changeShares > 0 ? '+' : '';
        let colorClass = changeShares > 0 ? 'txt-green' : (changeShares < 0 ? 'txt-red' : '');
        let rDate = r.report_date.split('T')[0];

        // Format change cell
        let changeDisplay;
        if (changeShares === 0 && Math.abs(changePct) < 0.005) {
            changeDisplay = `<span class="txt-muted">—</span>`;
        } else {
            let pctSign = changePct > 0 ? '+' : '';
            let pctDisplay = Math.abs(changePct) >= 0.005 ? `<br><small>(${pctSign}${changePct.toFixed(2)} pp)</small>` : '';
            changeDisplay = `${sign}${formatNum(changeShares)}${pctDisplay}`;
        }

        // Clean Type Display using dynamic inference
        let typeVal = r.jenis;
        if (!typeVal || typeVal.trim() === '') {
            typeVal = inferInvestorType(r.nama_pemegang_saham, r.status);
        }
        let typeDisplay = r.status ? `${typeVal} (${r.status})` : typeVal;

        return `
        <tr>
            <td data-value="${rDate}">${rDate}</td>
            <td class="t-code" data-value="${r.kode_emiten}">${r.kode_emiten}</td>
            <td data-value="${r.nama_pemegang_saham}" title="${r.nama_pemegang_saham}">${r.nama_pemegang_saham.length > 20 ? r.nama_pemegang_saham.substring(0,20)+'...' : r.nama_pemegang_saham}</td>
            <td data-value="${typeDisplay}">${typeDisplay}</td>
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

let peChart = null;
let pbvChart = null;
let flowTimelineChart = null;
let ownershipChart = null;

function destroyCharts() {
    if (peChart) { peChart.destroy(); peChart = null; }
    if (pbvChart) { pbvChart.destroy(); pbvChart = null; }
    if (flowTimelineChart) { flowTimelineChart.destroy(); flowTimelineChart = null; }
    if (ownershipChart) { ownershipChart.destroy(); ownershipChart = null; }
}

function initDetailTabs() {
    const detailTabs = document.querySelectorAll('.detail-tab-btn');
    const detailPanes = document.querySelectorAll('.detail-tab-pane');
    
    detailTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            detailTabs.forEach(t => t.classList.remove('active'));
            detailPanes.forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
            
            // Fix ApexCharts sizing
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 100);
        });
    });
}

function renderCircularGauge(containerId, score, maxScore, color) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const pct = Math.min(Math.max(score / maxScore, 0), 1);
    const radius = 20;
    const circ = 2 * Math.PI * radius;
    const offset = circ - (pct * circ);
    
    container.innerHTML = `
        <svg class="gauge-svg" width="50" height="50" viewBox="0 0 50 50">
            <circle class="gauge-track" cx="25" cy="25" r="${radius}" />
            <circle class="gauge-fill" cx="25" cy="25" r="${radius}" 
                stroke="${color}" 
                stroke-dasharray="${circ}" 
                stroke-dashoffset="${offset}" />
            <text class="gauge-text" x="25" y="27" font-size="9" fill="var(--text-main)">${score}</text>
        </svg>
    `;
}

async function showStockDetailPanel(ticker) {
    if (!globalMarketData) return;
    const stock = globalMarketData.find(s => s.kode_saham === ticker);
    if (!stock) return;

    // Destroy existing charts to prevent overlap
    destroyCharts();

    // Populate surface header
    document.getElementById('detail-ticker').textContent = ticker;
    document.getElementById('detail-name').textContent = stock.nama_perusahaan;
    document.getElementById('detail-close').textContent = formatNum(stock.close);
    
    const changeEl = document.getElementById('detail-change');
    changeEl.textContent = `${stock.diff > 0 ? '+' : ''}${stock.diff} (${formatPct(stock.pct)})`;
    changeEl.className = stock.pct > 0 ? 'txt-green' : (stock.pct < 0 ? 'txt-red' : '');

    // Show the panel (Side Drawer)
    const panel = document.getElementById('stock-detail-panel');
    if (panel) {
        panel.classList.add('open');
    }

    // Fetch and render analytics
    await Promise.all([
        loadStockConfirmation(ticker),
        loadStockValuationBands(ticker),
        loadStockFlowSummary(ticker),
        loadStockOwnershipTimeline(ticker)
    ]);
}

async function loadStockConfirmation(ticker) {
    const data = await fetchAPI(`/stocks/${ticker}/confirmation`);
    if (!data) return;

    // Update Grade Badge
    const gradeEl = document.getElementById('detail-grade');
    gradeEl.textContent = `Grade: ${data.grade}`;
    
    let gradeColor = 'var(--neon-green)';
    if (data.grade === 'F') gradeColor = 'var(--neon-red)';
    else if (data.grade.startsWith('D') || data.grade.startsWith('C')) gradeColor = '#f59e0b';
    else if (data.grade.startsWith('B')) gradeColor = 'var(--neon-blue)';
    
    gradeEl.style.borderColor = gradeColor + '66';
    gradeEl.style.color = gradeColor;
    gradeEl.style.background = gradeColor + '15';

    // Renders circular sub-score gauges
    renderCircularGauge('gauge-technical-container', data.technical.score, 35, 'var(--neon-blue)');
    document.getElementById('txt-score-technical').textContent = `${data.technical.score} / 35`;

    renderCircularGauge('gauge-volume-container', data.volume.score, 30, '#8b5cf6');
    document.getElementById('txt-score-volume').textContent = `${data.volume.score} / 30`;

    renderCircularGauge('gauge-institutional-container', data.institutional.score, 35, 'var(--neon-green)');
    document.getElementById('txt-score-institutional').textContent = `${data.institutional.score} / 35`;

    // Render Checklist
    const checklistContainer = document.getElementById('confirmation-checklist-container');
    if (checklistContainer && data.checklist) {
        checklistContainer.innerHTML = data.checklist.map(item => {
            let icon = '⚠️';
            if (item.status === 'pass') icon = '✅';
            else if (item.status === 'fail') icon = '❌';

            return `
            <div class="checklist-row ${item.status}">
                <span>${item.label}</span>
                <span class="checklist-icon ${item.status}">${icon} <small>${item.detail}</small></span>
            </div>
            `;
        }).join('');
    }
}

async function loadStockValuationBands(ticker) {
    const data = await fetchAPI(`/stocks/${ticker}/valuation-bands`);
    if (!data) return;

    const renderSDChart = (containerId, title, metrics, currentVal) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!metrics.history || metrics.history.length === 0) {
            container.innerHTML = `<div class="txt-muted" style="padding:40px; text-align:center;">Insufficient historical valuation data to render bands.</div>`;
            return;
        }

        const dates = metrics.history.map(p => p.date);
        const seriesData = metrics.history.map(p => parseFloat(p.value.toFixed(2)));
        
        // Horizontal band boundaries
        const mean = metrics.bands.mean;
        const plus1 = metrics.bands.plus_1sd;
        const plus2 = metrics.bands.plus_2sd;
        const minus1 = metrics.bands.minus_1sd;
        const minus2 = metrics.bands.minus_2sd;

        const options = {
            chart: {
                type: 'line',
                height: 250,
                background: 'transparent',
                toolbar: { show: false },
                animations: { enabled: true }
            },
            theme: { mode: 'dark' },
            stroke: {
                width: [3, 1, 1, 1.5, 1, 1],
                dashArray: [0, 5, 5, 0, 5, 5],
                colors: ['#38bdf8', '#ef4444', '#f59e0b', '#94a3b8', '#10b981', '#059669']
            },
            series: [
                { name: 'Actual ' + title, data: seriesData },
                { name: '+2 SD (' + plus2.toFixed(1) + ')', data: Array(dates.length).fill(parseFloat(plus2.toFixed(2))) },
                { name: '+1 SD (' + plus1.toFixed(1) + ')', data: Array(dates.length).fill(parseFloat(plus1.toFixed(2))) },
                { name: 'Mean (' + mean.toFixed(1) + ')', data: Array(dates.length).fill(parseFloat(mean.toFixed(2))) },
                { name: '-1 SD (' + minus1.toFixed(1) + ')', data: Array(dates.length).fill(parseFloat(minus1.toFixed(2))) },
                { name: '-2 SD (' + minus2.toFixed(1) + ')', data: Array(dates.length).fill(parseFloat(minus2.toFixed(2))) }
            ],
            xaxis: {
                categories: dates,
                labels: { rotate: 0, style: { colors: '#94a3b8', fontSize: '10px' } }
            },
            yaxis: {
                labels: { style: { colors: '#94a3b8', fontSize: '10px' } }
            },
            legend: { show: true, position: 'bottom', horizontalAlign: 'center', fontSize: '10px' },
            title: {
                text: `${title} current: ${currentVal.toFixed(1)} (${metrics.zone.replace('_', ' ')})`,
                align: 'left',
                style: { fontSize: '12px', color: '#f8fafc', fontWeight: 600 }
            },
            grid: { borderColor: 'rgba(255,255,255,0.05)' }
        };

        const chart = new ApexCharts(container, options);
        chart.render();
        return chart;
    };

    peChart = renderSDChart('pe-bands-chart', 'P/E Ratio', data.per, data.per.current);
    pbvChart = renderSDChart('pbv-bands-chart', 'PBV Ratio', data.pbv, data.pbv.current);
}

async function loadStockFlowSummary(ticker) {
    const data = await fetchAPI(`/stocks/${ticker}/flow-summary`);
    if (!data) return;

    // Render stacked flow heatbar
    const fNet = data.foreign_net;
    const fBuy = data.foreign_buy;
    const fSell = data.foreign_sell;
    const total = fBuy + fSell;
    
    const heatbar = document.getElementById('flow-net-heatbar');
    const buyVal = document.getElementById('flow-buy-val');
    const sellVal = document.getElementById('flow-sell-val');
    const netVal = document.getElementById('flow-net-val');

    if (heatbar && buyVal && sellVal && netVal) {
        if (total > 0) {
            const buyPct = (fBuy / total) * 100;
            const sellPct = 100 - buyPct;
            heatbar.innerHTML = `
                <div style="width: ${buyPct}%; background: var(--neon-green); height: 100%; transition: width 0.5s;"></div>
                <div style="width: ${sellPct}%; background: var(--neon-red); height: 100%; transition: width 0.5s;"></div>
            `;
        } else {
            heatbar.innerHTML = `<div style="width: 100%; background: rgba(255,255,255,0.05); height: 100%;"></div>`;
        }

        buyVal.textContent = `Buy: ${formatNum(fBuy)}`;
        sellVal.textContent = `Sell: ${formatNum(fSell)}`;
        netVal.textContent = `${fNet > 0 ? '+' : ''}${formatNum(fNet)}`;
        netVal.className = fNet > 0 ? 'txt-green' : (fNet < 0 ? 'txt-red' : '');
    }

    // Render 5D timeline using mixed column + line chart
    const timelineContainer = document.getElementById('flow-timeline-chart');
    if (timelineContainer && data.trend_5d && data.trend_5d.length > 0) {
        const dates = data.trend_5d.map(p => p.date);
        const volumes = data.trend_5d.map(p => p.volume);
        const closes = data.trend_5d.map(p => p.close);

        const options = {
            chart: {
                height: 200,
                type: 'line',
                background: 'transparent',
                toolbar: { show: false }
            },
            theme: { mode: 'dark' },
            stroke: { width: [0, 3], curve: 'smooth' },
            series: [
                { name: 'Daily Volume', type: 'column', data: volumes },
                { name: 'Close Price', type: 'line', data: closes }
            ],
            fill: {
                opacity: [0.35, 1],
                gradient: {
                    inverseColors: false,
                    shade: 'dark',
                    type: "vertical",
                    opacityFrom: 0.85,
                    opacityTo: 0.55,
                    stops: [0, 100, 100, 100]
                }
            },
            colors: ['#8b5cf6', 'var(--neon-blue)'],
            xaxis: {
                categories: dates,
                labels: { style: { colors: '#94a3b8', fontSize: '9px' } }
            },
            yaxis: [
                {
                    title: { text: 'Volume Traded', style: { color: '#8b5cf6', fontSize: '10px' } },
                    labels: { style: { colors: '#94a3b8', fontSize: '9px' }, formatter: formatMoney }
                },
                {
                    opposite: true,
                    title: { text: 'Price (IDR)', style: { color: 'var(--neon-blue)', fontSize: '10px' } },
                    labels: { style: { colors: '#94a3b8', fontSize: '9px' }, formatter: formatNum }
                }
            ],
            grid: { borderColor: 'rgba(255,255,255,0.05)' },
            legend: { show: false }
        };

        flowTimelineChart = new ApexCharts(timelineContainer, options);
        flowTimelineChart.render();
    }
}

async function loadStockOwnershipTimeline(ticker) {
    const data = await fetchAPI(`/stocks/${ticker}/ownership-timeline`);
    if (!data) return;

    // Render Free Float Circular Gauge
    const ffContainer = document.getElementById('free-float-gauge');
    const ffStatus = document.getElementById('free-float-status');
    if (ffContainer && ffStatus && data.free_float) {
        const ffPct = data.free_float.current_pct;
        let ffColor = 'var(--neon-green)';
        if (ffPct < 15.0) ffColor = 'var(--neon-red)';
        else if (ffPct < 20.0) ffColor = '#f59e0b';

        renderCircularGauge('free-float-gauge', Math.round(ffPct), 100, ffColor);
        
        ffStatus.textContent = `Free Float: ${ffPct.toFixed(1)}% — ${data.free_float.status === 'COMPLIANT' ? 'Compliant ✅' : 'Non-Compliant 🚨'}`;
        ffStatus.className = data.free_float.status === 'COMPLIANT' ? 'txt-green' : 'txt-red';
        ffStatus.style.fontWeight = '600';
    }

    // Render HHI Concentration
    const hhiVal = document.getElementById('hhi-value');
    const hhiBar = document.getElementById('hhi-bar');
    const hhiStatus = document.getElementById('hhi-status');
    if (hhiVal && hhiBar && hhiStatus) {
        const hhi = data.concentration_hhi;
        hhiVal.textContent = formatNum(hhi);
        
        // HHI ranges: < 1500 (low), 1500-2500 (moderate), > 2500 (high concentration)
        let barColor = 'var(--neon-green)';
        let statusText = "Diverse Ownership (Low Concentration)";
        let fillPct = (hhi / 10000) * 100;
        
        if (hhi > 2500) {
            barColor = 'var(--neon-red)';
            statusText = "Monopolistic/Highly Concentrated Ownership";
        } else if (hhi >= 1500) {
            barColor = '#f59e0b';
            statusText = "Moderately Concentrated Ownership Structure";
        }

        hhiBar.innerHTML = `<div style="width: ${fillPct}%; background: ${barColor}; height:100%; transition: width 0.5s;"></div>`;
        hhiStatus.textContent = statusText;
        hhiStatus.style.color = barColor;
        hhiStatus.style.fontWeight = '600';
    }

    // Render Shareholders stacked area timeline
    const timelineContainer = document.getElementById('ownership-timeline-chart');
    if (timelineContainer && data.dates && data.dates.length > 0 && data.holders && data.holders.length > 0) {
        const options = {
            chart: {
                height: 280,
                type: 'area',
                background: 'transparent',
                stacked: true,
                toolbar: { show: false }
            },
            theme: { mode: 'dark' },
            stroke: { curve: 'smooth', width: 2 },
            series: data.holders.map(h => ({
                name: h.name.length > 25 ? h.name.substring(0,25) + '...' : h.name,
                data: h.series.map(v => parseFloat(v.toFixed(2)))
            })),
            xaxis: {
                categories: data.dates,
                labels: { style: { colors: '#94a3b8', fontSize: '9px' } }
            },
            yaxis: {
                labels: {
                    style: { colors: '#94a3b8', fontSize: '9px' },
                    formatter: (val) => `${val.toFixed(1)}%`
                },
                max: 100
            },
            grid: { borderColor: 'rgba(255,255,255,0.05)' },
            legend: { show: true, position: 'bottom', horizontalAlign: 'center', fontSize: '9px' },
            fill: { type: 'solid', opacity: 0.65 }
        };

        ownershipChart = new ApexCharts(timelineContainer, options);
        ownershipChart.render();
    } else if (timelineContainer) {
        timelineContainer.innerHTML = `<div class="txt-muted" style="padding:40px; text-align:center;">No major shareholder time-series available.</div>`;
    }
}

function init() {
    initTabs();
    setupTableSorting();
    initDetailTabs();
    
    // Row selection and Click-to-inspect delegation
    document.addEventListener('click', (e) => {
        const row = e.target.closest('.clickable-row');
        if (row) {
            const ticker = row.getAttribute('data-ticker');
            
            // Remove previous selection highlights
            document.querySelectorAll('.clickable-row').forEach(r => r.classList.remove('selected-row'));
            row.classList.add('selected-row');
            
            // Trigger load detail panel
            showStockDetailPanel(ticker);
        }
    });
    
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

    // Close Detail Drawer Listeners
    const closeBtn = document.getElementById('close-detail-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            const panel = document.getElementById('stock-detail-panel');
            if (panel) {
                panel.classList.remove('open');
                document.querySelectorAll('.clickable-row').forEach(r => r.classList.remove('selected-row'));
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const panel = document.getElementById('stock-detail-panel');
            if (panel && panel.classList.contains('open')) {
                panel.classList.remove('open');
                document.querySelectorAll('.clickable-row').forEach(r => r.classList.remove('selected-row'));
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', init);

