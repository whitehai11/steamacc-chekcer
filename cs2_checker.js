const SteamUser = require('steam-user');
const NodeCS2 = require('node-cs2');
const { fetchSteamGuardCode } = require('./mail_bot');

/**
 * Log into a Steam account, launch Counter-Strike 2, connect to the Game Coordinator,
 * retrieve the current match penalty/cooldown, clean up, and resolve the remaining minutes.
 * 
 * @param {string} username The Steam username.
 * @param {string} password The Steam password.
 * @returns {Promise<number>} Resolves with the remaining cooldown minutes (0 if no cooldown).
 */
async function checkCs2Cooldown(username, password) {
    return new Promise((resolve, reject) => {
        const user = new SteamUser();
        const cs2 = new NodeCS2(user);
        
        let timeoutId;
        let isResolved = false;

        const cleanUp = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            try {
                user.logOff();
            } catch (e) {
                // Ignore logoff error
            }
            user.removeAllListeners();
            cs2.removeAllListeners();
        };

        const safeResolve = (value) => {
            if (!isResolved) {
                isResolved = true;
                cleanUp();
                resolve(value);
            }
        };

        const safeReject = (err) => {
            if (!isResolved) {
                isResolved = true;
                cleanUp();
                reject(err);
            }
        };

        // Global safety timeout of 90 seconds
        timeoutId = setTimeout(() => {
            safeReject(new Error('Timeout during CS2 cooldown check'));
        }, 90000);

        // Handle Steam Guard Event
        user.on('steamGuard', async (domain, callback) => {
            console.log(`[CS2 Checker] Steam Guard code requested for bot '${username}'. Checking emails...`);
            let attempts = 0;
            const maxAttempts = 3;

            const checkEmailLoop = async () => {
                attempts++;
                console.log(`[CS2 Checker] Email check attempt ${attempts}/${maxAttempts}...`);
                const result = await fetchSteamGuardCode();
                
                if (result && result.code) {
                    console.log(`[CS2 Checker] Successfully retrieved Steam Guard code: ${result.code}`);
                    callback(result.code);
                } else if (attempts < maxAttempts) {
                    setTimeout(checkEmailLoop, 5000);
                } else {
                    console.error('[CS2 Checker] Steam Guard code not found in emails after 3 attempts.');
                    safeReject(new Error('Steam Guard code email not found'));
                }
            };

            // Start the polling loop after 5 seconds
            setTimeout(checkEmailLoop, 5000);
        });

        // Handle Successful Steam Login
        user.on('loggedOn', () => {
            console.log(`[CS2 Checker] Bot '${username}' logged on. Launching CS2 (730)...`);
            user.gamesPlayed([730]);
        });

        // Handle App Launch
        user.on('appLaunched', (appid) => {
            if (appid === 730) {
                console.log(`[CS2 Checker] CS2 app launched. Triggering helloGC()...`);
                if (typeof cs2.helloGC === 'function') {
                    cs2.helloGC();
                } else if (typeof cs2.hello === 'function') {
                    cs2.hello();
                }
            }
        });

        // Listen for GC account data event (main: accountDataSelf, fallback: accountData)
        const handleAccountData = (data) => {
            console.log(`[CS2 Checker] Account data received for bot '${username}':`, data);
            const penaltySeconds = data.penalty_seconds || 0;
            const remainingMinutes = Math.ceil(penaltySeconds / 60);
            
            console.log(`[CS2 Checker] CS2 Cooldown for bot '${username}': ${remainingMinutes} minutes.`);
            safeResolve(remainingMinutes);
        };

        cs2.on('accountDataSelf', handleAccountData);
        cs2.on('accountData', handleAccountData);

        // Error Handlers
        user.on('error', (err) => {
            console.error(`[CS2 Checker] Steam User Error for bot '${username}':`, err);
            safeReject(err);
        });

        cs2.on('error', (err) => {
            console.error(`[CS2 Checker] CS2 GC Error for bot '${username}':`, err);
            safeReject(err);
        });

        // Start Connection
        user.logOn({
            accountName: username,
            password: password
        });
    });
}

module.exports = {
    checkCs2Cooldown
};
