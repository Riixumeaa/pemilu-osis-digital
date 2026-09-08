// dev-server.js — Zero-dependency Local Server for Vercel Functions + Index.html
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local manually if process.env isn't set
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const idx = trimmed.indexOf('=');
            if (idx > 0) {
                const key = trimmed.substring(0, idx).trim();
                const val = trimmed.substring(idx + 1).trim();
                if (!process.env[key]) {
                    process.env[key] = val;
                }
            }
        }
    });
}

// Import Vercel handlers dynamically
import statusHandler from './api/status.js';
import stationsHandler from './api/stations.js';
import voteHandler from './api/vote.js';
import statsHandler from './api/stats.js';
import candidatesHandler from './api/candidates.js';
import authHandler from './api/auth.js';
import setupHandler from './api/setup.js';

import logsHandler from './api/logs.js';

const PORT = process.env.PORT || 3000;

const apiRoutes = {
    '/api/status': statusHandler,
    '/api/stations': stationsHandler,
    '/api/vote': voteHandler,
    '/api/stats': statsHandler,
    '/api/candidates': candidatesHandler,
    '/api/auth': authHandler,
    '/api/setup': setupHandler,
    '/api/logs': logsHandler,
};

const server = http.createServer(async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    // Enhance res with status and json helpers (Vercel API format)
    res.status = function (code) {
        res.statusCode = code;
        return res;
    };
    res.json = function (data) {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
        return res;
    };

    // Route API requests
    const routeKey = Object.keys(apiRoutes).find(r => pathname === r || pathname.startsWith(r + '.js'));
    if (routeKey) {
        // Parse query params
        const query = {};
        for (const [k, v] of parsedUrl.searchParams.entries()) {
            query[k] = v;
        }
        req.query = query;

        // Parse body for POST requests
        let bodyData = '';
        req.on('data', chunk => { bodyData += chunk; });
        req.on('end', async () => {
            if (bodyData) {
                try {
                    req.body = JSON.parse(bodyData);
                } catch (e) {
                    req.body = bodyData;
                }
            } else {
                req.body = {};
            }

            try {
                await apiRoutes[routeKey](req, res);
            } catch (err) {
                console.error(`API Error on ${pathname}:`, err);
                if (!res.writableEnded) {
                    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
                }
            }
        });
        return;
    }

    // Serve static files (Index.html, public/*)
    let filePath = path.join(__dirname, pathname === '/' ? 'Index.html' : pathname);
    if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
        filePath += '.html';
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 PEMILU OSIS DIGITAL — Local Dev Server Running`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`==================================================\n`);
});
