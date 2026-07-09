const fetch = require('node-fetch');

const CSREP_API_KEY = process.env.CSREP_API_KEY || 'mein_sicheres_csrep_api_key';

/**
 * Fetch stats for a Steam ID from CSREP API.
 * 
 * @param {string} steamId64 The 64-bit Steam ID.
 * @returns {Promise<{premier_elo: number, cs2_hours: number, inventory_value: number, trust_rating: string}>} Player stats.
 */
async function getPlayerStats(steamId64) {
    const url = `https://api.csrep.gg/players/${steamId64}`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-API-Key': CSREP_API_KEY,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`CSREP API responded with status ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Handle PlayerEntity containing a nested result property
        const stats = data.result || data || {};

        return {
            premier_elo: typeof stats.premier_elo !== 'undefined' ? stats.premier_elo : 0,
            cs2_hours: typeof stats.cs2_hours !== 'undefined' ? stats.cs2_hours : 0,
            inventory_value: typeof stats.inventory_value !== 'undefined' ? stats.inventory_value : 0,
            trust_rating: stats.trust_rating || 'Unknown'
        };
    } catch (err) {
        console.error(`[CSREP API] Error fetching stats for ${steamId64}:`, err);
        throw err;
    }
}

/**
 * Trigger CSREP API stats refresh for a Steam ID.
 * 
 * @param {string} steamId64 The 64-bit Steam ID.
 * @returns {Promise<{premier_elo: number, cs2_hours: number, inventory_value: number, trust_rating: string}>} Refreshed player stats.
 */
async function refreshPlayerStats(steamId64) {
    const url = `https://api.csrep.gg/players/${steamId64}/refresh`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'X-API-Key': CSREP_API_KEY,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`CSREP API responded with status ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const stats = data.result || data || {};

        return {
            premier_elo: typeof stats.premier_elo !== 'undefined' ? stats.premier_elo : 0,
            cs2_hours: typeof stats.cs2_hours !== 'undefined' ? stats.cs2_hours : 0,
            inventory_value: typeof stats.inventory_value !== 'undefined' ? stats.inventory_value : 0,
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
