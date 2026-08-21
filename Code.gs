// ================================================================
// PEMILU OSIS DIGITAL — Code.gs (Multi-Station Real-Time System)
// Google Apps Script Backend (V8 Runtime)
// ================================================================

var ADMIN_PASSWORD   = 'siriyadh2026';
var ADMIN_TTL        = 28800;   // 8 jam
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
    { name: SHT.SETTINGS,   headers: ['Key', 'Value', 'UpdatedAt'] },
    { name: SHT.CANDIDATES, headers: ['Id', 'Number', 'Chairman', 'Vice', 'PairImageUrl', 'Active', 'CreatedAt'] },
    { name: SHT.VOTES,      headers: ['Id', 'CandidateId', 'StationId', 'SessionToken', 'VotedAt'] },
    { name: SHT.SESSIONS,   headers: ['StationId', 'Status', 'UpdatedAt'] },
    { name: SHT.LOGS,       headers: ['Timestamp', 'Type', 'Message', 'Data'] }
  ];
  
  sheets.forEach(function(def) {
    var sh = ss.getSheetByName(def.name);
    if (!sh) sh = ss.insertSheet(def.name);
    initSheetHeader(sh, def.name, def.headers);
  });
  
  if (!getSetting('ELECTION_TITLE')) setSetting('ELECTION_TITLE', 'PEMILU OSIS DIGITAL');
  if (!getSetting('ELECTION_STATUS')) setSetting('ELECTION_STATUS', EST.NOT_STARTED);
  
  getDriveFolder();
  logActivity('SETUP', 'Setup sistem otomatis selesai');
  
  try {
    SpreadsheetApp.getUi().alert('✅ Setup Pemilu OSIS Digital Berhasil!');
  } catch(e) {}
  
  return { success: true, message: 'Setup sistem otomatis berhasil!' };
}

function checkSystemStatus() {
  var st = getElectionStatus();
  var msg = '📊 Status Pemilu: ' + st.status + '\nJudul: ' + st.title;
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
    if (name === SHT.SETTINGS)   headers = ['Key', 'Value', 'UpdatedAt'];
    if (name === SHT.CANDIDATES) headers = ['Id', 'Number', 'Chairman', 'Vice', 'PairImageUrl', 'Active', 'CreatedAt'];
    if (name === SHT.VOTES)      headers = ['Id', 'CandidateId', 'StationId', 'SessionToken', 'VotedAt'];
    if (name === SHT.SESSIONS)   headers = ['StationId', 'Status', 'UpdatedAt'];
    if (name === SHT.LOGS)       headers = ['Timestamp', 'Type', 'Message', 'Data'];
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
  if (!res.valid) throw new Error('Sesi admin tidak valid.');
}

// ================================================================
// ELECTION MANAGEMENT & CANDIDATES
// ================================================================

function getElectionStatus() {
  var status = getSetting('ELECTION_STATUS', EST.NOT_STARTED);
  var startTime = getSetting('START_TIME', '');
  var endTime = getSetting('END_TIME', '');
  var title = getSetting('ELECTION_TITLE', 'PEMILU OSIS DIGITAL');

  if (status === EST.SCHEDULED && startTime && endTime) {
    var now = new Date();
    var st = new Date(startTime);
    var et = new Date(endTime);
    if (now >= st && now < et) {
      status = EST.RUNNING;
      setSetting('ELECTION_STATUS', EST.RUNNING);
    } else if (now >= et) {
      status = EST.FINISHED;
      setSetting('ELECTION_STATUS', EST.FINISHED);
    }
  }

  return { status: status, startTime: startTime, endTime: endTime, title: title };
}

function setElectionTitle(adminToken, title) {
  requireAdmin(adminToken);
  setSetting('ELECTION_TITLE', title);
  logActivity('ELECTION', 'Judul pemilu diubah: ' + title);
  return { success: true, message: 'Judul pemilu disimpan!' };
}

