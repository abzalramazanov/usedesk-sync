import fs from "fs";
import path from "path";

const logFilePath = "/tmp/unanswered_questions.json";

export function logUnanswered(question, clientId) {
  let log = [];
  if (fs.existsSync(logFilePath)) {
    try {
      const content = fs.readFileSync(logFilePath, "utf-8");
      log = JSON.parse(content);
    } catch (err) {
      console.error("⚠️ Не удалось прочитать лог:", err);
    }
  }

  log.push({
    question,
    clientId,
    timestamp: new Date().toISOString()
  });

  try {
    fs.writeFileSync(logFilePath, JSON.stringify(log, null, 2), "utf-8");
    console.log("📝 Записано в лог-файл:", logFilePath);
    console.log("📂 Содержимое лога:\n", log);
  } catch (err) {
    console.error("❌ Ошибка записи лога:", err);
  }
}

export function isUnrecognizedResponse(answer) {
  if (!answer || answer.trim() === "") return true;

  const strongTriggers = [
    "я не знаю",
    "мне неизвестно",
    "не могу помочь",
    "вне моей компетенции",
    "затрудняюсь ответить"
  ];

  const normalized = answer.toLowerCase();
  return strongTriggers.some(trigger => normalized.includes(trigger));
}
