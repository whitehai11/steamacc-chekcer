const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const asfHelper = require('./asf_helper');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const ACCOUNTS_PATH = path.join(__dirname, 'accounts.json');

let config = {
  dashboardPassword: 'admin',
  asfPath: './asf',
  steamApiKey: '',
  csrepKeyId: '',
  csrepSecret: '',
  asfIpcUrl: 'http://asf:1242',
  asfIpcPassword: '',
  externalAsf: true,
  discordWebhookUrl: '',
  port: 3000
};

if (fs.existsSync(CONFIG_PATH)) {
  try {
    config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  } catch (err) {
    console.error('Error reading config.json, using defaults:', err);
  }
}

async function asfRequest(method, urlPath, data = null, timeout = 5000) {
  const headers = {};
  if (config.asfIpcPassword) {
    headers['Authentication'] = config.asfIpcPassword;
  }
  const url = `${config.asfIpcUrl}${urlPath}`;
  if (method.toLowerCase() === 'post') {
    return axios.post(url, data, { headers, timeout });
  }
  return axios.get(url, { headers, timeout });
}

const SESSION_SECRET = crypto.randomBytes(32).toString('hex');
function generateToken() {
  return crypto.createHmac('sha256', SESSION_SECRET).update(config.dashboardPassword).digest('hex');
}

let accounts = [];
function loadAccounts() {
  if (fs.existsSync(ACCOUNTS_PATH)) {
    try {
      accounts = JSON.parse(fs.readFileSync(ACCOUNTS_PATH, 'utf8'));
    } catch (err) {
      console.error('Error reading accounts.json, initializing empty:', err);
      accounts = [];
    }
  } else {
    accounts = [];
  }
}
loadAccounts();