function scheduleElection(adminToken, startTimeIso, endTimeIso) {
  requireAdmin(adminToken);
  setSetting('START_TIME', startTimeIso);
  setSetting('END_TIME', endTimeIso);
  setSetting('ELECTION_STATUS', EST.SCHEDULED);
  logActivity('ELECTION', 'Jadwal pemilu diatur');
  return { success: true, message: 'Jadwal pemilu disimpan!' };
}

function startElection(adminToken) {
  requireAdmin(adminToken);
  setSetting('ELECTION_STATUS', EST.RUNNING);
  logActivity('ELECTION', 'Pemilu dimulai secara manual');
  return { success: true, message: 'Pemilu dimulai!' };
}

function stopElection(adminToken) {
  requireAdmin(adminToken);
  setSetting('ELECTION_STATUS', EST.FINISHED);
  logActivity('ELECTION', 'Pemilu dihentikan secara manual');
  return { success: true, message: 'Pemilu dihentikan!' };
}

function resetElection(adminToken) {
  requireAdmin(adminToken);
  var ss = getSS();
  var vSheet = ss.getSheetByName(SHT.VOTES);
  if (vSheet) { vSheet.clear(); initSheetHeader(vSheet, SHT.VOTES); }
  var sSheet = ss.getSheetByName(SHT.SESSIONS);
  if (sSheet) { sSheet.clear(); initSheetHeader(sSheet, SHT.SESSIONS); }
  setSetting('ELECTION_STATUS', EST.NOT_STARTED);
  logActivity('ELECTION', 'Pemilu di-reset secara keseluruhan');
  return { success: true, message: 'Data suara dan station berhasil di-reset!' };
}

function getCandidates() {
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
        active: row[5] === true || String(row[5]).toUpperCase() === 'TRUE',
        createdAt: row[6]
      });
    }
  }
  candidates.sort(function(a,b){ return a.number - b.number; });
  return { success: true, candidates: candidates };
}

function addCandidate(adminToken, number, chairman, vice, pairImageUrl) {
  requireAdmin(adminToken);
  var sheet = getSheet(SHT.CANDIDATES);
  var id = generateUuid();
  var now = new Date().toISOString();
  sheet.appendRow([id, number, chairman, vice, pairImageUrl || '', true, now]);
  logActivity('CANDIDATE', 'Pasangan calon #' + number + ' ditambahkan');
  return { success: true, message: 'Pasangan calon berhasil ditambahkan!' };
}

function updateCandidate(adminToken, id, number, chairman, vice, pairImageUrl) {
  requireAdmin(adminToken);
  var sheet = getSheet(SHT.CANDIDATES);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      var imgUrl = pairImageUrl || data[i][4];
      sheet.getRange(i + 1, 2, 1, 4).setValues([[number, chairman, vice, imgUrl]]);
      logActivity('CANDIDATE', 'Pasangan calon #' + number + ' diperbarui');
      return { success: true, message: 'Data kandidat diperbarui!' };
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
      sheet.getRange(i + 1, 6).setValue(activeState);
      logActivity('CANDIDATE', 'Status pasangan ID ' + id + ' diubah ke ' + activeState);
      return { success: true, message: 'Status kandidat diubah!' };
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
      logActivity('CANDIDATE', 'Pasangan calon ID ' + id + ' dihapus');
      return { success: true, message: 'Pasangan calon dihapus!' };
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
    return { success: true, url: url };
  } catch(e) {
    return { success: false, message: 'Gagal mengupload foto: ' + e.message };
  }
}

// ================================================================
// DYNAMIC MULTI-STATION SESSIONS & REAL-TIME FLOW
// ================================================================

