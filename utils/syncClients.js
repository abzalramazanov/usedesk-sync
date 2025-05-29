const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('../credentials.json');

// 🔧 Настройки
const TIMESTAMP_FILE = path.join(__dirname, '..', 'last_timestamp.txt');
const DEFAULT_TIMESTAMP = 1748512200000; // 2025-05-29 12:30:00 Asia/Almaty
const SHEET_ID = '1VNxBh-zd5r8livxK--rjgPk-E0o_fBtZQALqRKoYiY0';

async function getLastTimestamp() {
  try {
    if (fs.existsSync(TIMESTAMP_FILE)) {
      const ts = parseInt(fs.readFileSync(TIMESTAMP_FILE, 'utf8').trim());
      console.log(`🕒 Прочитан timestamp из файла: ${ts}`);
      return ts;
    } else {
      console.log(`📁 Файл timestamp не найден. Используем default: ${DEFAULT_TIMESTAMP}`);
      return DEFAULT_TIMESTAMP;
    }
  } catch (err) {
    console.error('❌ Ошибка чтения timestamp:', err.message);
    return DEFAULT_TIMESTAMP;
  }
}

async function saveLastTimestamp(timestamp) {
  try {
    fs.writeFileSync(TIMESTAMP_FILE, timestamp.toString());
    console.log(`💾 Сохранён timestamp: ${timestamp}`);
  } catch (err) {
    console.error('❌ Ошибка записи timestamp:', err.message);
  }
}

async function syncClients() {
  console.log('🚀 syncClients стартует...');
  console.log('🌐 USEDESK_API_URL:', process.env.USEDESK_API_URL);
  console.log('🔐 USEDESK_TOKEN:', process.env.USEDESK_TOKEN ? 'есть' : 'НЕТ');
  console.log('📄 Google Sheet ID:', SHEET_ID);

  const doc = new GoogleSpreadsheet(SHEET_ID);

  try {
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
    console.log(`✅ Авторизация в Google Sheets прошла → Документ: ${doc.title}`);
  } catch (err) {
    console.error('❌ Ошибка авторизации Google Sheets:', err.message);
    return;
  }

  const sheet = doc.sheetsByIndex[0];
  let rows = [];

  try {
    rows = await sheet.getRows();
    console.log(`📊 Загружено строк из таблицы: ${rows.length}`);
  } catch (err) {
    console.error('❌ Ошибка чтения строк:', err.message);
    return;
  }

  const lastTimestamp = await getLastTimestamp();

  const newRows = rows.filter((row) => {
    const created = parseInt(row.created);
    if (isNaN(created)) {
      console.warn(`⚠️ Строка с невалидным created: ${row.created}`);
      return false;
    }
    return created > lastTimestamp;
  });

  console.log(`📌 Новых строк после ${lastTimestamp}: ${newRows.length}`);

  if (newRows.length === 0) {
    console.log('ℹ️ Новых клиентов нет — выходим.');
    return;
  }

  let createdCount = 0;
  let skippedCount = 0;
  let latestTimestamp = lastTimestamp;

  for (const row of newRows) {
    const phone = String(row.phone_number || '').replace(/\D/g, '');
    const name = 'ИИН ' + (row.bin_iin || '');
    const created = parseInt(row.created);

    if (!phone || !row.bin_iin || isNaN(created)) {
      console.warn(`⚠️ Пропущена строка. phone: ${phone}, bin_iin: ${row.bin_iin}, created: ${row.created}`);
      skippedCount++;
      continue;
    }

    console.log(`📤 Пытаемся создать клиента: ${name}, ${phone}`);

    try {
      const response = await axios.post(process.env.USEDESK_API_URL, {
        api_token: process.env.USEDESK_TOKEN,
        phone,
        name,
      });

      const clientId = response.data.client_id || '❓ unknown';
      console.log(`✅ Клиент создан → client_id: ${clientId}`);

      try {
        const ticketResp = await axios.post('https://api.usedesk.ru/create/ticket', {
          api_token: process.env.USEDESK_TOKEN,
          tag: 'OscarSigmaRegistration',
          message: 'new registration :D',
          subject: 'OscarSigmaRegistration',
          channel_id: '63818',
          from: 'client',
          client_id: clientId,
        });

        console.log(`💬 Тикет отправлен → статус ${ticketResp.status}`);
      } catch (err) {
        console.error(`❌ Ошибка отправки тикета client_id=${clientId}:`, err.response?.data || err.message);
      }

      createdCount++;
      if (created > latestTimestamp) {
        latestTimestamp = created;
      }
    } catch (err) {
      console.error(`❌ Ошибка создания клиента (${name}):`, err.response?.data || err.message);
      skippedCount++;
    }
  }

  console.log(`📈 Готово. Создано: ${createdCount}, Пропущено: ${skippedCount}`);

  if (createdCount > 0) {
    await saveLastTimestamp(latestTimestamp);
  } else {
    console.log('ℹ️ timestamp не обновлён — новых клиентов не создано.');
  }
}

syncClients();
