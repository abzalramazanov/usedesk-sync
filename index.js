import express from "express";
import bodyParser from "body-parser";
const app = express();
app.use(bodyParser.json());

app.post("/", async (req, res) => {
  console.log("📨 Вебхук пришёл!");
  console.log(JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Сервер слушает порт");
});