function updateCachedStats(mutationType, payload) {
  try {
    var cache = CacheService.getScriptCache();
    var cachedStr = cache.get('statistics_cache');
    var stats = cachedStr ? JSON.parse(cachedStr) : null;
    if (!stats) return; // If cold, getStatistics will build & cache on next call
    
    var now = new Date().toISOString();
    
    if (mutationType === 'VOTE') {
      stats.totalVotes = (stats.totalVotes || 0) + 1;
      if (stats.breakdown && stats.breakdown.length) {
        stats.breakdown.forEach(function(cand) {
          if (String(cand.id) === String(payload.candidateId)) {
            cand.votes = (cand.votes || 0) + 1;
          }
        });
        stats.breakdown.forEach(function(cand) {
          cand.percentage = stats.totalVotes > 0 ? Math.round((cand.votes / stats.totalVotes) * 1000) / 10 : 0;
        });
      }
      if (stats.stations) {
        var found = false;
        stats.stations.forEach(function(st) {
          if (String(st.stationId) === String(payload.stationId)) {
            st.status = 'VOTED';
            st.updatedAt = now;
            found = true;
          }
        });
        if (!found && payload.stationId) {
          stats.stations.push({ stationId: String(payload.stationId), status: 'VOTED', updatedAt: now });
        }
      }
    } else if (mutationType === 'STATION_STATUS') {
      if (stats.stations) {
        var found = false;
        stats.stations.forEach(function(st) {
          if (String(st.stationId) === String(payload.stationId)) {
            st.status = payload.status;
            st.updatedAt = now;
            found = true;
          }
        });
        if (!found && payload.stationId) {
          stats.stations.push({ stationId: String(payload.stationId), status: payload.status, updatedAt: now });
        }
      }
    } else if (mutationType === 'DELETE_STATION') {
      if (stats.stations) {
        stats.stations = stats.stations.filter(function(st) {
          return String(st.stationId) !== String(payload.stationId);
        });
      }
    } else if (mutationType === 'RESET_ALL_STATIONS') {
      if (stats.stations) {
        stats.stations.forEach(function(st) {
          st.status = 'READY';
          st.updatedAt = now;
        });
      }
    }
    
    // Save updated stats back to CacheService with a generous 120s TTL
    cache.put('statistics_cache', JSON.stringify(stats), 120);
  } catch(e) {}
}

function registerStation(stationId) {
  // 1. Fast Cache Read (< 15ms response!)
  try {
    var cache = CacheService.getScriptCache();
    var cachedStr = cache.get('statistics_cache');
    if (cachedStr) {
      var stats = JSON.parse(cachedStr);
      if (stats && stats.stations) {
        for (var s = 0; s < stats.stations.length; s++) {
          if (String(stats.stations[s].stationId) === String(stationId)) {
            return { success: true, stationId: stationId, status: stats.stations[s].status };
          }
        }
      }
    }
  } catch(e) {}

  // 2. If not in cache, fallback to sheet read/write with script lock:
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000); // wait up to 3s
  } catch(e) {
    var sheet = getSheet(SHT.SESSIONS);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(stationId)) {
        return { success: true, stationId: stationId, status: data[i][1] };
      }
    }
    return { success: true, stationId: stationId, status: 'READY' };
  }
  try {
    var sheet = getSheet(SHT.SESSIONS);
    var data = sheet.getDataRange().getValues();
    var now = new Date().toISOString();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(stationId)) {
        sheet.getRange(i + 1, 3).setValue(now);
        updateCachedStats('STATION_STATUS', { stationId: stationId, status: data[i][1] });
        return { success: true, stationId: stationId, status: data[i][1] };
      }
    }
    sheet.appendRow([stationId, 'READY', now]);
    logActivity('STATION', stationId + ' dibuka');
    updateCachedStats('STATION_STATUS', { stationId: stationId, status: 'READY' });
    return { success: true, stationId: stationId, status: 'READY' };
  } finally {
    lock.releaseLock();
  }
}

function getAllStations() {
  var sheet = getSheet(SHT.SESSIONS);
  var data = sheet.getDataRange().getValues();
  var stations = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) {
      stations.push({
        stationId: String(data[i][0]),
        status: String(data[i][1]),
        updatedAt: data[i][2]
      });
    }
  }
  return { success: true, stations: stations };
}

