// ================================================================
// PEMILU OSIS DIGITAL — Code.gs (Multi-Station Low-Egress System)
// Google Apps Script Backend (V8 Runtime)
// ================================================================

var ADMIN_PASSWORD   = 'siriyadh2026';
var ADMIN_TTL        = 28800;   // 8 jam (in seconds)
var FOLDER_NAME      = 'PEMILU OSIS DIGITAL - FOTO PASANGAN';

var SHT = {
  SETTINGS:   'SETTINGS',
  CANDIDATES: 'CANDIDATES',
  VOTES:      'VOTES',
  SESSIONS:   'SESSIONS',
  LOGS:       'LOGS'
};

var EST = {
  NOT_STARTED: 'NOT_STARTED',
  SCHEDULED:   'SCHEDULED',
  RUNNING:     'RUNNING',
  FINISHED:    'FINISHED'
};

// ================================================================
// AUTOMATIC SPREADSHEET SETUP & MENU
// ================================================================

function onOpen() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('🗳️ PEMILU OSIS')
      .addItem('⚡ Setup Sistem Otomatis', 'setupSystem')
      .addItem('📊 Cek Status Pemilu', 'checkSystemStatus')
      .addToUi();
  } catch(e) {}
}

function setupSystem() {
  var ss = getSS();
  var sheets = [
    { name: SHT.SETTINGS,   headers: ['KEY', 'VALUE', 'UPDATED_AT'] },
    { name: SHT.CANDIDATES, headers: ['ID', 'NUMBER', 'CHAIRMAN', 'VICE', 'PAIR_IMAGE', 'PAIR_IMAGE_FILE_ID', 'ACTIVE', 'CREATED_AT'] },
    { name: SHT.VOTES,      headers: ['ID', 'SESSION_ID', 'STATION_ID', 'CANDIDATE_ID', 'CANDIDATE_NUMBER', 'CHAIRMAN', 'VICE', 'TIMESTAMP'] },
    { name: SHT.SESSIONS,   headers: ['SESSION_ID', 'STATION_ID', 'STATUS', 'CREATED_AT', 'VOTED_AT', 'CANDIDATE_ID'] },
    { name: SHT.LOGS,       headers: ['TIMESTAMP', 'TYPE', 'MESSAGE', 'DATA'] }
  ];
  
  sheets.forEach(function(def) {
    var sh = ss.getSheetByName(def.name);
    if (!sh) sh = ss.insertSheet(def.name);
    initSheetHeader(sh, def.name, def.headers);
  });
  
  if (!getSetting('TITLE')) setSetting('TITLE', 'PEMILU OSIS DIGITAL');
  if (!getSetting('STATUS')) setSetting('STATUS', EST.NOT_STARTED);
  if (!getSetting('CANDIDATE_VERSION')) setSetting('CANDIDATE_VERSION', '1');
  
  getDriveFolder();
  logActivity('SETUP', 'Setup sistem otomatis berhasil dilakukan');
  
  try {
    SpreadsheetApp.getUi().alert('✅ Setup Pemilu OSIS Digital Berhasil!');
  } catch(e) {}
  
  return { success: true, message: 'Setup sistem otomatis berhasil!' };
}

function checkSystemStatus() {
  var st = getElectionStatus();
  var msg = '📊 Status Pemilu: ' + st.status + '\nJudul: ' + st.title + '\nCandidate Version: ' + st.candidateVersion;
  try { SpreadsheetApp.getUi().alert(msg); } catch(e) {}
  return msg;
}

function getSS() { return SpreadsheetApp.getActiveSpreadsheet(); }

function getSheet(name) {
  var ss = getSS();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    initSheetHeader(sheet, name);
  }
  return sheet;
}

