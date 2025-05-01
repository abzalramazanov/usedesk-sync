import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fs from "fs/promises";
import fetch from "node-fetch";

dotenv.config();
const app = express();
app.use(bodyParser.json());

const HISTORY_FILE = "./chat_history.json";

// 1. Добавляем сообщение в историю
async function appendMessage(chatId, message) {
  let data = {};
  try {
    const file = await fs.readFile(HISTORY_FILE, "utf-8");
    data = JSON.parse(file);
  } catch (_) {}

  if (!data[chatId]) data[chatId] = [];
  data[chatId].push(message);
  if (data[chatId].length > 10) {
    data[chatId] = data[chatId].slice(-10);
  }

  await fs.writeFile(HISTORY_FILE, JSON.stringify(data, null, 2));
}

// 2. Получаем последние сообщения по чату
async function getLastMessages(chatId) {
  try {
    const file = await fs.readFile(HISTORY_FILE, "utf-8");
    const data = JSON.parse(file);
    return data[chatId] || [];
  } catch (_) {
    return [];
  }
}

// 3. Отправляем запрос в Gemini
async function generateAnswer(prompt) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    }),
  });

  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.[0]?.text || "Извините, я пока не могу ответить.";
}

// 4. Отправляем ответ в UseDesk
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

// 5. Обработка входящего сообщения
app.post("/", async (req, res) => {
  const body = req.body;
  console.log("📨 Вебхук UseDesk:", JSON.stringify(body, null, 2));

  const chatId = body.chat_id;
  const ticketId = body.ticket?.id;
  const text = body.text;
  const author = body.from === "client" ? "Клиент" : "Агент";

  if (!chatId || !text || !ticketId) return res.sendStatus(400);

  await appendMessage(chatId, `${author}: ${text}`);

  if (body.from === "client") {
    const context = await getLastMessages(chatId);
    const prompt = `Ты агент поддержки Payda. Вот история переписки:\n${context.join("\n")}\n\nОтветь клиенту лаконично, вежливо и немного с эмоциями.`;
    const reply = await generateAnswer(prompt);
    await sendToUseDesk(ticketId, reply);
    console.log("🤖 Ответ ИИ отправлен:", reply);
  }

  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Сервер слушает порт");
});
