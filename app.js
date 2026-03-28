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
let selectedSectors = [];
let selectedIndustries = [];
const loadedTabs = {
    'tab-summary': false,
    'tab-screener': false,
    'tab-shareholders': false
};

// Utilities for Indonesian number format ("1.500" -> 1500)
const parseIndoNum = (str) => {
    if (!str) return 0;
    // Remove all dots, convert commas to dots
    let val = str.replace(/\./g, '').replace(/,/g, '.');
    // Remove newlines and tabs from IDX bad data (e.g. "=\n\t\t\t\t0")
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
                pe: parseIndoNum(r.per),
                pbv: parseIndoNum(r.pbv),
                roe: parseIndoNum(r.roe_pct),
                roa: parseIndoNum(r.roa_pct),
                npm: parseIndoNum(r.npm_pct),
                der: parseIndoNum(r.der),
                mc: parseIndoNum(r.mkt_cap)
            }));
            
            const sectors = [...new Set(globalScreenerData.map(r => r.sektor).filter(s => s !== '-'))].sort();
            const industries = [...new Set(globalScreenerData.map(r => r.industri).filter(s => s !== '-'))].sort();
            
            initMultiSelect('ms-sector', sectors, selectedSectors);
            initMultiSelect('ms-industry', industries, selectedIndustries);
            
            applyScreenerFilters();
        }
    } 
    else if (targetId === 'tab-shareholders') {
        const data = await fetchAPI('/market/shareholders?page=1&per_page=2000');
        if (data) renderShareholdersTable(data.results);
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
            <td data-value="${r.nama_perusahaan}" title="${r.nama_perusahaan}">${r.nama_perusahaan.length > 25 ? r.nama_perusahaan.substring(0,25)+'...' : r.nama_perusahaan}</td>
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
        
        return `
        <tr>
            <td class="t-code" data-value="${r.kode_saham}">${r.kode_saham}</td>
            <td data-value="${r.nama_perusahaan}" title="${r.nama_perusahaan}">${r.nama_perusahaan.length > 25 ? r.nama_perusahaan.substring(0,25)+'...' : r.nama_perusahaan}</td>
            <td data-value="${r.sektor}">${r.sektor}</td>
            <td data-value="${r.industri}">${r.industri.length > 20 ? r.industri.substring(0,20)+'...' : r.industri}</td>
            <td class="right ${peColor}" data-value="${r.pe}">${r.pe.toFixed(2)}</td>
            <td class="right" data-value="${r.pbv}">${r.pbv.toFixed(2)}</td>
            <td class="right ${roeColor}" data-value="${r.roe}">${r.roe.toFixed(2)}</td>
            <td class="right ${roaColor}" data-value="${r.roa}">${r.roa.toFixed(2)}</td>
            <td class="right ${npmColor}" data-value="${r.npm}">${r.npm.toFixed(2)}</td>
            <td class="right ${derColor}" data-value="${r.der}">${r.der.toFixed(2)}</td>
            <td class="right" data-value="${r.mc}">${formatMoney(r.mc)}</td>
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
        let rawChg = r.perubahan || '0';
        let chgNum = parseFloat(rawChg.replace(/,/g, '')) || 0;
        
        let shares = parseFloat(r.jumlah_saham_current?.replace(/,/g, '')) || 0;
        let pct = parseFloat(r.pct_current?.replace(/,/g, '')) || 0;
        
        // Detect if raw changes from IDX PDF are percentages or absolute shares
        let isPercentageOrig = rawChg.includes('%') || rawChg.includes('.') || Math.abs(chgNum) === pct;
        
        let changeShares = 0;
        let changePct = 0;
        
        if (pct > 0 && shares > 0) {
            let totalCompanyShares = shares / (pct / 100);
            
            if (isPercentageOrig) {
                changePct = chgNum;
                changeShares = Math.round((changePct / 100) * totalCompanyShares);
            } else {
                changeShares = chgNum;
                changePct = (changeShares / totalCompanyShares) * 100;
            }
        }
        
        let sign = changeShares > 0 ? '+' : '';
        let colorClass = changeShares > 0 ? 'txt-green' : (changeShares < 0 ? 'txt-red' : '');
        let rDate = r.report_date.split('T')[0];

        return `
        <tr>
            <td data-value="${rDate}">${rDate}</td>
            <td class="t-code" data-value="${r.kode_emiten}">${r.kode_emiten}</td>
            <td data-value="${r.nama_pemegang_saham}" title="${r.nama_pemegang_saham}">${r.nama_pemegang_saham.length > 25 ? r.nama_pemegang_saham.substring(0,25)+'...' : r.nama_pemegang_saham}</td>
            <td data-value="${r.jenis}">${r.jenis || '-'} ${r.status || ''}</td>
            <td class="right" data-value="${shares}">${formatNum(shares)}</td>
            <td class="right" data-value="${pct}">${pct.toFixed(2)}</td>
            <td class="right ${colorClass}" data-value="${changeShares}" title="Idx Raw Data: ${rawChg}">
                ${sign}${formatNum(changeShares)} <br>
                <small>(${sign}${changePct.toFixed(2)}%)</small>
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
    
    await loadMarketSummary();
    
    // Reload currently active tab if not summary
    const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-target');
    if (activeTab !== 'tab-summary') {
        await loadTabContent(activeTab);
    }
    
    setSyncing(false);
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
