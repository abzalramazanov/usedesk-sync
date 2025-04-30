import express from "express";
import fetch from "node-fetch";
import { findFaqAnswer } from "./faq.js"; // если ты используешь Google Sheets — иначе убери
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const USEDESK_API_TOKEN = process.env.USEDESK_API_TOKEN;
const USEDESK_USER_ID = process.env.USEDESK_USER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Проверка переменных окружения
console.log("🧪 Переменные окружения:");
console.log("USEDESK_API_TOKEN:", USEDESK_API_TOKEN ? "✅" : "❌ NOT SET");
console.log("USEDESK_USER_ID:", USEDESK_USER_ID ? "✅" : "❌ NOT SET");
console.log("GOOGLE_CLIENT_EMAIL:", process.env.GOOGLE_CLIENT_EMAIL ? "✅" : "❌");
console.log("GOOGLE_PRIVATE_KEY:", process.env.GOOGLE_PRIVATE_KEY ? "✅" : "❌");

app.get("/", (req, res) => {
  res.send("✅ Usedesk AI Webhook активен");
});

app.post("/", async (req, res) => {
  console.log("🚀 Входящий вебхук:", JSON.stringify(req.body, null, 2));

  const data = req.body;

  if (!data || !data.text || data.from !== "client") {
    console.log("⚠️ Пропущено: не сообщение от клиента");
    return res.sendStatus(200);
  }

  const chatId = data.chat_id;
  const messageText = data.text;
  const clientId = data.client_id;

  if (!chatId || !clientId) {
    console.log("❗ Пропущены обязательные поля (chat_id или client_id)");
    return res.sendStatus(200);
  }

  let reply = findFaqAnswer(messageText); // Попробуем ответ из базы (если есть)

  if (!reply) {
    reply = await getGeminiReply(messageText);
  }

  if (!reply) {
    reply = "Извините, не смог придумать ответ 😅";
  }

  const sendResult = await sendToUseDesk(chatId, reply);
  console.log("✅ Ответ от Gemini отправлен в чат:", reply);
  console.log("📦 UseDesk response:", sendResult);

  res.sendStatus(200);
});

async function getGeminiReply(promptText) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Ты бот службы поддержки. Отвечай вежливо, кратко и по делу. Вот сообщение от клиента: ${promptText}`
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    const result = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return result || null;
  } catch (e) {
    console.error("❌ Ошибка запроса к Gemini:", e);
    return null;
  }
}

async function sendToUseDesk(chatId, text) {
  try {
    const res = await fetch("https://api.usedesk.ru/chat/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: USEDESK_API_TOKEN,
        chat_id: chatId,
        user_id: USEDESK_USER_ID,
        text
      })
    });
    return await res.json();
  } catch (err) {
    console.error("❌ Ошибка отправки в UseDesk:", err);
    return null;
  }
}

app.listen(PORT, () => {
  console.log(`✅ Сервер с ИИ подключен и слушает 🚀 (порт ${PORT})`);
});
