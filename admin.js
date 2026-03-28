// -----------------------------------------------------
// Scraper Admin Dedicated Logic
// -----------------------------------------------------

// API Keys & URLs
const API_BASE = 'http://localhost:8080/api/v1';
const API_KEY = 'dev_secret_key';

// DOM Elements
const triggerScrapeBtn = document.getElementById('trigger-scrape-btn');
const adminStatus = document.getElementById('admin-status');
const adminLastRun = document.getElementById('admin-last-run');
const adminHealth = document.getElementById('admin-health');
const terminalLogs = document.getElementById('terminal-logs');

// Init Poller
let scraperPollInterval = null;

// Bind Button
triggerScrapeBtn.addEventListener('click', async () => {
    if (!confirm('WARNING: Force-triggering the Scraper bypasses cron schedules and consumes massive server memory to run Puppeteer in Docker.\n\nAre you sure you want to proceed?')) return;
    
    triggerScrapeBtn.textContent = '▶ TRIGGERING...'; 
    triggerScrapeBtn.style.opacity = '0.5';
    
    try { 
        await fetch(`${API_BASE}/scraper/trigger`, { 
            method: 'POST', 
            headers: { 'X-API-Key': API_KEY } 
        }); 
    } catch (e) { 
        alert('Failed: ' + e.message); 
    }
    
    setTimeout(() => { 
        triggerScrapeBtn.innerHTML = '▶ FORCE SCRAPE NOW'; 
        triggerScrapeBtn.style.opacity = '1'; 
    }, 2000);
});

// Polling Engine
async function pollScraperStatus() {
    try {
        const res = await fetch(`${API_BASE}/scraper/status`, { 
            headers: { 'X-API-Key': API_KEY } 
        });
        
        if (!res.ok) throw new Error('API down');
        
        const data = await res.json();
        
        adminStatus.textContent = data.is_running ? 'RUNNING' : data.status;
        adminStatus.className = 'value ' + (data.is_running ? 'txt-blue' : (data.status.includes('Fail') ? 'txt-red' : ''));
        adminLastRun.textContent = data.last_run || '--';
        adminHealth.textContent = 'Online'; 
        adminHealth.className = 'value txt-green';
        
        if (data.logs && data.logs.length > 0) {
            terminalLogs.innerHTML = data.logs.join('<br>');
            const terminalWindow = terminalLogs.parentElement;
            // Native auto-scroll to bottom of log output
            terminalWindow.scrollTop = terminalWindow.scrollHeight;
        } else {
            terminalLogs.innerHTML = 'System Idle. Awaiting commands...';
        }
    } catch (e) {
        adminHealth.textContent = 'Disconnected'; 
        adminHealth.className = 'value txt-red';
        terminalLogs.innerHTML = `<span class="txt-red">[FATAL CONNECTION ERROR]</span> API Bridge Socket Disconnected.\nBackend system is offline or rebooting.`;
    }
}

// Start immediately and loop every 2s
pollScraperStatus();
scraperPollInterval = setInterval(pollScraperStatus, 2000);
