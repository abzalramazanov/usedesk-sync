// index_with_history.js
import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fs from "fs";
import fsp from "fs/promises";
import { logUnanswered, isUnrecognizedResponse } from "./log_unanswered.js";
import { faq } from "./faq.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const USEDESK_API_TOKEN = process.env.USEDESK_API_TOKEN;
const USEDESK_USER_ID = process.env.USEDESK_USER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLIENT_ID_LIMITED = "175888649";

const HISTORY_FILE = "/mnt/data/chat_history.json";
const HISTORY_TTL_MS = 8 * 60 * 60 * 1000; // 8 часов

if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, "{}");
  console.log("📁 Новый файл истории создан на диске Render (/mnt/data)");
}

const recentGreetings = {}; // key: ticket_id, value: timestamp

function buildExtendedPrompt(faq, userMessage, history = []) {
  let block = "📦 Дополнительная база вопросов и ответов:\n";
  if (Array.isArray(faq)) {
    faq.forEach((item) => {
      block += "Q: " + item.question + "\nA: " + item.answer + "\n\n";
      if (item.aliases && item.aliases.length > 0) {
        item.aliases.forEach((alias) => {
          block += "Q: " + alias + "\nA: " + item.answer + "\n\n";
        });
      }
    });
  }
  const chatHistory = history.length > 0 ? `\nИстория переписки:\n${history.map(h => h.text).join("\n")}` : "";
  block += `${chatHistory}\n\nВопрос клиента: \"${userMessage}\"\nОтвет:`;
  return block;
}

async function getChatHistory(chatId) {
  let data = {};
  try {
    const file = await fsp.readFile(HISTORY_FILE, "utf-8");
    data = JSON.parse(file);
  } catch (_) {}
  const now = Date.now();
  const history = (data[chatId] || []).filter(entry => now - entry.timestamp < HISTORY_TTL_MS);
  data[chatId] = history;
  await fsp.writeFile(HISTORY_FILE, JSON.stringify(data, null, 2));
  return history.map(entry => entry.text);
}

async function appendToHistory(chatId, message) {
  let data = {};
  try {
    const file = await fsp.readFile(HISTORY_FILE, "utf-8");
    data = JSON.parse(file);
  } catch (_) {}
  if (!data[chatId]) data[chatId] = [];
  data[chatId].push({ text: message, timestamp: Date.now() });
  if (data[chatId].length > 10) {
    data[chatId] = data[chatId].slice(-10);
  }
  await fsp.writeFile(HISTORY_FILE, JSON.stringify(data, null, 2));
  console.log(`💾 История обновлена: [${chatId}] → ${message}`);
}

function isAskingClarification(answer) {
  const clarifiers = [
    "уточните",
    "что именно",
    "можете уточнить",
    "не совсем понял",
    "уточните, пожалуйста",
    "могли бы пояснить",
    "чем могу помочь",
    "как могу помочь",
    "что вас интересует",
    "опишите подробнее",
    "напишите подробнее",
    "расскажите подробнее"
  ];
  return clarifiers.some(word => answer.toLowerCase().includes(word));
}

async function updateTicketStatus(ticketId, status, clientName) {
  try {
    const response = await fetch("https://api.usedesk.ru/update/ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: USEDESK_API_TOKEN,
        ticket_id: ticketId,
        status: String(status)
      })
    });
    await response.json();
    console.log(`🎯 Клиент: ${clientName} | Статус тикета #${ticketId} → ${status}`);
  } catch (err) {
    console.error("❌ Ошибка обновления статуса тикета:", err);
  }
}

app.post("/", async (req, res) => {
  const data = req.body;
  if (!data || !data.text || data.from !== "client") return res.sendStatus(200);
  if (data.client_id != CLIENT_ID_LIMITED) return res.sendStatus(200);

  const chat_id = data.chat_id;
  const message = data.text;
  const ticket_id = data.ticket?.id;
  const ticket_status = data.ticket?.status_id;
  const client_id = data.client?.id;
  const client_name = data.client?.name || "Неизвестно";
  console.log("🚀 Получено сообщение:", message);

  await appendToHistory(chat_id, `Клиент: ${message}`);
  const history = await getChatHistory(chat_id);

  const systemPrompt = `Ты — агент клиентской поддержки сервиса Payda ЭДО. Отвечай лаконично, вежливо и по делу. Используй разговорный, но профессиональный стиль. Ниже — основные вопросы:`;
  const fullPrompt = systemPrompt + "\n\n" + buildExtendedPrompt(faq, message, history);

  let aiAnswer = "Извините, не смог придумать ответ 😅";
  let isUnrecognized = false;

  try {
    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: fullPrompt }] }] })
      }
    );
    const geminiData = await geminiRes.json();
    aiAnswer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || aiAnswer;

    const lastGreet = recentGreetings[ticket_id];
    const now = Date.now();
    if (aiAnswer.toLowerCase().startsWith("здравствуйте") && lastGreet && now - lastGreet < 86400000) {
      aiAnswer = aiAnswer.replace(/^здравствуйте[!,.\s]*/i, "").trimStart();
    } else if (aiAnswer.toLowerCase().startsWith("здравствуйте")) {
      recentGreetings[ticket_id] = now;
    }

    console.log("🤖 Ответ от Gemini:", aiAnswer);

    if (isUnrecognizedResponse(aiAnswer)) {
      isUnrecognized = true;
      logUnanswered(message, data.client_id);
      aiAnswer = "К этому вопросу подключится наш менеджер, пожалуйста, ожидайте 🙌";

      await fetch("https://api.usedesk.ru/chat/changeAssignee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_token: USEDESK_API_TOKEN,
          chat_id,
          user_id: USEDESK_USER_ID
        })
      });
    }
  } catch (err) {
    console.error("❌ Ошибка Gemini:", err);
  }

  if (ticket_status === 3) {
    return res.sendStatus(200);
  }

  try {
    await fetch("https://api.usedesk.ru/chat/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: USEDESK_API_TOKEN,
        chat_id,
        user_id: USEDESK_USER_ID,
        text: aiAnswer
      })
    });
    await appendToHistory(chat_id, `Агент: ${aiAnswer}`);
    console.log("✅ Ответ отправлен клиенту");
  } catch (err) {
    console.error("❌ Ошибка отправки в Usedesk:", err);
  }

  if (ticket_id && !isUnrecognized) {
    const status = isAskingClarification(aiAnswer) ? 6 : 2;
    await updateTicketStatus(ticket_id, status, client_name);
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`✅ Сервер с ИИ и Render-диском подключен 🚀 (порт ${PORT})`);
});
