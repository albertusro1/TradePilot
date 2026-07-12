// ─────────────────────────────────────────────────────────────
// TradePilot AI Signal Tracker — tracker.js
// ─────────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:8080/api/v1';
const API_KEY = 'dev_secret_key';

// State
let allSignals = [];
let activeFilter = 'all';
let searchQuery = '';

// DOM
const searchInput = document.getElementById('tracker-search');
const filterBar = document.getElementById('filter-bar');
const tbody = document.getElementById('tracker-body');
const resultCount = document.getElementById('result-count');

// ── Utilities ────────────────────────────────────────────────
function formatNum(n) {
    if (n == null || isNaN(n)) return '--';
    return Number(n).toLocaleString('id-ID');
}

async function fetchAPI(endpoint) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            headers: { 'X-API-Key': API_KEY }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        console.error(`Fetch failed: ${endpoint}`, e);
        return null;
    }
}

// ── KPI Calculations ─────────────────────────────────────────
function updateKPIs(data) {
    const total = data.length;
    const active = data.filter(r => r.is_active).length;
    const stopped = data.filter(r => !r.is_active).length;

    const peaks = data.map(r => r.max_profit_pct || 0).filter(p => p > 0);
    const avgPeak = peaks.length > 0 ? (peaks.reduce((a, b) => a + b, 0) / peaks.length) : 0;

    document.getElementById('kpi-total').textContent = total;
    document.getElementById('kpi-active').textContent = active;
    document.getElementById('kpi-stopped').textContent = stopped;
    document.getElementById('kpi-avg-peak').textContent = avgPeak > 0 ? `+${avgPeak.toFixed(2)}%` : '--';
}

