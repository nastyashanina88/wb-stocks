const ExcelJS = require("exceljs");
const path = require("path");
const { fetchStocks, mapRows, ALERT_THRESHOLD } = require("./stocks");

async function main() {
  try {
    const stocks = await fetchStocks();

    if (stocks.length === 0) {
      console.log("Остатки не найдены.");
      return;
    }

    const rows = mapRows(stocks);
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
