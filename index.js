import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const USEDESK_API_TOKEN = "12ff4f2af60aee0fe6869cec6e2c8401df7980b7";
const OPERATOR_USER_ID = 293758;
const TEST_CLIENT_ID = 175888649; // ← ТВОЙ client_id, только тебе отвечаем

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const { from, text: messageText, chat_id: chatId, client_id: incomingClientId } = req.body;

  // Базовые фильтры
  if (from !== "client" || !chatId || !messageText) return;

  // Ограничение только на твой client_id
  if (incomingClientId !== TEST_CLIENT_ID) {
    console.log(`⛔ Сообщение не от тебя (client_id: ${incomingClientId}), пропущено.`);
    return;
  }

  try {
    await fetch("https://api.usedesk.ru/chat/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: USEDESK_API_TOKEN,
        chat_id: chatId,
        user_id: OPERATOR_USER_ID,
        text: "Yeap, бро! Ответ получен только тобой 🤫"
      })
    });
  } catch (err) {
    console.error("❌ Ошибка при отправке:", err.message);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Сервер запущен и слушает только тебя 🤝");
});