function initSheetHeader(sheet, name, customHeaders) {
  if (sheet.getLastRow() > 0) return;
  var headers = customHeaders;
  if (!headers) {
    if (name === SHT.SETTINGS)   headers = ['KEY', 'VALUE', 'UPDATED_AT'];
    if (name === SHT.CANDIDATES) headers = ['ID', 'NUMBER', 'CHAIRMAN', 'VICE', 'PAIR_IMAGE', 'PAIR_IMAGE_FILE_ID', 'ACTIVE', 'CREATED_AT'];
    if (name === SHT.VOTES)      headers = ['ID', 'SESSION_ID', 'STATION_ID', 'CANDIDATE_ID', 'CANDIDATE_NUMBER', 'CHAIRMAN', 'VICE', 'TIMESTAMP'];
    if (name === SHT.SESSIONS)   headers = ['SESSION_ID', 'STATION_ID', 'STATUS', 'CREATED_AT', 'VOTED_AT', 'CANDIDATE_ID'];
    if (name === SHT.LOGS)       headers = ['TIMESTAMP', 'TYPE', 'MESSAGE', 'DATA'];
  }
  if (headers && headers.length > 0) {
    sheet.appendRow(headers);
    var hdrRange = sheet.getRange(1, 1, 1, headers.length);
    hdrRange.setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
}

function getDriveFolder() {
  var folders = DriveApp.getFoldersByName(FOLDER_NAME);
  var folder;
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(FOLDER_NAME);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }
  return folder;
}

// ================================================================
// ROUTING & HTML SERVING
// ================================================================

function doGet(e) {
  try {
    setupSystemOnFirstLoad();
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('PEMILU OSIS DIGITAL')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  } catch(err) {
    return HtmlService.createHtmlOutput('<!DOCTYPE html><html><head><title>Error</title></head><body style="font-family:sans-serif;padding:2rem;"><h2>⚠️ File Index.html tidak ditemukan</h2></body></html>')
      .setTitle('Error — PEMILU OSIS')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

function setupSystemOnFirstLoad() {
  try {
    var ss = getSS();
    if (!ss.getSheetByName(SHT.SETTINGS)) setupSystem();
  } catch(e) {}
}

// ================================================================
// SETTINGS & LOGGING
// ================================================================

function getSetting(key, defaultVal) {
  try {
    var sheet = getSheet(SHT.SETTINGS);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === key) return data[i][1];
    }
  } catch(e) {}
  return defaultVal !== undefined ? defaultVal : null;
}

function setSetting(key, val) {
  var sheet = getSheet(SHT.SETTINGS);
  var data = sheet.getDataRange().getValues();
  var now = new Date().toISOString();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2, 1, 2).setValues([[val, now]]);
      return;
    }
  }
  sheet.appendRow([key, val, now]);
}

function incrementCandidateVersion() {
  var ver = parseInt(getSetting('CANDIDATE_VERSION', '1')) || 1;
  ver++;
  setSetting('CANDIDATE_VERSION', String(ver));
  // Invalidate script cache for candidates
  CacheService.getScriptCache().remove('candidates_list');
  return ver;
}

function logActivity(type, message, dataObj) {
  try {
    var sheet = getSheet(SHT.LOGS);
    var now = new Date().toISOString();
    var dataStr = dataObj ? (typeof dataObj === 'object' ? JSON.stringify(dataObj) : String(dataObj)) : '';
    sheet.appendRow([now, type, message, dataStr]);
  } catch(e) {}
}

function generateUuid() { return Utilities.getUuid(); }

// ================================================================
// AUTH & ADMIN
// ================================================================

function adminLogin(password) {
  if (password !== ADMIN_PASSWORD) {
    logActivity('AUTH', 'Login admin gagal: Password salah');
    return { success: false, message: 'Password admin salah!' };
  }
  var token = generateUuid();
  CacheService.getScriptCache().put('admin_session_' + token, 'valid', ADMIN_TTL);
  logActivity('AUTH', 'Login admin berhasil');
  return { success: true, token: token };
}

function verifyAdminToken(token) {
  if (!token) return { valid: false };
  var cached = CacheService.getScriptCache().get('admin_session_' + token);
  return { valid: cached === 'valid' };
}

function requireAdmin(token) {
  var res = verifyAdminToken(token);
  if (!res.valid) throw new Error('Sesi admin tidak valid atau telah berakhir.');
}

// ================================================================
// ELECTION MANAGEMENT & CANDIDATES (WITH CANDIDATE_VERSION CACHING)
// ================================================================

