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
const ALLOWED_CLIENT_ID = "175888649"; // ← только тебе отвечаем

// Fuse.js — мягкий поиск
const fuse = new Fuse(faqList, {
  keys: ["question", "aliases"],
  threshold: 0.4,
});

console.log("\n🧪 Переменные окружения:");
console.log("USEDESK_API_TOKEN:", USEDESK_API_TOKEN ? "✅" : "❌ NOT SET");
console.log("USEDESK_USER_ID:", USEDESK_USER_ID ? "✅" : "❌ NOT SET");
console.log("GEMINI_API_KEY:", GEMINI_API_KEY ? "✅" : "❌ NOT SET");

app.post("/", async (req, res) => {
  const data = req.body;

  if (!data || !data.text || data.from !== "client") {
    console.log("⚠️ Пропущено: не сообщение от клиента");
    return res.sendStatus(200);
  }

  const { chat_id, text: message, client_id } = data;

  // Отвечаем только определённому клиенту
  if (String(client_id) !== ALLOWED_CLIENT_ID) {
    console.log("⚠️ Клиент не авторизован для автоответа");
    return res.sendStatus(200);
  }

  console.log("🚀 Получено сообщение:", message);

  // 1. Ищем в локальной базе
  const result = fuse.search(message.toLowerCase());
  const matchedAnswer = result?.[0]?.item?.answer;

  let aiAnswer = matchedAnswer || "Извините, не смог придумать ответ 😅";

  if (matchedAnswer) {
    console.log("📚 Ответ найден в FAQ:", matchedAnswer);
  } else {
    // 2. Если не нашли — идём в Gemini
    const prompt = `Ты чат-бот службы поддержки. Отвечай кратко, вежливо и по делу. Если не знаешь — предложи обратиться к оператору.\n\nКлиент: ${message}`;
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
          }),
        }
      );
      const geminiData = await geminiRes.json();
      aiAnswer =
        geminiData.candidates?.[0]?.content?.parts?.[0]?.text || aiAnswer;
      console.log("🤖 Ответ от Gemini:", aiAnswer);
    } catch (error) {
      console.error("❌ Ошибка запроса к Gemini:", error.message);
    }
  }

  // 3. Шлём ответ в чат
  try {
    const response = await fetch("https://api.usedesk.ru/chat/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: USEDESK_API_TOKEN,
        chat_id,
        user_id: USEDESK_USER_ID,
        text: aiAnswer,
      }),
    });

    const result = await response.json();
    console.log("✅ Ответ отправлен клиенту:", result);
  } catch (error) {
    console.error("❌ Ошибка отправки в Usedesk:", error.message);
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`✅ Сервер с ИИ подключен и слушает 🚀 (порт ${PORT})`);
});
