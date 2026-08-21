const { google } = require('googleapis');

let sheetsClient = null;

function formatPrivateKey(key) {
  if (!key) return '';
  let k = String(key).trim();

  // If user pasted the JSON key line: "private_key": "-----BEGIN..."
  k = k.replace(/^[^{]*"private_key"\s*:\s*/i, '');
  k = k.replace(/^[^{]*private_key\s*:\s*/i, '');

  // Strip wrapping double quotes, single quotes, or backticks
  k = k.replace(/^["'`]+|["'`]+$/g, '').trim();

  // Strip trailing comma if copied from JSON file
  k = k.replace(/,$/, '').trim();
  k = k.replace(/^["'`]+|["'`]+$/g, '').trim();

  // Replace literal backslash-n, double backslash-n, and Windows newlines
  k = k.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/%0A/gi, '\n');

  // Fix space typos if present
  k = k.replace(/-----\s*BEGIN/g, '-----BEGIN').replace(/END\s*-----/g, 'END-----');

  // If missing header, wrap in standard PEM PKCS#8 header/footer
  if (!k.includes('-----BEGIN')) {
    k = `-----BEGIN PRIVATE KEY-----\n${k}\n-----END PRIVATE KEY-----`;
  }

  return k.trim();
}

function getPrivateKeyPreview(key) {
  const formatted = formatPrivateKey(key);
  if (!formatted) return 'EMPTY';
  const lines = formatted.split('\n');
  const first = lines[0] || '';
  const last = lines[lines.length - 1] || '';
  return `${first} ... (${lines.length} lines) ... ${last}`;
}

function getGoogleSheets() {
  if (sheetsClient) return sheetsClient;

  let clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !rawPrivateKey) {
    return null; // Google Sheets sync disabled if env vars not provided
  }

  clientEmail = clientEmail.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  const privateKey = formatPrivateKey(rawPrivateKey);

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
    return sheetsClient;
  } catch (err) {
    console.error('Google Sheets Auth Error:', err.message);
    return null;
  }
}

async function appendVoteToSheet(voteData) {
  const sheets = getGoogleSheets();
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!sheets || !spreadsheetId) return false;

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'VOTES!A:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          voteData.id,
          voteData.candidateId,
          voteData.stationId || 'Station 1',
          'NO_TOKEN',
          voteData.votedAt || new Date().toISOString()
        ]]
      }
    });
    return true;
  } catch (err) {
    console.error('Error appending vote to Google Sheet:', err.message);
    return false;
  }
}

async function updateStationSessionSheet(stationId, status) {
  const sheets = getGoogleSheets();
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!sheets || !spreadsheetId) return false;

  try {
    // Read current sessions sheet
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'SESSIONS!A:C'
    });

    const rows = res.data.values || [];
    let foundIndex = -1;

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === String(stationId)) {
        foundIndex = i + 1; // 1-indexed row
        break;
      }
    }

    const now = new Date().toISOString();
    if (foundIndex > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `SESSIONS!B${foundIndex}:C${foundIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[status, now]]
        }
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'SESSIONS!A:C',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[stationId, status, now]]
        }
      });
    }
    return true;
  } catch (err) {
    console.error('Error updating SESSIONS sheet:', err.message);
    return false;
  }
}

async function syncCandidateToSheet(cand) {
  const sheets = getGoogleSheets();
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!sheets || !spreadsheetId) return false;

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'CANDIDATES!A:F'
    }).catch(() => null);

    const rows = res && res.data && res.data.values ? res.data.values : [];
    let foundIndex = -1;

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(cand.id) || String(rows[i][1]) === String(cand.number)) {
        foundIndex = i + 1;
        break;
      }
    }

    const imgUrl = cand.pairImageUrl || cand.pair_image_url || '';

    if (foundIndex > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `CANDIDATES!A${foundIndex}:F${foundIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[cand.id || foundIndex, cand.number, cand.chairman, cand.vice, imgUrl, cand.active !== false]]
        }
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'CANDIDATES!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[cand.id || Date.now(), cand.number, cand.chairman, cand.vice, imgUrl, cand.active !== false]]
        }
      });
    }
    return true;
  } catch (err) {
    console.error('Error syncing candidate to Google Sheet:', err.message);
    return false;
  }
}

module.exports = {
  getGoogleSheets,
  getPrivateKeyPreview,
  appendVoteToSheet,
  updateStationSessionSheet,
  syncCandidateToSheet
};
