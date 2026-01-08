// Fetch and display game version
window.addEventListener('DOMContentLoaded', () => {
  fetch('/api/version')
    .then(res => res.json())
    .then(data => {
      const versionEl = document.getElementById('gameVersion');
      if (versionEl) versionEl.textContent = data.version;
    })
    .catch(err => console.error('Failed to fetch version:', err));
});

// Register persistent player id with server for ownership checks
try {
  const socket = io();
  socket.on('connect', () => {
    const pid = localStorage.getItem('tankGamePlayerId');
    if (pid) socket.emit('registerPlayer', { playerId: pid });
  });
} catch (e) {
  // ignore if socket.io not available
}

// Basic UI helpers (reuse ids from lobby.html)
function showError(message) {
  const err = document.getElementById('errorMessage');
  if (!err) return;
  err.textContent = message;
  err.classList.remove('hidden');
  setTimeout(() => err.classList.add('hidden'), 5000);
}

function showStatus(message) {
  const st = document.getElementById('statusMessage');
  if (!st) return;
  st.textContent = message;
  st.classList.remove('hidden');
  setTimeout(() => st.classList.add('hidden'), 3000);
}

// Username modal wiring (same UX as menu)
try {
  const socket = io();
  const playerId = localStorage.getItem('tankGamePlayerId') || ('player_' + Date.now() + '_' + Math.random().toString(36).substr(2,9));
  let username = localStorage.getItem('tankGameUsername') || `Player_${playerId.substr(7,6)}`;

  socket.on('connect', () => {
    socket.emit('registerPlayer', { playerId });
  });

  const changeNameBtn = document.getElementById('changeNameBtn');
  const usernameModal = document.getElementById('usernameModal');
  const usernameInput = document.getElementById('usernameInput');
  const saveUsernameBtn = document.getElementById('saveUsernameBtn');
  const cancelUsernameBtn = document.getElementById('cancelUsernameBtn');
  const usernameModalError = document.getElementById('usernameModalError');

  function showUsernameModalError(message) {
    if (!usernameModalError) {
      showError(message);
      return;
    }
    usernameModalError.textContent = message;
    usernameModalError.classList.remove('hidden');
    setTimeout(() => usernameModalError.classList.add('hidden'), 5000);
  }

  if (changeNameBtn) {
    changeNameBtn.addEventListener('click', () => {
      if (usernameInput) usernameInput.value = username;
      if (usernameModal) {
        usernameModal.classList.remove('hidden');
        usernameInput && usernameInput.focus();
      }
    });
  }

  if (cancelUsernameBtn) {
    cancelUsernameBtn.addEventListener('click', () => {
      if (usernameModal) usernameModal.classList.add('hidden');
    });
  }

  if (saveUsernameBtn) {
    saveUsernameBtn.addEventListener('click', () => {
      const newName = usernameInput.value.trim();
      if (!newName || newName.length < 2) {
        showUsernameModalError('Username must be at least 2 characters');
        return;
      }
      // Emit update request and handle ack
      socket.emit('updateUsername', { playerId, username: newName }, (resp) => {
        if (resp && resp.success) {
          username = resp.name || newName;
          localStorage.setItem('tankGameUsername', username);
          if (usernameModal) usernameModal.classList.add('hidden');
          showStatus('Username updated!');
        } else {
          showUsernameModalError(resp && resp.error ? resp.error : 'Failed to update username');
        }
      });
    });
  }
} catch (e) {
  // ignore if DOM not ready or socket errors
}
