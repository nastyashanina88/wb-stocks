require("dotenv").config();
const axios = require("axios");

const API_TOKEN = process.env.WB_API_TOKEN;
const STOCKS_URL =
  "https://statistics-api.wildberries.ru/api/v1/supplier/stocks";
const SALES_URL =
  "https://statistics-api.wildberries.ru/api/v1/supplier/sales";
const SALES_DAYS = 7;

const ALERT_THRESHOLD = 30;
const CACHE_TTL = Number(process.env.CACHE_TTL_MIN || 10) * 60 * 1000; // минуты → мс

const cache = {
  stocks: { data: null, ts: 0 },
  sales:  { data: null, ts: 0 },
};

function isFresh(entry) {
  return entry.data !== null && Date.now() - entry.ts < CACHE_TTL;
}

function getStockStatus(qty) {
  if (qty === 0) return "out_of_stock";
  if (qty <= ALERT_THRESHOLD) return "critical";
  return "in_stock";
}

async function fetchStocksFromAPI() {
  if (!API_TOKEN) {
    throw new Error("Переменная WB_API_TOKEN не задана в .env");
  }

  const allStocks = [];
  let dateFrom = "2019-01-01";

  console.log("Загрузка остатков с Wildberries...");

  while (true) {
    const { data } = await axios.get(STOCKS_URL, {
      params: { dateFrom },
      headers: { Authorization: API_TOKEN },
    });

    if (!data || data.length === 0) break;

    allStocks.push(...data);
    console.log(`  Получено записей: ${allStocks.length}`);

    if (data.length < 60000) break;

    dateFrom = data[data.length - 1].lastChangeDate;
  }

  return allStocks;
}

async function fetchStocks() {
  if (isFresh(cache.stocks)) {
    console.log("Остатки: из кэша");
    return cache.stocks.data;
  }
  const data = await fetchStocksFromAPI();
  cache.stocks = { data, ts: Date.now() };
  return data;
}

async function fetchSalesFromAPI() {
  if (!API_TOKEN) {
    throw new Error("Переменная WB_API_TOKEN не задана в .env");
  }

  const dateFrom = new Date(Date.now() - SALES_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  console.log(`Загрузка продаж за ${SALES_DAYS} дней (с ${dateFrom})...`);

  const { data } = await axios.get(SALES_URL, {
    params: { dateFrom },
    headers: { Authorization: API_TOKEN },
  });

  console.log(`  Продаж получено: ${(data || []).length}`);
  return data || [];
}

async function fetchSales() {
  if (isFresh(cache.sales)) {
    console.log("Продажи: из кэша");
    return cache.sales.data;
  }
  const data = await fetchSalesFromAPI();
  cache.sales = { data, ts: Date.now() };
  return data;
}

function clearCache() {
  cache.stocks = { data: null, ts: 0 };
  cache.sales = { data: null, ts: 0 };
  console.log("Кэш очищен");
}

function buildSalesMap(sales) {
  // Считаем кол-во продаж по ключу barcode+warehouse
  const map = {};
  for (const s of sales) {
    // saleID начинается с "S" для продаж, "R" для возвратов
    if (typeof s.saleID === "string" && s.saleID.startsWith("R")) continue;
    const key = `${s.barcode}_${s.warehouseName}`;
    map[key] = (map[key] || 0) + 1;
  }
  return map;
}

function mapRows(stocks, salesMap) {
  return stocks.map((item) => {
    const qty = item.quantity ?? 0;
    return {
      warehouse: item.warehouseName ?? "",
      supplierArticle: item.supplierArticle ?? "",
      barcode: item.barcode ?? "",
      quantity: qty,
      brand: item.brand ?? "",
      category: item.category ?? "",
      subject: item.subject ?? "",
      price: item.Price ?? "",
      lastChangeDate: item.lastChangeDate ?? "",
      stockStatus: getStockStatus(qty),
      daysUntilOOS: (() => {
        if (qty === 0) return 0;
        const key = `${item.barcode}_${item.warehouseName}`;
        const totalSold = (salesMap && salesMap[key]) || 0;
        if (totalSold === 0) return null; // нет продаж — не рассчитать
        const avgPerDay = totalSold / SALES_DAYS;
        return Math.round(qty / avgPerDay);
      })(),
    };
  });
}

function buildArticleSalesStats(sales, article) {
  const q = article.toLowerCase();
  const matched = sales.filter(
    (s) => (s.supplierArticle || "").toLowerCase() === q
  );

  let sold = 0;
  let returned = 0;
  let revenue = 0;

  for (const s of matched) {
    if (typeof s.saleID === "string" && s.saleID.startsWith("R")) {
      returned++;
    } else {
      sold++;
      revenue += s.finishedPrice || 0;
    }
  }

  return { sold, returned, revenue, totalRecords: matched.length };
}

module.exports = {
  fetchStocks, fetchSales, buildSalesMap, buildArticleSalesStats,
  getStockStatus, mapRows, clearCache, ALERT_THRESHOLD, SALES_DAYS,
};