function getElectionStatus() {
  var status = getSetting('STATUS', EST.NOT_STARTED);
  var startTime = getSetting('START_TIME', '');
  var endTime = getSetting('END_TIME', '');
  var title = getSetting('TITLE', 'PEMILU OSIS DIGITAL');
  var candVer = getSetting('CANDIDATE_VERSION', '1');

  if (status === EST.SCHEDULED && startTime && endTime) {
    var now = new Date();
    var st = new Date(startTime);
    var et = new Date(endTime);
    if (now >= st && now < et) {
      status = EST.RUNNING;
      setSetting('STATUS', EST.RUNNING);
    } else if (now >= et) {
      status = EST.FINISHED;
      setSetting('STATUS', EST.FINISHED);
    }
  }

  return { status: status, startTime: startTime, endTime: endTime, title: title, candidateVersion: candVer };
}

function setElectionTitle(adminToken, title) {
  requireAdmin(adminToken);
  setSetting('TITLE', title);
  logActivity('ELECTION', 'Judul pemilu diubah: ' + title);
  return { success: true, message: 'Judul pemilu disimpan!' };
}

function scheduleElection(adminToken, startTimeIso, endTimeIso) {
  requireAdmin(adminToken);
  setSetting('START_TIME', startTimeIso);
  setSetting('END_TIME', endTimeIso);
  setSetting('STATUS', EST.SCHEDULED);
  logActivity('ELECTION', 'Jadwal pemilu diatur');
  return { success: true, message: 'Jadwal pemilu disimpan!' };
}

function startElection(adminToken) {
  requireAdmin(adminToken);
  setSetting('STATUS', EST.RUNNING);
  logActivity('ELECTION', 'Pemilu dimulai oleh panitia');
  return { success: true, message: 'Pemilu dimulai!' };
}

function stopElection(adminToken) {
  requireAdmin(adminToken);
  setSetting('STATUS', EST.FINISHED);
  logActivity('ELECTION', 'Pemilu dihentikan oleh panitia');
  return { success: true, message: 'Pemilu dihentikan!' };
}

function resetElection(adminToken) {
  requireAdmin(adminToken);
  var ss = getSS();
  var vSheet = ss.getSheetByName(SHT.VOTES);
  if (vSheet) { vSheet.clear(); initSheetHeader(vSheet, SHT.VOTES); }
  var sSheet = ss.getSheetByName(SHT.SESSIONS);
  if (sSheet) { sSheet.clear(); initSheetHeader(sSheet, SHT.SESSIONS); }
  setSetting('STATUS', EST.NOT_STARTED);
  CacheService.getScriptCache().remove('statistics_cache');
  logActivity('ELECTION', 'Pemilu di-reset secara keseluruhan');
  return { success: true, message: 'Data suara dan station berhasil di-reset!' };
}

function getCandidates() {
  // Check CacheService first (low egress, fast response!)
  var cache = CacheService.getScriptCache();
  var cached = cache.get('candidates_list');
  var candVer = getSetting('CANDIDATE_VERSION', '1');
  
  if (cached) {
    try {
      var parsed = JSON.parse(cached);
      return { success: true, candidates: parsed, version: candVer };
    } catch(e) {}
  }
  
  var sheet = getSheet(SHT.CANDIDATES);
  var data = sheet.getDataRange().getValues();
  var candidates = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (row[0]) {
      candidates.push({
        id: String(row[0]),
        number: Number(row[1]),
        chairman: String(row[2]),
        vice: String(row[3]),
        pairImageUrl: String(row[4] || ''),
        pairImageFileId: String(row[5] || ''),
        active: row[6] === true || String(row[6]).toUpperCase() === 'TRUE',
        createdAt: row[7]
      });
    }
  }
  candidates.sort(function(a,b){ return a.number - b.number; });
  
  // Save to CacheService for 600s
  try { cache.put('candidates_list', JSON.stringify(candidates), 600); } catch(e) {}
  return { success: true, candidates: candidates, version: candVer };
}

