const TelegramBot = require("node-telegram-bot-api");
const { fetchStocks, mapRows, ALERT_THRESHOLD } = require("./stocks");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error(
    "Ошибка: задайте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env"
  );
  process.exit(1);
}

async function sendAlerts() {
  try {
    const stocks = await fetchStocks();
    const rows = mapRows(stocks);
    const alerts = rows
      .filter((r) => r.quantity <= ALERT_THRESHOLD)
      .sort((a, b) => a.quantity - b.quantity);

    if (alerts.length === 0) {
      console.log("Критичных позиций нет — сообщение не отправлено.");
      return;
    }

    const lines = alerts.map(
      (r) => `  qty=${r.quantity} | ${r.warehouse} | ${r.supplierArticle} | ${r.brand}`
    );

    const message =
      `⚠️ Критичные остатки WB (порог ≤${ALERT_THRESHOLD})\n` +
      `Всего позиций: ${rows.length}\n` +
      `Критичных: ${alerts.length}\n\n` +
      lines.join("\n");

    const bot = new TelegramBot(BOT_TOKEN);
    await bot.sendMessage(CHAT_ID, message);

    console.log(`Отправлено в Telegram: ${alerts.length} критичных позиций.`);
  } catch (err) {
    console.error("Ошибка:", err.message);
    process.exit(1);
  }
}

sendAlerts();
