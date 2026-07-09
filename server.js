const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Import modules
const { checkCs2Cooldown } = require('./cs2_checker');
const { getPlayerStats, refreshPlayerStats } = require('./csrep_api');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');

app.use(express.json());

// Load static frontend files from public folder if it exists
if (fs.existsSync(path.join(__dirname, 'public'))) {
    app.use(express.static(path.join(__dirname, 'public')));
}

// In-Memory Database Helpers
function readAccounts() {
    try {
        if (!fs.existsSync(ACCOUNTS_FILE)) {
            fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify([], null, 2));
            return [];
        }
        const data = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
        return JSON.parse(data || '[]');
    } catch (err) {
        console.error('[Server DB] Error reading accounts.json:', err);
        return [];
    }
}

function saveAccounts(accounts) {
    try {
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
    } catch (err) {
        console.error('[Server DB] Error saving accounts.json:', err);
    }
}

// ASF IPC Command Helper
async function sendAsfCommand(command) {
    const ipcUrl = process.env.ASF_IPC_URL || 'http://asf:1242/Api/Command';
    const password = process.env.ASF_PASSWORD || 'mein_sicheres_ipc_passwort';
    
    console.log(`[ASF IPC] Sending command: "${command}" to ${ipcUrl}`);
    try {
        const response = await fetch(ipcUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authentication': password
            },
            body: JSON.stringify({ Command: command })
        });
        
        if (!response.ok) {
            throw new Error(`ASF IPC responded with status ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`[ASF IPC] Response:`, data);
        return data;
    } catch (err) {
        console.error(`[ASF IPC] Error sending command:`, err);
        return { Success: false, Message: err.message };
    }
}

// REST Endpoints
app.get('/api/accounts', (req, res) => {
    const accounts = readAccounts();
    res.json(accounts);
});

app.post('/api/accounts', (req, res) => {
    const { username, password, steamId64 } = req.body;
    
    if (!username || !password || !steamId64) {
        return res.status(400).json({ error: 'Username, password, and steamId64 are required' });
    }
    
    const accounts = readAccounts();
    
    // Check if account already exists
    const existingIndex = accounts.findIndex(acc => acc.username === username);
    const newAccount = {
        username,
        password,
        steamId64,
        farmingMode: 'hours', // default farming mode
        cooldownMinutes: 0,
        stats: {
            premier_elo: 0,
            cs2_hours: 0,
            inventory_value: 0,
            trust_rating: 'Unknown'
        },
        lastUpdated: new Date().toISOString()
    };
    
    if (existingIndex > -1) {
        // preserve existing stats/cooldown if updating
        newAccount.farmingMode = accounts[existingIndex].farmingMode || 'hours';
        newAccount.cooldownMinutes = accounts[existingIndex].cooldownMinutes || 0;
        newAccount.stats = accounts[existingIndex].stats || newAccount.stats;
        accounts[existingIndex] = newAccount;
    } else {
        accounts.push(newAccount);
    }
    
    saveAccounts(accounts);
    
    // Write config for ASF
    try {
        const asfConfigPath = path.join(__dirname, 'asf-config', `${username}.json`);
        const botConfig = {
            Enabled: true,
            SteamLogin: username,
            SteamPassword: password
        };
        fs.writeFileSync(asfConfigPath, JSON.stringify(botConfig, null, 2));
        console.log(`[Server] Wrote ASF config for bot '${username}'`);
    } catch (err) {
        console.error(`[Server] Failed to write ASF config for '${username}':`, err);
    }
    
    // Broadcast the update
    io.emit('accountsUpdate', accounts);
    
    res.status(201).json({ message: 'Account registered successfully', account: newAccount });
});

app.post('/api/farming/mode', async (req, res) => {
    const { username, mode } = req.body;
    
    if (!username || !mode || !['cards', 'hours'].includes(mode)) {
        return res.status(400).json({ error: 'Username and valid mode (cards or hours) are required' });
    }
    
    const accounts = readAccounts();
    const account = accounts.find(acc => acc.username === username);
    
    if (!account) {
        return res.status(404).json({ error: 'Account not found' });
    }
    
    account.farmingMode = mode;
    saveAccounts(accounts);
    
    // Send command to ASF
    let cmd = '';
    if (mode === 'hours') {
        cmd = `!play ${username} 730`;
    } else {
        cmd = `!resume ${username}`;
    }
    
    io.emit('botStatus', { username, status: `Switching farming mode to: ${mode}` });
    const result = await sendAsfCommand(cmd);
    
    io.emit('accountsUpdate', accounts);
    
    res.json({ message: `Farming mode updated to ${mode}`, asfResult: result });
});

app.post('/api/bot/fetch-stats', async (req, res) => {
    const { steamId64 } = req.body;
    
    if (!steamId64) {
        return res.status(400).json({ error: 'steamId64 is required' });
    }
    
    const accounts = readAccounts();
    const account = accounts.find(acc => acc.steamId64 === steamId64);
    
    if (!account) {
        return res.status(404).json({ error: 'Bot account with this Steam ID not found' });
    }
    
    io.emit('botStatus', { username: account.username, status: 'Fetching player stats...' });
    
    try {
        // Trigger CSREP stats fetch
        const stats = await getPlayerStats(steamId64);
        
        // Save stats to local database
        account.stats = stats;
        account.lastUpdated = new Date().toISOString();
        saveAccounts(accounts);
        
        // Push update to all clients via Socket.IO
        io.emit('statsFetched', { username: account.username, steamId64, stats });
        io.emit('accountsUpdate', accounts);
        
        res.json({ success: true, stats });
    } catch (err) {
        console.error(`[Server] API-Crash für ${steamId64}:`, err);
        io.emit('botStatus', { 
            username: account.username, 
            status: `❌ SYSTEM-FEHLER: ${err.message}` 
        });
        res.status(500).json({ error: err.message });
    }
});

// Manual trigger endpoint for cooldown verification
app.post('/api/bot/check-cooldown', async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }
    const accounts = readAccounts();
    const account = accounts.find(acc => acc.username === username);
    if (!account) {
        return res.status(404).json({ error: 'Account not found' });
    }
    
    runCooldownCheckForAccount(account);
    res.json({ message: `Cooldown check triggered for bot '${username}'` });
});

// Cooldown Checker Function for a Single Bot
async function runCooldownCheckForAccount(bot) {
    try {
        console.log(`[Cooldown Schedule] Starting cooldown check for ${bot.username}...`);
        io.emit('botStatus', { username: bot.username, status: 'Stopping farming to check cooldown' });
        
        // 1. Send !stop to ASF
        await sendAsfCommand(`!stop ${bot.username}`);
        
        // 2. Wait 5 seconds
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 3. Run headless check
        io.emit('botStatus', { username: bot.username, status: 'Running headless CS2 GC cooldown check' });
        const cooldownMinutes = await checkCs2Cooldown(bot.username, bot.password);
        
        // 4. Save status
        const accounts = readAccounts();
        const acc = accounts.find(a => a.username === bot.username);
        if (acc) {
            acc.cooldownMinutes = cooldownMinutes;
            acc.lastUpdated = new Date().toISOString();
            saveAccounts(accounts);
        }
        
        io.emit('botStatus', { username: bot.username, status: `Cooldown checked: ${cooldownMinutes} min remaining` });
        
        // 5. Resume farming
        const mode = bot.farmingMode || 'hours';
        let resumeCmd = '';
        if (mode === 'hours') {
            resumeCmd = `!play ${bot.username} 730`;
        } else {
            resumeCmd = `!resume ${bot.username}`;
        }
        
        io.emit('botStatus', { username: bot.username, status: `Resuming farming in ${mode} mode` });
        await sendAsfCommand(resumeCmd);
        
        // Final update broadcast
        io.emit('accountsUpdate', readAccounts());
    } catch (err) {
        console.error(`[Cooldown Schedule] Cooldown check failed for ${bot.username}:`, err);
        io.emit('botStatus', { username: bot.username, status: `Cooldown check failed: ${err.message}` });
        
        // Fallback: Try to resume farming anyway
        const mode = bot.farmingMode || 'hours';
        const resumeCmd = mode === 'hours' ? `!play ${bot.username} 730` : `!resume ${bot.username}`;
        await sendAsfCommand(resumeCmd);
    }
}

// Global Orchestrator Scheduler: run every 2 hours
async function runGlobalScheduler() {
    console.log('[Scheduler] Executing periodic CS2 Cooldown check for all bots...');
    const accounts = readAccounts();
    
    // Process bots sequentially to prevent rate limits or port conflicts
    for (const bot of accounts) {
        await runCooldownCheckForAccount(bot);
        // Wait 10 seconds between bots
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
    console.log('[Scheduler] Completed periodic checks.');
}

// Set interval to run exactly every 2 hours (7,200,000 milliseconds)
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
setInterval(runGlobalScheduler, TWO_HOURS_MS);

// Socket.io Connection Handler
io.on('connection', (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);
    
    // Immediately send the current bot list on connection
    socket.emit('accountsUpdate', readAccounts());
    
    socket.on('disconnect', () => {
        console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
});

// Verify write permissions in /app directory on startup (Docker-ready security check)
try {
    const testFile = path.join(__dirname, '.permission_test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log('[Server Setup] Read and write permissions verified for /app directory.');
} catch (err) {
    console.error('[Server Error] CRITICAL: No write permissions in the directory. accounts.json cannot be persisted.', err);
}

// Function to synchronize all accounts in database to the mapped /app/asf-config directory
function syncAsfConfigs() {
    try {
        const asfConfigDir = path.join(__dirname, 'asf-config');
        if (!fs.existsSync(asfConfigDir)) {
            console.log(`[Server Setup] ASF config directory ${asfConfigDir} is not mounted. Skipping bot config sync.`);
            return;
        }
        const accounts = readAccounts();
        console.log(`[Server Setup] Syncing ${accounts.length} bots to ASF configuration...`);
        for (const account of accounts) {
            const botFile = path.join(asfConfigDir, `${account.username}.json`);
            const botConfig = {
                Enabled: true,
                SteamLogin: account.username,
                SteamPassword: account.password
            };
            fs.writeFileSync(botFile, JSON.stringify(botConfig, null, 2));
        }
        console.log('[Server Setup] ASF configurations successfully synchronized.');
    } catch (err) {
        console.error('[Server Error] Failed to synchronize ASF configurations:', err);
    }
}

// Run config sync on startup
syncAsfConfigs();

// Start Server
server.listen(PORT, () => {
    console.log(`[Server] Master Steam Bot Dashboard Backend listening on port ${PORT}`);
});
