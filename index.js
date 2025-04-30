// index.js
import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import faqList from "./faq.js";
import Fuse from "fuse.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const USEDESK_API_TOKEN = process.env.USEDESK_API_TOKEN;
const USEDESK_USER_ID = process.env.USEDESK_USER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TEST_CLIENT_ID = "175888649"; // Только этот клиент получает ответы

console.log("\n\u{1F9EA} Переменные окружения:");
console.log("USEDESK_API_TOKEN:", USEDESK_API_TOKEN ? "✅" : "❌ NOT SET");
console.log("USEDESK_USER_ID:", USEDESK_USER_ID ? "✅" : "❌ NOT SET");
console.log("GEMINI_API_KEY:", GEMINI_API_KEY ? "✅" : "❌ NOT SET");

// Настраиваем Fuse.js
const fuse = new Fuse(faqList, {
  keys: ["question", "aliases"],
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: true
});

app.post("/", async (req, res) => {
  const data = req.body;

  if (!data || !data.text || data.from !== "client" || `${data.client_id}` !== TEST_CLIENT_ID) {
    console.log("\u26A0\uFE0F Пропущено: не сообщение от клиента или не наш client_id");
    return res.sendStatus(200);
  }

  const chat_id = data.chat_id;
  const message = data.text;
  const client_id = data.client_id;

  console.log("\u{1F680} Получено сообщение:", message);

  // Ищем в локальной базе
  const result = fuse.search(message.toLowerCase());
  let answer = result?.[0]?.item?.answer || null;

  if (answer) {
    console.log("\u{1F4DA} Ответ найден в FAQ:", answer);
  } else {
    // Иначе спрашиваем у Gemini
    const prompt = `Ты чат-бот службы поддержки. Отвечай кратко, вежливо и по делу. Если не знаешь — предложи обратиться к оператору.\n\nКлиент: ${message}`;
    answer = "Извините, я не понимаю ваш запрос.  Для уточнения, пожалуйста, обратитесь к оператору.";

    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              { role: "user", parts: [{ text: prompt }] }
            ]
          })
        }
      );

      const geminiData = await geminiRes.json();
      answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || answer;
      console.log("\u2705 Ответ от Gemini:", answer);
    } catch (error) {
      console.error("\u274C Ошибка запроса к Gemini:", error);
    }
  }

  // Отправляем ответ клиенту
  try {
    const response = await fetch("https://api.usedesk.ru/chat/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: USEDESK_API_TOKEN,
        chat_id,
        user_id: USEDESK_USER_ID,
        text: answer
      })
    });

    const result = await response.json();
    console.log("\u2705 Ответ отправлен клиенту:", result);
  } catch (error) {
    console.error("\u274C Ошибка отправки в Usedesk:", error);
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`✅ Сервер с ИИ подключен и слушает 🚀 (порт ${PORT})`);
});
