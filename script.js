// Configuration
const CONFIG = {
    API_URL: 'https://cqg.critters.quest/api/mining/miners',
    REFRESH_INTERVAL: 30 * 60 * 1000, // 30 minutes
    COOKIE: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ3YWxsZXQiOiI2Nk1FUzVMN05iemRwVDZpWHRRb0NuSGFnNXptQlBRcFhqYlc3QWgzRFpEVCIsImlhdCI6MTc1OTUxOTEyNiwiZXhwIjoxNzU5NTYyMzI2fQ.Lszd_5Ji1UdPR2oRTToQ5y2_TJRuWRSicx4d_hFwj2U',
    REMINDER_INTERVALS: [30 * 60, 15 * 60, 5 * 60, 60], // 30min, 15min, 5min, 1min
    ALERT_WINDOW_SECONDS: 5 * 3600, // 5 hours
    MATT_WALLET: '3E77qMQBScwWQDeauPgerW5G46pB42HngbGCb32oBfu1' // Matt's wallet address
};

// Global state
let plotsData = [];
let filteredPlots = [];
let mattPlots = [];
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
    searchWalletBtn: document.getElementById('searchWalletBtn'),
    // Matt's section elements
    mattLoadingIndicator: document.getElementById('mattLoadingIndicator'),
    mattErrorMessage: document.getElementById('mattErrorMessage'),
    mattErrorText: document.getElementById('mattErrorText'),
    mattPlotsContainer: document.getElementById('mattPlotsContainer'),
    refreshMattBtn: document.getElementById('refreshMattBtn'),
    // Token management elements
    tokenInput: document.getElementById('tokenInput'),
    updateTokenBtn: document.getElementById('updateTokenBtn'),
    tokenStatus: document.getElementById('tokenStatus'),
    tokenExpiry: document.getElementById('tokenExpiry'),
    // Manual data elements
    manualDataInput: document.getElementById('manualDataInput'),
    loadManualDataBtn: document.getElementById('loadManualDataBtn'),
    // Debug elements
    currentTime: document.getElementById('currentTime'),
    timeFilterValue: document.getElementById('timeFilterValue'),
    totalMiners: document.getElementById('totalMiners'),
    processedPlots: document.getElementById('processedPlots'),
    mattMiners: document.getElementById('mattMiners'),
    mattPlots: document.getElementById('mattPlots')
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

// Token management functions
function parseJWT(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        
        const payload = JSON.parse(atob(parts[1]));
        return {
            wallet: payload.wallet,
            issuedAt: payload.iat,
            expiresAt: payload.exp,
            isValid: payload.exp > Math.floor(Date.now() / 1000)
        };
    } catch (error) {
        console.error('Error parsing JWT:', error);
        return null;
    }
}

function updateTokenStatus() {
    const tokenInfo = parseJWT(CONFIG.COOKIE);
    if (tokenInfo) {
        const expiryDate = new Date(tokenInfo.expiresAt * 1000);
        const timeUntilExpiry = tokenInfo.expiresAt - Math.floor(Date.now() / 1000);
        
        elements.tokenExpiry.textContent = expiryDate.toLocaleString();
        
        // Update status styling
        elements.tokenStatus.className = 'token-status';
        if (timeUntilExpiry < 0) {
            elements.tokenStatus.classList.add('expired');
            elements.tokenStatus.innerHTML = `<small>Token expired: <span>${expiryDate.toLocaleString()}</span></small>`;
        } else if (timeUntilExpiry < 3600) { // Less than 1 hour
            elements.tokenStatus.classList.add('warning');
            elements.tokenStatus.innerHTML = `<small>Token expires soon: <span>${expiryDate.toLocaleString()}</span></small>`;
        } else {
            elements.tokenStatus.innerHTML = `<small>Token expires: <span>${expiryDate.toLocaleString()}</span></small>`;
        }
    } else {
        elements.tokenStatus.className = 'token-status expired';
        elements.tokenStatus.innerHTML = '<small>Invalid token format</small>';
    }
}

function updateGameToken(newToken) {
    // Validate the new token
    const tokenInfo = parseJWT(newToken);
    if (!tokenInfo) {
        alert('Invalid token format. Please check your token and try again.');
        return false;
    }
    
    // Update the configuration
    CONFIG.COOKIE = newToken;
    
    // Save to localStorage for persistence
    localStorage.setItem('gameAccessToken', newToken);
    
    // Update the display
    updateTokenStatus();
    
    // Show success message
    elements.tokenStatus.className = 'token-status success';
    elements.tokenStatus.innerHTML = `<small>Token updated successfully! Expires: <span>${new Date(tokenInfo.expiresAt * 1000).toLocaleString()}</span></small>`;
    
    // Clear the input
    elements.tokenInput.value = '';
    
    // Reload data with new token
    loadData();
    
    return true;
}

