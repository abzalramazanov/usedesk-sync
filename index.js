// index.js
import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const USEDESK_API_TOKEN = process.env.USEDESK_API_TOKEN;
const OPERATOR_USER_ID = parseInt(process.env.OPERATOR_USER_ID || "293758");
const TEST_CLIENT_ID = parseInt(process.env.TEST_CLIENT_ID || "175888649");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = "Ты чат-бот службы поддержки. Отвечай кратко, вежливо и по делу. Если не знаешь — предложи обратиться к оператору.";

async function getGeminiResponse(promptText) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "system",
            parts: [{ text: SYSTEM_PROMPT }]
          },
          {
            role: "user",
            parts: [{ text: promptText }]
          }
        ]
      })
    });

    const data = await response.json();
    console.log("👉 Gemini raw response:", JSON.stringify(data, null, 2));

    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "Извините, не смог придумать ответ 😅";
  } catch (e) {
    console.error("❌ Ошибка Gemini:", e.message);
    return "Произошла ошибка при генерации ответа. Обратитесь к оператору.";
  }
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const { from, text: messageText, chat_id: chatId, client_id: incomingClientId } = req.body;

  if (from !== "client" || !chatId || !messageText) return;
  if (incomingClientId !== TEST_CLIENT_ID) return;

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
    console.error("❌ Ошибка при отправке в чат:", err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Сервер с ИИ подключен и слушает 🚀"));
