// Client State
let token = localStorage.getItem('sentinel_token');
let accountsList = [];
let asfRunning = false;
let asfInstalled = false;
let wsConn = null;
let active2faAccountId = null;
let currentFilter = 'all';
let searchQuery = '';

const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const passwordInput = document.getElementById('password-input');
const toggleLoginPwd = document.getElementById('toggle-login-pwd');

const asfStatusDot = document.getElementById('asf-status-dot');
const asfStatusText = document.getElementById('asf-status-text');
const localProcessControls = document.getElementById('local-process-controls');
const btnStartAsf = document.getElementById('btn-start-asf');
const btnStopAsf = document.getElementById('btn-stop-asf');
const btnDownloadAsf = document.getElementById('btn-download-asf');
const btnAddAccount = document.getElementById('btn-add-account');
const btnCheckAll = document.getElementById('btn-check-all');
const btnSettings = document.getElementById('btn-settings');
const btnLogout = document.getElementById('btn-logout');

const statTotal = document.getElementById('stat-total');
const statClean = document.getElementById('stat-clean');
const statCooldown = document.getElementById('stat-cooldown');
const statPending = document.getElementById('stat-pending');

const accountsTableBody = document.getElementById('accounts-table-body');
const tableResponsive = document.querySelector('.table-responsive');
const noAccountsMessage = document.getElementById('no-accounts-message');
const btnEmptyAdd = document.getElementById('btn-empty-add');
const accountCount = document.getElementById('account-count');

const terminalPanel = document.getElementById('terminal-panel');
const terminalOutput = document.getElementById('terminal-output');
const btnClearLogs = document.getElementById('btn-clear-logs');

const modalAddAccount = document.getElementById('modal-add-account');
const modalSteamGuard = document.getElementById('modal-steamguard');
const modalSettings = document.getElementById('modal-settings');

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  if (token) {
    showDashboard();
  } else {
    showLogin();
  }
});

function setupEventListeners() {
 
  loginForm.addEventListener('submit', handleLogin);
  
  toggleLoginPwd.addEventListener('click', () => {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    toggleLoginPwd.textContent = type === 'password' ? 'Show' : 'Hide';
  });

  btnStartAsf.addEventListener('click', () => apiCall('/api/asf/start', 'POST'));
  btnStopAsf.addEventListener('click', () => apiCall('/api/asf/stop', 'POST'));
  btnDownloadAsf.addEventListener('click', () => {
    if (confirm('Do you want to download and install ArchiSteamFarm and the CS2Interface plugin now? This will take a moment.')) {
      apiCall('/api/asf/download', 'POST');
    }
  });

  btnAddAccount.addEventListener('click', () => openModal(modalAddAccount));
  btnEmptyAdd.addEventListener('click', () => openModal(modalAddAccount));
  btnCheckAll.addEventListener('click', checkAllStatuses);
  
  document.getElementById('add-account-form').addEventListener('submit', handleAddAccount);
  document.getElementById('steamguard-form').addEventListener('submit', handleSteamGuardSubmit);

  const btnToggleSdaGuide = document.getElementById('btn-toggle-sda-guide');
  const sdaGuideContent = document.getElementById('sda-guide-content');
  btnToggleSdaGuide.addEventListener('click', () => {
    const isHidden = sdaGuideContent.style.display === 'none';
    sdaGuideContent.style.display = isHidden ? 'block' : 'none';
    btnToggleSdaGuide.textContent = isHidden ? 'Hide guide' : 'How to get my Shared Secret?';
  });

  const btnNavDashboard = document.getElementById('btn-nav-dashboard');
  const btnNav2fa = document.getElementById('btn-nav-2fa');
  const dashboardView = document.getElementById('dashboard-view');
  const authenticatorView = document.getElementById('authenticator-view');

  btnNavDashboard.addEventListener('click', () => {
    btnNavDashboard.classList.add('active-nav');
    btnNav2fa.classList.remove('active-nav');
    dashboardView.style.display = 'flex';
    authenticatorView.style.display = 'none';
  });

  btnNav2fa.addEventListener('click', () => {
    btnNavDashboard.classList.remove('active-nav');
    btnNav2fa.classList.add('active-nav');
    dashboardView.style.display = 'none';
    authenticatorView.style.display = 'flex';
    render2faGrid();
  });

  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderAccounts();
  });

  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      renderAccounts();
    });
  });

  const btnTestWebhook = document.getElementById('btn-test-webhook');
  btnTestWebhook.addEventListener('click', async () => {
    const res = await apiCall('/api/asf/test-webhook', 'POST');
    if (res) {
      alert(res.message);
    }
  });

  btnSettings.addEventListener('click', openSettings);
  document.getElementById('settings-form').addEventListener('submit', handleSaveSettings);

  btnLogout.addEventListener('click', handleLogout);

  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      closeModal(e.target.closest('.modal-overlay'));
    });
  });

  btnClearLogs.addEventListener('click', () => {
    terminalOutput.innerHTML = '';
  });
}