function saveAccounts() {
  try {
    fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(accounts, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save accounts:', err);
  }
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const expectedToken = generateToken();

  if (token && token === expectedToken) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized. Invalid or missing token.' });
  }
}

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === config.dashboardPassword) {
    res.json({ token: generateToken() });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.get('/api/config', authMiddleware, (req, res) => {
  const publicConfig = { ...config };
  delete publicConfig.dashboardPassword;
  res.json(publicConfig);
});

app.post('/api/config', authMiddleware, (req, res) => {
  const { dashboardPassword, discordWebhookUrl } = req.body;
  
  if (dashboardPassword && dashboardPassword.trim() !== '') {
    config.dashboardPassword = dashboardPassword;
  }
  if (discordWebhookUrl !== undefined) {
    config.discordWebhookUrl = discordWebhookUrl;
  }

  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    res.json({ message: 'Settings saved successfully', config: { ...config, dashboardPassword: '***' } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write config file: ' + err.message });
  }
});

app.get('/api/accounts', authMiddleware, (req, res) => {
  res.json(accounts);
});

app.post('/api/accounts', authMiddleware, (req, res) => {
  const { botName, username, password, sharedSecret } = req.body;

  if (!botName || !username || !password) {
    return res.status(400).json({ error: 'Bot name, Steam login, and Password are required.' });
  }

  const trimmedBotName = botName.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (accounts.some(acc => acc.botName.toLowerCase() === trimmedBotName.toLowerCase())) {
    return res.status(400).json({ error: 'An account with this bot name already exists.' });
  }

  const newAccount = {
    id: crypto.randomBytes(8).toString('hex'),
    botName: trimmedBotName,
    username: username.trim(),
    password: password.trim(),
    sharedSecret: sharedSecret ? sharedSecret.trim() : '',
    steamId: '',
    status: 'Offline',
    lastChecked: null,
    cooldownRemaining: 0,
    cooldownReason: '',
    vacBanned: false,
    communityBanned: false,
    tradeBanned: false,
    limited: false,
    cs2Hours: 0,
    inventoryValue: 0,
    faceitElo: 0,
    faceitLevel: 0,
    premierElo: 0,
    trustRating: 0
  };

  accounts.push(newAccount);
  saveAccounts();

  const absAsfPath = path.resolve(__dirname, config.asfPath);
  asfHelper.writeBotConfig(absAsfPath, newAccount.botName, newAccount.username, newAccount.password, newAccount.sharedSecret);

  res.json({ message: 'Account added successfully', account: newAccount });
});

app.delete('/api/accounts/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const index = accounts.findIndex(acc => acc.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  const account = accounts[index];
  accounts.splice(index, 1);
  saveAccounts();

  const absAsfPath = path.resolve(__dirname, config.asfPath);
  asfHelper.deleteBotFiles(absAsfPath, account.botName);

  res.json({ message: `Account ${account.botName} deleted successfully` });
});

app.get('/api/asf/status', authMiddleware, async (req, res) => {
  let isRunning = false;
  
  if (config.externalAsf) {
    try {
      const response = await asfRequest('get', '/Api/ASF', null, 1500);
      isRunning = response.status === 200;
    } catch (err) {
      console.error('ASF status check failed:', err.message);
      isRunning = false;
    }
  }

  res.json({
    installed: true,
    running: isRunning,
    external: config.externalAsf
  });
});

app.post('/api/asf/start', authMiddleware, (req, res) => {
  res.status(400).json({ error: 'Process control is disabled. ASF must be run inside Docker.' });
});

app.post('/api/asf/stop', authMiddleware, (req, res) => {
  res.status(400).json({ error: 'Process control is disabled. ASF must be run inside Docker.' });
});

app.post('/api/asf/download', authMiddleware, (req, res) => {
  res.status(400).json({ error: 'Manual installation is disabled. ASF must be run inside Docker.' });
});

app.post('/api/asf/test-webhook', authMiddleware, async (req, res) => {
  if (!config.discordWebhookUrl || config.discordWebhookUrl.trim() === '') {
    return res.status(400).json({ error: 'Discord Webhook URL is not configured.' });
  }

  try {
    await axios.post(config.discordWebhookUrl, {
      content: '🔔 **Steam Account Sentinel**: Webhook connection test successful! Webhook is active.',
      embeds: [{
        title: 'Connection Status Test',
        description: 'This is a test notification from your dashboard. Alert pings and state updates will look like this.',
        color: 0x3b82f6,
        timestamp: new Date().toISOString()
      }]
    }, { timeout: 5000 });
    res.json({ message: 'Test notification sent successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Webhook Delivery Failed: ' + err.message });
  }
});

app.post('/api/accounts/:id/2fa', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { code } = req.body;
  const account = accounts.find(acc => acc.id === id);

  if (!account) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  if (!config.externalAsf) {
    return res.status(400).json({ error: 'ArchiSteamFarm local execution is disabled. Enable external container mode.' });
  }

  if (!code || code.trim() === '') {
    return res.status(400).json({ error: 'Code is required.' });
  }

  try {
    const inputType = code.length === 5 ? 1 : 2; 
    
    const response = await asfRequest('post', `/Api/Bot/${account.botName}/Input`, {
      Type: inputType,
      Value: code.trim()
    }, 10000);

    if (response.data && response.data.Success) {
      account.status = 'Online';
      saveAccounts();
      res.json({ message: 'Steam Guard code submitted successfully.', result: response.data });
    } else {
      res.status(400).json({ error: 'Failed to submit code. ' + (response.data?.Message || '') });
    }
  } catch (err) {
    res.status(500).json({ error: 'IPC Error: ' + err.message });
  }
});