// ── Detail Modal ─────────────────────────────────────────────
function showDetail(index) {
    const r = allSignals.find((_, i) => i === index) || allSignals[index];
    if (!r) return;

    const pnl = parseFloat(r.pct_change) || 0;
    const pnlColor = pnl > 0 ? 'var(--neon-green)' : pnl < 0 ? '#ef4444' : 'var(--text-muted)';
    const pnlText = `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`;

    let tagColor, tagLabel, tagIcon;
    if (r.signal_type === 'Whale Accumulation') {
        tagColor = '#a78bfa'; tagLabel = 'Whale Accumulation'; tagIcon = '🐋';
    } else if (r.signal_type === 'Institutional Flow') {
        tagColor = '#38bdf8'; tagLabel = 'Institutional Flow'; tagIcon = '🏦';
    } else {
        tagColor = '#10b981'; tagLabel = 'Technical Pulse'; tagIcon = '⚡';
    }

    const statusHtml = r.is_active
        ? '<span style="color:#10b981; font-weight:600;">● ACTIVE</span>'
        : `<span style="color:#ef4444; font-weight:600;">■ STOPPED</span> <span style="color:var(--text-muted); font-size:0.8rem;">on ${r.stop_out_date || '--'}</span>`;

    const peakHtml = r.max_profit_pct > 0
        ? `<span style="color:var(--neon-green); font-weight:700;">+${r.max_profit_pct.toFixed(2)}%</span> <span style="color:var(--text-muted); font-size:0.8rem;">on ${r.max_profit_date || '--'}</span>`
        : '<span style="color:var(--text-muted);">No peak recorded yet</span>';

    const reasonText = r.reason || 'No detailed reasoning available for this signal. Run a new scrape to populate reasons for future signals.';

    // Remove existing modal if any
    const existing = document.getElementById('detail-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'detail-modal';
    modal.innerHTML = `
        <div class="modal-backdrop" onclick="closeDetail()"></div>
        <div class="modal-content glass-card">
            <div class="modal-header">
                <div style="display:flex; align-items:center; gap:12px;">
                    <span style="font-size:1.8rem;">${tagIcon}</span>
                    <div>
                        <h3 style="font-size:1.4rem; color:var(--text-main); margin:0;">${r.kode_saham}</h3>
                        <span style="font-size:0.75rem; color:${tagColor}; font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">${tagLabel}</span>
                    </div>
                </div>
                <button onclick="closeDetail()" style="background:none; border:none; color:var(--text-muted); font-size:1.5rem; cursor:pointer; padding:4px 8px; transition:all 0.2s;">&times;</button>
            </div>

            <div class="modal-grid">
                <div class="modal-stat">
                    <span class="modal-stat-label">Status</span>
                    <span class="modal-stat-value">${statusHtml}</span>
                </div>
                <div class="modal-stat">
                    <span class="modal-stat-label">Entry Date</span>
                    <span class="modal-stat-value">${r.date}</span>
                </div>
                <div class="modal-stat">
                    <span class="modal-stat-label">Entry Price</span>
                    <span class="modal-stat-value">IDR ${formatNum(r.entry_price)}</span>
                </div>
                <div class="modal-stat">
                    <span class="modal-stat-label">Current Price</span>
                    <span class="modal-stat-value">IDR ${formatNum(r.current_price)}</span>
                </div>
                <div class="modal-stat">
                    <span class="modal-stat-label">Current P&L</span>
                    <span class="modal-stat-value" style="color:${pnlColor}; font-weight:700; font-size:1.1rem;">${pnlText}</span>
                </div>
                <div class="modal-stat">
                    <span class="modal-stat-label">Peak Profit</span>
                    <span class="modal-stat-value">${peakHtml}</span>
                </div>
            </div>

            <div class="modal-section">
                <h4 style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted); margin-bottom:8px;">Target Zone</h4>
                <p style="color:var(--text-main); font-size:0.9rem; margin:0;">${r.target_zone || '--'}</p>
            </div>

            <div class="modal-section" style="background:rgba(139,92,246,0.06); border:1px solid rgba(139,92,246,0.2);">
                <h4 style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.08em; color:#c4b5fd; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                    Why This Was Recommended
                </h4>
                <p style="color:#e2e8f0; font-size:0.88rem; margin:0; line-height:1.6;">${reasonText}</p>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('visible'));
}

function closeDetail() {
    const modal = document.getElementById('detail-modal');
    if (modal) {
        modal.classList.remove('visible');
        setTimeout(() => modal.remove(), 200);
    }
}

// Close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
});

// ── Render Table ─────────────────────────────────────────────
function renderTable(data) {
    if (!data || data.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="11">
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <p>No signals match your filters.</p>
                </div>
            </td></tr>`;
        resultCount.textContent = '0 signals found';
        return;
    }

    resultCount.textContent = `${data.length} signal${data.length !== 1 ? 's' : ''} found`;

    tbody.innerHTML = data.map((r, idx) => {
        // Find the real index in allSignals for the detail modal
        const realIdx = allSignals.indexOf(r);
        const pnl = parseFloat(r.pct_change) || 0;
        const pnlColor = pnl > 0 ? 'var(--neon-green)' : pnl < 0 ? '#ef4444' : 'var(--text-muted)';
        const pnlText = `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`;

        // Status pill
        const statusClass = r.is_active ? 'active' : 'stopped';
        const statusLabel = r.is_active ? 'ACTIVE' : 'STOPPED';
        const statusPill = `<span class="status-pill ${statusClass}"><span class="status-dot ${statusClass}"></span>${statusLabel}</span>`;

        // Signal tag color
        let tagBg, tagColor;
        if (r.signal_type === 'Whale Accumulation') {
            tagBg = 'rgba(139,92,246,0.15)'; tagColor = '#a78bfa';
        } else if (r.signal_type === 'Institutional Flow') {
            tagBg = 'rgba(56,189,248,0.15)'; tagColor = 'var(--neon-blue)';
        } else {
            tagBg = 'var(--neon-green-dim)'; tagColor = 'var(--neon-green)';
        }

        const shortType = r.signal_type === 'Whale Accumulation' ? 'WHALE'
            : r.signal_type === 'Institutional Flow' ? 'FLOW'
            : 'TECH';

        // Peak profit
        let peakHtml = '<span style="color:var(--text-muted)">--</span>';
        if (r.max_profit_pct > 0) {
            peakHtml = `<div class="peak-block">
                <span class="peak-value" style="color:var(--neon-green)">+${r.max_profit_pct.toFixed(2)}%</span>
                <span class="peak-date">${r.max_profit_date || '--'}</span>
            </div>`;
        }

        // Stop date
        const stopDate = r.stop_out_date || '--';

        return `<tr>
            <td>${statusPill}</td>
            <td><span class="t-code" style="font-size:0.92rem;">${r.kode_saham}</span></td>
            <td><span class="signal-tag" style="background:${tagBg}; color:${tagColor}; border:1px solid ${tagColor}33;">${shortType}</span></td>
            <td>${r.date}</td>
            <td class="right">${formatNum(r.entry_price)}</td>
            <td class="right">${formatNum(r.current_price)}</td>
            <td class="right" style="color:${pnlColor}; font-weight:700;">${pnlText}</td>
            <td class="right">${peakHtml}</td>
            <td>${r.is_active ? '<span style="color:var(--text-muted)">--</span>' : `<span style="color:#ef4444">${stopDate}</span>`}</td>
            <td style="font-size:0.75rem; color:var(--text-muted); max-width:180px; overflow:hidden; text-overflow:ellipsis;">${r.target_zone || '--'}</td>
            <td><button class="detail-btn" onclick="showDetail(${realIdx})">Detail</button></td>
        </tr>`;
    }).join('');
}

