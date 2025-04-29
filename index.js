import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// Константы
const TEST_CLIENT_ID = 175888649; // Твой client_id для тестов (из UseDesk)
const USEDESK_API_TOKEN = '12ff4f2af60aee0fe6869cec6e2c8401df7980b7';
const OPERATOR_USER_ID = 293758; // Твой оператор в UseDesk

app.post("/webhook", async (req, res) => {
  console.log("🚀 Получено сообщение от UseDesk:");
  console.log(JSON.stringify(req.body, null, 2));

  res.sendStatus(200);

  const messageText = req.body.text;
  const clientId = req.body.client_id;
  const channelId = req.body.ticket?.channel_id;

  if (!messageText || !clientId || !channelId) {
    console.log("❗ Пропущены обязательные поля в сообщении");
    return;
  }

  // Теперь проверяем только client_id
  if (clientId !== TEST_CLIENT_ID) {
    console.log(`⚠️ Сообщение от другого клиента (${clientId}), пропускаем`);
    return;
  }

  try {
    const replyText = "Привет! Ответ через client_id! 🤖";

    const response = await fetch("https://api.usedesk.ru/create/ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: USEDESK_API_TOKEN,
        client_id: clientId,
        channel_id: channelId,
        from: "user",
        user_id: OPERATOR_USER_ID,
        type: "message",
        message: replyText
      })
    });

    const data = await response.json();
    console.log(`✅ Ответ отправлен клиенту ${clientId}:`, data);
  } catch (error) {
    console.error("❌ Ошибка отправки ответа:", error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Вебхук сервер запущен на порту", PORT));
