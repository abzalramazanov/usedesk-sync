
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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const HISTORY_FILE = "/mnt/data/chat_history.json";
const HISTORY_TTL_MS = 8 * 60 * 60 * 1000; // 8 часов

if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, "{}");
  console.log("📁 Новый файл истории создан на диске Render (/mnt/data)");
}

const recentGreetings = {};

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
  block += `${chatHistory}\n\nВопрос клиента: "${userMessage}"\nОтвет:`;
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
  return answer.includes("?") && !answer.toLowerCase().includes("хорошо") && !answer.toLowerCase().includes("понял");
}

app.post("/", async (req, res) => {
  const data = req.body;
  console.log("🔥 Входящий запрос:", JSON.stringify(data, null, 2));

  if (!data || data.from !== "client") {
    console.log("⚠️ Пропущено: нет данных или сообщение не от клиента.");
    return res.sendStatus(200);
  }

  const chat_id = data.chat_id;
  const message = data.text || "[Без текста]";
  const ticket_id = data.ticket?.id;
  const history = await getChatHistory(chat_id);

  await appendToHistory(chat_id, `Клиент: ${message}`);

  const fullPrompt = "Ты — агент поддержки Payda ЭДО. Отвечай вежливо и кратко." +
                     "\n\n" + buildExtendedPrompt(faq, message, history);

  let aiAnswer = "Извините, не смог придумать ответ 😅";

  try {
    const geminiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: fullPrompt }] }] })
    });
    const geminiData = await geminiRes.json();
    aiAnswer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || aiAnswer;
    console.log("🤖 Ответ от Gemini:", aiAnswer);
  } catch (err) {
    console.error("❌ Ошибка Gemini:", err);
  }

  try {
    const response = await fetch("https://api.usedesk.ru/chat/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: USEDESK_API_TOKEN,
        chat_id,
        user_id: 293758,
        text: aiAnswer
      })
    });
    const result = await response.json();
    console.log("📬 Ответ от Usedesk API:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("❌ Ошибка отправки в Usedesk:", err);
  }

  await appendToHistory(chat_id, `Агент: ${aiAnswer}`);
  // Меняем статус тикета
  if (ticket_id) {
    const status = isAskingClarification(aiAnswer) ? 6 : 2;
    try {
      const response = await fetch("https://api.usedesk.ru/update/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_token: USEDESK_API_TOKEN,
          ticket_id,
          status: String(status)
        })
      });
      const result = await response.json();
      console.log(`📌 Статус тикета #${ticket_id} обновлён → ${status}`);
    } catch (err) {
      console.error("❌ Ошибка смены статуса тикета:", err);
    }
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`✅ Сервер с ИИ и Render-диском подключен 🚀 (порт ${PORT})`);
});
