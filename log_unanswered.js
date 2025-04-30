
import fs from "fs";

const path = "/tmp/unanswered_questions.json"; // Render-friendly path

export function isUnrecognizedResponse(text) {
  const lowered = text.toLowerCase();
  return (
    lowered.includes("не нашёл ответа") ||
    lowered.includes("не знаю") ||
    lowered.includes("не понимаю") ||
    lowered.includes("не могу помочь") ||
    lowered.includes("обратитесь") ||
    lowered.includes("оператор") ||
    lowered.includes("выходит за рамки") ||
    lowered.includes("информации нет") ||
    lowered.includes("не обладаю") ||
    text.trim().length < 10
  );
}

export function logUnanswered(question, clientId = null) {
  const entry = {
    question,
    clientId,
    timestamp: new Date().toISOString()
  };

  let log = [];
  if (fs.existsSync(path)) {
    try {
      log = JSON.parse(fs.readFileSync(path, "utf8"));
    } catch (e) {
      console.error("❌ Ошибка чтения файла:", e.message);
    }
  }

  log.push(entry);
  fs.writeFileSync(path, JSON.stringify(log, null, 2));
  console.log("📝 Записано в лог-файл:", path);
  console.log("📂 Содержимое лога нераспознанных вопросов:");
  console.log(JSON.stringify(log, null, 2)); // 👈 это отобразится в Render Logs
}
