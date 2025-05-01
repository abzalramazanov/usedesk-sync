import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fs from "fs/promises";
import fetch from "node-fetch";

dotenv.config();
const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const HISTORY_FILE = "./chat_history.json";

// --------- ХРАНЕНИЕ ПЕРЕПИСКИ ---------
async function appendMessage(chatId, message) {
  let data = {};
  try {
    const file = await fs.readFile(HISTORY_FILE, "utf-8");
    data = JSON.parse(file);
  } catch (_) {}

  if (!data[chatId]) data[chatId] = [];
  data[chatId].push(message);
  if (data[chatId].length > 10) {
    data[chatId] = data[chatId].slice(-10); // сохраняем только последние 10
  }

  await fs.writeFile(HISTORY_FILE, JSON.stringify(data, null, 2));
}

async function getLastMessages(chatId) {
  try {
    const file = await fs.readFile(HISTORY_FILE, "utf-8");
    const data = JSON.parse(file);
    return data[chatId] || [];
  } catch (_) {
    return [];
  }
}

// --------- ГЕНЕРАЦИЯ ОТВЕТА ---------
async function generateAnswer(prompt) {
  const geminiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + process.env.GEMINI_API_KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    }),
  });

  const json = await geminiRes.json();
  return json?.candidates?.[0]?.content?.parts?.[0]?.text || "Извините, сейчас не могу ответить.";
}

// --------- ОТПРАВКА В USEDESK ---------
async function sendToUseDesk(ticketId, message) {
  await fetch("https://api.usedesk.ru/chat/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_token: process.env.USEDESK_API_KEY,
      ticket_id: ticketId,
      message: message
    })
  });
}

// --------- ОБРАБОТКА ВХОДЯЩЕГО СООБЩЕНИЯ ---------
app.post("/incoming", async (req, res) => {
  const body = req.body;

  const chatId = body.chat_id;
  const ticketId = body.ticket?.id;
  const text = body.text;
  const author = body.from === "client" ? "Клиент" : "Агент";

  if (!chatId || !text) return res.sendStatus(400);

  await appendMessage(chatId, `${author}: ${text}`);

  if (body.from === "client") {
    const context = await getLastMessages(chatId);
    const prompt = `Ты агент поддержки Payda. Вот история чата:\n${context.join("\n")}\n\nОтветь клиенту вежливо, кратко и с лёгкими эмоциями.`;

    const reply = await generateAnswer(prompt);
    await sendToUseDesk(ticketId, reply);
  }

  res.sendStatus(200);
});

// --------- СТАРТ ---------
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
