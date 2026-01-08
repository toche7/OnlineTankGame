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
  socket.emit('getPersonalStats', { playerId });
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
    document.getElementById('rankValue').textContent = '#' + data.rank;
  }
});

// Display leaderboard
socket.on('leaderboard', (players) => {
  const tbody = document.getElementById('leaderboardBody');
  tbody.innerHTML = '';
  
  if (!players || players.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading">No players yet. Play some games to appear on the leaderboard!</td></tr>';
    return;
  }
  
  players.forEach((player, index) => {
    const stats = player.stats;
    const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);
    const winRate = stats.gamesPlayed > 0 ? ((stats.wins / stats.gamesPlayed) * 100).toFixed(1) : '0.0';
    
    const row = document.createElement('tr');
    
    // Highlight current player
    if (player.id === playerId) {
      row.classList.add('highlight');
    }
    
    // Add medal for top 3
    let rankDisplay = index + 1;
    if (index === 0) rankDisplay = '🥇 1';
    else if (index === 1) rankDisplay = '🥈 2';
    else if (index === 2) rankDisplay = '🥉 3';
    
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

    // Color username: blue for Google-signed players, white otherwise
    // Apply after innerHTML so cells exist
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
});

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Event listeners
document.getElementById('sortBy').addEventListener('change', loadLeaderboard);
document.getElementById('refreshBtn').addEventListener('click', loadStats);

// Initial load
socket.on('connect', () => {
  loadStats();
});

// Auto-refresh every 30 seconds
setInterval(() => {
  loadStats();
}, 30000);
