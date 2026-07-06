const fs = require('fs');
const path = require('path');
const axios = require('axios');
const AdmZip = require('adm-zip');

let logCallback = null;

function sysLog(message) {
  if (logCallback) {
    logCallback(`[SENTINEL-SYSTEM] ${new Date().toLocaleTimeString()}: ${message}\n`);
  } else {
    console.log(`[SENTINEL-SYSTEM] ${message}`);
  }
}

function setLogCallback(callback) {
  logCallback = callback;
}

function writeGlobalConfigs(asfDir) {
  const configDir = path.join(asfDir, 'config');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const ipcConfigPath = path.join(configDir, 'IPC.config');
  if (!fs.existsSync(ipcConfigPath)) {
    const ipcConfigContent = {
      Settings: {
        Endpoints: [
          {
            Url: 'http://*:1242'
          }
        ]
      }
    };
    fs.writeFileSync(ipcConfigPath, JSON.stringify(ipcConfigContent, null, 2));
    sysLog('Created IPC.config successfully (IPC listening on port 1242 on all network interfaces).');
  }

  const asfJsonPath = path.join(configDir, 'ASF.json');
  if (!fs.existsSync(asfJsonPath)) {
    const asfJsonContent = {
      IPC: true,
      AutoUpdates: false,
      Headless: true
    };
    fs.writeFileSync(asfJsonPath, JSON.stringify(asfJsonContent, null, 2));
    sysLog('Created global ASF.json configuration.');
  }
}

function writeBotConfig(asfDir, botName, username, password, sharedSecret) {
  const configDir = path.join(asfDir, 'config');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const botConfigPath = path.join(configDir, `${botName}.json`);
  const botConfigContent = {
    Enabled: true,
    SteamLogin: username,
    SteamPassword: password,
    OnlineStatus: 1,
    FarmingPausedByDefault: true,
    GamesPlayed: [730],
    AutoStartCS2Interface: true
  };
  fs.writeFileSync(botConfigPath, JSON.stringify(botConfigContent, null, 2));

  const botAuthPath = path.join(configDir, `${botName}.auth`);
  if (sharedSecret && sharedSecret.trim() !== '') {
    const botAuthContent = {
      SteamID: 0,
      SharedSecret: sharedSecret.trim(),
      IdentitySecret: ""
    };
    fs.writeFileSync(botAuthPath, JSON.stringify(botAuthContent, null, 2));
    sysLog(`Configured bot config & auto-2FA authenticator for bot: ${botName}`);
  } else {
    if (fs.existsSync(botAuthPath)) {
      fs.unlinkSync(botAuthPath);
    }
    sysLog(`Configured bot config for bot: ${botName} (manual 2FA required if enabled)`);
  }
}

function deleteBotFiles(asfDir, botName) {
  const configDir = path.join(asfDir, 'config');
  const botConfigPath = path.join(configDir, `${botName}.json`);
  const botAuthPath = path.join(configDir, `${botName}.auth`);

  if (fs.existsSync(botConfigPath)) {
    fs.unlinkSync(botConfigPath);
  }
  if (fs.existsSync(botAuthPath)) {
    fs.unlinkSync(botAuthPath);
  }
  sysLog(`Deleted bot configurations for bot: ${botName}`);
}

async function ensurePluginInstalled(pluginsDir) {
  try {
    const pluginExtractDir = path.join(pluginsDir, 'CS2Interface');
    const dllPath = path.join(pluginExtractDir, 'CS2Interface.dll');
    
    if (fs.existsSync(dllPath)) {
      sysLog('CS2Interface plugin is already installed.');
      return false;
    }

    if (!fs.existsSync(pluginExtractDir)) {
      fs.mkdirSync(pluginExtractDir, { recursive: true });
    }

    sysLog('CS2Interface plugin not found. Downloading from GitHub...');
    const url = 'https://github.com/Citrinate/CS2Interface/releases/latest/download/CS2Interface.zip';
    
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'arraybuffer',
      timeout: 30000
    });

    const tempZipPath = path.join(pluginExtractDir, 'plugin_temp.zip');
    fs.writeFileSync(tempZipPath, response.data);

    sysLog('Extracting CS2Interface plugin zip...');
    const zip = new AdmZip(tempZipPath);
    zip.extractAllTo(pluginExtractDir, true);
    fs.unlinkSync(tempZipPath);
    
    sysLog('CS2Interface plugin successfully installed automatically!');
    return true;
  } catch (error) {
    sysLog(`Error during automated plugin download/installation: ${error.message}`);
    throw error;
  }
}

module.exports = {
  writeGlobalConfigs,
  writeBotConfig,
  deleteBotFiles,
  ensurePluginInstalled,
  setLogCallback
};
