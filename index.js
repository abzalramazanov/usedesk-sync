const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// Конфигурационные значения (задать в переменных окружения или конфиге)
const API_KEY = process.env.GOOGLE_API_KEY;        // API-ключ Google Gemini (PaLM) v1beta
const USEDESK_TOKEN = process.env.USEDESK_TOKEN;   // Токен авторизации UseDesk API
const ALLOWED_CLIENT_ID = process.env.ALLOWED_CLIENT_ID; // Разрешенный client_id для фильтрации

// Системный промт для модели – бот службы поддержки
const SYSTEM_PROMPT = "Ты чат-бот службы поддержки. Отвечай кратко, вежливо и по делу. " + 
                      "Если не знаешь — предлагай обратиться к оператору. Отвечай только по теме.";

app.post('/webhook', async (req, res) => {
  try {
    // Безопасность: проверяем client_id отправителя
    const clientId = req.body.client_id || req.body.message?.client_id;
    if (!clientId || clientId !== ALLOWED_CLIENT_ID) {
      // Если client_id не указан или не совпадает с разрешенным – игнорируем запрос
      return res.status(200).end();
    }

    // Извлекаем текст сообщения пользователя
    const userText = req.body.message?.text || req.body.text || req.body.message;
    if (!userText) {
      return res.status(200).end(); // нет текста для обработки
    }

    // Формируем запрос к API Google Gemini (PaLM) v1beta
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta2/models/chat/gemini-pro-001:generateMessage?key=${API_KEY}`;
    const payload = {
      prompt: {
        context: SYSTEM_PROMPT,              // системный промт с инструкцией для бота
        messages: [ { author: 'user', content: userText } ] // последнее сообщение от пользователя
      },
      temperature: 0.2,   // низкая температура для устойчивых и предсказуемых ответов
      candidateCount: 1   // запрашиваем только один вариант ответа
    };

    // Обращаемся к модели Gemini для генерации ответа
    const response = await axios.post(apiUrl, payload);
    let replyText = '';
    if (response.data && response.data.candidates && response.data.candidates.length > 0) {
      replyText = response.data.candidates[0].content?.trim();
    }

    // Если ответ пустой или отсутствует – используем текст-заглушку
    if (!replyText) {
      replyText = "Извините, мне сейчас трудно ответить. Пожалуйста, обратитесь к оператору.";
    }

    // Отправляем сгенерированный (или запасной) ответ обратно в чат через UseDesk API
    await axios.post(
      'https://api.usedesk.ru/chat/sendMessage',
      { text: replyText, client_id: clientId },
      { headers: { 'Authorization': `Bearer ${USEDESK_TOKEN}` } }
    );

    // Подтверждаем успешную обработку запроса
    return res.status(200).end();

  } catch (error) {
    console.error('Ошибка при обработке вебхука:', error);

    // В случае любой ошибки — пытаемся отправить сообщение об ошибке пользователю (fallback)
    try {
      await axios.post(
        'https://api.usedesk.ru/chat/sendMessage',
        { 
          text: "Извините, возникла техническая ошибка. Попробуйте позже или обратитесь к оператору.", 
          client_id: req.body.client_id || req.body.message?.client_id 
        },
        { headers: { 'Authorization': `Bearer ${USEDESK_TOKEN}` } }
      );
    } catch (sendError) {
      console.error('Ошибка при отправке сообщения-заглушки:', sendError);
    }

    // Завершаем обработку, вернув OK (чтобы UseDesk не делал повторных попыток)
    return res.status(200).end();
  }
});

// (При необходимости запуск сервера, если не в безсерверной среде)
// app.listen(process.env.PORT || 3000, () => console.log('Webhook service started'));
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