function showLogin() {
  loginContainer.style.display = 'block';
  dashboardContainer.style.display = 'none';
  if (wsConn) {
    wsConn.close();
  }
}

function showDashboard() {
  loginContainer.style.display = 'none';
  dashboardContainer.style.display = 'block';
  initDashboard();
}

async function handleLogin(e) {
  e.preventDefault();
  const password = passwordInput.value;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (res.ok) {
      token = data.token;
      localStorage.setItem('sentinel_token', token);
      loginError.textContent = '';
      passwordInput.value = '';
      showDashboard();
    } else {
      loginError.textContent = data.error || 'Authentication failed';
    }
  } catch (err) {
    loginError.textContent = 'Server connection error';
  }
}

function handleLogout() {
  localStorage.removeItem('sentinel_token');
  token = null;
  showLogin();
}

async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = {
    'Authorization': `Bearer ${token}`
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const res = await fetch(endpoint, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    if (res.status === 401) {
      handleLogout();
      return null;
    }

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'API Error');
      return null;
    }
    return data;
  } catch (err) {
    console.error(`API Call failed (${endpoint}):`, err);
    return null;
  }
}

async function initDashboard() {
  await loadAccounts();
  await updateAsfStatus();
  connectWebSocket();

  const pollInterval = setInterval(async () => {
    if (!token) {
      clearInterval(pollInterval);
      return;
    }
    await updateAsfStatus();
    await loadAccounts();
  }, 5000);
}

async function loadAccounts() {
  const accounts = await apiCall('/api/accounts');
  if (accounts) {
    accountsList = accounts;
    renderAccounts();
    updateStats();
  }
}

async function updateAsfStatus() {
  const status = await apiCall('/api/asf/status');
  if (status) {
    asfRunning = status.running;
    asfInstalled = status.installed;
    const isExternal = status.external;

    if (isExternal) {
      localProcessControls.style.display = 'none';
      if (asfRunning) {
        asfStatusDot.className = 'status-dot dot-online';
        asfStatusText.textContent = 'Connected';
      } else {
        asfStatusDot.className = 'status-dot dot-offline';
        asfStatusText.textContent = 'Disconnected';
      }
    } else {
      localProcessControls.style.display = 'block';
      if (!asfInstalled) {
        asfStatusDot.className = 'status-dot dot-offline';
        asfStatusText.textContent = 'Not Installed';
        btnStartAsf.style.display = 'none';
        btnStopAsf.style.display = 'none';
        btnDownloadAsf.style.display = 'inline-flex';
      } else if (asfRunning) {
        asfStatusDot.className = 'status-dot dot-online';
        asfStatusText.textContent = 'Running';
        btnStartAsf.style.display = 'none';
        btnStopAsf.style.display = 'inline-flex';
        btnDownloadAsf.style.display = 'none';
      } else {
        asfStatusDot.className = 'status-dot dot-offline';
        asfStatusText.textContent = 'Stopped';
        btnStartAsf.style.display = 'inline-flex';
        btnStopAsf.style.display = 'none';
        btnDownloadAsf.style.display = 'none';
      }
    }
  }
}

