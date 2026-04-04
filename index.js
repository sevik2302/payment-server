const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API работает");
});
// === ПЕРЕМЕННЫЕ (заполни после получения от банка) ===
const SECRET_KEY = process.env.SECRET_KEY || "";
const PUBLIC_ID = process.env.PUBLIC_ID || "";

// === ПРОВЕРКА РАБОТЫ СЕРВЕРА ===
app.get("/", (req, res) => {
  res.send("Server is running");
});

// === СОЗДАНИЕ ПЛАТЕЖА ===
app.post("/create-payment", async (req, res) => {
  try {
    const { amount } = req.body;

    res.json({
      message: "Платёж пока заглушка",
      amount: amount
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Ошибка создания платежа");
  }
});

// === ФИСКАЛИЗАЦИЯ ЧЕКА (Raif API) ===
app.post("/create-receipt", async (req, res) => {
  try {
    const { amount, email } = req.body;

    const response = await axios.post(
      "https://pay.raif.ru/fiscal/v1/receipts/sell",
      {
        receiptNumber: Date.now().toString(),
        client: {
          email: email || "test@test.ru"
        },
        items: [
          {
            name: "Услуга",
            price: amount,
            quantity: 1,
            amount: amount,
            paymentObject: "SERVICE",
            paymentMode: "FULL_PAYMENT",
            vatType: "VAT20"
          }
        ],
        total: amount
      },
      {
        headers: {
          Authorization: Bearer `${SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Ошибка фискализации");
  }
});

// === CALLBACK ОТ БАНКА ===
app.post("/callback", (req, res) => {
  console.log("Callback:", req.body);
  res.sendStatus(200);
});

// === ЗАПУСК ===
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server is running on port", PORT);
});
