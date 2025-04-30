// log_unanswered.js
import fs from "fs";

export function isUnrecognizedResponse(text) {
  const lowered = text.toLowerCase();
  return (
    lowered.includes("не нашёл ответа") ||
    lowered.includes("не знаю") ||
    lowered.includes("не понимаю") ||
    lowered.includes("не могу помочь") ||
    lowered.includes("обратитесь") ||
    lowered.includes("оператор") ||
    lowered.includes("не входит в мои функции") ||
    lowered.includes("это выходит за рамки") ||
    lowered.includes("информации нет") ||
    lowered.includes("не обладаю") ||
    text.trim().length < 10
  );
}

export function logUnanswered(question, clientId = null) {
  const path = "./unanswered_questions.json";
  const entry = {
    question,
    clientId,
    timestamp: new Date().toISOString(),
  };

  let log = [];
  if (fs.existsSync(path)) {
    try {
      log = JSON.parse(fs.readFileSync(path, "utf8"));
    } catch (e) {
      console.error("Ошибка чтения unanswered_questions.json:", e.message);
    }
  }

  log.push(entry);
  fs.writeFileSync(path, JSON.stringify(log, null, 2));
}
