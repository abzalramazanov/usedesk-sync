// loadFaqFromSheets.js
import { google } from "googleapis";
import { readFileSync } from "fs";
import Fuse from "fuse.js";

const SHEET_ID = "1oyU3RMzRzIETL5c5PAKN1MumxYrFLN1IpLjVd1lA9Cg";
const SHEET_RANGE = "Лист1!A2:B"; // Пропускаем заголовок

let fuse = null;

export async function loadFaq() {
  const auth = new google.auth.GoogleAuth({
   credentials: {
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
}),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });

  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE
  });

  const rows = res.data.values;
  if (!rows || rows.length === 0) throw new Error("Таблица пуста или не найдена");

  const faqList = rows.map(([question, answer]) => ({ question, answer }));

  fuse = new Fuse(faqList, {
    keys: ["question"],
    threshold: 0.4
  });

  console.log(`✅ Загружено ${faqList.length} FAQ из Google Таблицы`);
}

export function findFaqAnswer(message) {
  if (!fuse) return null;
  const result = fuse.search(message.toLowerCase());
  return result?.[0]?.item?.answer || null;
}
