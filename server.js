const express = require("express");
const path = require("path");
const { fetchStocks, fetchSales, buildSalesMap, mapRows, clearCache, ALERT_THRESHOLD } = require("./stocks");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/api/stocks", async (req, res) => {
  try {
    const [stocks, sales] = await Promise.all([fetchStocks(), fetchSales()]);
    const salesMap = buildSalesMap(sales);
    const rows = mapRows(stocks, salesMap);
    res.json({ rows, threshold: ALERT_THRESHOLD, cachedAt: new Date().toISOString() });
  } catch (err) {
    console.error("Ошибка загрузки остатков:", err.message);
    res.status(500).json({ error: "Не удалось загрузить остатки" });
  }
});

app.post("/api/refresh", (req, res) => {
  clearCache();
  res.json({ ok: true });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Дашборд запущен: http://localhost:${PORT}`);
});
