const socket = io();

// Get player ID
let playerId = localStorage.getItem('tankGamePlayerId');
let username = null; // Will be fetched from server

// Fetch username from server
async function fetchUsername() {
  try {
    const response = await fetch(`/api/player/${playerId}`);
    const data = await response.json();
    if (data.success && data.player) {
      username = data.player.username;
    }
  } catch (err) {
    console.error('Error fetching username:', err);
  }
}

// Check if coming from a game (for rejoin)
const urlParams = new URLSearchParams(window.location.search);
const gameCode = urlParams.get('gameCode');
const oldSocketId = urlParams.get('oldSocketId');

// Setup back button with rejoin if coming from game
window.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('backToLobby');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (gameCode && oldSocketId) {
        // Rejoin the game
        window.location.href = `/menu.html?rejoin=${gameCode}&oldSocketId=${oldSocketId}`;
      } else {
        // Just go to menu
        window.location.href = '/menu.html';
      }
    });
  }
});

// Load personal stats and leaderboard
async function loadStats() {
  await fetchUsername();
  const sortBy = document.getElementById('sortBy').value;
  socket.emit('getPersonalStats', { playerId, sortBy });
  loadLeaderboard();
}

// Load leaderboard
function loadLeaderboard() {
  const sortBy = document.getElementById('sortBy').value;
  socket.emit('getLeaderboard', { sortBy });
}

// Display personal stats
socket.on('personalStats', (data) => {
  if (!data) {
    document.getElementById('yourWins').textContent = '0';
    document.getElementById('yourGames').textContent = '0';
    document.getElementById('yourKills').textContent = '0';
    document.getElementById('yourDeaths').textContent = '0';
    document.getElementById('yourKD').textContent = '0.00';
    document.getElementById('yourWinRate').textContent = '0%';
    document.getElementById('rankValue').textContent = '#-';
    return;
  }
  
  const stats = data.stats;
  const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);
  const winRate = stats.gamesPlayed > 0 ? ((stats.wins / stats.gamesPlayed) * 100).toFixed(1) : '0.0';
  
  document.getElementById('yourWins').textContent = stats.wins;
  document.getElementById('yourGames').textContent = stats.gamesPlayed;
  document.getElementById('yourKills').textContent = stats.kills;
  document.getElementById('yourDeaths').textContent = stats.deaths;
  document.getElementById('yourKD').textContent = kd;
  document.getElementById('yourWinRate').textContent = winRate + '%';
  
  if (data.rank) {
    const rankType = data.isGoogle ? '(Registered Players)' : '(Guest Players)';
    document.getElementById('rankValue').textContent = '#' + data.rank + ' ' + rankType;
  }
});

// Display both leaderboards
socket.on('leaderboards', (data) => {
  displayLeaderboard('loggedInLeaderboardBody', data.loggedIn || [], 'registered');
  displayLeaderboard('guestLeaderboardBody', data.guest || [], 'guest');
  displayLeaderboard('monthlyLeaderboardBody', data.monthly || [], 'monthly');
  displayLeaderboard('lastMonthLeaderboardBody', data.lastMonth || [], 'lastMonth');
});

