
const fs = require('fs');
const path = './unanswered_questions.json';

function isUnrecognizedResponse(text) {
    return (
        text.toLowerCase().includes("не нашёл ответа") ||
        text.toLowerCase().includes("не понимаю") ||
        text.trim().length < 10
    );
}

function logUnanswered(question, clientId = null) {
    const entry = {
        question,
        clientId,
        timestamp: new Date().toISOString()
    };

    let log = [];
    if (fs.existsSync(path)) {
        try {
            log = JSON.parse(fs.readFileSync(path, 'utf8'));
        } catch (e) {
            console.error("Ошибка чтения unanswered_questions.json:", e.message);
        }
    }

    log.push(entry);

    fs.writeFileSync(path, JSON.stringify(log, null, 2));
}

module.exports = {
    isUnrecognizedResponse,
    logUnanswered
};
