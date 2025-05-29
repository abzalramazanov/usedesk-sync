require('dotenv').config();
const path = require('path');
const { syncClients } = require(path.join(__dirname, 'utils', 'syncClients'));

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
