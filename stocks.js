require("dotenv").config();
const axios = require("axios");

const API_TOKEN = process.env.WB_API_TOKEN;
const STOCKS_URL =
  "https://statistics-api.wildberries.ru/api/v1/supplier/stocks";

const ALERT_THRESHOLD = 30;

function getStockStatus(qty) {
  if (qty === 0) return "out_of_stock";
  if (qty <= ALERT_THRESHOLD) return "critical";
  return "in_stock";
}

async function fetchStocks() {
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

function mapRows(stocks) {
  return stocks.map((item) => {
    const qty = item.quantity ?? 0;
    return {
      warehouse: item.warehouseName ?? "",
      supplierArticle: item.supplierArticle ?? "",
      barcode: item.barcode ?? "",
      quantity: qty,
      brand: item.brand ?? "",
      price: item.Price ?? "",
      lastChangeDate: item.lastChangeDate ?? "",
      stockStatus: getStockStatus(qty),
    };
  });
}

module.exports = { fetchStocks, getStockStatus, mapRows, ALERT_THRESHOLD };
