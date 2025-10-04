// Configuration
const CONFIG = {
    API_URL: 'https://cqg.critters.quest/api/mining/miners',
    REFRESH_INTERVAL: 30 * 60 * 1000, // 30 minutes
    COOKIE: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ3YWxsZXQiOiI2Nk1FUzVMN05iemRwVDZpWHRRb0NuSGFnNXptQlBRcFhqYlc3QWgzRFpEVCIsImlhdCI6MTc1OTUxOTEyNiwiZXhwIjoxNzU5NTYyMzI2fQ.Lszd_5Ji1UdPR2oRTToQ5y2_TJRuWRSicx4d_hFwj2U',
    REMINDER_INTERVALS: [30 * 60, 15 * 60, 5 * 60, 60], // 30min, 15min, 5min, 1min
    ALERT_WINDOW_SECONDS: 5 * 3600 // 5 hours
};

// Global state
let plotsData = [];
let filteredPlots = [];
let currentView = 'table';
let currentTimeFilter = 5;
let refreshInterval;

// DOM elements
const elements = {
    lastUpdated: document.getElementById('lastUpdated'),
    timeFilter: document.getElementById('timeFilter'),
    searchInput: document.getElementById('searchInput'),
    refreshBtn: document.getElementById('refreshBtn'),
    totalPlots: document.getElementById('totalPlots'),
    lootableSoon: document.getElementById('lootableSoon'),
    uniquePlayers: document.getElementById('uniquePlayers'),
    avgLevel: document.getElementById('avgLevel'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    errorMessage: document.getElementById('errorMessage'),
    errorText: document.getElementById('errorText'),
    plotsContainer: document.getElementById('plotsContainer'),
    tableView: document.getElementById('tableView'),
    cardView: document.getElementById('cardView'),
    tileSearch: document.getElementById('tileSearch'),
    searchTileBtn: document.getElementById('searchTileBtn'),
    walletSearch: document.getElementById('walletSearch'),
    searchWalletBtn: document.getElementById('searchWalletBtn')
};

// Utility functions
function getCurrentTimestamp() {
    return Math.floor(Date.now() / 1000);
}

function formatTimeDuration(seconds) {
    if (seconds <= 0) return 'Now';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

function formatDateTime(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
    });
}

function getTimeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// API functions
async function fetchMinersData() {
    try {
        // Use a CORS proxy service to bypass browser restrictions
        // You can replace this with your own proxy server if needed
        const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
        const response = await fetch(proxyUrl + CONFIG.API_URL, {
            method: 'GET',
            headers: {
                'Cookie': `gameAccessToken=${CONFIG.COOKIE}`,
                'X-Requested-With': 'XMLHttpRequest'
            },
            mode: 'cors'
        });
        
        if (!response.ok) {
            // Fallback to alternative proxy
            const fallbackProxy = 'https://api.allorigins.win/raw?url=';
            const fallbackResponse = await fetch(fallbackProxy + encodeURIComponent(CONFIG.API_URL), {
                headers: {
                    'Cookie': `gameAccessToken=${CONFIG.COOKIE}`
                }
            });
            
            if (!fallbackResponse.ok) {
                throw new Error(`HTTP error! status: ${fallbackResponse.status}`);
            }
            
            return await fallbackResponse.json();
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching miners data:', error);
        
        // If all API calls fail, try to load from local storage as fallback
        const cachedData = localStorage.getItem('cachedMinersData');
        if (cachedData) {
            const parsedData = JSON.parse(cachedData);
            const cacheTime = localStorage.getItem('cachedMinersDataTime');
            const now = Date.now();
            
            // Use cached data if it's less than 1 hour old
            if (cacheTime && (now - parseInt(cacheTime)) < 3600000) {
                console.log('Using cached data as fallback');
                return parsedData;
            }
        }
        
        throw error;
    }
}

// Data processing
function processPlotsData(data, timeWindowHours = 5) {
    const currentTime = getCurrentTimestamp();
    const twentyFourHours = 24 * 3600;
    const alertWindowSeconds = timeWindowHours * 3600;
    const processedPlots = [];

    for (const miningGroup of Object.values(data.miners || {})) {
        for (const miner of miningGroup) {
            if (miner.expectedEndTime && (miner.destination || miner.currentTile)) {
                const lootableTime = miner.expectedEndTime + twentyFourHours;
                const timeUntilLootable = lootableTime - currentTime;
                const tile = miner.destination || miner.currentTile;

                // Only include plots within the specified time window
                if (timeUntilLootable > 0 && timeUntilLootable <= alertWindowSeconds) {
                    processedPlots.push({
                        tile: tile,
                        player: miner.user || 'unknown',
                        level: miner.level || 0,
                        tier: miner.tier || 0,
                        timeLeft: formatTimeDuration(timeUntilLootable),
                        lootableAt: formatDateTime(lootableTime),
                        lootableTime: lootableTime,
                        timeUntilLootable: timeUntilLootable,
                        isLootable: timeUntilLootable <= 60,
                        isSoon: timeUntilLootable <= 5 * 60
                    });
                }
            }
        }
    }

    // Sort by time until lootable (soonest first)
    return processedPlots.sort((a, b) => a.timeUntilLootable - b.timeUntilLootable);
}

function calculateStats(plots) {
    const stats = {
        totalPlots: plots.length,
        lootableSoon: plots.filter(p => p.timeUntilLootable <= CONFIG.ALERT_WINDOW_SECONDS).length,
        uniquePlayers: new Set(plots.map(p => p.player)).size,
        avgLevel: plots.length > 0 ? Math.round(plots.reduce((sum, p) => sum + p.level, 0) / plots.length) : 0
    };
    return stats;
}

// UI update functions
function updateStats(stats) {
    elements.totalPlots.textContent = stats.totalPlots;
    elements.lootableSoon.textContent = stats.lootableSoon;
    elements.uniquePlayers.textContent = stats.uniquePlayers;
    elements.avgLevel.textContent = stats.avgLevel;
}

function updateLastUpdated() {
    const now = new Date();
    elements.lastUpdated.textContent = `Last updated: ${now.toLocaleTimeString()}`;
}

function showLoading() {
    elements.loadingIndicator.style.display = 'block';
    elements.errorMessage.style.display = 'none';
    elements.plotsContainer.innerHTML = '';
}

function hideLoading() {
    elements.loadingIndicator.style.display = 'none';
}

function showError(message) {
    elements.errorText.textContent = message;
    elements.errorMessage.style.display = 'block';
    elements.loadingIndicator.style.display = 'none';
}

function hideError() {
    elements.errorMessage.style.display = 'none';
}

// View rendering functions
function renderTableView(plots) {
    if (plots.length === 0) {
        elements.plotsContainer.innerHTML = `
            <div class="text-center mt-20">
                <i class="fas fa-inbox" style="font-size: 3rem; color: #cbd5e0; margin-bottom: 20px;"></i>
                <p style="color: #718096; font-size: 1.1rem;">No plots found within the selected time window.</p>
            </div>
        `;
        return;
    }

    const tableHTML = `
        <table class="table-view">
            <thead>
                <tr>
                    <th>Tile</th>
                    <th>Player</th>
                    <th>Level</th>
                    <th>Tier</th>
                    <th>Time Left</th>
                    <th>Lootable At</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${plots.map(plot => `
                    <tr class="fade-in">
                        <td><strong>${plot.tile}</strong></td>
                        <td>${plot.player}</td>
                        <td>${plot.level}</td>
                        <td>${plot.tier}</td>
                        <td><strong>${plot.timeLeft}</strong></td>
                        <td>${plot.lootableAt}</td>
                        <td>
                            <span class="status-badge ${getStatusClass(plot)}">
                                ${getStatusText(plot)}
                            </span>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    elements.plotsContainer.innerHTML = tableHTML;
}

function renderCardView(plots) {
    if (plots.length === 0) {
        elements.plotsContainer.innerHTML = `
            <div class="text-center mt-20">
                <i class="fas fa-inbox" style="font-size: 3rem; color: #cbd5e0; margin-bottom: 20px;"></i>
                <p style="color: #718096; font-size: 1.1rem;">No plots found within the selected time window.</p>
            </div>
        `;
        return;
    }

    const cardsHTML = `
        <div class="card-view">
            ${plots.map(plot => `
                <div class="plot-card ${getStatusClass(plot)} fade-in">
                    <div class="plot-header">
                        <div class="plot-tile">Tile ${plot.tile}</div>
                        <span class="status-badge ${getStatusClass(plot)}">
                            ${getStatusText(plot)}
                        </span>
                    </div>
                    <div class="plot-details">
                        <div class="detail-item">
                            <div class="detail-label">Player</div>
                            <div class="detail-value">${plot.player}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Level</div>
                            <div class="detail-value">${plot.level}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Tier</div>
                            <div class="detail-value">${plot.tier}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Time Left</div>
                            <div class="detail-value"><strong>${plot.timeLeft}</strong></div>
                        </div>
                    </div>
                    <div class="plot-timer">
                        <div class="timer-text">${plot.timeLeft}</div>
                        <div class="timer-subtext">${plot.lootableAt}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    elements.plotsContainer.innerHTML = cardsHTML;
}

function getStatusClass(plot) {
    if (plot.isLootable) return 'status-lootable';
    if (plot.isSoon) return 'status-soon';
    return 'status-far';
}

function getStatusText(plot) {
    if (plot.isLootable) return 'Lootable';
    if (plot.isSoon) return 'Soon';
    return 'Later';
}

// Filter and search functions
function filterPlots(plots, timeWindowHours, searchTerm = '') {
    const currentTime = getCurrentTimestamp();
    const alertWindowSeconds = timeWindowHours * 3600;
    
    let filtered = plots.filter(plot => {
        const timeUntilLootable = plot.lootableTime - currentTime;
        const withinTimeWindow = timeUntilLootable > 0 && timeUntilLootable <= alertWindowSeconds;
        
        if (!withinTimeWindow) return false;
        
        if (!searchTerm) return true;
        
        const searchLower = searchTerm.toLowerCase();
        return (
            plot.tile.toString().includes(searchLower) ||
            plot.player.toLowerCase().includes(searchLower)
        );
    });
    
    return filtered.sort((a, b) => a.timeUntilLootable - b.timeUntilLootable);
}

function applyFilters() {
    const searchTerm = elements.searchInput.value.trim();
    filteredPlots = filterPlots(plotsData, currentTimeFilter, searchTerm);
    
    const stats = calculateStats(filteredPlots);
    updateStats(stats);
    
    if (currentView === 'table') {
        renderTableView(filteredPlots);
    } else {
        renderCardView(filteredPlots);
    }
}

// Event handlers
function setupEventListeners() {
    // Time filter change
    elements.timeFilter.addEventListener('change', (e) => {
        currentTimeFilter = parseInt(e.target.value);
        applyFilters();
    });
    
    // Search input
    elements.searchInput.addEventListener('input', debounce(applyFilters, 300));
    
    // Refresh button
    elements.refreshBtn.addEventListener('click', loadData);
    
    // View toggle
    elements.tableView.addEventListener('click', () => {
        currentView = 'table';
        elements.tableView.classList.add('active');
        elements.cardView.classList.remove('active');
        renderTableView(filteredPlots);
    });
    
    elements.cardView.addEventListener('click', () => {
        currentView = 'card';
        elements.cardView.classList.add('active');
        elements.tableView.classList.remove('active');
        renderCardView(filteredPlots);
    });
    
    // Quick search
    elements.searchTileBtn.addEventListener('click', () => {
        const tileNumber = elements.tileSearch.value.trim();
        if (tileNumber) {
            elements.searchInput.value = tileNumber;
            applyFilters();
        }
    });
    
    elements.searchWalletBtn.addEventListener('click', () => {
        const walletAddress = elements.walletSearch.value.trim();
        if (walletAddress) {
            elements.searchInput.value = walletAddress;
            applyFilters();
        }
    });
    
    // Enter key for quick search
    elements.tileSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            elements.searchTileBtn.click();
        }
    });
    
    elements.walletSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            elements.searchWalletBtn.click();
        }
    });
}

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Main data loading function
async function loadData() {
    try {
        showLoading();
        hideError();
        
        elements.refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        elements.refreshBtn.disabled = true;
        
        const data = await fetchMinersData();
        
        // Cache the data for fallback use
        localStorage.setItem('cachedMinersData', JSON.stringify(data));
        localStorage.setItem('cachedMinersDataTime', Date.now().toString());
        
        plotsData = processPlotsData(data, currentTimeFilter);
        
        applyFilters();
        updateLastUpdated();
        
        hideLoading();
        
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Failed to load plots data. Please check your connection and try again.');
    } finally {
        elements.refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        elements.refreshBtn.disabled = false;
    }
}

// Auto-refresh functionality
function startAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    refreshInterval = setInterval(() => {
        loadData();
    }, CONFIG.REFRESH_INTERVAL);
}

// Initialize the application
function init() {
    setupEventListeners();
    loadData();
    startAutoRefresh();
    
    // Update timers every minute
    setInterval(() => {
        if (plotsData.length > 0) {
            plotsData = plotsData.map(plot => {
                const currentTime = getCurrentTimestamp();
                const timeUntilLootable = plot.lootableTime - currentTime;
                
                return {
                    ...plot,
                    timeLeft: formatTimeDuration(timeUntilLootable),
                    timeUntilLootable: timeUntilLootable,
                    isLootable: timeUntilLootable <= 60,
                    isSoon: timeUntilLootable <= 5 * 60
                };
            }).filter(plot => plot.timeUntilLootable > 0);
            
            applyFilters();
        }
    }, 60000); // Update every minute
}

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
