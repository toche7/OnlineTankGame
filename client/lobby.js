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
