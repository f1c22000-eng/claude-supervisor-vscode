#!/usr/bin/env node
// ============================================
// CLAUDE SUPERVISOR - HOOK SCRIPT
// ============================================
// This script is executed by Claude Code hooks
// It communicates with the Claude Supervisor extension

const http = require('http');

const HOOK_SERVER_PORT = process.env.CLAUDE_SUPERVISOR_PORT || 18899;
const HOOK_SERVER_HOST = '127.0.0.1';
const TIMEOUT = 5000; // 5 seconds timeout

/**
 * Read stdin (context from Claude Code)
 */
async function readStdin() {
    return new Promise((resolve) => {
        let data = '';

        // Set timeout in case no data
        const timeout = setTimeout(() => {
            resolve(data || '{}');
        }, 1000);

        process.stdin.setEncoding('utf8');
        process.stdin.on('readable', () => {
            let chunk;
            while ((chunk = process.stdin.read()) !== null) {
                data += chunk;
            }
        });
        process.stdin.on('end', () => {
            clearTimeout(timeout);
            resolve(data || '{}');
        });
    });
}

/**
 * Make HTTP request to supervisor hook server
 */
async function checkWithSupervisor(context) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(context);

        const options = {
            hostname: HOOK_SERVER_HOST,
            port: HOOK_SERVER_PORT,
            path: '/api/check-stop',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: TIMEOUT
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    const response = JSON.parse(body);
                    resolve(response);
                } catch (e) {
                    resolve({ allow: true, message: 'Invalid response from supervisor' });
                }
            });
        });

        req.on('error', (e) => {
            // If supervisor is not running, allow stop
            console.error(`Supervisor not available: ${e.message}`);
            resolve({ allow: true, message: 'Supervisor not available' });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ allow: true, message: 'Supervisor timeout' });
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Main function
 */
async function main() {
    try {
        // Read context from stdin
        const stdinData = await readStdin();
        let context = {};

        try {
            context = JSON.parse(stdinData);
        } catch (e) {
            // If stdin is not valid JSON, use empty context
        }

        // Check with supervisor
        const result = await checkWithSupervisor(context);

        if (result.allow) {
            // Allow stop - exit with code 0
            if (result.message) {
                console.log(result.message);
            }
            process.exit(0);
        } else {
            // Block stop - exit with code 2
            // Print message to stderr so Claude sees it
            console.error(result.message || 'Stop blocked by supervisor');
            process.exit(2);
        }

    } catch (error) {
        // On error, allow stop (fail-safe)
        console.error(`Hook error: ${error.message}`);
        process.exit(0);
    }
}

main();