function addCandidate(adminToken, number, chairman, vice, pairImageUrl, pairImageFileId) {
  requireAdmin(adminToken);
  var sheet = getSheet(SHT.CANDIDATES);
  var id = generateUuid();
  var now = new Date().toISOString();
  var candObj = {
    id: id,
    number: Number(number),
    chairman: chairman,
    vice: vice,
    pairImageUrl: pairImageUrl || '',
    pairImageFileId: pairImageFileId || '',
    active: true,
    createdAt: now
  };
  
  sheet.appendRow([id, number, chairman, vice, pairImageUrl || '', pairImageFileId || '', true, now]);
  var newVer = incrementCandidateVersion();
  logActivity('CANDIDATE', 'Pasangan calon #' + number + ' (' + chairman + ' & ' + vice + ') ditambahkan');
  
  // Return the newly created candidate object directly to frontend (FAST ADD, NO FULL DB REFETCH!)
  return { success: true, message: 'Pasangan calon berhasil ditambahkan!', candidate: candObj, version: String(newVer) };
}

function updateCandidate(adminToken, id, number, chairman, vice, pairImageUrl, pairImageFileId) {
  requireAdmin(adminToken);
  var sheet = getSheet(SHT.CANDIDATES);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      var imgUrl = pairImageUrl !== undefined ? pairImageUrl : data[i][4];
      var imgFileId = pairImageFileId !== undefined ? pairImageFileId : data[i][5];
      sheet.getRange(i + 1, 2, 1, 5).setValues([[number, chairman, vice, imgUrl, imgFileId]]);
      var newVer = incrementCandidateVersion();
      logActivity('CANDIDATE', 'Pasangan calon #' + number + ' diperbarui');
      return { success: true, message: 'Data kandidat diperbarui!', candidate: { id: id, number: Number(number), chairman: chairman, vice: vice, pairImageUrl: imgUrl, pairImageFileId: imgFileId, active: data[i][6] }, version: String(newVer) };
    }
  }
  return { success: false, message: 'Kandidat tidak ditemukan.' };
}

function toggleCandidate(adminToken, id, activeState) {
  requireAdmin(adminToken);
  var sheet = getSheet(SHT.CANDIDATES);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.getRange(i + 1, 7).setValue(activeState);
      var newVer = incrementCandidateVersion();
      logActivity('CANDIDATE', 'Status pasangan ID ' + id + ' diubah ke ' + activeState);
      return { success: true, message: 'Status kandidat diubah!', id: id, active: activeState, version: String(newVer) };
    }
  }
  return { success: false, message: 'Kandidat tidak ditemukan.' };
}

function deleteCandidate(adminToken, id) {
  requireAdmin(adminToken);
  var sheet = getSheet(SHT.CANDIDATES);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      var newVer = incrementCandidateVersion();
      logActivity('CANDIDATE', 'Pasangan calon ID ' + id + ' dihapus');
      return { success: true, message: 'Pasangan calon dihapus!', id: id, version: String(newVer) };
    }
  }
  return { success: false, message: 'Kandidat tidak ditemukan.' };
}

function uploadPhoto(base64Data, mimeType, candNum) {
  try {
    var folder = getDriveFolder();
    var data = base64Data.split(',')[1] || base64Data;
    var blob = Utilities.newBlob(Utilities.base64Decode(data), mimeType || 'image/jpeg', 'kandidat_' + candNum + '_' + Date.now() + '.jpg');
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var url = 'https://lh3.googleusercontent.com/d/' + file.getId();
    return { success: true, url: url, fileId: file.getId() };
  } catch(e) {
    return { success: false, message: 'Gagal mengupload foto: ' + e.message };
  }
}

// ================================================================
// MULTI-STATION SESSION ENGINE & ATOMIC VOTE SUBMISSION
// ================================================================

/**
 * Get current session state for a specific station (or recover session on refresh)
 */
