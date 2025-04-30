import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { findAnswer } from "./faq.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const USEDESK_API_TOKEN = process.env.USEDESK_API_TOKEN;
const USEDESK_USER_ID = process.env.USEDESK_USER_ID;
const ALLOWED_CLIENT_ID = "175888649"; // ← твой client_id

console.log("\n🧪 Переменные окружения:");
console.log("USEDESK_API_TOKEN:", USEDESK_API_TOKEN ? "✅" : "❌ NOT SET");
console.log("USEDESK_USER_ID:", USEDESK_USER_ID ? "✅" : "❌ NOT SET");

app.post("/", async (req, res) => {
  const data = req.body;

  if (!data || !data.text || data.from !== "client") {
    console.log("⚠️ Пропущено: не сообщение от клиента");
    return res.sendStatus(200);
  }

  const message = data.text;
  const chat_id = data.chat_id;
  const client_id = data.client_id;

  if (`${client_id}` !== ALLOWED_CLIENT_ID) {
    console.log(`🚫 Игнор: client_id ${client_id} не разрешён`);
    return res.sendStatus(200);
  }

  console.log("🚀 Получено сообщение:", message);

const faqAnswer = findAnswer(message);
if (!faqAnswer) {
  // обработка случая, когда ответ не найден
} else {
  // отправка найденного ответа
}

  console.log("📚 Ответ найден в FAQ:", faqAnswer);

  try {
    const usedeskRes = await fetch("https://api.usedesk.ru/chat/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: USEDESK_API_TOKEN,
        chat_id,
        user_id: USEDESK_USER_ID,
        text: faqAnswer
      })
    });

    const result = await usedeskRes.json();
    console.log("✅ Ответ отправлен клиенту:", result);
  } catch (err) {
    console.error("❌ Ошибка отправки сообщения:", err);
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`✅ Сервер с ИИ подключен и слушает 🚀 (порт ${PORT})`);
});