function nextStationSession(stationId) {
  var sheet = getSheet(SHT.SESSIONS);
  var data = sheet.getDataRange().getValues();
  var now = new Date().toISOString();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(stationId)) {
      sheet.getRange(i + 1, 2, 1, 2).setValues([['READY', now]]);
      logActivity('STATION', stationId + ' dilanjutkan ke pemilih berikutnya oleh panitia');
      updateCachedStats('STATION_STATUS', { stationId: stationId, status: 'READY' });
      return { success: true, message: stationId + ' siap untuk pemilih berikutnya!' };
    }
  }
  sheet.appendRow([stationId, 'READY', now]);
  updateCachedStats('STATION_STATUS', { stationId: stationId, status: 'READY' });
  return { success: true, message: stationId + ' siap!' };
}

/**
 * Delete a single station (individual booth removal)
 */
function deleteStation(stationId) {
  var sheet = getSheet(SHT.SESSIONS);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(stationId)) {
      sheet.deleteRow(i + 1);
      logActivity('STATION', stationId + ' dihapus dari panel oleh panitia');
      updateCachedStats('DELETE_STATION', { stationId: stationId });
      return { success: true, message: stationId + ' berhasil dihapus!' };
    }
  }
  return { success: false, message: stationId + ' tidak ditemukan.' };
}

/**
 * Reset all active voting stations back to READY / Clear all sessions
 */
function resetAllStations() {
  var ss = getSS();
  var sSheet = ss.getSheetByName(SHT.SESSIONS);
  if (sSheet) {
    sSheet.clear();
    initSheetHeader(sSheet, SHT.SESSIONS);
  }
  logActivity('STATION', 'Semua bilik suara (stations) di-reset/ditutup oleh panitia');
  updateCachedStats('RESET_ALL_STATIONS', {});
  return { success: true, message: 'Semua bilik suara berhasil di-reset!' };
}

function castStationVote(stationId, candidateId) {
  var stInfo = getElectionStatus();
  if (stInfo.status !== EST.RUNNING) {
    return { success: false, message: 'Pemilu belum dibuka atau telah selesai.' };
  }
  
  var ss = getSS();
  
  // Record Vote
  var vSheet = getSheet(SHT.VOTES);
  var voteId = generateUuid();
  var now = new Date().toISOString();
  vSheet.appendRow([voteId, candidateId, stationId || 'Station 1', 'NO_TOKEN', now]);
  
  // Mark station status as VOTED
  var sSheet = getSheet(SHT.SESSIONS);
  var sData = sSheet.getDataRange().getValues();
  var found = false;
  for (var i = 1; i < sData.length; i++) {
    if (String(sData[i][0]) === String(stationId)) {
      sSheet.getRange(i + 1, 2, 1, 2).setValues([['VOTED', now]]);
      found = true;
      break;
    }
  }
  if (!found) {
    sSheet.appendRow([stationId, 'VOTED', now]);
  }
  
  // Update statistics cache instantly in-memory!
  updateCachedStats('VOTE', { stationId: stationId || 'Station 1', candidateId: candidateId });
  
  logActivity('VOTE', 'Suara masuk di ' + (stationId || 'Station 1'), { candidateId: candidateId });
  return { success: true, message: 'Suara Anda berhasil dicatat!' };
}

// ================================================================
// ADMIN DASHBOARD DATA & STATISTICS
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
    endTime: statusInfo.endTime
  };
}

function getStatistics() {
  // Try cache first (120s TTL) — mutated instantly on votes & session updates for ultra-fast response
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
    var cid = String(vData[i][1]);
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
  var stationsRes = getAllStations();
  
  var result = {
    success: true,
    totalVotes: totalVotes,
    breakdown: breakdown,
    electionStatus: statusInfo.status,
    title: statusInfo.title,
    stations: stationsRes.stations
  };
  
  // Cache for 120 seconds
  try { cache.put('statistics_cache', JSON.stringify(result), 120); } catch(e) {}
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