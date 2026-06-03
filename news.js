const API_BASE = "http://127.0.0.1:8080/api/v1";
const API_KEY = "dev_secret_key";

// DOM Elements
const newsContainer = document.getElementById('news-container');
const impactTodayList = document.getElementById('impact-today-list');
const searchInput = document.getElementById('news-search');

// State
let allArticles = [];
let currentFilter = "all";

/**
 * Fetch and render news
 */
async function loadNews(ticker = "") {
    newsContainer.innerHTML = '<div class="loader" style="margin: 100px auto;"></div>';
    
    try {
        let url = `${API_BASE}/news`;
        if (ticker) url += `?ticker=${ticker.toUpperCase()}`;

        const resp = await fetch(url, {
            headers: { "X-API-Key": API_KEY }
        });
        allArticles = await resp.json();

        applyFilter();
        if (!ticker) renderImpactSidebar(allArticles);
    } catch (err) {
        console.error("Failed to load news:", err);
        newsContainer.innerHTML = `
            <div class="empty-state">
                <p>Failed to connect to the news server.</p>
                <p style="font-size: 0.75rem; color: var(--neon-red); margin-top: 8px;">Error: ${err.message}</p>
                <p style="font-size: 0.7rem; color: var(--text-muted); margin-top: 15px;">Check if the API is running at 127.0.0.1:8080 and that CORS is allowed.</p>
            </div>
        `;
    }
}

function applyFilter() {
    let filtered = allArticles;
    if (currentFilter === "bullish") filtered = allArticles.filter(a => a.sentiment_score > 0.15);
    if (currentFilter === "bearish") filtered = allArticles.filter(a => a.sentiment_score < -0.15);
    if (currentFilter === "high") filtered = allArticles.filter(a => a.is_high_impact);

    renderNews(filtered);
}

/**
 * Render news items to the main container
 */
function renderNews(articles) {
    if (!articles || articles.length === 0) {
        const query = searchInput.value;
        const msg = query ? `No news found for "${query}"` : `No news found matching the "${currentFilter}" filter.`;
        newsContainer.innerHTML = `<div class="empty-state"><p>${msg}</p></div>`;
        return;
    }

    newsContainer.innerHTML = articles.map(art => {
        const isPositive = art.sentiment_score > 0.15;
        const isNegative = art.sentiment_score < -0.15;
        
        const sentimentClass = isPositive ? 'sentiment-positive' : 
                              isNegative ? 'sentiment-negative' : 
                              'sentiment-neutral';
        
        const sentimentText = isPositive ? 'BULLISH' : 
                             isNegative ? 'BEARISH' : 
                             'NEUTRAL';
        
        const sentimentIcon = isPositive ? '↗' : isNegative ? '↘' : '→';
        const accentColor = isPositive ? 'var(--neon-green)' : isNegative ? 'var(--neon-red)' : 'var(--text-muted)';

        const impactTag = art.is_high_impact ? '<div class="impact-box">High Impact</div>' : '';
        
        const priceImpactHtml = art.price_impact !== undefined ? 
            `<div class="price-impact ${art.price_impact >= 0 ? 'txt-green' : 'txt-red'}">
                ${art.price_impact >= 0 ? '▲' : '▼'} ${Math.abs(art.price_impact).toFixed(2)}% (Real Reaction)
            </div>` : '';

        const sectorHtml = art.sektor ? `<span class="badge" style="background: rgba(139,92,246,0.1); color: #c4b5fd; border: 1px solid rgba(139,92,246,0.2);">${art.sektor}</span>` : '';
        const relatedHtml = art.related_stocks && art.related_stocks.length > 0 ? 
            `<div class="related-peers" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.05);">
                <span style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; margin-right: 8px;">Sector Peers:</span>
                ${art.related_stocks.map(rs => `<span class="ticker-badge" onclick="loadNews('${rs}')">${rs}</span>`).join('')}
            </div>` : '';

        return `
            <div class="news-item slide-up" style="border-left: 4px solid ${accentColor};">
                ${impactTag}
                <div class="news-meta">
                    <span class="news-source">${art.source}</span>
                    <span>•</span>
                    <span>${new Date(art.published_at).toLocaleString()}</span>
                    ${art.kode_saham ? `<span>•</span> <span class="badge" style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2);">${art.kode_saham}</span>` : ''}
                    ${sectorHtml ? `<span>•</span> ${sectorHtml}` : ''}
                </div>
                <a href="${art.content_url}" target="_blank" class="news-title">
                    <span style="color: ${accentColor}; margin-right: 8px; font-weight: 700;">${sentimentIcon}</span>
                    ${art.title}
                </a>
                <div class="news-footer">
                    <div class="sentiment-badge ${sentimentClass}">
                        ${sentimentText} (${(art.sentiment_score * 100).toFixed(0)}%)
                    </div>
                    ${priceImpactHtml}
                </div>
                ${relatedHtml}
            </div>
        `;
    }).join('');
}

/**
 * Render Top Impactful items to the sidebar
 */
function renderImpactSidebar(articles) {
    // 1. Render High Impact list
    const highImpact = articles
        .filter(a => a.is_high_impact)
        .slice(0, 5);

    if (highImpact.length === 0) {
        impactTodayList.innerHTML = '<div style="font-size: 0.75rem; color: var(--text-muted);">No high-impact news detected today.</div>';
    } else {
        impactTodayList.innerHTML = highImpact.map(art => `
            <div class="impact-list-item">
                <div class="ticker-circle">${art.kode_saham || '??'}</div>
                <div class="impact-info">
                    <h4>${art.title}</h4>
                    <div class="impact-score">Sentiment: ${(art.sentiment_score > 0 ? '+' : '')}${(art.sentiment_score * 100).toFixed(0)}%</div>
                </div>
            </div>
        `).join('');
    }

    // 2. Calculate Market Heat
    if (articles.length > 0) {
        const totalScore = articles.reduce((sum, art) => sum + art.sentiment_score, 0);
        const avgScore = totalScore / articles.length;
        const heatEl = document.getElementById('market-heat-score');
        
        heatEl.innerText = `${avgScore >= 0 ? '+' : ''}${avgScore.toFixed(2)}`;
        heatEl.style.color = avgScore > 0.1 ? 'var(--neon-green)' : 
                            avgScore < -0.1 ? 'var(--neon-red)' : 
                            'var(--text-muted)';
    }
}

// Search handler with debounce
let debounceTimer;
searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        loadNews(e.target.value);
    }, 500);
});

// Filter button listeners
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelector('.filter-btn.active').classList.remove('active');
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        applyFilter();
    });
});

// Initial Load
document.addEventListener('DOMContentLoaded', () => loadNews());
