
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

const systemPrompt = `
Ты — агент клиентской поддержки сервиса Payda ЭДО. Отвечай лаконично, вежливо и по делу. Используй разговорный, но профессиональный стиль. Основывайся на следующих вопросах и ответах:

1. Сколько стоят услуги? — Услуги стоят 500 тг в месяц.
2. Как сменить провайдера? — Напишите в поддержку ЯндексПро: «Хочу перейти в Payda ЭДО» и укажите ИИН.
3. Где подписать документы? — Документы доступны на сайте https://taxi.edo.kz/.
4. Когда будут готовы документы? — Обычно с 8 по 15 число каждого месяца.
5. Что делать, если документы не пришли? — Проверьте, выбрали ли вы нас в ЯндексПро и зарегистрированы ли на сайте.
6. Как проверить, кто мой текущий провайдер? — Напишите в поддержку ЯндексПро.
7. Когда можно перейти? — В любой момент, но документы появятся только с 8 числа следующего месяца.
8. Нужно ли платить заранее? — Нет, кнопка оплаты появится перед подписанием документов.
9. Где будет приходить уведомление? — Мы отправим смс на номер телефона.
10. Что, если не приходит смс? — Проверьте номер или обратитесь в поддержку Payda.
11. Как узнать, подписаны ли мои документы? — Зайдите на сайт https://taxi.edo.kz/ и авторизуйтесь.
12. Можно ли использовать Kaspi для оплаты? — Да, кнопка оплаты через Kaspi будет доступна на сайте.
13. Какие документы нужно подписывать? — АВР и ЭСФ, каждый месяц.
14. А если не подписать документы? — Это может повлиять на расчёты с Яндексом, рекомендуем подписывать.
15. Сколько времени занимает переход? — Обычно 1-2 дня после смены провайдера в ЯндексПро.
16. Кто такой Payda? — Мы провайдер электронного документооборота.
17. Чем вы отличаетесь от других? — У нас удобный сайт, поддержка и быстрая обработка документов.
18. Я раньше был у Бухты, как перейти? — Напишите в поддержку ЯндексПро о переходе на Payda ЭДО, укажите ИИН и подтвердите. С 8 числа вы у нас.
19. Когда можно будет подписать документы? — С 8 по 15 число, каждый месяц.
20. Где можно скачать документы? — После авторизации на сайте https://taxi.edo.kz/.
21. А где я могу задать вопрос? — В этом чате или по контактам поддержки.
22. У меня ошибка на сайте — Обратитесь к оператору, мы решим всё.
23. Не вижу кнопку оплаты — Кнопка появляется только в период подписания.
24. Почему я не вижу документы? — Проверьте, выбрали ли нас в ЯндексПро и прошли ли регистрацию.
25. Я выбрал провайдера, что дальше? — Ждите смс от нас с 8 числа.
26. Я уже зарегистрировался — Отлично! Ждите документы с 8 числа.
27. Где инструкция? — На сайте https://payda.usedocs.com или спросите в чате.
28. Можно ли перейти в середине месяца? — Да, но документы будут с 8 числа следующего месяца.
29. Я не успел подписать в прошлом месяце — Обратитесь к оператору, возможно повторное подписание.
30. Кто видит мои документы? — Только вы и ваш провайдер.

Если не нашёл нужного ответа в этом списке — постарайся найти похожий вопрос в дополнительной базе ниже.
`;

function buildExtendedPrompt(faq, userMessage) {
  let block = \`Дополнительная база вопросов и ответов:\n`;
  faq.forEach((item, i) => {
    block += \`\${i + 1}. Вопрос: \${item.question}\nОтвет: \${item.answer}\n\n`;
    if (item.aliases && item.aliases.length > 0) {
      item.aliases.forEach(alias => {
        block += \`Альтернативный вопрос: \${alias}\nОтвет: \${item.answer}\n\n`;
      });
    }
  });
  block += \`Если и среди этих вопросов нет точного совпадения — честно скажи, что не знаешь и предложи обратиться к оператору.\n\nВопрос клиента: "\${userMessage}"\nОтвет:`;
  return block;
}

app.post("/", async (req, res) => {
  const data = req.body;
  if (!data || !data.text || data.from !== "client") return res.sendStatus(200);
  if (data.client_id != CLIENT_ID_LIMITED) return res.sendStatus(200);

  const chat_id = data.chat_id;
  const message = data.text;
  console.log("🚀 Получено сообщение:", message);

  const fullPrompt = \`\${systemPrompt}\n\n\${buildExtendedPrompt(faq, message)}`;

  let aiAnswer = "Извините, не смог придумать ответ 😅";

  try {
    const geminiRes = await fetch(
      \`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=\${GEMINI_API_KEY}\`,
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
      console.log("📌 Ответ не распознан — логируем.");
      logUnanswered(message, data.client_id);
    }

  } catch (err) {
    console.error("❌ Ошибка Gemini:", err);
  }

  try {
    const usedeskRes = await fetch("https://api.usedesk.ru/chat/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: USEDESK_API_TOKEN,
        chat_id,
        user_id: USEDESK_USER_ID,
        text: aiAnswer
      })
    });

    const usedeskData = await usedeskRes.json();
    console.log("✅ Ответ отправлен клиенту:", usedeskData);
  } catch (err) {
    console.error("❌ Ошибка отправки в Usedesk:", err);
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(\`✅ Сервер работает на порту \${PORT}\`);
});
