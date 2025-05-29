const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('../credentials.json');

// 📁 Пути
const LOCK_FILE = path.join(__dirname, '..', 'sync.lock');
const SENT_LOG_FILE = path.join(__dirname, '..', 'sent_clients.json');

// 🧱 Настройки
const DEFAULT_LOCAL = '2025-05-29 15:45:00';
const SHEET_ID = '1VNxBh-zd5r8livxK--rjgPk-E0o_fBtZQALqRKoYiY0';

// 💤 Пауза
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 🔐 Блокировка
function isLocked() {
  return fs.existsSync(LOCK_FILE);
}
function lock() {
  fs.writeFileSync(LOCK_FILE, 'locked');
}
function unlock() {
  if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
}

// 📛 Функция извлечения имени и отчества из full_name
function extractPositionName(fullName) {
  if (!fullName) return '';
  const cleaned = fullName.replace(/ИП\s*/i, '').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 3) {
    const name = parts[1][0].toUpperCase() + parts[1].slice(1).toLowerCase();
    const patronymic = parts[2][0].toUpperCase() + parts[2].slice(1).toLowerCase();
    return `${name} ${patronymic}`;
  }
  return cleaned;
}

// 🧠 Работа с sent_clients.json
function loadSentClients() {
  try {
    if (!fs.existsSync(SENT_LOG_FILE)) return [];
    const raw = fs.readFileSync(SENT_LOG_FILE);
    return JSON.parse(raw);
  } catch (err) {
    console.error('❌ Ошибка чтения sent_clients.json:', err.message);
    return [];
  }
}

function saveSentClient(bin_iin, created_local) {
  try {
    const list = loadSentClients();
    list.push({ bin_iin, created_local });
    fs.writeFileSync(SENT_LOG_FILE, JSON.stringify(list, null, 2));
  } catch (err) {
    console.error('❌ Ошибка записи в sent_clients.json:', err.message);
  }
}

function alreadySent(bin_iin, sentList) {
  return sentList.some(c => c.bin_iin === bin_iin);
}

// 📅 Чтение даты из Google Sheets
async function getLastLocal(doc) {
  try {
    const metaSheet = doc.sheetsByTitle['Meta'];
    if (!metaSheet) {
      console.warn('⚠️ Лист Meta не найден. Используем default дату:', DEFAULT_LOCAL);
      return DEFAULT_LOCAL;
    }

    await metaSheet.loadCells('A1');
    const cell = metaSheet.getCell(0, 0);
    const value = cell.value?.toString().trim();

    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
      console.warn(`⚠️ Невалидная дата в Meta! A1: "${value}" → откатываем на default`);
      return DEFAULT_LOCAL;
    }

    console.log(`🕒 Прочитан created_local из Google Sheets: ${value}`);
    return value;
  } catch (err) {
    console.error('❌ Ошибка чтения даты из Meta:', err.message);
    return DEFAULT_LOCAL;
  }
}

async function saveLastLocal(doc, timestampStr) {
  try {
    let metaSheet = doc.sheetsByTitle['Meta'];

    if (!metaSheet) {
      console.warn('⚠️ Лист Meta не найден. Создаём...');
      metaSheet = await doc.addSheet({ title: 'Meta', headerValues: [] });
    }

    await metaSheet.loadCells('A1');
    const cell = metaSheet.getCell(0, 0);
    cell.value = timestampStr;
    await metaSheet.saveUpdatedCells();

    console.log(`💾 Сохранён created_local в Google Sheets: ${timestampStr}`);
  } catch (err) {
    console.error('❌ Ошибка записи даты в Meta:', err.message);
  }
}

// 🚀 Главная функция
async function syncClients() {
  if (isLocked()) {
    console.log('⛔ Скрипт уже выполняется. Выход.');
    return;
  }
  lock();

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
    unlock();
    return;
  }

  let rows = [];
  try {
    const sheet = doc.sheetsByIndex[0];
    rows = await sheet.getRows();
    console.log(`📊 Загружено строк из таблицы: ${rows.length}`);
  } catch (err) {
    console.error('❌ Ошибка чтения строк:', err.message);
    unlock();
    return;
  }

  const lastLocal = await getLastLocal(doc);
  const sentClients = loadSentClients();

  const newRows = rows.filter((row) => {
    const createdLocal = row.created_local?.trim();
    return createdLocal && createdLocal > lastLocal;
  });

  console.log(`📌 Новых строк после ${lastLocal}: ${newRows.length}`);

  if (newRows.length === 0) {
    console.log('ℹ️ Новых клиентов нет — выходим.');
    unlock();
    return;
  }

  let createdCount = 0;
  let skippedCount = 0;
  let latestLocal = null;

  for (const row of newRows) {
    const phone = String(row.phone_number || '').replace(/\D/g, '');
    const bin_iin = row.bin_iin || '';
    const name = 'ИИН ' + bin_iin;
    const createdLocal = row.created_local?.trim();
    const fullName = row.full_name || '';
    const position = extractPositionName(fullName);

    if (!phone || !bin_iin || !createdLocal) {
      console.warn(`⚠️ Пропущена строка. phone: ${phone}, bin_iin: ${bin_iin}, created_local: ${createdLocal}`);
      skippedCount++;
      continue;
    }

    if (alreadySent(bin_iin, sentClients)) {
      console.log(`⏭ Уже отправляли: ${bin_iin} — пропускаем`);
      skippedCount++;
      continue;
    }

    console.log(`📤 Пытаемся создать клиента: ${name}, ${phone}`);

    try {
      const response = await axios.post(process.env.USEDESK_API_URL, {
        api_token: process.env.USEDESK_TOKEN,
        phone,
        name,
        position // 👈 добавлено имя и отчество в поле должности
      });

      const clientId = response.data.client_id || '❓ unknown';
      console.log(`✅ Клиент создан → client_id: ${clientId}`);

      await sleep(1000);

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

      saveSentClient(bin_iin, createdLocal);
      latestLocal = createdLocal;
      createdCount++;
    } catch (err) {
      console.error(`❌ Ошибка создания клиента (${name}):`, err.response?.data || err.message);
      skippedCount++;
    }
  }

  console.log(`📈 Готово. Создано: ${createdCount}, Пропущено: ${skippedCount}`);
  if (latestLocal) await saveLastLocal(doc, latestLocal);
  unlock();
}

syncClients();
