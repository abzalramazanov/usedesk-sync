import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const USEDESK_API_TOKEN = '12ff4f2af60aee0fe6869cec6e2c8401df7980b7';
const OPERATOR_USER_ID = 293758;

app.post("/webhook", async (req, res) => {
  console.log("🚀 Входящий вебхук:");
  console.log(JSON.stringify(req.body, null, 2));
  res.sendStatus(200);

  const from = req.body.from;
  const messageText = req.body.text;
  const client = req.body.client;
  const ticket = req.body.ticket;
  const platform = req.body.platform; // ВАЖНО: это наш надёжный индикатор WhatsApp

  if (from !== "client") {
    console.log("⚠️ Сообщение не от клиента, пропускаем.");
    return;
  }

  if (!messageText || !client || !ticket || !platform) {
    console.log("❗ Пропущены обязательные поля");
    return;
  }

  if (platform !== "pact_whatsapp") {
    console.log(`⚠️ Канал не WhatsApp (${platform}), пропускаем.`);
    return;
  }

  const clientId = client.id;
  const clientPhone = client.phones?.[0]?.phone;
  const channelId = ticket.channel_id;

  try {
    const replyText = "Бро, теперь точно ушло в WhatsApp, всё чётко 🤖";

    const response = await fetch("https://api.usedesk.ru/create/ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: USEDESK_API_TOKEN,
        message: replyText,
        subject: "Автоответ",
        channel_id: channelId,
        from: "user",
        user_id: OPERATOR_USER_ID,
        client_id: clientId,
        client_phone: clientPhone
      })
    });

    const data = await response.json();
    console.log("✅ Ответ отправлен в WhatsApp:", data);
  } catch (err) {
    console.error("❌ Ошибка при отправке:", err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Сервер запущен на порту", PORT));
