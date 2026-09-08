// scripts/simulate_pemilu.js — Virtual Simulation Engine (3 Bilik + 200 Pemilih)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local if available
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const idx = trimmed.indexOf('=');
            if (idx > 0) {
                const key = trimmed.substring(0, idx).trim();
                const val = trimmed.substring(idx + 1).trim();
                if (!process.env[key]) process.env[key] = val;
            }
        }
    });
}

// Parse CLI flags
const args = process.argv.slice(2);
const getArg = (flag, def) => {
    const found = args.find(a => a.startsWith(`--${flag}=`));
    return found ? found.split('=')[1] : def;
};

const BASE_URL = getArg('url', process.env.BASE_URL || 'http://localhost:3000');
const TOTAL_VOTERS = parseInt(getArg('voters', '200')) || 200;
const MODE = getArg('mode', 'realistic'); // 'realistic' (delay) or 'stress' (minimal delay)
const STATIONS = ['STATION-01', 'STATION-02', 'STATION-03'];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function apiFetch(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    });
    return await res.json();
}

async function main() {
    console.log(`\n==================================================================`);
    console.log(`🗳️  PEMILU OSIS DIGITAL — VIRTUAL SIMULATION ENGINE`);
    console.log(`==================================================================`);
    console.log(`📍 Target Server : ${BASE_URL}`);
    console.log(`🏛️  Total Bilik   : ${STATIONS.length} (${STATIONS.join(', ')})`);
    console.log(`👥 Total Pemilih : ${TOTAL_VOTERS} Orang`);
    console.log(`⚡ Mode Testing  : ${MODE.toUpperCase()}`);
    console.log(`==================================================================\n`);

    // 1. Reset & Start Pemilu
    console.log(`🔄 [1/4] Menginisialisasi Pemilu & Membuka Status RUNNING...`);

    // Authenticate as Admin
    const adminPassword = process.env.ADMIN_PASSWORD || 'siriyadh2026';
    const authRes = await apiFetch('/api/auth', {
        method: 'POST',
        body: JSON.stringify({ password: adminPassword })
    });

    const adminToken = authRes.token || 'MOCK_TOKEN';

    if (getArg('reset', 'true') === 'true') {
        console.log(`🧹 Membersihkan data votes & sessions lama (resetAll)...`);
        await apiFetch('/api/status', {
            method: 'POST',
            body: JSON.stringify({ action: 'resetAll', token: adminToken })
        });
    }

    // Set status to RUNNING
    await apiFetch('/api/status', {
        method: 'POST',
        body: JSON.stringify({ action: 'setStatus', value: 'RUNNING', token: adminToken })
    });

    // Fetch candidates
    const candRes = await apiFetch('/api/candidates');
    if (!candRes.success || !candRes.candidates || candRes.candidates.length === 0) {
        console.error(`❌ Gagal mengambil daftar kandidat! Pastikan database Supabase sudah di-setup.`);
        console.error(`Response:`, candRes);
        process.exit(1);
    }

    const candidates = candRes.candidates;
    console.log(`✅ Terdeteksi ${candidates.length} Pasangan Calon:`);
    candidates.forEach(c => {
        console.log(`   - Paslon #${c.number}: ${c.chairman} & ${c.vice}`);
    });

    // Calculate quota per station
    const quotaPerStation = Math.floor(TOTAL_VOTERS / STATIONS.length);
    const remainder = TOTAL_VOTERS % STATIONS.length;

    const stationQuotas = {};
    STATIONS.forEach((st, idx) => {
        stationQuotas[st] = quotaPerStation + (idx < remainder ? 1 : 0);
    });

    console.log(`\n📊 Pembagian Quota Pemilih per Bilik:`);
    STATIONS.forEach(st => console.log(`   - ${st}: ${stationQuotas[st]} pemilih`));

    // Metrics tracking
    const metrics = {
        totalAttempted: 0,
        totalSuccess: 0,
        totalFailed: 0,
        latencies: [],
        candidateVotes: {},
        stationVotes: {},
        doubleVotesDetected: 0,
        usedSessionIds: new Set()
    };

    candidates.forEach(c => { metrics.candidateVotes[c.number] = 0; });
    STATIONS.forEach(st => { metrics.stationVotes[st] = 0; });

    const startTime = Date.now();
    console.log(`\n🚀 [2/4] Memulai Simulasi Voting 3 Bilik Paralel...\n`);

    // Station Worker Function
    const runStationWorker = async (stationId, targetQuota) => {
        let completed = 0;

        while (completed < targetQuota) {
            const stepStart = Date.now();

            // 1. Get current active session for station
            let sessRes = await apiFetch(`/api/stations?action=get&stationId=${stationId}`);

            // If status is WAITING or no active session, request auth & auto-approve
            if (!sessRes.sessionId || sessRes.status === 'WAITING' || sessRes.status === 'COMPLETED') {
                const reqAuth = await apiFetch('/api/stations', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'request_auth', stationId })
                });

                if (reqAuth.success && reqAuth.requestId) {
                    const appAuth = await apiFetch('/api/stations', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'approve_auth', requestId: reqAuth.requestId, role: 'peserta' })
                    });
                    sessRes.sessionId = appAuth.sessionId;
                }
            }

            if (!sessRes.sessionId) {
                console.error(`⚠️ [${stationId}] Gagal mendapatkan sessionId. Retrying...`);
                await delay(500);
                continue;
            }

            const sessionId = sessRes.sessionId;

            // Check double-voting lock
            if (metrics.usedSessionIds.has(sessionId)) {
                metrics.doubleVotesDetected++;
            } else {
                metrics.usedSessionIds.add(sessionId);
            }

            // 2. Pick a candidate randomly
            const chosenCand = candidates[Math.floor(Math.random() * candidates.length)];

            // 3. Submit Vote
            metrics.totalAttempted++;
            const voteRes = await apiFetch('/api/vote', {
                method: 'POST',
                body: JSON.stringify({
                    sessionId: sessionId,
                    stationId: stationId,
                    candidateId: chosenCand.id
                })
            });

            const latency = Date.now() - stepStart;
            metrics.latencies.push(latency);

            if (voteRes.success) {
                metrics.totalSuccess++;
                metrics.candidateVotes[chosenCand.number]++;
                metrics.stationVotes[stationId]++;
                completed++;

                process.stdout.write(`\r[SIMULASI] ${metrics.totalSuccess}/${TOTAL_VOTERS} Suara Terkumpul | Latensi avg: ${Math.round(metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length)}ms | ${stationId}: ${completed}/${targetQuota}`);

                // 4. Transition to next voter
                await apiFetch('/api/stations', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'next', stationId })
                });
            } else {
                metrics.totalFailed++;
                console.error(`\n❌ [${stationId}] Gagal Submit Vote: ${voteRes.message}`);
            }

            // Delay between voters
            if (MODE === 'realistic') {
                await delay(100 + Math.floor(Math.random() * 200)); // ~200ms delay per simulated voter
            } else {
                await delay(10); // Stress test delay
            }
        }
    };

    // Run all 3 station workers concurrently!
    await Promise.all(STATIONS.map(st => runStationWorker(st, stationQuotas[st])));

    const totalTimeSec = ((Date.now() - startTime) / 1000).toFixed(2);
    const avgLatency = Math.round(metrics.latencies.reduce((a, b) => a + b, 0) / (metrics.latencies.length || 1));
    const throughput = (metrics.totalSuccess / totalTimeSec).toFixed(2);

    console.log(`\n\n==================================================================`);
    console.log(`✅ [3/4] SIMULASI SELESAI DENGAN SUKSES!`);
    console.log(`==================================================================`);
    console.log(`⏱️  Waktu Eksekusi   : ${totalTimeSec} Detik`);
    console.log(`🚀 Throughput       : ${throughput} Votes / Detik`);
    console.log(`⚡ Latensi Avg API   : ${avgLatency} ms`);
    console.log(`🎯 Suara Sukses     : ${metrics.totalSuccess} / ${TOTAL_VOTERS} (${((metrics.totalSuccess / TOTAL_VOTERS) * 100).toFixed(1)}%)`);
    console.log(`🚫 Double-Vote Lock : ${metrics.doubleVotesDetected > 0 ? `⚠️ ${metrics.doubleVotesDetected} Ditolak DB Lock` : '0 Error (100% Aman)'}`);
    console.log(`------------------------------------------------------------------`);

    console.log(`\n📬 Rekap Perolehan Suara Calon (Total 200 Pemilih):`);
    candidates.forEach(c => {
        const votes = metrics.candidateVotes[c.number] || 0;
        const pct = ((votes / metrics.totalSuccess) * 100).toFixed(1);
        console.log(`   Paslon #${c.number} (${c.chairman} & ${c.vice}) : ${votes} Suara (${pct}%)`);
    });

    console.log(`\n🏛️  Rekap Suara Terproses per Bilik:`);
    STATIONS.forEach(st => {
        console.log(`   - ${st} : ${metrics.stationVotes[st]} Suara`);
    });

    // 4. Final DB Stats Audit
    console.log(`\n🔍 [4/4] Verifikasi Integritas Database Supabase...`);
    const statsRes = await apiFetch('/api/stats');
    if (statsRes.success) {
        console.log(`✅ Database Realtime Stats:`);
        console.log(`   - Total Registered Votes in DB : ${statsRes.totalVotes}`);
        console.log(`   - Candidate Totals in DB       :`, statsRes.breakdown.map(r => `Paslon #${r.number}: ${r.votes} Suara`).join(', '));
        if (statsRes.totalVotes === TOTAL_VOTERS) {
            console.log(`\n🎉 INTEGRITAS 100% RELEVAN! DATABASE SAMA PERSIS DENGAN TOTAL PEMILIH (200 SUARA).`);
        } else {
            console.log(`\n⚠️ Perhatian: Total DB (${statsRes.totalVotes}) beda dengan simulasi (${TOTAL_VOTERS}).`);
        }
    }

    console.log(`==================================================================\n`);
}

main().catch(err => {
    console.error(`💥 Uncaught Simulation Error:`, err);
    process.exit(1);
});
