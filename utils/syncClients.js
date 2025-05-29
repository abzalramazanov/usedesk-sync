const { Client } = require('pg');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TIMESTAMP_FILE = path.join(__dirname, '..', 'last_timestamp.txt');
const DEFAULT_TIMESTAMP = '2025-05-01 00:00:00';

async function getLastTimestamp() {
  try {
    if (fs.existsSync(TIMESTAMP_FILE)) {
      return fs.readFileSync(TIMESTAMP_FILE, 'utf8').trim();
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
    fs.writeFileSync(TIMESTAMP_FILE, timestamp);
  } catch (err) {
    console.error('❌ Не удалось сохранить timestamp:', err.message);
  }
}

async function syncClients() {
  const db = new Client({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
  });

  try {
    await db.connect();

    const lastTimestamp = await getLastTimestamp();
    console.log(`📌 Обработка клиентов после: ${lastTimestamp}`);

    const query = \`
      SELECT phone_number, bin_iin, created
      FROM users_client
      WHERE client_category_id IS NOT NULL
        AND created > $1
      ORDER BY created ASC
    \`;

    const result = await db.query(query, [lastTimestamp]);
    const rows = result.rows;

    console.log(`🔍 Найдено новых клиентов: ${rows.length}`);

    let createdCount = 0;
    let skippedCount = 0;
    let latestTimestamp = lastTimestamp;

    for (const row of rows) {
      const phone = String(row.phone_number).replace(/\D/g, '');
      const name = 'ИИН ' + row.bin_iin;

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

        // Отправка тикета
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
        latestTimestamp = row.created > latestTimestamp ? row.created : latestTimestamp;
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

    await db.end();
  } catch (err) {
    console.error('❌ Ошибка подключения к базе:', err.stack || err.message || err);
  }
}

module.exports = { syncClients };
