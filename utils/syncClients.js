const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('../credentials.json');

const TIMESTAMP_FILE = path.join(__dirname, '..', 'last_timestamp.txt');
const DEFAULT_TIMESTAMP = 1748512200000; // 2025-05-29 12:30:00 Asia/Almaty in ms
const SHEET_ID = '1VNxBh-zd5r8livxK--rjgPk-E0o_fBtZQALqRKoYiY0';

async function getLastTimestamp() {
  try {
    if (fs.existsSync(TIMESTAMP_FILE)) {
      return parseInt(fs.readFileSync(TIMESTAMP_FILE, 'utf8').trim());
    } else {
      return DEFAULT_TIMESTAMP;
    }
  } catch (err) {
    console.error('❌ Не удалось прочитать timestamp:', err.message);
    return DEFAULT_TIMESTAMP;
  }
}

async function saveLastTimestamp(timestamp) {
  try {
    fs.writeFileSync(TIMESTAMP_FILE, timestamp.toString());
  } catch (err) {
    console.error('❌ Не удалось сохранить timestamp:', err.message);
  }
}

async function syncClients() {
  const doc = new GoogleSpreadsheet(SHEET_ID);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  const rows = await sheet.getRows();

  const lastTimestamp = await getLastTimestamp();
  console.log(`📌 Обработка клиентов после: ${lastTimestamp}`);

  const newRows = rows.filter(row => {
    const created = parseInt(row.created);
    return created > lastTimestamp;
  });

  console.log(`🔍 Найдено новых клиентов: ${newRows.length}`);

  let createdCount = 0;
  let skippedCount = 0;
  let latestTimestamp = lastTimestamp;

  for (const row of newRows) {
    const phone = String(row.phone_number).replace(/\D/g, '');
    const name = 'ИИН ' + row.bin_iin;
    const created = parseInt(row.created);

    if (!phone || !name) {
      skippedCount++;
      continue;
    }

    try {
      const response = await axios.post(process.env.USEDESK_API_URL, {
        api_token: process.env.USEDESK_TOKEN,
        phone,
        name,
      });

      const clientId = response.data.client_id || '❓ unknown';
      console.log(`✅ Created client: ${name} (${phone}) → client_id: ${clientId}`);

      try {
        const ticketResponse = await axios.post("https://api.usedesk.ru/create/ticket", {
          api_token: process.env.USEDESK_TOKEN,
          tag: "OscarSigmaRegistration",
          message: "new registration :D",
          subject: "OscarSigmaRegistration",
          channel_id: "63818",
          from: "client",
          client_id: clientId
        });
        console.log(`💬 Ticket sent for client_id=${clientId}:`, ticketResponse.status);
      } catch (err) {
        console.error(`⚠️ Ticket send error for client_id=${clientId}:`, err.response?.data || err.message);
      }

      createdCount++;
      if (created > latestTimestamp) {
        latestTimestamp = created;
      }
    } catch (err) {
      console.error('❌ Error creating client:', err.response?.data || err.message);
      skippedCount++;
    }
  }

  console.log(`📊 ИТОГО: создано: ${createdCount}, пропущено: ${skippedCount}`);

  if (createdCount > 0) {
    await saveLastTimestamp(latestTimestamp);
    console.log(`🕒 Обновлён last_timestamp.txt → ${latestTimestamp}`);
  } else {
    console.log('ℹ️ last_timestamp.txt не обновлялся — новых клиентов не было');
  }
}

module.exports = { syncClients };
