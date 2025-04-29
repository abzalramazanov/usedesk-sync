import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const USEDESK_API_TOKEN = "12ff4f2af60aee0fe6869cec6e2c8401df7980b7";
const OPERATOR_USER_ID = 293758;

app.post("/webhook", async (req, res) => {
  console.log("🚀 Входящий вебхук:");
  console.log(JSON.stringify(req.body, null, 2));
  res.sendStatus(200);

  const from = req.body.from;
  const messageText = req.body.text;
  const chatId = req.body.chat_id;

  // Обработка только сообщений от клиента
  if (from !== "client") {
    console.log("⚠️ Это не клиент. Пропускаем.");
    return;
  }

  if (!chatId || !messageText) {
    console.log("❗ Нет chat_id или текста");
    return;
  }

  try {
    const replyText = "Yeap, бро! Это ответ прямо в WhatsApp чат 🤖";

    const response = await fetch("https://api.usedesk.ru/chat/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: USEDESK_API_TOKEN,
        chat_id: chatId,
        user_id: OPERATOR_USER_ID,
        text: replyText
      })
    });

    const data = await response.json();
    console.log("✅ Ответ отправлен в чат:", data);
  } catch (err) {
    console.error("❌ Ошибка при отправке:", err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Сервер запущен на порту", PORT));