// Helper function to display a leaderboard
function displayLeaderboard(tbodyId, players, type) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = '';
  
  if (!players || players.length === 0) {
    let message;
    if (type === 'registered') {
      message = 'No registered players yet.';
    } else if (type === 'guest') {
      message = 'No guest players yet.';
    } else if (type === 'monthly') {
      message = 'No rankings yet. Play some games this month!';
    } else if (type === 'lastMonth') {
      message = 'No data from last month yet.';
    }
    tbody.innerHTML = `<tr><td colspan="8" class="loading">${message}</td></tr>`;
    return;
  }
  
  // Get the current sort attribute
  const sortBy = document.getElementById('sortBy').value;
  
  // Calculate ranks considering ties
  let currentRank = 1;
  let previousValue = null;
  
  players.forEach((player, index) => {
    const stats = player.stats;
    const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);
    const winRate = stats.gamesPlayed > 0 ? ((stats.wins / stats.gamesPlayed) * 100).toFixed(1) : '0.0';
    
    // Get the current player's value for the sorted attribute
    let currentValue;
    switch(sortBy) {
      case 'wins':
        currentValue = stats.wins;
        break;
      case 'gamesPlayed':
        currentValue = stats.gamesPlayed;
        break;
      case 'kills':
        currentValue = stats.kills;
        break;
      case 'deaths':
        currentValue = stats.deaths;
        break;
      case 'kd':
        currentValue = parseFloat(kd);
        break;
      case 'winRate':
        currentValue = parseFloat(winRate);
        break;
      default:
        currentValue = stats.wins;
    }
    
    // Update rank if value changed from previous player
    if (index > 0 && currentValue !== previousValue) {
      currentRank = index + 1;
    }
    previousValue = currentValue;
    
    const row = document.createElement('tr');
    
    // Highlight current player
    if (player.id === playerId) {
      row.classList.add('highlight');
    }
    
    // Add medal for top 3 ranks (not positions)
    let rankDisplay = currentRank;
    if (currentRank === 1) rankDisplay = '🥇 1';
    else if (currentRank === 2) rankDisplay = '🥈 2';
    else if (currentRank === 3) rankDisplay = '🥉 3';
    
    row.innerHTML = `
      <td>${rankDisplay}</td>
      <td>${escapeHtml(player.username)}</td>
      <td>${stats.wins}</td>
      <td>${stats.gamesPlayed}</td>
      <td>${stats.kills}</td>
      <td>${stats.deaths}</td>
      <td>${kd}</td>
      <td>${winRate}%</td>
    `;

    // Color username: green for Google-signed players, white otherwise
    tbody.appendChild(row);
    try {
      const nameCell = row.cells[1];
      if (nameCell) {
        nameCell.style.color = player.isGoogle ? '#4caf50' : 'white';
      }
    } catch (e) {
      // ignore if cells not available
    }
  });
}

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Tab switching functionality
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.leaderboard-tab');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      
      // Remove active class from all buttons and tabs
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(tab => tab.classList.remove('active'));
      
      // Add active class to clicked button and corresponding tab
      button.classList.add('active');
      let targetTab;
      if (tabName === 'loggedIn') {
        targetTab = 'loggedInTab';
      } else if (tabName === 'guest') {
        targetTab = 'guestTab';
      } else if (tabName === 'monthly') {
        targetTab = 'monthlyTab';
      } else if (tabName === 'lastMonth') {
        targetTab = 'lastMonthTab';
      }
      if (targetTab) {
        document.getElementById(targetTab).classList.add('active');
      }
    });
  });
}

// Mode tab switching (Online vs Single Player)
function setupModeTabs() {
  const modeTabButtons = document.querySelectorAll('.mode-tab-btn');
  const modeSections = document.querySelectorAll('.mode-section');
  
  modeTabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const mode = button.getAttribute('data-mode');
      
      // Remove active class from all buttons and sections
      modeTabButtons.forEach(btn => btn.classList.remove('active'));
      modeSections.forEach(section => section.classList.remove('active'));
      
      // Add active class to clicked button and corresponding section
      button.classList.add('active');
      if (mode === 'online') {
        document.getElementById('onlineSection').classList.add('active');
      } else if (mode === 'singleplayer') {
        document.getElementById('singleplayerSection').classList.add('active');
        // Load single player stats when tab is opened
        loadSinglePlayerStats();
      }
    });
  });
}

// Load single player stats
async function loadSinglePlayerStats() {
  await fetchUsername();
  const playerId = localStorage.getItem('tankGamePlayerId');
  
  try {
    // Load personal stats
    const statsResponse = await fetch(`/api/singleplayer/stats/${playerId}`);
    const statsData = await statsResponse.json();
    
    if (statsData.success) {
      displaySinglePlayerStats(statsData.stats);
    }
    
    // Load leaderboard
    loadSinglePlayerLeaderboard();
  } catch (error) {
    console.error('Error loading single player stats:', error);
  }
}

