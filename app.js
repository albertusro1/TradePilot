// Configuration
const API_BASE = 'http://localhost:8080/api/v1';
const API_KEY = 'dev_secret_key';

// DOM Elements
const refreshBtn = document.getElementById('refresh-btn');
const lastUpdated = document.getElementById('last-updated');
const tabs = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// State maps to track if a tab has been loaded already
const loadedTabs = {
    'tab-summary': false,
    'tab-screener': false,
    'tab-brokers': false,
    'tab-shareholders': false
};

// Utilities
const formatNum = (num) => new Intl.NumberFormat('en-US').format(num);
const formatMoney = (num) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(num);
const formatPct = (num) => {
    let val = parseFloat(num);
    if (isNaN(val)) return '-';
    let sign = val > 0 ? '+' : '';
    return `${sign}${val.toFixed(2)}%`;
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
// OVERVIEW & MOVERS
// ─────────────────────────────────────────────────────────────

async function loadMovers() {
    const data = await fetchAPI('/market/movers');
    if (!data || !data.top_gainers || !data.top_losers) return;

    // Render Gainers
    const gainersHTML = data.top_gainers.slice(0, 4).map(s => {
        return `
        <div class="mover-item">
            <div>
                <div class="m-code">${s.kode_saham}</div>
                <div class="m-price">${formatNum(s.close)}</div>
            </div>
            <div class="m-change positive">+${s.perubahan} (+${s.persentase}%)</div>
        </div>`;
    }).join('');
    document.getElementById('gainers-list').innerHTML = gainersHTML;

    // Render Losers
    const losersHTML = data.top_losers.slice(0, 4).map(s => {
         return `
        <div class="mover-item">
            <div>
                <div class="m-code">${s.kode_saham}</div>
                <div class="m-price">${formatNum(s.close)}</div>
            </div>
            <div class="m-change negative">${s.perubahan} (${s.persentase}%)</div>
        </div>`;
    }).join('');
    document.getElementById('losers-list').innerHTML = losersHTML;

    updateTimestamp();
}

async function loadBreadth() {
    // We can infer breadth from the summary API
    const data = await fetchAPI('/market/summary');
    if (!data || !data.results) return;
    
    let up = 0, down = 0, flat = 0;
    data.results.forEach(s => {
        let chg = parseFloat(s.perubahan) || 0;
        if (chg > 0) up++;
        else if (chg < 0) down++;
        else flat++;
    });

    document.getElementById('stat-up').textContent = up;
    document.getElementById('stat-down').textContent = down;
    document.getElementById('stat-flat').textContent = flat;
    document.getElementById('stat-total').textContent = data.results.length;

    // Also populate tab-summary since we have the data
    renderSummaryTable(data.results);
    loadedTabs['tab-summary'] = true;
}

// ─────────────────────────────────────────────────────────────
// TAB DATA LOADERS
// ─────────────────────────────────────────────────────────────

async function loadTabContent(targetId) {
    if (loadedTabs[targetId]) return;

    if (targetId === 'tab-summary') {
        const data = await fetchAPI('/market/summary');
        if (data) renderSummaryTable(data.results);
    } 
    else if (targetId === 'tab-screener') {
        const data = await fetchAPI('/market/screener');
        if (data) renderScreenerTable(data.results);
    } 
    else if (targetId === 'tab-brokers') {
        const data = await fetchAPI('/brokers/summary');
        if (data) renderBrokersTable(data.results);
    }
    else if (targetId === 'tab-shareholders') {
        // Just page 1, per_page 50
        const data = await fetchAPI('/market/shareholders?page=1&per_page=50');
        if (data) renderShareholdersTable(data.results);
    }

    loadedTabs[targetId] = true;
}

// ─────────────────────────────────────────────────────────────
// TABLE RENDERERS
// ─────────────────────────────────────────────────────────────

function renderSummaryTable(results) {
    const tbody = document.querySelector('#table-summary tbody');
    if (!results || !results.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="center">No data available</td></tr>';
        return;
    }

    tbody.innerHTML = results.slice(0, 100).map(r => {
        let pct = parseFloat(r.persentase) || 0;
        let colorClass = pct > 0 ? 'txt-green' : (pct < 0 ? 'txt-red' : '');
        let sign = pct > 0 ? '+' : '';
        
        return `
        <tr>
            <td class="t-code">${r.kode_saham}</td>
            <td title="${r.nama_perusahaan}">${r.nama_perusahaan.length > 25 ? r.nama_perusahaan.substring(0,25)+'...' : r.nama_perusahaan}</td>
            <td class="right">${formatNum(r.close)}</td>
            <td class="right ${colorClass}">${sign}${r.perubahan} (${sign}${r.persentase}%)</td>
            <td class="right">${formatNum(r.volume)}</td>
            <td class="right">${formatMoney(r.value)}</td>
            <td class="right txt-green">${formatNum(r.foreign_buy)}</td>
            <td class="right txt-red">${formatNum(r.foreign_sell)}</td>
        </tr>
        `;
    }).join('');
}

function renderScreenerTable(results) {
    const tbody = document.querySelector('#table-screener tbody');
    if (!results || !results.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="center">No data available</td></tr>';
        return;
    }

    tbody.innerHTML = results.slice(0, 100).map(r => `
        <tr>
            <td class="t-code">${r.kode_saham}</td>
            <td title="${r.nama_perusahaan}">${r.nama_perusahaan.length > 25 ? r.nama_perusahaan.substring(0,25)+'...' : r.nama_perusahaan}</td>
            <td class="right">${r.per_x}</td>
            <td class="right">${r.pbvr_x}</td>
            <td class="right">${r.roe_pct}</td>
            <td class="right">${r.roa_pct}</td>
            <td class="right">${r.der_x}</td>
            <td class="right">${formatMoney(r.market_cap)}</td>
        </tr>
    `).join('');
}

function renderBrokersTable(results) {
    const tbody = document.querySelector('#table-brokers tbody');
    if (!results || !results.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="center">No data available</td></tr>';
        return;
    }

    tbody.innerHTML = results.slice(0, 100).map(r => {
        let netLots = parseFloat(r.net_lots || 0);
        let colorClass = netLots > 0 ? 'txt-green' : (netLots < 0 ? 'txt-red' : '');
        return `
        <tr>
            <td class="t-code">${r.kode_broker}</td>
            <td class="right">${formatNum(r.net_buy_vol)}</td>
            <td class="right">${formatNum(r.net_sell_vol)}</td>
            <td class="right ${colorClass}">${formatNum(netLots)}</td>
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
        let chg = parseFloat(r.perubahan?.replace(/,/g, '')) || 0;
        let colorClass = chg > 0 ? 'txt-green' : (chg < 0 ? 'txt-red' : '');
        let sign = chg > 0 ? '+' : '';
        return `
        <tr>
            <td>${r.report_date.split('T')[0]}</td>
            <td class="t-code">${r.kode_emiten}</td>
            <td title="${r.nama_pemegang_saham}">${r.nama_pemegang_saham.length > 30 ? r.nama_pemegang_saham.substring(0,30)+'...' : r.nama_pemegang_saham}</td>
            <td>${r.jenis || '-'} ${r.status || ''}</td>
            <td class="right">${r.jumlah_saham_current}</td>
            <td class="right">${r.pct_current}</td>
            <td class="right ${colorClass}">${sign}${r.perubahan}</td>
        </tr>
    `}).join('');
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
            // Remove active classes
            tabs.forEach(t => t.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            // Add active to clicked
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');

            // Load data if not loaded
            loadTabContent(targetId);
        });
    });
}

function init() {
    initTabs();
    
    // Initial Load
    loadMovers();
    loadBreadth(); // Also loads 'tab-summary'

    // Refresh btn
    refreshBtn.addEventListener('click', () => {
        // Reset state
        Object.keys(loadedTabs).forEach(k => loadedTabs[k] = false);
        document.querySelectorAll('tbody').forEach(el => el.innerHTML = '<tr><td colspan="8" class="center"><div class="loader inline"></div></td></tr>');
        
        loadMovers();
        loadBreadth();
        
        // Reload currently active tab
        const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-target');
        loadTabContent(activeTab);
    });
}

document.addEventListener('DOMContentLoaded', init);
