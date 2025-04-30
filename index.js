// index.js
import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import Fuse from "fuse.js";
import faqList from "./faq.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const USEDESK_API_TOKEN = process.env.USEDESK_API_TOKEN;
const USEDESK_USER_ID = process.env.USEDESK_USER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TEST_CLIENT_ID = "175888649"; // Меняй при необходимости

// Настройка поиска по локальной базе
const fuse = new Fuse(faqList, {
  keys: ["question"],
  threshold: 0.4,
});

console.log("\n\u{1F9EA} Переменные окружения:");
console.log("USEDESK_API_TOKEN:", USEDESK_API_TOKEN ? "✅" : "❌ NOT SET");
console.log("USEDESK_USER_ID:", USEDESK_USER_ID ? "✅" : "❌ NOT SET");
console.log("GEMINI_API_KEY:", GEMINI_API_KEY ? "✅" : "❌ NOT SET");

app.post("/", async (req, res) => {
  const data = req.body;
  const { chat_id, client_id, text: message } = data;

  if (!message || data.from !== "client" || client_id != TEST_CLIENT_ID) {
    console.log("⏭ Пропуск: не сообщение от клиента или не тестовый client_id");
    return res.sendStatus(200);
  }

  console.log("\u{1F680} Получено сообщение:", message);

  // 1. Поиск в FAQ
  const faqMatch = fuse.search(message.toLowerCase());
  if (faqMatch.length > 0) {
    const answer = faqMatch[0].item.answer;
    console.log("\u{1F4DA} Ответ найден в FAQ:", answer);
    await sendUsedeskMessage(chat_id, answer);
    return res.sendStatus(200);
  }

  // 2. Gemini AI
  const prompt = `Ты сотрудник поддержки Payda ЭДО. Отвечай ясно, с примерами. Если вопрос про переход от другого провайдера, расскажи пошагово.`;
  let aiAnswer = "Извините, я не понял вопрос. Пожалуйста, обратитесь к оператору.";

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: `${prompt}\n\nКлиент: ${message}` }] },
          ],
        }),
      }
    );

    const geminiData = await geminiRes.json();
    aiAnswer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || aiAnswer;
    console.log("\u2705 Ответ от Gemini отправлен в чат:", aiAnswer);
  } catch (error) {
    console.error("\u274C Ошибка Gemini:", error);
  }

  await sendUsedeskMessage(chat_id, aiAnswer);
  res.sendStatus(200);
});

async function sendUsedeskMessage(chat_id, text) {
  try {
    const response = await fetch("https://api.usedesk.ru/chat/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: USEDESK_API_TOKEN,
        chat_id,
        user_id: USEDESK_USER_ID,
        text,
      }),
    });
    const result = await response.json();
    console.log("\u2705 Ответ отправлен клиенту:", result);
  } catch (error) {
    console.error("\u274C Ошибка отправки Usedesk:", error);
  }
}

app.listen(PORT, () => {
  console.log(`✅ Сервер с ИИ подключен и слушает 🚀 (порт ${PORT})`);
});