function renderAccounts() {
  accountsTableBody.innerHTML = '';
  accountCount.textContent = `${accountsList.length} accounts configured`;

  if (accountsList.length === 0) {
    noAccountsMessage.style.display = 'flex';
    tableResponsive.style.display = 'none';
    return;
  }

  let filtered = accountsList;
  if (searchQuery) {
    filtered = filtered.filter(acc => 
      acc.botName.toLowerCase().includes(searchQuery) ||
      acc.username.toLowerCase().includes(searchQuery)
    );
  }
  if (currentFilter === 'online') {
    filtered = filtered.filter(acc => acc.status === 'Online');
  } else if (currentFilter === 'cooldown') {
    filtered = filtered.filter(acc => acc.status === 'Cooldown' || (acc.cooldownRemaining && acc.cooldownRemaining > 0));
  } else if (currentFilter === 'banned') {
    filtered = filtered.filter(acc => acc.status === 'Banned' || acc.vacBanned || acc.communityBanned || acc.tradeBanned);
  }

  if (filtered.length === 0) {
    noAccountsMessage.style.display = 'none';
    tableResponsive.style.display = 'block';
    accountsTableBody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align: center; padding: 24px;">No accounts match your filter criteria.</td></tr>`;
    return;
  }

  noAccountsMessage.style.display = 'none';
  tableResponsive.style.display = 'block';

  filtered.forEach(account => {
   
    const trSummary = document.createElement('tr');
    trSummary.className = 'summary-row';
    trSummary.dataset.id = account.id;

    let statusClass = 'badge-offline';
    if (account.status === 'Online') statusClass = 'badge-online';
    else if (account.status === 'Connecting') statusClass = 'badge-connecting';
    else if (account.status === 'Cooldown') statusClass = 'badge-cooldown';
    else if (account.status === 'Banned') statusClass = 'badge-banned';

    const steamProfileLink = account.steamId
      ? `<a href="https://steamcommunity.com/profiles/${account.steamId}" target="_blank" onclick="event.stopPropagation();">${account.steamId}</a>`
      : '<span class="text-muted">Not discovered</span>';

    let publicBanDetails = 'Clean';
    if (account.vacBanned || account.communityBanned || account.tradeBanned) {
      const bans = [];
      if (account.vacBanned) bans.push('VAC/Game Ban');
      if (account.communityBanned) bans.push('Community Ban');
      if (account.tradeBanned) bans.push('Trade Ban');
      publicBanDetails = bans.join(', ');
    }
    const publicBanClass = publicBanDetails === 'Clean' ? 'log-line-success' : 'log-line-error';

    const tagsMarkup = (account.tags || []).map(tag => {
      let style = '';
      if (tag === 'Prime') style = 'background: rgba(59, 130, 246, 0.08); color: var(--accent); border-color: rgba(59, 130, 246, 0.15);';
      if (tag === 'High Elo') style = 'background: rgba(255, 255, 255, 0.08); color: #fff; border-color: rgba(255, 255, 255, 0.15);';
      if (tag === 'Flagged' || tag === 'Limited') style = 'background: rgba(239, 68, 68, 0.06); color: var(--danger); border-color: rgba(239, 68, 68, 0.15);';
      return `<span class="badge-tag" style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 6px; border-radius: 3px; border: 1px solid rgba(255, 255, 255, 0.04); ${style}">${tag}</span>`;
    }).join('');

    trSummary.innerHTML = `
      <td class="col-bot">
        <div style="font-weight:700">${account.botName}</div>
        <div style="font-size:0.75rem; color:var(--text-muted)">Login: ${account.username}</div>
        <div style="margin-top: 6px; display: flex; gap: 4px; flex-wrap: wrap;">
          ${tagsMarkup}
        </div>
      </td>
      <td class="col-steamid">${steamProfileLink}</td>
      <td>
        <span class="badge ${statusClass}">${account.status}</span>
      </td>
      <td style="text-align: right;">
        <span class="${publicBanClass}" style="font-weight:600">${publicBanDetails}</span>
        ${account.limited ? '<div style="font-size:0.72rem; color:var(--warning)">Limited Account</div>' : ''}
      </td>
    `;

    const trDetail = document.createElement('tr');
    trDetail.className = 'detail-row';
    trDetail.id = `detail-${account.id}`;
    trDetail.style.display = 'none';

    let cs2CooldownMarkup = '<span class="text-muted">Clean / Active</span>';
    if (account.cooldownRemaining && account.cooldownRemaining > 0) {
      const minutes = Math.ceil(account.cooldownRemaining / 60);
      const hours = (account.cooldownRemaining / 3600).toFixed(1);
      const displayTime = minutes > 120 ? `${hours} hours` : `${minutes} mins`;
      cs2CooldownMarkup = `
        <div class="cooldown-detail">
          <div style="font-weight:700; color:var(--danger); font-size:1.1rem">${displayTime}</div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${account.cooldownReason || 'Matchmaking Penalty'}</div>
        </div>
      `;
    }

    let csrepStatsMarkup = '<span class="text-muted">No stats recorded</span>';
    if (account.cs2Hours !== undefined || account.premierElo || account.faceitLevel || account.trustRating !== undefined) {
      let trustColor = 'var(--accent)';
      if (account.trustRating !== undefined && account.trustRating !== null) {
        if (account.trustRating >= 70) trustColor = 'var(--accent)';
        else if (account.trustRating >= 35) trustColor = 'var(--text-muted)';
        else trustColor = 'var(--danger)';
      }

      csrepStatsMarkup = `
        <div class="stats-grid-mini">
          <div class="stat-mini">
            <span class="stat-mini-label">Hours</span>
            <span class="stat-mini-val">${account.cs2Hours !== undefined && account.cs2Hours !== null ? Math.round(account.cs2Hours) : 'N/A'}</span>
          </div>
          <div class="stat-mini">
            <span class="stat-mini-label">Premier Elo</span>
            <span class="stat-mini-val">${account.premierElo || 'N/A'}</span>
          </div>
          <div class="stat-mini">
            <span class="stat-mini-label">Faceit</span>
            <span class="stat-mini-val">${account.faceitLevel ? `${account.faceitLevel} (${account.faceitElo || '0'})` : 'N/A'}</span>
          </div>
        </div>
        <div class="trust-slider-container" style="margin-top: 12px; background: rgba(0,0,0,0.15); padding: 8px 12px; border-radius: 4px; border: 1px solid var(--border);">
          <div style="display: flex; justify-content: space-between; font-size: 0.72rem; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">
            <span>Trust Rating</span>
            <span style="color: ${trustColor}">${account.trustRating !== undefined && account.trustRating !== null ? account.trustRating + '%' : 'N/A'}</span>
          </div>
          <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.3); border-radius: 3px; overflow: hidden; border: 1px solid var(--border);">
            <div style="width: ${account.trustRating || 0}%; height: 100%; background: ${trustColor}; border-radius: 3px;"></div>
          </div>
        </div>
      `;
    }

    const hasSecret = account.sharedSecret && account.sharedSecret.trim() !== '';
    const secretField = hasSecret
      ? `
        <div class="col-creds-row">
          <span class="col-creds-label">Auto-2FA:</span>
          <span class="credential-field" data-secret="${account.sharedSecret}">••••••••</span>
        </div>
        <div class="col-creds-row" style="margin-top: 6px;">
          <span class="col-creds-label" style="display:flex; align-items:center;">2FA Code:</span>
          <div style="display: flex; gap: 6px; align-items: center;">
            <span class="badge badge-offline code-val" style="font-family:var(--font-mono); font-size:0.85rem; font-weight:700; border:1px solid var(--border); background:rgba(0,0,0,0.3); padding:2px 6px;">-----</span>
            <button type="button" class="btn-primary btn-sm btn-generate-2fa" style="padding: 2px 6px; font-size: 0.7rem; line-height:1.2;" data-id="${account.id}">Get Code</button>
            <button type="button" class="btn-secondary btn-sm btn-copy-2fa" style="padding: 2px 6px; font-size: 0.7rem; line-height:1.2; display: none;">Copy</button>
          </div>
        </div>`
      : '';

    trDetail.innerHTML = `
      <td colspan="4">
        <div class="detail-container">
          <div class="detail-grid">
            <div class="detail-column">
              <div class="detail-title-sm">Credentials</div>
              <div class="col-creds">
                <div class="col-creds-row">
                  <span class="col-creds-label">Password:</span>
                  <span class="credential-field" data-password="${account.password}">••••••••</span>
                </div>
                ${secretField}
              </div>
            </div>
            <div class="detail-column">
              <div class="detail-title-sm">Matchmaking Standing</div>
              ${cs2CooldownMarkup}
            </div>
            <div class="detail-column" style="grid-column: span 2">
              <div class="detail-title-sm">CSRep.GG Statistics</div>
              ${csrepStatsMarkup}
            </div>
          </div>
          <div class="detail-actions-row">
            <button class="btn-secondary btn-sm btn-show-creds">Show Credentials</button>
            <button class="btn-secondary btn-sm btn-web-login" data-id="${account.id}">Web Login</button>
            <button class="btn-success btn-sm btn-check-status" data-id="${account.id}">Refresh Status</button>
            ${account.status === 'Connecting' ? `<button class="btn-primary btn-sm btn-prompt-sg" data-id="${account.id}" data-botname="${account.botName}">Enter Steam Guard</button>` : ''}
            <button class="btn-danger btn-sm btn-delete" data-id="${account.id}" data-botname="${account.botName}">Delete Bot</button>
          </div>
        </div>
      </td>
    `;

    // Toggle row action
    trSummary.addEventListener('click', () => {
      const isVisible = trDetail.style.display === 'table-row';
      document.querySelectorAll('.detail-row').forEach(row => {
        row.style.display = 'none';
      });
      document.querySelectorAll('.summary-row').forEach(row => {
        row.classList.remove('expanded');
      });

      if (!isVisible) {
        trDetail.style.display = 'table-row';
        trSummary.classList.add('expanded');
      }
    });

    // Bind event listeners for actions in the drawer
    trDetail.querySelector('.btn-show-creds').addEventListener('click', (e) => {
      const credFields = trDetail.querySelectorAll('.credential-field');
      if (credFields.length === 0) return;
      const isHidden = credFields[0].textContent === '••••••••';
      credFields.forEach(field => {
        if (field.dataset.password) {
          field.textContent = isHidden ? field.dataset.password : '••••••••';
        } else if (field.dataset.secret) {
          field.textContent = isHidden ? field.dataset.secret : '••••••••';
        }
      });
      e.target.textContent = isHidden ? 'Hide Credentials' : 'Show Credentials';
    });

    const btnGen2fa = trDetail.querySelector('.btn-generate-2fa');
    if (btnGen2fa) {
      btnGen2fa.addEventListener('click', async (e) => {
        const codeBadge = trDetail.querySelector('.code-val');
        const copyBtn = trDetail.querySelector('.btn-copy-2fa');
        codeBadge.textContent = '...';
        copyBtn.style.display = 'none';
        const res = await apiCall(`/api/accounts/${account.id}/2fa-code`);
        if (res && res.code) {
          codeBadge.textContent = res.code;
          codeBadge.className = 'badge badge-online code-val';
          copyBtn.style.display = 'inline-flex';
          
          // Reset after 30 seconds
          setTimeout(() => {
            codeBadge.textContent = '-----';
            codeBadge.className = 'badge badge-offline code-val';
            copyBtn.style.display = 'none';
          }, 30000);
        } else {
          codeBadge.textContent = 'Err';
          codeBadge.className = 'badge badge-offline code-val';
          copyBtn.style.display = 'none';
        }
      });
    }

    const btnCopy2fa = trDetail.querySelector('.btn-copy-2fa');
    if (btnCopy2fa) {
      btnCopy2fa.addEventListener('click', () => {
        const codeVal = trDetail.querySelector('.code-val').textContent;
        if (codeVal && codeVal !== '-----' && codeVal !== '...' && codeVal !== 'Err') {
          navigator.clipboard.writeText(codeVal);
          btnCopy2fa.textContent = 'Copied!';
          setTimeout(() => {
            btnCopy2fa.textContent = 'Copy';
          }, 2000);
        }
      });
    }

    trDetail.querySelector('.btn-web-login').addEventListener('click', async (e) => {
      const btn = e.target;
      const origText = btn.textContent;
      btn.textContent = 'Generating...';
      btn.disabled = true;
      const res = await apiCall(`/api/accounts/${account.id}/web-login`);
      btn.textContent = origText;
      btn.disabled = false;
      if (res && res.url) {
        window.open(res.url, '_blank');
      } else {
        alert('Failed to generate web login link. Make sure the bot is online in ASF.');
      }
    });

    trDetail.querySelector('.btn-check-status').addEventListener('click', (e) => {
      const accId = e.target.dataset.id;
      checkSingleStatus(accId);
    });

    const btnSg = trDetail.querySelector('.btn-prompt-sg');
    if (btnSg) {
      btnSg.addEventListener('click', (e) => {
        active2faAccountId = e.target.dataset.id;
        document.getElementById('sg-botname').textContent = e.target.dataset.botname;
        document.getElementById('sg-acc-id').value = active2faAccountId;
        document.getElementById('sg-code').value = '';
        openModal(modalSteamGuard);
      });
    }

    trDetail.querySelector('.btn-delete').addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-delete');
      const botName = btn.dataset.botname;
      const accId = btn.dataset.id;
      if (confirm(`Are you sure you want to delete account ${botName}?`)) {
        deleteAccount(accId);
      }
    });

    accountsTableBody.appendChild(trSummary);
    accountsTableBody.appendChild(trDetail);
  });
}