function getStationSession(stationId) {
  if (!stationId) stationId = 'STATION-01';
  var sheet = getSheet(SHT.SESSIONS);
  var data = sheet.getDataRange().getValues();
  
  // Find latest session row for this station
  var latestSession = null;
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]) === String(stationId)) {
      latestSession = {
        sessionId: String(data[i][0]),
        stationId: String(data[i][1]),
        status: String(data[i][2]),
        createdAt: data[i][3],
        votedAt: data[i][4]
      };
      break;
    }
  }
  
  var stInfo = getElectionStatus();
  if (!latestSession) {
    return { success: true, stationId: stationId, sessionId: null, status: 'WAITING', electionStatus: stInfo.status };
  }
  
  return {
    success: true,
    stationId: latestSession.stationId,
    sessionId: latestSession.sessionId,
    status: latestSession.status,
    electionStatus: stInfo.status
  };
}

/**
 * Panitia creates a new session for a station ("PESERTA BERIKUTNYA")
 */
function createVotingSession(stationId) {
  if (!stationId) stationId = 'STATION-01';
  var sheet = getSheet(SHT.SESSIONS);
  var sessionId = generateUuid();
  var now = new Date().toISOString();
  
  sheet.appendRow([sessionId, stationId, 'ACTIVE', now, '', '']);
  logActivity('STATION', stationId + ' dibuatkan session baru (' + sessionId + ') oleh panitia');
  
  // Invalidate stats cache so panitia dashboard updates immediately
  CacheService.getScriptCache().remove('statistics_cache');
  
  return { success: true, stationId: stationId, sessionId: sessionId, status: 'ACTIVE' };
}

/**
 * Get status of all active stations for Dashboard Pemilu
 */
function getAllStationStatuses() {
  var sheet = getSheet(SHT.SESSIONS);
  var data = sheet.getDataRange().getValues();
  var stationMap = {};
  
  // Pick the latest session per station_id
  for (var i = 1; i < data.length; i++) {
    var sid = String(data[i][1]);
    if (sid) {
      stationMap[sid] = {
        sessionId: String(data[i][0]),
        stationId: sid,
        status: String(data[i][2]),
        createdAt: data[i][3],
        votedAt: data[i][4]
      };
    }
  }
  
  var stations = [];
  Object.keys(stationMap).sort().forEach(function(k) {
    stations.push(stationMap[k]);
  });
  
  return { success: true, stations: stations };
}

/**
 * ATOMIC SUBMIT VOTE WITH LockService ANTI-DOUBLE VOTE
 */
function submitVote(sessionId, stationId, candidateId) {
  if (!sessionId || !candidateId) {
    return { success: false, message: 'Data vote tidak lengkap.' };
  }
  
  var stInfo = getElectionStatus();
  if (stInfo.status !== EST.RUNNING) {
    return { success: false, message: 'Pemilu belum dibuka atau telah selesai.' };
  }
  
  // Acquire LockService to prevent concurrent double-vote race conditions
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000); // 5 sec timeout
  } catch(e) {
    return { success: false, message: 'Server sibuk. Silakan coba submit beberapa detik lagi.' };
  }
  
  try {
    var ss = getSS();
    var sSheet = ss.getSheetByName(SHT.SESSIONS);
    var sData = sSheet.getDataRange().getValues();
    var sessionRowIndex = -1;
    var sessionObj = null;
    
    for (var i = 1; i < sData.length; i++) {
      if (String(sData[i][0]) === String(sessionId)) {
        sessionRowIndex = i + 1;
        sessionObj = {
          sessionId: String(sData[i][0]),
          stationId: String(sData[i][1]),
          status: String(sData[i][2])
        };
        break;
      }
    }
    
    if (!sessionObj) {
      return { success: false, message: 'Sesi voting tidak ditemukan.' };
    }
    
    if (sessionObj.status === 'VOTED' || sessionObj.status === 'COMPLETED') {
      return { success: false, message: 'Sesi voting ini sudah digunakan!' };
    }
    
    // Get candidate detail
    var candsRes = getCandidates();
    var candidateObj = null;
    for (var c = 0; c < candsRes.candidates.length; c++) {
      if (String(candsRes.candidates[c].id) === String(candidateId)) {
        candidateObj = candsRes.candidates[c];
        break;
      }
    }
    
    if (!candidateObj || !candidateObj.active) {
      return { success: false, message: 'Kandidat pilihan tidak valid.' };
    }
    
    var now = new Date().toISOString();
    var voteId = generateUuid();
    var targetStationId = stationId || sessionObj.stationId || 'STATION-01';
    
    // 1. Save vote to VOTES sheet
    var vSheet = getSheet(SHT.VOTES);
    vSheet.appendRow([voteId, sessionId, targetStationId, candidateObj.id, candidateObj.number, candidateObj.chairman, candidateObj.vice, now]);
    
    // 2. Mark session as VOTED
    sSheet.getRange(sessionRowIndex, 3, 1, 4).setValues([['VOTED', sData[sessionRowIndex - 1][3] || now, now, candidateObj.id]]);
    
    // 3. Clear stats cache
    CacheService.getScriptCache().remove('statistics_cache');
    
    logActivity('VOTE', 'Suara masuk di ' + targetStationId + ' untuk Pasangan #' + candidateObj.number, { sessionId: sessionId, candidateId: candidateObj.id });
    
    return {
      success: true,
      voteId: voteId,
      sessionId: sessionId,
      message: 'Suara Anda telah berhasil dicatat!'
    };
  } finally {
    lock.releaseLock();
  }
}