// ── Filtering Logic ──────────────────────────────────────────
function applyFilters() {
    let filtered = [...allSignals];

    // Text search
    if (searchQuery) {
        filtered = filtered.filter(r => r.kode_saham.toUpperCase().includes(searchQuery));
    }

    // Status / type filter
    if (activeFilter === 'active') {
        filtered = filtered.filter(r => r.is_active);
    } else if (activeFilter === 'stopped') {
        filtered = filtered.filter(r => !r.is_active);
    } else if (activeFilter !== 'all') {
        // It's a signal_type filter
        filtered = filtered.filter(r => r.signal_type === activeFilter);
    }

    renderTable(filtered);
}

// ── Table Sorting ────────────────────────────────────────────
function setupSorting() {
    const table = document.getElementById('tracker-table');
    const headers = table.querySelectorAll('th');

    headers.forEach((th, colIndex) => {
        th.addEventListener('click', () => {
            const type = th.dataset.type;
            if (!type) return;

            const isAsc = th.classList.contains('asc');
            headers.forEach(h => h.classList.remove('asc', 'desc'));
            th.classList.add(isAsc ? 'desc' : 'asc');

            const dir = isAsc ? -1 : 1;

            allSignals.sort((a, b) => {
                let va, vb;
                // Map column index to data field
                switch (colIndex) {
                    case 0: va = a.is_active ? 1 : 0; vb = b.is_active ? 1 : 0; break;
                    case 1: va = a.kode_saham; vb = b.kode_saham; break;
                    case 2: va = a.signal_type; vb = b.signal_type; break;
                    case 3: va = a.date; vb = b.date; break;
                    case 4: va = a.entry_price; vb = b.entry_price; break;
                    case 5: va = a.current_price; vb = b.current_price; break;
                    case 6: va = parseFloat(a.pct_change) || 0; vb = parseFloat(b.pct_change) || 0; break;
                    case 7: va = a.max_profit_pct || 0; vb = b.max_profit_pct || 0; break;
                    case 8: va = a.stop_out_date || ''; vb = b.stop_out_date || ''; break;
                    default: return 0;
                }

                if (typeof va === 'string') return va.localeCompare(vb) * dir;
                return (va - vb) * dir;
            });

            applyFilters();
        });
    });
}

// ── Event Listeners ──────────────────────────────────────────
searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toUpperCase();
    applyFilters();
});

filterBar.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;

    // Remove active classes from all chips
    filterBar.querySelectorAll('.filter-chip').forEach(c => {
        c.classList.remove('active', 'active-green', 'active-red');
    });

    const filter = chip.dataset.filter;
    activeFilter = filter;

    // Apply the right active class
    if (filter === 'active') {
        chip.classList.add('active-green');
    } else if (filter === 'stopped') {
        chip.classList.add('active-red');
    } else {
        chip.classList.add('active');
    }

    applyFilters();
});

// ── Live Recommendations Section ─────────────────────────────
async function generateTradeRecommendations() {
    const elWhale = document.getElementById('signal-whale');
    const elForeign = document.getElementById('signal-foreign');
    const elTech = document.getElementById('signal-tech');
    if (!elWhale) return;

    const data = await fetchAPI('/recommendations/history');
    const recs = (data && data.results) ? data.results : [];

    const byType = {};

    // Group by signal type, prioritize the first active one we see
    recs.forEach(r => {
        if (!byType[r.signal_type]) {
            byType[r.signal_type] = r;
        } else if (!byType[r.signal_type].is_active && r.is_active) {
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
                    <span class="t-code" style="font-size: 1.1rem; font-family: 'JetBrains Mono', monospace; font-weight: bold;">${r.kode_saham}</span> 
                    <span class="badge" style="background:${badgeColor}; color:${textColor}; border: 1px solid ${textColor}44;">${badgeText}</span>
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;">
                    ${r.is_active ? `Current: <span style="color:#a9b7c6">${formatNum(r.current_price)}</span>` : `<span style="color:#ef4444">Exit: ${r.stop_out_date}</span>`} 
                    &bull; P&L: <span style="color:${pnlColor}; font-family: 'JetBrains Mono', monospace; font-weight: bold;">${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%</span>
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
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
    const data = await fetchAPI('/recommendations/history');
    allSignals = (data && data.results) ? data.results : [];

    updateKPIs(allSignals);
    renderTable(allSignals);
    setupSorting();
    generateTradeRecommendations();
}

document.addEventListener('DOMContentLoaded', init);
