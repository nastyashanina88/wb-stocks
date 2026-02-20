# WB Stocks

Скрипт для выгрузки остатков со складов Wildberries в XLSX-файл.

## Возможности

- Загрузка всех остатков через API Wildberries (с пагинацией)
- Экспорт в `stocks.xlsx` с заморозкой заголовков
- Статус остатка: `in_stock`, `critical`, `out_of_stock`
- Вывод ТОП-10 критичных позиций в консоль

## Установка

```bash
npm install
```

## Настройка

Создайте файл `.env` в корне проекта:

```
WB_API_TOKEN=ваш_токен_wildberries
```

## Запуск

```bash
node index.js
```

Результат сохраняется в `stocks.xlsx`.
