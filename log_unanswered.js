import fs from "fs";

const path = "./unanswered_questions.json";

export function isUnrecognizedResponse(text) {
  const lowered = text.toLowerCase();
  return (
    lowered.includes("не нашёл ответа") ||
    lowered.includes("не понимаю") ||
    lowered.includes("не уверен") ||
    lowered.includes("обратитесь к оператору") ||
    lowered.includes("выйдет за рамки") ||
    lowered.includes("выходит за рамки") ||
    text.trim().length < 10
  );
}

export function logUnanswered(question, clientId = null) {
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
