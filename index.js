require("dotenv").config();
const axios = require("axios");
const ExcelJS = require("exceljs");
const path = require("path");

const API_TOKEN = process.env.WB_API_TOKEN;
const STOCKS_URL =
  "https://statistics-api.wildberries.ru/api/v1/supplier/stocks";

if (!API_TOKEN) {
  console.error("Ошибка: переменная WB_API_TOKEN не задана в .env");
  process.exit(1);
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

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("stocks");

    const columns = [
      { header: "warehouse", key: "warehouse" },
      { header: "supplierArticle", key: "supplierArticle" },
      { header: "barcode", key: "barcode" },
      { header: "quantity", key: "quantity" },
      { header: "brand", key: "brand" },
      { header: "price", key: "price" },
      { header: "lastChangeDate", key: "lastChangeDate" },
    ];

    sheet.columns = columns;

    sheet.getRow(1).font = { bold: true };

    sheet.views = [{ state: "frozen", ySplit: 1 }];

    for (const item of stocks) {
      sheet.addRow({
        warehouse: item.warehouseName ?? "",
        supplierArticle: item.supplierArticle ?? "",
        barcode: item.barcode ?? "",
        quantity: item.quantity ?? "",
        brand: item.brand ?? "",
        price: item.Price ?? "",
        lastChangeDate: item.lastChangeDate ?? "",
      });
    }

    const filePath = path.join(__dirname, "stocks.xlsx");
    await workbook.xlsx.writeFile(filePath);

    console.log("Готово! Сохранено в stocks.xlsx");
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
