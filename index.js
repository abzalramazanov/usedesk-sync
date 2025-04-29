import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const TEST_CLIENT_ID = 175888649;
const USEDESK_API_TOKEN = '12ff4f2af60aee0fe6869cec6e2c8401df7980b7';

app.post("/webhook", async (req, res) => {
  console.log("🚀 Получено сообщение от UseDesk:");
  console.log(JSON.stringify(req.body, null, 2));

  res.sendStatus(200);

  const from = req.body.from;
  const messageText = req.body.text;
  const clientId = req.body.client_id;
  const chatId = req.body.chat_id;

  if (!messageText || !clientId || !chatId) {
    console.log("❗ Пропущены обязательные поля (messageText, clientId, chatId)");
    return;
  }

  if (from !== "client") {
    console.log("⚠️ Это не сообщение от клиента. Пропускаем.");
    return;
  }

  if (clientId !== TEST_CLIENT_ID) {
    console.log(`⚠️ Сообщение от другого клиента (${clientId}), игнорируем`);
    return;
  }

  try {
    const replyText = "Привет! Теперь я точно отвечаю прямо в чат, без нового тикета! 🤖";

    const response = await fetch("https://api.usedesk.ru/chat/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: USEDESK_API_TOKEN,
        chat_id: chatId,
        message: replyText,
        type: "text"
      })
    });

    const data = await response.json();
    console.log("✅ Ответ отправлен в этот же чат:", data);
  } catch (error) {
    console.error("❌ Ошибка при отправке в чат:", error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Вебхук сервер запущен на порту", PORT));
