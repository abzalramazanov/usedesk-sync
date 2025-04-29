// index.js
import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { loadFaq, findFaqAnswer } from "./loadFaqFromSheets.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(bodyParser.json());

// Загружаем FAQ из Google Sheets при старте
await loadFaq();

// Приём вебхуков от UseDesk
app.post("/", async (req, res) => {
  const data = req.body;

  if (!data?.ticket || !data.client_id || data.from !== "client") return res.sendStatus(200);

  const ticketId = data.ticket.id;
  const clientId = data.client_id;
  const chatId = data.chat_id;
  const messageText = data.text;

  // Ищем ответ в базе
  const faqAnswer = findFaqAnswer(messageText);

  let finalAnswer = faqAnswer;

  // Если не нашли — спрашиваем Gemini
  if (!faqAnswer) {
    try {
      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: `Ты бот службы поддержки. Отвечай кратко, вежливо и по делу. Вопрос клиента: ${messageText}` }
              ]
            }
          ]
        })
      });
      const geminiJson = await geminiRes.json();
      finalAnswer = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || "Извините, не смог придумать ответ 😅";
    } catch (e) {
      console.error("Ошибка Gemini:", e);
      finalAnswer = "Извините, не смог придумать ответ 😅";
    }
  }

  // Отправляем ответ обратно клиенту через UseDesk
  try {
    const usedeskRes = await fetch("https://api.usedesk.ru/chat/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: process.env.USEDESK_API_TOKEN,
        chat_id: chatId,
        user_id: process.env.USEDESK_USER_ID,
        text: finalAnswer
      })
    });
    const usedeskData = await usedeskRes.json();
    console.log("✅ Ответ от Gemini отправлен в чат:", finalAnswer);
  } catch (e) {
    console.error("❌ Ошибка отправки в UseDesk:", e);
  }

  res.sendStatus(200);
});

// Заглушка для Render
app.get("/", (req, res) => {
  res.send("✅ Usedesk AI Webhook активен");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер с ИИ подключен и слушает 🚀 (порт ${PORT})`);
});
