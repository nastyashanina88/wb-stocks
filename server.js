const express = require("express");
const path = require("path");
const { fetchStocks, mapRows, ALERT_THRESHOLD } = require("./stocks");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/api/stocks", async (req, res) => {
  try {
    const stocks = await fetchStocks();
    const rows = mapRows(stocks);
    res.json({ rows, threshold: ALERT_THRESHOLD });
  } catch (err) {
    console.error("Ошибка загрузки остатков:", err.message);
    res.status(500).json({ error: "Не удалось загрузить остатки" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Дашборд запущен: http://localhost:${PORT}`);
});
