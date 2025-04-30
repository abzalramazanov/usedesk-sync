import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

console.log("🧪 Переменные окружения:");
console.log("USEDESK_API_TOKEN:", process.env.USEDESK_API_TOKEN ? "✅" : "❌ NOT SET");
console.log("USEDESK_USER_ID:", process.env.USEDESK_USER_ID ? "✅" : "❌ NOT SET");
console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "✅" : "❌ NOT SET");

app.get("/", (req, res) => {
  res.send("✅ Webhook активен");
});

app.post("/", async (req, res) => {
  console.log("🚀 Входящий вебхук:");
  console.dir(req.body, { depth: null });

  const data = req.body;

  // Просто подтверждаем получение
  res.sendStatus(200);

  // Проверяем, от клиента ли сообщение
  if (!data || !data.text || data.from !== "client") {
    console.log("⚠️ Пропущено: не сообщение от клиента или нет текста");
    return;
  }

  const promptText = data.text;

  // Обращение к Gemini
  let answer = "Извините, не смог придумать ответ 😅";
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: promptText }] }]
      })
    });
    const result = await response.json();
    answer = result.candidates?.[0]?.content?.parts?.[0]?.text || answer;
  } catch (err) {
    console.error("❌ Ошибка при запросе к Gemini:", err.message);
  }

  console.log(`✅ Ответ от Gemini отправлен в чат: ${answer}`);

  // Отправка ответа в UseDesk
  try {
    const chatId = data.chat_id;
    const userId = process.env.USEDESK_USER_ID;

    const usedeskRes = await fetch("https://api.usedesk.ru/chat/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: process.env.USEDESK_API_TOKEN,
        chat_id: chatId,
        user_id: userId,
        text: answer
      })
    });

    const usedeskResult = await usedeskRes.json();
    console.log("📤 Результат отправки в UseDesk:", usedeskResult);
  } catch (err) {
    console.error("❌ Ошибка при отправке в UseDesk:", err.message);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Сервер с ИИ подключен и слушает 🚀 (порт ${PORT})`);
});