// Display single player stats
function displaySinglePlayerStats(stats) {
  if (!stats || stats.total_games === '0') {
    // No games played yet
    document.getElementById('spTotalGames').textContent = '0';
    document.getElementById('spWins').textContent = '0';
    document.getElementById('spTotalKills').textContent = '0';
    document.getElementById('spTotalScore').textContent = '0';
    document.getElementById('spBestScore').textContent = '0';
    document.getElementById('spWinRate').textContent = '0%';
    document.getElementById('spTrainingGames').textContent = '0 games';
    document.getElementById('spTimeAttackGames').textContent = '0 games';
    document.getElementById('spCampaignGames').textContent = '0 games';
    document.getElementById('spBossRushGames').textContent = '0 games';
    document.getElementById('spBestTimeAttack').textContent = '-';
    document.getElementById('spBestBossRush').textContent = '-';
    document.getElementById('spCampaignsWon').textContent = '0 won';
    return;
  }
  
  const totalGames = parseInt(stats.total_games) || 0;
  const wins = parseInt(stats.wins) || 0;
  const winRate = totalGames > 0 ? ((wins / totalGames) * 100).toFixed(1) : '0.0';
  
  document.getElementById('spTotalGames').textContent = totalGames;
  document.getElementById('spWins').textContent = wins;
  document.getElementById('spTotalKills').textContent = parseInt(stats.total_kills) || 0;
  document.getElementById('spTotalScore').textContent = parseInt(stats.total_score) || 0;
  document.getElementById('spBestScore').textContent = parseInt(stats.best_score) || 0;
  document.getElementById('spWinRate').textContent = winRate + '%';
  
  // Mode breakdown
  document.getElementById('spTrainingGames').textContent = (parseInt(stats.training_games) || 0) + ' games';
  document.getElementById('spTimeAttackGames').textContent = (parseInt(stats.timeattack_games) || 0) + ' games';
  document.getElementById('spCampaignGames').textContent = (parseInt(stats.campaign_games) || 0) + ' games';
  document.getElementById('spBossRushGames').textContent = (parseInt(stats.bossrush_games) || 0) + ' games';
  
  // Best times
  if (stats.best_timeattack_time) {
    const time = parseInt(stats.best_timeattack_time);
    const mins = Math.floor(time / 60);
    const secs = time % 60;
    document.getElementById('spBestTimeAttack').textContent = `Best: ${mins}:${secs.toString().padStart(2, '0')}`;
  } else {
    document.getElementById('spBestTimeAttack').textContent = '-';
  }
  
  if (stats.best_bossrush_time) {
    const time = parseInt(stats.best_bossrush_time);
    const mins = Math.floor(time / 60);
    const secs = time % 60;
    document.getElementById('spBestBossRush').textContent = `Best: ${mins}:${secs.toString().padStart(2, '0')}`;
  } else {
    document.getElementById('spBestBossRush').textContent = '-';
  }
  
  document.getElementById('spCampaignsWon').textContent = (parseInt(stats.campaigns_won) || 0) + ' won';
}

// Load single player leaderboard
async function loadSinglePlayerLeaderboard() {
  const mode = document.getElementById('spModeFilter').value;
  const sortBy = document.getElementById('spSortBy').value;
  
  try {
    const response = await fetch(`/api/singleplayer/leaderboard?mode=${mode}&sortBy=${sortBy}`);
    const data = await response.json();
    
    if (data.success) {
      displaySinglePlayerLeaderboard(data.leaderboard);
    }
  } catch (error) {
    console.error('Error loading single player leaderboard:', error);
  }
}

// Display single player leaderboard
function displaySinglePlayerLeaderboard(players) {
  const tbody = document.getElementById('spLeaderboardBody');
  tbody.innerHTML = '';
  
  if (!players || players.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #999;">No games played yet</td></tr>';
    return;
  }
  
  players.forEach((player, index) => {
    const row = document.createElement('tr');
    const winRate = player.total_games > 0 ? ((player.total_wins / player.total_games) * 100).toFixed(1) : '0.0';
    const bestTime = player.best_time ? formatTime(parseInt(player.best_time)) : '-';
    
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${escapeHtml(player.username)}</td>
      <td>${player.total_wins || 0}</td>
      <td>${player.total_games || 0}</td>
      <td>${player.best_score || 0}</td>
      <td>${bestTime}</td>
      <td>${winRate}%</td>
    `;
    
    tbody.appendChild(row);
    
    // Color username: green for Google-signed players, white otherwise
    try {
      const nameCell = row.cells[1];
      if (nameCell) {
        nameCell.style.color = player.is_google ? '#4caf50' : 'white';
      }
    } catch (e) {
      // ignore if cells not available
    }
  });
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Event listeners
document.getElementById('sortBy').addEventListener('change', loadLeaderboard);
document.getElementById('refreshBtn').addEventListener('click', loadStats);

// Initialize tabs
window.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupModeTabs();
  
  // Single player controls
  const spModeFilter = document.getElementById('spModeFilter');
  const spSortBy = document.getElementById('spSortBy');
  const spRefreshBtn = document.getElementById('spRefreshBtn');
  
  if (spModeFilter) spModeFilter.addEventListener('change', loadSinglePlayerLeaderboard);
  if (spSortBy) spSortBy.addEventListener('change', loadSinglePlayerLeaderboard);
  if (spRefreshBtn) spRefreshBtn.addEventListener('click', loadSinglePlayerStats);
});

// Initial load
socket.on('connect', () => {
  loadStats();
});

// Auto-refresh every 30 seconds
setInterval(() => {
  loadStats();
}, 30000);
