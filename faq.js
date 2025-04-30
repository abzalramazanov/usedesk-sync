import Fuse from "fuse.js";

const faqList = [
  { question: "сколько стоят услуги", answer: "Услуги стоят 500тг в месяц." },
  { question: "как сменить провайдера", answer: "Напишите в поддержку ЯндексПро: «Хочу перейти в Payda ЭДО» и укажите свой ИИН." },
  { question: "где подписать документы", answer: "Документы доступны на сайте https://taxi.edo.kz/" },
  { question: "когда будут готовы документы", answer: "Документы обычно готовы с 8 по 15 число каждого месяца." },
  { question: "что делать если документы не пришли", answer: "Убедитесь, что выбрали нас как провайдера в ЯндексПро и зарегистрировались на сайте." }
];

const fuse = new Fuse(faqList, {
  keys: ["question"],
  threshold: 0.3,
  includeScore: true
});

export function findAnswer(message) {
  if (!message || message.trim().length < 5) return null; // игнорируем слишком короткие

  const results = fuse.search(message.toLowerCase());

  if (results.length === 0) return null;

  const [best] = results;

  if (best.score > 0.25) return null; // слабое совпадение — игнорим

  return best.item.answer;
}
