require('dotenv').config();
const { syncClients } = require('./utils/syncClients');

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/manual-sync', async (req, res) => {
  await syncClients();
  res.send('✅ Manual sync triggered');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  syncClients(); // запуск при старте
});
