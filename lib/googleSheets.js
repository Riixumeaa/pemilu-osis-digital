const { google } = require('googleapis');

let sheetsClient = null;

function formatPrivateKey(key) {
  if (!key) return '';
  let k = key.trim();
  // Strip outer quotes if wrapped
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }
  // Convert literal \n to real newline characters
  k = k.replace(/\\n/g, '\n');
  return k.trim();
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

module.exports = {
  getGoogleSheets,
  appendVoteToSheet,
  updateStationSessionSheet
};
