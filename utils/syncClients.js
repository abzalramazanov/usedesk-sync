// 📦 Импорты
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('../credentials.json');

// 📁 Пути
const LOCK_FILE = path.join(__dirname, '..', 'sync.lock');
const SENT_LOG_FILE = path.join(__dirname, '..', 'sent_clients.json');
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

// 🧠 Обработка имени
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

// 📜 Работа с логами
function loadSentClients() {
  try {
    if (!fs.existsSync(SENT_LOG_FILE)) return [];
    const raw = fs.readFileSync(SENT_LOG_FILE);
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveSentClient(bin_iin, created_local) {
  try {
    const list = loadSentClients();
    list.push({ bin_iin, created_local });
    fs.writeFileSync(SENT_LOG_FILE, JSON.stringify(list, null, 2));
  } catch {}
}

function alreadySent(bin_iin, sentList) {
  return sentList.some(c => c.bin_iin === bin_iin);
}

// 📅 Работа с датой в Meta
async function getLastLocal(doc) {
  try {
    const metaSheet = doc.sheetsByTitle['Meta'];
    if (!metaSheet) return DEFAULT_LOCAL;
    await metaSheet.loadCells('A1');
    const cell = metaSheet.getCell(0, 0);
    const value = cell.value?.toString().trim();
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return DEFAULT_LOCAL;
    return value;
  } catch {
    return DEFAULT_LOCAL;
  }
}

async function saveLastLocal(doc, timestampStr) {
  try {
    let metaSheet = doc.sheetsByTitle['Meta'];
    if (!metaSheet) metaSheet = await doc.addSheet({ title: 'Meta', headerValues: [] });
    await metaSheet.loadCells('A1');
    const cell = metaSheet.getCell(0, 0);
    cell.value = timestampStr;
    await metaSheet.saveUpdatedCells();
  } catch {}
}

// 🚀 Основной запуск
async function syncClients() {
  if (isLocked()) return;
  lock();

  const doc = new GoogleSpreadsheet(SHEET_ID);
  try {
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
  } catch {
    unlock();
    return;
  }

  let rows = [];
  try {
    const sheet = doc.sheetsByIndex[0];
    rows = await sheet.getRows();
  } catch {
    unlock();
    return;
  }

  const lastLocal = await getLastLocal(doc);
  const sentClients = loadSentClients();

  // ✅ Сравнение дат через Date, а не строки
  const newRows = rows.filter((row) => {
    if (!row.created_local) return false;
    const rowStr = row.created_local.toString().trim();
    const rowTime = new Date(rowStr.replace(' ', 'T'));
    const lastTime = new Date(lastLocal.replace(' ', 'T'));
    const isNew = rowTime > lastTime;

    console.log(`🔍 Сравниваю row=${rowStr} с lastLocal=${lastLocal} → ${isNew}`);
    return isNew;
  });

  console.log(`📌 Новых строк после ${lastLocal}: ${newRows.length}`);
  if (newRows.length === 0) {
    console.log('ℹ️ Новых клиентов нет — выходим.');
    unlock();
    return;
  }

  for (const row of newRows) {
    const phone = String(row.phone_number || '').replace(/\D/g, '');
    const shortPhone = phone.startsWith('7') ? phone.slice(1) : phone;
    const bin_iin = row.bin_iin || '';
    const name = 'ИИН ' + bin_iin;
    const createdLocal = row.created_local?.toString().trim();
    const fullName = row.full_name || '';
    const position = extractPositionName(fullName);

    if (!phone || !bin_iin || !createdLocal || alreadySent(bin_iin, sentClients)) continue;

    let clientId = '';
    let tickets = [];
    try {
      const searchResp = await axios.post('https://api.usedesk.ru/clients', {
        api_token: process.env.USEDESK_TOKEN,
        query: shortPhone,
        search_type: 'partial_match'
      });

      if (Array.isArray(searchResp.data) && searchResp.data.length > 0) {
        const client = searchResp.data[0];
        clientId = client.id;
        tickets = client.tickets || [];

        await axios.post('https://api.usedesk.ru/update/client', {
          api_token: process.env.USEDESK_TOKEN,
          client_id: clientId,
          phone,
          name,
          position
        });
        console.log(`🔄 Клиент обновлён: id ${clientId}`);
      } else {
        const clientResp = await axios.post('https://api.usedesk.ru/create/client', {
          api_token: process.env.USEDESK_TOKEN,
          phone,
          name,
          position
        });
        clientId = clientResp.data.client_id || '';
        console.log(`🆕 Клиент создан: id ${clientId}`);
      }

      await sleep(2000);

      let sendNewTicket = true;
      if (tickets.length > 0) {
        const latestTicketId = Math.max(...tickets);
        const ticketStatusResp = await axios.post('https://api.usedesk.ru/ticket', {
          api_token: process.env.USEDESK_TOKEN,
          ticket_id: latestTicketId
        });

        const status = ticketStatusResp.data.ticket.status_id;
        console.log(`🎯 Последний тикет ${latestTicketId} статус: ${status}`);

        if (status !== 3) {
          console.log(`📎 Обновляем открытый тикет ${latestTicketId}`);

          await axios.post('https://api.usedesk.ru/update/ticket', {
            api_token: process.env.USEDESK_TOKEN,
            ticket_id: latestTicketId,
            subject: 'OscarSigmaRegistration',
            tag: 'OscarSigmaRegistration'
          });

          await axios.post('https://api.usedesk.ru/create/comment', {
            api_token: process.env.USEDESK_TOKEN,
            ticket_id: latestTicketId,
            message: 'OscarSigmaRegistration',
            type: 'public',
            from: 'client'
          });

          sendNewTicket = false;
        }
      }

      if (sendNewTicket) {
        const ticketResp = await axios.post('https://api.usedesk.ru/create/ticket', {
          api_token: process.env.USEDESK_TOKEN,
          tag: 'OscarSigmaRegistration',
          message: 'new registration :D',
          subject: 'OscarSigmaRegistration',
          channel_id: '63818',
          from: 'client',
          client_id: clientId
        });

        const data = ticketResp.data;
        if (data.message_status === 'delivered') {
          console.log(`✅ Новый тикет доставлен: ${data.ticket_id}`);
        } else {
          console.log(`⚠️ Новый тикет не доставлен, пытаемся ещё раз...`);
          await axios.post('https://api.usedesk.ru/update/ticket', {
            api_token: process.env.USEDESK_TOKEN,
            ticket_id: data.ticket_id,
            status: 4
          });

          await sleep(2000);
          const retryResp = await axios.post('https://api.usedesk.ru/create/ticket', {
            api_token: process.env.USEDESK_TOKEN,
            tag: 'OscarSigmaRegistration',
            message: 'new registration :D',
            subject: 'OscarSigmaRegistration',
            channel_id: '63818',
            from: 'client',
            client_id: clientId
          });

          if (retryResp.data.message_status === 'delivered') {
            console.log(`✅ Повторный тикет доставлен: ${retryResp.data.ticket_id}`);
          } else {
            console.log(`❌ И повторный тикет не доставлен.`);
          }
        }
      }

      saveSentClient(bin_iin, createdLocal);
      await saveLastLocal(doc, createdLocal);
    } catch (err) {
      console.log('❌ Ошибка:', err.message);
    }
  }

  unlock();
}

syncClients();
