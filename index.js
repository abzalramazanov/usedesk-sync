import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// Константы
const TEST_CLIENT_ID = 175888649; // Твой client_id для тестов
const USEDESK_API_TOKEN = '12ff4f2af60aee0fe6869cec6e2c8401df7980b7'; // Твой токен
const OPERATOR_USER_ID = 293758; // Твой ID оператора в UseDesk

app.post("/webhook", async (req, res) => {
  console.log("🚀 Получено сообщение от UseDesk:");
  console.log(JSON.stringify(req.body, null, 2));

  res.sendStatus(200); // Сразу отвечаем, чтобы UseDesk не ждал

  const messageText = req.body.text;
  const clientId = req.body.client_id;
  const channelId = req.body.ticket?.channel_id || req.body.channel_id;
  const chatId = req.body.chat_id;
  const ticketId = req.body.ticket?.id;

  if (!messageText || !clientId) {
    console.log("❗ Пропущены обязательные поля (нет текста или client_id)");
    return;
  }

  if (clientId !== TEST_CLIENT_ID) {
    console.log(`⚠️ Сообщение от другого клиента (${clientId}), пропускаем`);
    return;
  }

  try {
    const replyText = "Привет! Это автоматический ответ через правильный канал! 🤖";

    if (chatId) {
      // Это живой чат (WhatsApp, Webchat и т.д.)
      console.log("💬 Обнаружен chat_id, шлем ответ в ЧАТ");

      const response = await fetch("https://api.usedesk.ru/create/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_token: USEDESK_API_TOKEN,
          client_id: clientId,
          channel_id: channelId,
          from: "user",
          user_id: OPERATOR_USER_ID,
          type: "question",
          message: replyText
        })
      });

      const data = await response.json();
      console.log(`✅ Ответ отправлен в ЧАТ WhatsApp клиенту ${clientId}:`, data);

    } else if (ticketId) {
      // Это обычный тикет (например email)
      console.log("📩 Обнаружен ticket_id, шлем комментарий в тикет");

      const response = await fetch("https://api.usedesk.ru/create/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_token: USEDESK_API_TOKEN,
          ticket_id: ticketId,
          message: replyText
        })
      });

      const data = await response.json();
      console.log(`✅ Ответ добавлен в ТИКЕТ ${ticketId}:`, data);

    } else {
      console.log("⚠️ Не обнаружено ни chat_id, ни ticket_id — ничего не отправляем");
    }

  } catch (error) {
    console.error("❌ Ошибка при отправке ответа:", error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Вебхук сервер запущен на порту", PORT));
