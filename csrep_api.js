const fetch = require('node-fetch');

const CSREP_API_KEY = process.env.CSREP_API_KEY || 'mein_sicheres_csrep_api_key';
const CSREP_KEY_ID = process.env.CSREP_KEY_ID;

/**
 * Fetch stats for a Steam ID from CSREP API.
 * Logs the raw HTTP response before parsing.
 * 
 * @param {string} steamId64 The 64-bit Steam ID.
 * @returns {Promise<{premier_elo: number, cs2_hours: number, inventory_value: number, trust_rating: string}>} Player stats.
 */
async function getPlayerStats(steamId64) {
    const url = `https://csrep.gg/api/players/${steamId64}`;
    console.log(`[CSREP] Rufe URL auf: ${url} mit Key: ${CSREP_API_KEY ? 'VORHANDEN' : 'FEHLT!'} und Key ID: ${CSREP_KEY_ID ? 'VORHANDEN' : 'FEHLT!'}`);
    
    try {
        const headers = {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        if (CSREP_KEY_ID) {
            headers['X-Key-ID'] = CSREP_KEY_ID;
            headers['X-API-Key'] = CSREP_API_KEY;
            
            // Fallback Basic Auth for standard developer APIs
            headers['Authorization'] = 'Basic ' + Buffer.from(`${CSREP_KEY_ID}:${CSREP_API_KEY}`).toString('base64');
        } else {
            headers['X-API-Key'] = CSREP_API_KEY || '';
        }

        const response = await fetch(url, {
            method: 'GET',
            headers
        });

        const rawText = await response.text();
        console.log(`[CSREP RAW RESPONSE]:`, rawText);

        if (!response.ok) {
            throw new Error(`Code ${response.status} -> Roher Text: ${rawText}`);
        }

        const data = JSON.parse(rawText);
        const stats = data.result || data || {};

        return {
            premier_elo: stats.premier_elo || 0,
            cs2_hours: stats.cs2_hours || 0,
            inventory_value: stats.inventory_value || 0,
            trust_rating: stats.trust_rating || 'Unknown'
        };
    } catch (err) {
        console.error(`[CSREP API] Error fetching stats for ${steamId64}:`, err);
        throw err;
    }
}

/**
 * Trigger CSREP API stats refresh for a Steam ID.
 * Logs the raw HTTP response before parsing.
 * 
 * @param {string} steamId64 The 64-bit Steam ID.
 * @returns {Promise<{premier_elo: number, cs2_hours: number, inventory_value: number, trust_rating: string}>} Refreshed player stats.
 */
async function refreshPlayerStats(steamId64) {
    const url = `https://csrep.gg/api/players/${steamId64}/refresh`;
    console.log(`[CSREP] Rufe URL auf: ${url} mit Key: ${CSREP_API_KEY ? 'VORHANDEN' : 'FEHLT!'} und Key ID: ${CSREP_KEY_ID ? 'VORHANDEN' : 'FEHLT!'}`);
    
    try {
        const headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        if (CSREP_KEY_ID) {
            headers['X-Key-ID'] = CSREP_KEY_ID;
            headers['X-API-Key'] = CSREP_API_KEY;
            headers['Authorization'] = 'Basic ' + Buffer.from(`${CSREP_KEY_ID}:${CSREP_API_KEY}`).toString('base64');
        } else {
            headers['X-API-Key'] = CSREP_API_KEY || '';
        }

        const response = await fetch(url, {
            method: 'POST',
            headers
        });

        const rawText = await response.text();
        console.log(`[CSREP RAW RESPONSE]:`, rawText);

        if (!response.ok) {
            throw new Error(`Code ${response.status} -> Roher Text: ${rawText}`);
        }

        const data = JSON.parse(rawText);
        const stats = data.result || data || {};

        return {
            premier_elo: stats.premier_elo || 0,
            cs2_hours: stats.cs2_hours || 0,
            inventory_value: stats.inventory_value || 0,
            trust_rating: stats.trust_rating || 'Unknown'
        };
    } catch (err) {
        console.error(`[CSREP API] Error refreshing stats for ${steamId64}:`, err);
        throw err;
    }
}

module.exports = {
    getPlayerStats,
    refreshPlayerStats
};