// API functions
async function fetchMinersData() {
    const proxies = [
        'https://api.allorigins.win/raw?url=',
        'https://cors-anywhere.herokuapp.com/',
        'https://thingproxy.freeboard.io/fetch/',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://proxy.cors.sh/',
        'https://corsproxy.io/?'
    ];
    
    for (let i = 0; i < proxies.length; i++) {
        try {
            console.log(`Trying proxy ${i + 1}/${proxies.length}: ${proxies[i]}`);
            
            let response;
            if (proxies[i].includes('allorigins')) {
                // AllOrigins proxy
                response = await fetch(proxies[i] + encodeURIComponent(CONFIG.API_URL), {
                    method: 'GET',
                    headers: {
                        'Cookie': `gameAccessToken=${CONFIG.COOKIE}`,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
            } else if (proxies[i].includes('cors-anywhere')) {
                // CORS Anywhere proxy
                response = await fetch(proxies[i] + CONFIG.API_URL, {
                    method: 'GET',
                    headers: {
                        'Cookie': `gameAccessToken=${CONFIG.COOKIE}`,
                        'X-Requested-With': 'XMLHttpRequest',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
            } else {
                // Other proxies - try different approaches
                if (proxies[i].includes('codetabs')) {
                    // CodeTabs proxy - doesn't support custom headers well
                    response = await fetch(proxies[i] + CONFIG.API_URL, {
                        method: 'GET',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                } else if (proxies[i].includes('cors.sh')) {
                    // CORS.sh proxy
                    response = await fetch(proxies[i] + CONFIG.API_URL, {
                        method: 'GET',
                        headers: {
                            'x-cors-api-key': 'temp_1234567890',
                            'Cookie': `gameAccessToken=${CONFIG.COOKIE}`,
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                } else if (proxies[i].includes('corsproxy.io')) {
                    // CORSProxy.io
                    response = await fetch(proxies[i] + encodeURIComponent(CONFIG.API_URL), {
                        method: 'GET',
                        headers: {
                            'Cookie': `gameAccessToken=${CONFIG.COOKIE}`,
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                } else {
                    // Other proxies
                    response = await fetch(proxies[i] + CONFIG.API_URL, {
                        method: 'GET',
                        headers: {
                            'Cookie': `gameAccessToken=${CONFIG.COOKIE}`,
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                }
            }
            
            if (response.ok) {
                const data = await response.json();
                console.log(`Successfully fetched data using proxy ${i + 1}`);
                
                // Check if we got unauthorized response
                if (data.status === false && data.message && data.message.includes('Unauthorized')) {
                    console.log(`Proxy ${i + 1} returned unauthorized - token not sent properly`);
                    continue;
                }
                
                return data;
            } else {
                console.log(`Proxy ${i + 1} failed with status: ${response.status}`);
            }
        } catch (error) {
            console.log(`Proxy ${i + 1} error:`, error.message);
            continue;
        }
    }
    
    // If all proxies fail, try to load from local storage as fallback
    console.log('All proxies failed, trying cached data...');
    const cachedData = localStorage.getItem('cachedMinersData');
    if (cachedData) {
        const parsedData = JSON.parse(cachedData);
        const cacheTime = localStorage.getItem('cachedMinersDataTime');
        const now = Date.now();
        
        // Use cached data if it's less than 24 hours old
        if (cacheTime && (now - parseInt(cacheTime)) < 86400000) {
            console.log('Using cached data as fallback');
            return parsedData;
        }
    }
    
    throw new Error('All API proxies failed due to authentication issues. Please use the manual data input method in the Troubleshooting section to load data directly.');
}

// Data processing
function processPlotsData(data, timeWindowHours = 5) {
    console.log('Processing plots data:', data);
    const currentTime = getCurrentTimestamp();
    const twentyFourHours = 24 * 3600;
    const alertWindowSeconds = timeWindowHours * 3600;
    const processedPlots = [];

    // Debug: log the data structure
    console.log('Data structure:', {
        hasMiners: !!data.miners,
        minersKeys: data.miners ? Object.keys(data.miners) : 'no miners',
        totalMiners: data.miners ? Object.values(data.miners).flat().length : 0
    });

    for (const miningGroup of Object.values(data.miners || {})) {
        for (const miner of miningGroup) {
            console.log('Processing miner:', {
                user: miner.user,
                expectedEndTime: miner.expectedEndTime,
                destination: miner.destination,
                currentTile: miner.currentTile,
                level: miner.level,
                tier: miner.tier
            });

            if (miner.expectedEndTime && (miner.destination || miner.currentTile)) {
                const lootableTime = miner.expectedEndTime + twentyFourHours;
                const timeUntilLootable = lootableTime - currentTime;
                const tile = miner.destination || miner.currentTile;

                console.log('Miner details:', {
                    tile,
                    lootableTime,
                    timeUntilLootable,
                    alertWindowSeconds,
                    withinWindow: timeUntilLootable > 0 && timeUntilLootable <= alertWindowSeconds
                });

                // Only include plots within the specified time window (or all if debug mode)
                if (timeUntilLootable > 0 && (alertWindowSeconds >= 999 * 3600 || timeUntilLootable <= alertWindowSeconds)) {
                    const plot = {
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
                    };
                    processedPlots.push(plot);
                    console.log('Added plot:', plot);
                }
            }
        }
    }

    console.log(`Processed ${processedPlots.length} plots for ${timeWindowHours}-hour window`);
    
    // Update debug info
    elements.processedPlots.textContent = processedPlots.length;
    elements.totalMiners.textContent = data.miners ? Object.values(data.miners).flat().length : 0;
    elements.currentTime.textContent = new Date().toLocaleString();
    elements.timeFilterValue.textContent = timeWindowHours >= 999 ? 'All (Debug)' : `${timeWindowHours} hours`;
    
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

// Matt's plots processing
function processMattPlots(data) {
    console.log('Processing Matt\'s plots data...');
    const currentTime = getCurrentTimestamp();
    const twentyFourHours = 24 * 3600;
    const mattPlots = [];
    let mattMinersFound = 0;

    for (const miningGroup of Object.values(data.miners || {})) {
        for (const miner of miningGroup) {
            if (miner.user === CONFIG.MATT_WALLET) {
                mattMinersFound++;
                console.log('Found Matt\'s miner:', {
                    user: miner.user,
                    expectedEndTime: miner.expectedEndTime,
                    destination: miner.destination,
                    currentTile: miner.currentTile,
                    level: miner.level,
                    tier: miner.tier
                });

                if (miner.expectedEndTime && (miner.destination || miner.currentTile)) {
                    const lootableTime = miner.expectedEndTime + twentyFourHours;
                    const timeUntilLootable = lootableTime - currentTime;
                    const tile = miner.destination || miner.currentTile;

                    console.log('Matt\'s miner details:', {
                        tile,
                        lootableTime,
                        timeUntilLootable,
                        willBeLootable: timeUntilLootable > 0
                    });

                    // Include all plots for Matt, regardless of time window
                    if (timeUntilLootable > 0) {
                        const plot = {
                            tile: tile,
                            player: miner.user,
                            level: miner.level || 0,
                            tier: miner.tier || 0,
                            timeLeft: formatTimeDuration(timeUntilLootable),
                            lootableAt: formatDateTime(lootableTime),
                            lootableTime: lootableTime,
                            timeUntilLootable: timeUntilLootable,
                            isLootable: timeUntilLootable <= 60,
                            isSoon: timeUntilLootable <= 5 * 60
                        };
                        mattPlots.push(plot);
                        console.log('Added Matt\'s plot:', plot);
                    }
                }
            }
        }
    }

    console.log(`Found ${mattMinersFound} miners for Matt, ${mattPlots.length} lootable plots`);
    
    // Update debug info
    elements.mattMiners.textContent = mattMinersFound;
    elements.mattPlots.textContent = mattPlots.length;
    
    // Sort by time until lootable (soonest first)
    return mattPlots.sort((a, b) => a.timeUntilLootable - b.timeUntilLootable);
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

// Matt's section rendering
function renderMattPlots(plots) {
    if (plots.length === 0) {
        elements.mattPlotsContainer.innerHTML = `
            <div class="matt-no-plots">
                <i class="fas fa-search"></i>
                <p>No active plots found for Matt's wallet.</p>
                <p>Either no miners are active or all plots have been looted.</p>
            </div>
        `;
        return;
    }

    const plotsHTML = plots.map(plot => `
        <div class="matt-plot-card ${getStatusClass(plot)} fade-in">
            <div class="matt-plot-header">
                <div class="matt-plot-tile">Tile ${plot.tile}</div>
                <span class="status-badge ${getStatusClass(plot)}">
                    ${getStatusText(plot)}
                </span>
            </div>
            <div class="plot-details">
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
                <div class="detail-item">
                    <div class="detail-label">Status</div>
                    <div class="detail-value">${getStatusText(plot)}</div>
                </div>
            </div>
            <div class="matt-plot-timer">
                <div class="matt-timer-text">${plot.timeLeft}</div>
                <div class="matt-timer-subtext">${plot.lootableAt}</div>
            </div>
        </div>
    `).join('');
    
    elements.mattPlotsContainer.innerHTML = plotsHTML;
}

function showMattLoading() {
    elements.mattLoadingIndicator.style.display = 'block';
    elements.mattErrorMessage.style.display = 'none';
    elements.mattPlotsContainer.innerHTML = '';
}

function hideMattLoading() {
    elements.mattLoadingIndicator.style.display = 'none';
}

function showMattError(message) {
    elements.mattErrorText.textContent = message;
    elements.mattErrorMessage.style.display = 'block';
    elements.mattLoadingIndicator.style.display = 'none';
}

function hideMattError() {
    elements.mattErrorMessage.style.display = 'none';
}

// Manual data processing
function processManualData(data) {
    try {
        // Process the data the same way as API data
        plotsData = processPlotsData(data, currentTimeFilter);
        mattPlots = processMattPlots(data);
        
        // Cache the data
        localStorage.setItem('cachedMinersData', JSON.stringify(data));
        localStorage.setItem('cachedMinersDataTime', Date.now().toString());
        
        // Update the UI
        applyFilters();
        renderMattPlots(mattPlots);
        updateLastUpdated();
        
        // Hide any loading/error states
        hideLoading();
        hideError();
        hideMattLoading();
        hideMattError();
        
        console.log('Manual data processed successfully');
    } catch (error) {
        console.error('Error processing manual data:', error);
        alert('Error processing the data. Please check the format and try again.');
    }
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
    
    // Matt's refresh button
    elements.refreshMattBtn.addEventListener('click', loadMattData);
    
    // Token management
    elements.updateTokenBtn.addEventListener('click', () => {
        const newToken = elements.tokenInput.value.trim();
        if (newToken) {
            updateGameToken(newToken);
        } else {
            alert('Please enter a token to update.');
        }
    });
    
    elements.tokenInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            elements.updateTokenBtn.click();
        }
    });
    
    // Manual data loading
    elements.loadManualDataBtn.addEventListener('click', () => {
        const manualData = elements.manualDataInput.value.trim();
        if (manualData) {
            try {
                const data = JSON.parse(manualData);
                processManualData(data);
                elements.manualDataInput.value = '';
                elements.tokenStatus.className = 'token-status success';
                elements.tokenStatus.innerHTML = '<small>Manual data loaded successfully!</small>';
            } catch (error) {
                alert('Invalid JSON format. Please check your data and try again.');
            }
        } else {
            alert('Please enter JSON data to load.');
        }
    });
    
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
        mattPlots = processMattPlots(data);
        
        applyFilters();
        renderMattPlots(mattPlots);
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

// Matt's data loading function
async function loadMattData() {
    try {
        showMattLoading();
        hideMattError();
        
        elements.refreshMattBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        elements.refreshMattBtn.disabled = true;
        
        const data = await fetchMinersData();
        mattPlots = processMattPlots(data);
        
        renderMattPlots(mattPlots);
        hideMattLoading();
        
    } catch (error) {
        console.error('Error loading Matt\'s data:', error);
        showMattError('Failed to load Matt\'s plots data. Please try again.');
    } finally {
        elements.refreshMattBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        elements.refreshMattBtn.disabled = false;
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
    // Load saved token from localStorage if available
    const savedToken = localStorage.getItem('gameAccessToken');
    if (savedToken) {
        CONFIG.COOKIE = savedToken;
    }
    
    setupEventListeners();
    updateTokenStatus();
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
        
        // Update Matt's plots timers
        if (mattPlots.length > 0) {
            mattPlots = mattPlots.map(plot => {
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
            
            renderMattPlots(mattPlots);
        }
    }, 60000); // Update every minute
}

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