app.get('/api/accounts/:id/2fa-code', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const account = accounts.find(acc => acc.id === id);

  if (!account) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  if (!config.externalAsf) {
    return res.status(400).json({ error: 'External ASF container mode must be active to generate live 2FA codes.' });
  }

  try {
    const response = await asfRequest('get', `/Api/Bot/${account.botName}/TwoFactorCode`, null, 5000);
    
    if (response.data && response.data.Success && response.data.Result) {
      res.json({ code: response.data.Result });
    } else {
      res.status(400).json({ error: 'Failed to retrieve code. Make sure sharedSecret is configured and active in ASF.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'IPC Error: ' + err.message });
  }
});

app.get('/api/accounts/:id/web-login', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const account = accounts.find(acc => acc.id === id);

  if (!account) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  if (!config.externalAsf) {
    return res.status(400).json({ error: 'External ASF container mode must be active to generate web-login links.' });
  }

  try {
    const response = await asfRequest('get', `/Api/Bot/${account.botName}/WebLogin`, null, 8000);
    
    if (response.data && response.data.Success && response.data.Result) {
      res.json({ url: response.data.Result });
    } else {
      res.status(400).json({ error: 'Failed to retrieve web-login link. Make sure the bot is online in ASF.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'IPC Error: ' + err.message });
  }
});

app.post('/api/accounts/:id/check', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const account = accounts.find(acc => acc.id === id);

  if (!account) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  try {
    const updated = await performAccountCheck(account);
    saveAccounts();
    res.json({ message: 'Check completed successfully', account: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to complete check: ' + err.message });
  }
});

app.post('/api/accounts/check-all', authMiddleware, async (req, res) => {
  try {
    let checkedCount = 0;
    for (const account of accounts) {
      await performAccountCheck(account);
      checkedCount++;
    }
    saveAccounts();
    res.json({ message: `Successfully checked status for ${checkedCount} accounts.` });
  } catch (err) {
    res.status(500).json({ error: 'Batch check failed: ' + err.message });
  }
});

async function performAccountCheck(account) {
  account.lastChecked = new Date().toISOString();

  if (config.externalAsf) {
    try {
      const botResponse = await asfRequest('get', `/Api/Bot/${account.botName}`, null, 3000);
      if (botResponse.data && botResponse.data.Result && botResponse.data.Result[account.botName]) {
        const botData = botResponse.data.Result[account.botName];

        if (botData.SteamID && botData.SteamID !== '0' && botData.SteamID !== 0) {
          account.steamId = botData.SteamID.toString();
        }

        if (botData.IsConnectedAndLoggedIn) {
          account.status = 'Online';
        } else if (botData.KeepAlive === false) {
          account.status = 'Offline';
        } else {
         
          account.status = 'Connecting';
        }
      }
    } catch (err) {
     
      console.log(`Failed to query ASF IPC for bot ${account.botName}: ${err.message}`);
    }
  } else {
    account.status = 'Offline';
  }

  if (account.steamId && account.steamId !== '') {
    try {
      if (config.steamApiKey && config.steamApiKey.trim() !== '') {
       
        const banRes = await axios.get(`https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${config.steamApiKey}&steamids=${account.steamId}`, { timeout: 4000 });
        if (banRes.data && banRes.data.players && banRes.data.players[0]) {
          const p = banRes.data.players[0];
          account.vacBanned = p.VACBanned;
          account.communityBanned = p.CommunityBanned;
          account.tradeBanned = p.EconomyBan !== 'none';
          if (p.NumberOfGameBans > 0) {
            account.vacBanned = true;
          }
        }
      } else {
       
        const profileRes = await axios.get(`https://steamcommunity.com/profiles/${account.steamId}/?xml=1`, { 
          timeout: 4000,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const xml = profileRes.data;
        account.vacBanned = /<vacBanned>1<\/vacBanned>/.test(xml);
        account.communityBanned = /<isLimitedAccount>1<\/isLimitedAccount>/.test(xml) === false && /<tradeBanState>None<\/tradeBanState>/.test(xml) === false;
        account.tradeBanned = /<tradeBanState>Banned<\/tradeBanState>/.test(xml);
        account.limited = /<isLimitedAccount>1<\/isLimitedAccount>/.test(xml);
      }
    } catch (err) {
      console.error(`Failed public ban check for SteamID ${account.steamId}: ${err.message}`);
    }
  }

  if (config.externalAsf && account.status === 'Online') {
    try {
      const cs2Res = await asfRequest('get', `/Api/CS2Interface/${account.botName}/PlayerProfile`, null, 5000);
      
      if (cs2Res.data && cs2Res.data.Success && cs2Res.data.Result) {
        const profiles = cs2Res.data.Result.account_profiles;
        if (profiles && profiles.length > 0) {
          const profile = profiles[0];

          if (profile.ranking) {
            account.cooldownRemaining = profile.ranking.penalty_seconds || 0;
            const reasonCode = profile.ranking.penalty_reason || 0;
            
            if (account.cooldownRemaining > 0) {
              account.status = 'Cooldown';

              const reasons = {
                0: 'Clean / None',
                1: 'Abandoned competitive match',
                2: 'Failed to reconnect in time',
                3: 'Kicked too many teammates',
                4: 'Kicked from too many matches',
                5: 'Excessive reports for griefing',
                6: 'Abusive text communications',
                7: 'Abusive voice communications',
                8: 'Matchmaking system failure',
                9: 'Untrusted account / Game ban',
                10: 'Automated cooldown (AI detection)'
              };
              account.cooldownReason = reasons[reasonCode] || `Active Cooldown (Code ${reasonCode})`;
            } else {
              account.cooldownReason = '';
            }
          }
          
          if (profile.vac_banned) {
            account.vacBanned = true;
          }
        }
      }
    } catch (err) {
     
      console.log(`Failed CS2Interface check for bot ${account.botName}: ${err.message}`);
    }
  }

  if (account.steamId && account.steamId !== '' && config.csrepKeyId && config.csrepSecret) {
    try {
      const csrepRes = await axios.get('https://api.csrep.gg/players', {
        params: { ids: [account.steamId] },
        headers: { 
          'X-Key-ID': config.csrepKeyId.trim(),
          'X-Secret': config.csrepSecret.trim()
        },
        timeout: 4000
      });
      if (csrepRes.data && csrepRes.data.status === 'OK' && csrepRes.data.result && csrepRes.data.result.length > 0) {
        const player = csrepRes.data.result[0];
        account.cs2Hours = player.cs2_hours || 0;
        account.inventoryValue = player.inventory_value || 0;
        account.faceitElo = player.faceit_elo || 0;
        account.faceitLevel = player.faceit_level || 0;
        account.premierElo = player.premier_elo || 0;
        account.trustRating = player.trust_rating || 0;
      }
    } catch (err) {
      console.error(`Failed CSRep check for bot ${account.botName}: ${err.message}`);
    }
  }

  if (account.vacBanned || account.communityBanned) {
    account.status = 'Banned';
  }

  const autoTags = [];
  if (account.vacBanned || account.communityBanned || account.tradeBanned) {
    autoTags.push('Flagged');
  }
  if (account.limited) {
    autoTags.push('Limited');
  } else {
    if (account.premierElo && account.premierElo > 0) {
      autoTags.push('Prime');
    }
  }
  if ((account.premierElo && account.premierElo >= 15000) || (account.faceitLevel && account.faceitLevel >= 8)) {
    autoTags.push('High Elo');
  }
  account.tags = autoTags;

  return account;
}

setInterval(async () => {
  if (accounts.length > 0) {
    console.log('Background job: Updating account statuses...');
    for (const account of accounts) {
      await performAccountCheck(account);
    }
    saveAccounts();
  }
}, 5 * 60 * 1000);

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);

  ws.send(JSON.stringify({
    type: 'system',
    message: `Connected to Sentinel Log Stream. Listening to updates.\n`
  }));

  ws.on('close', () => {
    clients.delete(ws);
  });
});

asfHelper.setLogCallback((logLine) => {
 
  const message = JSON.stringify({ type: 'log', message: logLine });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
});

async function checkAllAccountsAndNotify() {
  console.log(`[SENTINEL-CRON] Running hourly background check for ${accounts.length} accounts...`);
  
  let changeCount = 0;
  for (const account of accounts) {
   
    const prevState = {
      status: account.status || 'Offline',
      vacBanned: !!account.vacBanned,
      communityBanned: !!account.communityBanned,
      tradeBanned: !!account.tradeBanned,
      cooldownRemaining: account.cooldownRemaining || 0
    };

    try {
      await performAccountCheck(account);
    } catch (err) {
      console.error(`[SENTINEL-CRON] Failed checking account ${account.botName}:`, err.message);
      continue;
    }

    const currentState = {
      status: account.status || 'Offline',
      vacBanned: !!account.vacBanned,
      communityBanned: !!account.communityBanned,
      tradeBanned: !!account.tradeBanned,
      cooldownRemaining: account.cooldownRemaining || 0
    };

    const statusChanged = prevState.status !== currentState.status;
    const vacChanged = prevState.vacBanned !== currentState.vacBanned;
    const communityChanged = prevState.communityBanned !== currentState.communityBanned;
    const tradeChanged = prevState.tradeBanned !== currentState.tradeBanned;

    const cooldownAdded = prevState.cooldownRemaining === 0 && currentState.cooldownRemaining > 0;
    const cooldownRemoved = prevState.cooldownRemaining > 0 && currentState.cooldownRemaining === 0;

    if (statusChanged || vacChanged || communityChanged || tradeChanged || cooldownAdded || cooldownRemoved) {
      changeCount++;
      await sendDiscordNotification(account, prevState, currentState);
    }
  }

  if (changeCount > 0) {
    saveAccounts();
  }
  console.log(`[SENTINEL-CRON] Background check finished. Triggered notifications for ${changeCount} accounts.`);
}

async function sendDiscordNotification(account, prev, current) {
  if (!config.discordWebhookUrl || config.discordWebhookUrl.trim() === '') {
    return;
  }

  const fields = [];
  let isAlert = false;

  if (prev.status !== current.status) {
    fields.push({
      name: 'Status Shift',
      value: `\`${prev.status}\` ➔ \`${current.status}\``,
      inline: true
    });
  }

  if (prev.vacBanned !== current.vacBanned) {
    isAlert = isAlert || current.vacBanned;
    fields.push({
      name: 'VAC/Game Ban Status',
      value: current.vacBanned ? '🔴 **Banned**' : '🟢 **Ban Lifted**',
      inline: true
    });
  }

  if (prev.communityBanned !== current.communityBanned) {
    isAlert = isAlert || current.communityBanned;
    fields.push({
      name: 'Community Ban Status',
      value: current.communityBanned ? '🔴 **Banned**' : '🟢 **Ban Lifted**',
      inline: true
    });
  }

  if (prev.tradeBanned !== current.tradeBanned) {
    isAlert = isAlert || current.tradeBanned;
    fields.push({
      name: 'Trade Ban Status',
      value: current.tradeBanned ? '🔴 **Banned**' : '🟢 **Ban Lifted**',
      inline: true
    });
  }

  const prevMinutes = Math.ceil(prev.cooldownRemaining / 60);
  const currentMinutes = Math.ceil(current.cooldownRemaining / 60);
  if (prev.cooldownRemaining === 0 && current.cooldownRemaining > 0) {
    isAlert = true;
    fields.push({
      name: 'New CS2 Cooldown',
      value: `🚨 **Active Penalty**: ${currentMinutes} mins\nReason: *${account.cooldownReason || 'N/A'}*`,
      inline: false
    });
  } else if (prev.cooldownRemaining > 0 && current.cooldownRemaining === 0) {
    fields.push({
      name: 'CS2 Cooldown Expired',
      value: '🟢 **Matchmaking Standing Restored**',
      inline: false
    });
  }

  const color = (current.vacBanned || current.communityBanned || current.tradeBanned || current.cooldownRemaining > 0) 
    ? 0xef4444
    : 0x3b82f6;

  const embed = {
    title: `Sentinel Status Update - Bot: ${account.botName}`,
    color: color,
    fields: fields,
    timestamp: new Date().toISOString(),
    footer: {
      text: `Account Login: ${account.username}`
    }
  };

  const payload = {
    embeds: [embed]
  };

  if (isAlert) {
    payload.content = '@everyone';
  }

  try {
    await axios.post(config.discordWebhookUrl, payload, { timeout: 5000 });
  } catch (err) {
    console.error(`Failed to dispatch Discord Webhook for ${account.botName}:`, err.message);
  }
}

const PORT = config.port || 3000;
server.listen(PORT, async () => {
  console.log(`Steam Account Sentinel dashboard running on http://127.0.0.1:${PORT}`);

  try {
    const absAsfPath = path.resolve(__dirname, config.asfPath);
    asfHelper.writeGlobalConfigs(absAsfPath);
  } catch (err) {
    console.error('Failed to write default global configs:', err.message);
  }

  try {
    const pluginsDir = path.resolve(__dirname, 'asf/plugins');
    await asfHelper.ensurePluginInstalled(pluginsDir);
  } catch (err) {
    console.error('Failed to auto-install CS2Interface plugin:', err.message);
  }

  setInterval(checkAllAccountsAndNotify, 3600000);
});
