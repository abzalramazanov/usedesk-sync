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

// 📥 Сохраняем переписку по chat_id
async function appendMessage(chatId, message) {
  let data = {};
  try {
    const file = await fs.readFile(HISTORY_FILE, "utf-8");
    data = JSON.parse(file);
  } catch (_) {}

  if (!data[chatId]) data[chatId] = [];
  data[chatId].push(message);
  if (data[chatId].length > 10) {
    data[chatId] = data[chatId].slice(-10); // храним последние 10
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

// 🧠 Генерация ответа от Gemini
async function generateAnswer(prompt) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    }),
  });

  const json = await res.json();
  const reply = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  return reply || "Извините, сейчас не могу ответить.";
}

// 📤 Отправка сообщения в UseDesk (по chat_id и user_id!)
async function sendToUseDesk(chatId, message) {
  const result = await fetch("https://api.usedesk.ru/chat/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_token: process.env.USEDESK_API_KEY,
      chat_id: chatId,
      user_id: parseInt(process.env.USEDESK_AGENT_ID), // обязательно!
      message: message
    })
  });

  const json = await result.json();
  console.log("📤 Ответ от UseDesk:", json);
  if (json.error) {
    console.error("❌ Ошибка отправки:", json.error);
  }
}

// 🚀 Основной вебхук
app.post("/", async (req, res) => {
  const body = req.body;
  console.log("📨 Вебхук UseDesk:", JSON.stringify(body, null, 2));

  const chatId = body.chat_id;
  const text = body.text;
  const ticketId = body.ticket?.id;
  const author = body.from === "client" ? "Клиент" : "Агент";

  if (!chatId || !text || !ticketId) return res.sendStatus(400);

  await appendMessage(chatId, `${author}: ${text}`);

  if (body.from === "client") {
    const context = await getLastMessages(chatId);
    const prompt = `Ты агент поддержки Payda. Вот история диалога:\n${context.join("\n")}\n\nОтветь клиенту лаконично, вежливо и с небольшими эмоциями.`;
    const reply = await generateAnswer(prompt);
    console.log("🤖 Ответ ИИ отправлен:", reply);
    await sendToUseDesk(chatId, reply);
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер слушает порт ${PORT}`);
});