function render2faGrid() {
  const container = document.getElementById('auth-grid-container');
  const countSpan = document.getElementById('auth-count');
  container.innerHTML = '';

  const botsWith2fa = accountsList.filter(acc => acc.sharedSecret && acc.sharedSecret.trim() !== '');
  countSpan.textContent = `${botsWith2fa.length} bots with 2FA configured`;

  if (botsWith2fa.length === 0) {
    container.innerHTML = `<div class="text-muted" style="grid-column: span 3; text-align: center; padding: 40px;">No bots have Shared Secrets configured. Add a shared secret when adding or editing accounts.</div>`;
    return;
  }

  botsWith2fa.forEach(account => {
    const card = document.createElement('div');
    card.className = 'glass-panel';
    card.style.padding = '20px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '12px';

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="font-weight: 700; font-size: 1.05rem;">${account.botName}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted);">User: ${account.username}</div>
        </div>
        <span class="badge ${account.status === 'Online' ? 'badge-online' : 'badge-offline'}">${account.status}</span>
      </div>
      
      <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 0; background: rgba(0,0,0,0.15); border-radius: 6px; border: 1px solid var(--border);">
        <span style="font-size: 0.68rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; letter-spacing: 0.5px;">Active 2FA Code</span>
        <span class="auth-code-val" style="font-family: var(--font-mono); font-size: 2.2rem; font-weight: 800; color: var(--accent); letter-spacing: 2px; cursor: pointer;" title="Click to copy">-----</span>
        <span class="auth-timer-text" style="font-size: 0.68rem; color: var(--text-muted); min-height: 14px;"></span>
      </div>
      
      <div style="display: flex; gap: 8px;">
        <button class="btn-primary btn-sm btn-get-code" style="flex: 1;">Generate Code</button>
        <button class="btn-secondary btn-sm btn-copy-code" style="display: none;">Copy</button>
      </div>
    `;

    const codeSpan = card.querySelector('.auth-code-val');
    const timerSpan = card.querySelector('.auth-timer-text');
    const btnGet = card.querySelector('.btn-get-code');
    const btnCopy = card.querySelector('.btn-copy-code');
    let timerInterval = null;

    btnGet.addEventListener('click', async () => {
      codeSpan.textContent = '...';
      timerSpan.textContent = '';
      btnCopy.style.display = 'none';
      if (timerInterval) clearInterval(timerInterval);

      const res = await apiCall(`/api/accounts/${account.id}/2fa-code`);
      if (res && res.code) {
        codeSpan.textContent = res.code;
        codeSpan.style.color = 'var(--accent)';
        btnCopy.style.display = 'inline-flex';
        
        let secsLeft = 30;
        timerSpan.textContent = `Expires in ${secsLeft}s`;
        
        timerInterval = setInterval(() => {
          secsLeft--;
          if (secsLeft <= 0) {
            clearInterval(timerInterval);
            codeSpan.textContent = '-----';
            codeSpan.style.color = 'var(--text-muted)';
            timerSpan.textContent = '';
            btnCopy.style.display = 'none';
          } else {
            timerSpan.textContent = `Expires in ${secsLeft}s`;
          }
        }, 1000);
      } else {
        codeSpan.textContent = 'Err';
        codeSpan.style.color = 'var(--danger)';
      }
    });

    const triggerCopy = () => {
      const activeCode = codeSpan.textContent;
      if (activeCode && activeCode !== '-----' && activeCode !== '...' && activeCode !== 'Err') {
        navigator.clipboard.writeText(activeCode);
        btnCopy.textContent = 'Copied!';
        setTimeout(() => {
          btnCopy.textContent = 'Copy';
        }, 2000);
      }
    };

    codeSpan.addEventListener('click', triggerCopy);
    btnCopy.addEventListener('click', triggerCopy);

    container.appendChild(card);
  });
}

function updateStats() {
  statTotal.textContent = accountsList.length;
  
  const cleanCount = accountsList.filter(acc => acc.status === 'Online' && !acc.vacBanned && !acc.communityBanned).length;
  statClean.textContent = cleanCount;

  const flagCount = accountsList.filter(acc => acc.status === 'Banned' || acc.status === 'Cooldown').length;
  statCooldown.textContent = flagCount;

  const pendingCount = accountsList.filter(acc => acc.status === 'Connecting').length;
  statPending.textContent = pendingCount;
}

// Websocket log streaming
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  wsConn = new WebSocket(wsUrl);

  wsConn.onmessage = (event) => {
    const data = JSON.parse(event.data);
    appendLog(data.message, data.type);
  };

  wsConn.onclose = () => {
    appendLog('[SENTINEL-SYSTEM] Log websocket disconnected. Attempting to reconnect...\n', 'system');
    setTimeout(connectWebSocket, 3000);
  };

  wsConn.onerror = (err) => {
    console.error('WebSocket encountered an error:', err);
  };
}

function appendLog(text, type) {
  if (!text) return;
  const line = document.createElement('div');
  
  if (type === 'system') {
    line.className = 'log-line-system';
  } else {
    // Parse formatting/severity
    if (text.includes('[ERROR]') || text.includes('Exception') || text.includes('failed')) {
      line.className = 'log-line-error';
    } else if (text.includes('[WARN]') || text.includes('warning') || text.includes('Waiting for 2FA')) {
      line.className = 'log-line-warning';
    } else if (text.includes('Success') || text.includes('Logged in!') || text.includes('online')) {
      line.className = 'log-line-success';
    } else {
      line.className = 'log-line-info';
    }
  }

  line.textContent = text;
  terminalOutput.appendChild(line);

  // Auto-scroll to bottom
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

// API Trigger functions
async function checkSingleStatus(id) {
  const res = await apiCall(`/api/accounts/${id}/check`, 'POST');
  if (res) {
    loadAccounts();
  }
}

async function checkAllStatuses() {
  btnCheckAll.disabled = true;
  btnCheckAll.textContent = 'Checking...';
  const res = await apiCall('/api/accounts/check-all', 'POST');
  btnCheckAll.disabled = false;
  btnCheckAll.textContent = '↻ Check All Statuses';
  if (res) {
    loadAccounts();
  }
}

async function deleteAccount(id) {
  const res = await apiCall(`/api/accounts/${id}`, 'DELETE');
  if (res) {
    loadAccounts();
  }
}

async function handleAddAccount(e) {
  e.preventDefault();
  const botName = document.getElementById('acc-botname').value;
  const username = document.getElementById('acc-username').value;
  const password = document.getElementById('acc-password').value;
  const sharedSecret = document.getElementById('acc-2fa').value;

  const res = await apiCall('/api/accounts', 'POST', { botName, username, password, sharedSecret });
  if (res) {
    closeModal(modalAddAccount);
    document.getElementById('add-account-form').reset();
    loadAccounts();
  }
}

async function handleSteamGuardSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('sg-acc-id').value;
  const code = document.getElementById('sg-code').value;

  const res = await apiCall(`/api/accounts/${id}/2fa`, 'POST', { code });
  if (res) {
    closeModal(modalSteamGuard);
    document.getElementById('steamguard-form').reset();
    loadAccounts();
  }
}

// Settings
async function openSettings() {
  const configData = await apiCall('/api/config');
  if (configData) {
    document.getElementById('set-pwd').value = '';
    document.getElementById('set-discordurl').value = configData.discordWebhookUrl || '';
    openModal(modalSettings);
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const dashboardPassword = document.getElementById('set-pwd').value;
  const discordWebhookUrl = document.getElementById('set-discordurl').value;

  const body = { discordWebhookUrl };
  if (dashboardPassword && dashboardPassword.trim() !== '') {
    body.dashboardPassword = dashboardPassword;
  }

  const res = await apiCall('/api/config', 'POST', body);
  if (res) {
    closeModal(modalSettings);
    alert('Settings saved successfully.');
  }
}

// Modal Helpers
function openModal(modal) {
  modal.classList.add('active');
}

function closeModal(modal) {
  modal.classList.remove('active');
}
