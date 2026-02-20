require("dotenv").config();
const axios = require("axios");
const ExcelJS = require("exceljs");
const path = require("path");

const API_TOKEN = process.env.WB_API_TOKEN;
const STOCKS_URL =
  "https://statistics-api.wildberries.ru/api/v1/supplier/stocks";

const ALERT_THRESHOLD = 5;

if (!API_TOKEN) {
  console.error("Ошибка: переменная WB_API_TOKEN не задана в .env");
  process.exit(1);
}

function getStockStatus(qty) {
  if (qty === 0) return "out_of_stock";
  if (qty <= ALERT_THRESHOLD) return "critical";
  return "in_stock";
}

async function fetchStocks() {
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

async function main() {
  try {
    const stocks = await fetchStocks();

    if (stocks.length === 0) {
      console.log("Остатки не найдены.");
      return;
    }

    const rows = stocks.map((item) => {
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

    const alerts = rows.filter((r) => r.quantity <= ALERT_THRESHOLD);

    // --- XLSX ---
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("stocks");

    sheet.columns = [
      { header: "warehouse", key: "warehouse" },
      { header: "supplierArticle", key: "supplierArticle" },
      { header: "barcode", key: "barcode" },
      { header: "quantity", key: "quantity" },
      { header: "brand", key: "brand" },
      { header: "price", key: "price" },
      { header: "lastChangeDate", key: "lastChangeDate" },
      { header: "stockStatus", key: "stockStatus" },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    for (const row of rows) {
      sheet.addRow(row);
    }

    const filePath = path.join(__dirname, "stocks.xlsx");
    await workbook.xlsx.writeFile(filePath);

    console.log("Готово! Сохранено в stocks.xlsx\n");

    // --- ТОП-10 критичных ---
    if (alerts.length > 0) {
      const sorted = alerts
        .slice()
        .sort((a, b) => a.quantity - b.quantity || (a.warehouse > b.warehouse ? 1 : -1));

      const top10 = sorted.slice(0, 10);

      console.log("ТОП-10 критичных:");
      top10.forEach((r, i) => {
        console.log(
          `${i + 1}) qty=${r.quantity} | ${r.warehouse} | ${r.supplierArticle} | ${r.barcode} | ${r.brand} | price=${r.price} | ${r.stockStatus}`
        );
      });
    } else {
      console.log("Критичных позиций нет 🎉");
    }

    console.log(`\nВсего строк: ${rows.length}`);
    console.log(`В alerts: ${alerts.length}`);
    console.log(`Порог: <=${ALERT_THRESHOLD}`);
  } catch (err) {
    if (err.response) {
      console.error(
        `Ошибка API: ${err.response.status} — ${JSON.stringify(err.response.data)}`
      );
    } else {
      console.error("Ошибка:", err.message);
    }
    process.exit(1);
  }
}

main();