// ================================================================
// DASHBOARD & AGGREGATED STATISTICS
// ================================================================

function getAdminDashboardData(adminToken) {
  requireAdmin(adminToken);
  var statusInfo = getElectionStatus();
  var candsRes = getCandidates();
  var vSheet = getSheet(SHT.VOTES);
  var sSheet = getSheet(SHT.SESSIONS);
  var totalVotes = Math.max(0, vSheet.getLastRow() - 1);
  var totalSessions = Math.max(0, sSheet.getLastRow() - 1);
  
  return {
    success: true,
    totalVotes: totalVotes,
    totalSessions: totalSessions,
    totalCandidates: candsRes.candidates.length,
    electionStatus: statusInfo.status,
    title: statusInfo.title,
    startTime: statusInfo.startTime,
    endTime: statusInfo.endTime,
    candidateVersion: statusInfo.candidateVersion
  };
}

function getStatistics() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('statistics_cache');
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }
  
  var candsRes = getCandidates();
  var candidates = candsRes.candidates;
  var vSheet = getSheet(SHT.VOTES);
  var vData = vSheet.getDataRange().getValues();
  
  var counts = {};
  var totalVotes = 0;
  
  for (var c = 0; c < candidates.length; c++) {
    counts[candidates[c].id] = 0;
  }
  
  for (var i = 1; i < vData.length; i++) {
    var cid = String(vData[i][3]); // Candidate ID column
    if (counts[cid] !== undefined) {
      counts[cid]++;
      totalVotes++;
    }
  }
  
  var breakdown = candidates.map(function(cand) {
    var count = counts[cand.id] || 0;
    var pct = totalVotes > 0 ? Math.round((count / totalVotes) * 1000) / 10 : 0;
    return {
      id: cand.id,
      number: cand.number,
      chairman: cand.chairman,
      vice: cand.vice,
      votes: count,
      percentage: pct
    };
  });
  
  var statusInfo = getElectionStatus();
  var stationsRes = getAllStationStatuses();
  
  var result = {
    success: true,
    totalVotes: totalVotes,
    breakdown: breakdown,
    electionStatus: statusInfo.status,
    title: statusInfo.title,
    candidateVersion: statusInfo.candidateVersion,
    stations: stationsRes.stations
  };
  
  // Cache for 60 seconds
  try { cache.put('statistics_cache', JSON.stringify(result), 60); } catch(e) {}
  return result;
}

function getLogs(adminToken) {
  requireAdmin(adminToken);
  var sheet = getSheet(SHT.LOGS);
  var data = sheet.getDataRange().getValues();
  var logs = [];
  var start = Math.max(1, data.length - 100);
  for (var i = data.length - 1; i >= start; i--) {
    var row = data[i];
    if (row[0]) {
      logs.push({ timestamp: row[0], type: row[1], message: row[2], data: row[3] });
    }
  }
  return { success: true, logs: logs };
}