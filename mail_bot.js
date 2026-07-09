const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');

/**
 * Connects to the IMAP server and checks for unseen Steam Guard emails.
 * Extracts the 5-digit code and confirmation link using RegEx.
 * Marks the matching email as read and returns the extracted data.
 * 
 * @returns {Promise<{code: string, link: string|null}|null>} The code and link, or null if not found.
 */
async function fetchSteamGuardCode() {
    let connection;
    try {
        const config = {
            imap: {
                user: 'steamdash@neueerde.jetzt',
                password: process.env.STEAM_MAIL_PASSWORD || 'mein_sicheres_mail_passwort',
                host: 'mail.neueerde.jetzt',
                port: 993,
                tls: true,
                tlsOptions: { rejectUnauthorized: false },
                authTimeout: 10000
            }
        };

        connection = await imaps.connect(config);
        await connection.openBox('INBOX');

        // Fetch unseen messages
        const searchCriteria = ['UNSEEN'];
        const fetchOptions = {
            bodies: [''],
            markSeen: false
        };

        const messages = await connection.search(searchCriteria, fetchOptions);

        for (const item of messages) {
            const allPart = item.parts.find(part => part.which === '');
            if (!allPart || !allPart.body) continue;

            const parsed = await simpleParser(allPart.body);
            
            // Check if the X-Steam-Message-Type header exists and matches CEmailSteamGuard_Computer
            const messageTypeHeader = parsed.headers.get('x-steam-message-type');
            let isSteamGuard = false;

            if (Array.isArray(messageTypeHeader)) {
                isSteamGuard = messageTypeHeader.includes('CEmailSteamGuard_Computer');
            } else if (typeof messageTypeHeader === 'string') {
                isSteamGuard = messageTypeHeader === 'CEmailSteamGuard_Computer';
            }

            if (isSteamGuard) {
                // Steam Guard messages can have both text and html parts
                const textToScan = parsed.html || parsed.text || '';
                
                const codeMatch = textToScan.match(/\b([A-Z0-9]{5})\b/);
                const linkMatch = textToScan.match(/href="(https:\/\/store\.steampowered\.com\/login\/shipping_action\/[^"]+)"/);

                if (codeMatch) {
                    const code = codeMatch[1];
                    const link = linkMatch ? linkMatch[1] : null;

                    // Mark the email as seen (read)
                    await connection.addFlags(item.attributes.uid, '\\Seen');
                    
                    connection.end();
                    return { code, link };
                }
            }
        }

        connection.end();
        return null;
    } catch (err) {
        console.error('[Mail Bot] Error checking emails:', err);
        if (connection) {
            try {
                connection.end();
            } catch (e) {
                // Ignore closing error
            }
        }
        return null;
    }
}

module.exports = {
    fetchSteamGuardCode
};
