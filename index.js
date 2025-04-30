import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { logUnanswered, isUnrecognizedResponse } from "./log_unanswered.js";
import { faq } from "./faq.js";
dotenv.config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const USEDESK_API_TOKEN = process.env.USEDESK_API_TOKEN;
const USEDESK_USER_ID = process.env.USEDESK_USER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLIENT_ID_LIMITED = "175888649";

console.log("\n🧪 Переменные окружения:");
console.log("USEDESK_API_TOKEN:", USEDESK_API_TOKEN ? "✅" : "❌ NOT SET");
console.log("USEDESK_USER_ID:", USEDESK_USER_ID ? "✅" : "❌ NOT SET");
console.log("GEMINI_API_KEY:", GEMINI_API_KEY ? "✅" : "❌ NOT SET");
console.log("📚 Загружено FAQ:", Array.isArray(faq) ? faq.length : "⚠️ Не массив");

const systemPrompt = `Ты — агент клиентской поддержки сервиса Payda ЭДО. Отвечай лаконично, вежливо и по делу. Используй разговорный, но профессиональный стиль. Ниже — основные вопросы:

1. Сколько стоят услуги? — 500 тг в месяц.
2. Как сменить провайдера? — Напишите в ЯндексПро: «Хочу перейти в Payda ЭДО» и укажите ИИН.
3. Где подписать документы? — На https://taxi.edo.kz.
4. Когда будут готовы документы? — С 8 по 15 число каждого месяца.
5. Что делать, если документы не пришли? — Убедитесь, что выбрали нас в ЯндексПро и зарегистрировались.
6. Как узнать, кто мой провайдер? — Напишите в ЯндексПро.
7. Что если не пришла смс? — Обратитесь в поддержку.
8. Как узнать, подписаны ли документы? — Зайдите на сайт и проверьте раздел «Документы».
9. Как оплатить? — Через Kaspi, кнопка появляется на сайте.
10. Кто видит мои документы? — Только вы и ваш провайдер.

Если ответа нет — попробуй найти его в дополнительной базе ниже. Если и там ничего — предложи обратиться к оператору.`;

function buildExtendedPrompt(faq, userMessage) {
  let block = "📦 Дополнительная база вопросов и ответов:\n";
  if (Array.isArray(faq)) {
    faq.forEach((item, i) => {
      block += "Q: " + item.question + "\nA: " + item.answer + "\n\n";
      if (item.aliases && item.aliases.length > 0) {
        item.aliases.forEach(alias => {
          block += "Q: " + alias + "\nA: " + item.answer + "\n\n";
        });
      }
    });
  }
  block += "Если и среди этих вопросов нет ответа — отправь к оператору.\n\nВопрос клиента: \"" + userMessage + "\"\nОтвет:";
  return block;
}

async function updateTicketStatus(ticketId, status, clientName) {
  try {
    const response = await fetch("https://api.usedesk.ru/update/ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: USEDESK_API_TOKEN,
        ticket_id: ticketId,
        status: String(status) // <== тут ключ 'status', не 'status_id'
      })
    });
    const result = await response.json();
    console.log(`🎯 Клиент: ${clientName} | Статус тикета #${ticketId} → ${status}`);
  } catch (err) {
    console.error("❌ Ошибка обновления статуса тикета:", err);
  }
}

function isAskingClarification(answer) {
  const clarifiers = [ "уточните",  "что именно", "можете уточнить", "не совсем понял", "уточните, пожалуйста", "могли бы пояснить", "не могли бы уточнить", "что именно вас интересует", "могли бы подробнее", "не совсем ясно", "напишите подробнее", "чем могу помочь?"];
  return clarifiers.some(word => answer.toLowerCase().includes(word));
}

app.post("/", async (req, res) => {
  const data = req.body;
  if (!data || !data.text || data.from !== "client") return res.sendStatus(200);
  if (data.client_id != CLIENT_ID_LIMITED) return res.sendStatus(200);
  if (data.ticket?.assignee_id !== null || data.ticket?.group !== null) {
    return res.sendStatus(200);
  }

  const chat_id = data.chat_id;
  const message = data.text;
  const ticket_id = data.ticket?.id;
  const client_name = data.client?.name || "Неизвестно";
  console.log("🚀 Получено сообщение:", message);

  const fullPrompt = systemPrompt + "\n\n" + buildExtendedPrompt(faq, message);
  let aiAnswer = "Извините, не смог придумать ответ 😅";
  let isUnrecognized = false;

  try {
    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: fullPrompt }] }
          ]
        })
      }
    );
    const geminiData = await geminiRes.json();
    aiAnswer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || aiAnswer;
    console.log("🤖 Ответ от Gemini:", aiAnswer);

    if (isUnrecognizedResponse(aiAnswer)) {
      isUnrecognized = true;
      logUnanswered(message, data.client_id);
      aiAnswer = "К этому вопросу подключится наш менеджер, пожалуйста, ожидайте 🙌";

      try {
        await fetch("https://api.usedesk.ru/chat/changeAssignee", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_token: USEDESK_API_TOKEN,
            chat_id: chat_id,
            user_id: 293758
          })
        });
        console.log(`🔄 Менеджер назначен клиенту: ${client_name}`);
      } catch (err) {
        console.error("❌ Ошибка назначения менеджера:", err);
      }
    }
  } catch (err) {
    console.error("❌ Ошибка Gemini:", err);
  }

  try {
    await fetch("https://api.usedesk.ru/chat/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: USEDESK_API_TOKEN,
        chat_id,
        user_id: USEDESK_USER_ID,
        text: aiAnswer
      })
    });
    console.log("✅ Ответ отправлен клиенту");
  } catch (err) {
    console.error("❌ Ошибка отправки в Usedesk:", err);
  }

  if (ticket_id && !isUnrecognized) {
    const status = isAskingClarification(aiAnswer) ? 6 : 2;
    await updateTicketStatus(ticket_id, status, client_name);
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`✅ Сервер с ИИ подключен и слушает 🚀 (порт ${PORT})`);
});
