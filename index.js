import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const USEDESK_API_TOKEN = "12ff4f2af60aee0fe6869cec6e2c8401df7980b7";
const OPERATOR_USER_ID = 293758;
const TEST_CLIENT_ID = 175888649;
const GEMINI_API_KEY = "AIzaSyC0JmTKPnTT_nY4UZendJDIYDuKIZNy-oI";

async function getGeminiResponse(promptText) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: promptText }]
          }
        ]
      })
    });

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "Извини, не смог придумать ответ 😅";
  } catch (e) {
    console.error("❌ Ошибка Gemini:", e.message);
    return "Ошибка генерации ответа от ИИ 🤯";
  }
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const { from, text: messageText, chat_id: chatId, client_id: incomingClientId } = req.body;

  if (from !== "client" || !chatId || !messageText) return;
  if (incomingClientId !== TEST_CLIENT_ID) {
    console.log(`⛔ Не твой client_id (${incomingClientId}), пропущено.`);
    return;
  }

  try {
    const replyText = await getGeminiResponse(messageText);

    await fetch("https://api.usedesk.ru/chat/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: USEDESK_API_TOKEN,
        chat_id: chatId,
        user_id: OPERATOR_USER_ID,
        text: replyText
      })
    });

    console.log("✅ Ответ от Gemini отправлен в чат:", replyText);
  } catch (err) {
    console.error("❌ Ошибка отправки в WhatsApp:", err.message);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Сервер с ИИ-заправкой запущен 💡");
});
