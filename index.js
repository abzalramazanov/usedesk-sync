console.log("🧪 Переменные окружения:");
console.log("USEDESK_API_TOKEN:", process.env.USEDESK_API_TOKEN ? "✅" : "❌ NOT SET");
console.log("USEDESK_USER_ID:", process.env.USEDESK_USER_ID ? "✅" : "❌ NOT SET");
console.log("GOOGLE_CLIENT_EMAIL:", process.env.GOOGLE_CLIENT_EMAIL ? "✅" : "❌ NOT SET");
console.log("GOOGLE_PRIVATE_KEY:", process.env.GOOGLE_PRIVATE_KEY ? "✅" : "❌ NOT SET");

// index.js — основной сервер

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import Fuse from "fuse.js";
import faqList from "./faq.js";

const USEDESK_API_TOKEN = process.env.USEDESK_API_TOKEN;
const USEDESK_USER_ID = process.env.USEDESK_USER_ID;

const fuse = new Fuse(faqList, {
  keys: ["question"],
  threshold: 0.4
});

const app = express();
app.use(bodyParser.json());

app.post("/", async (req, res) => {
  const data = req.body;

  if (!data || !data.text || data.from !== "client") {
    console.log("⚠️ Пропущено: не сообщение от клиента");
    return res.sendStatus(200);
  }

  const message = data.text.toLowerCase();
  const answer = fuse.search(message)?.[0]?.item?.answer;

  if (!answer) {
    console.log("❓ Вопрос не найден в базе");
    return res.sendStatus(200);
  }

  const response = await fetch("https://api.usedesk.ru/chat/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_token: USEDESK_API_TOKEN,
      chat_id: data.chat_id,
      user_id: USEDESK_USER_ID,
      text: answer
    })
  });

  const result = await response.json();
  console.log("✅ Ответ отправлен в чат:", result);

  res.sendStatus(200);
});

app.get("/", (_, res) => {
  res.send("✅ Usedesk AI Webhook активен");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер с ИИ подключен и слушает 🚀 (порт ${PORT})`);
});
