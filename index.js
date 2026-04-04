const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// === переменные из окружения ===
const MERCHANT_ID = process.env.MERCHANT_ID;
const SECRET_KEY = process.env.SECRET_KEY;

const CLOUDKASSIR_PUBLIC_ID = process.env.CLOUDKASSIR_PUBLIC_ID;
const CLOUDKASSIR_API_PASSWORD = process.env.CLOUDKASSIR_API_PASSWORD;

// === проверка работы сервера ===
app.get("/", (req, res) => {
  res.send("Server is running");
});

// === создать оплату (Райффайзен) ===
app.post("/create-payment", async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ error: "No amount" });
    }

    const response = await axios.post(
      "https://pay.raif.ru/api/payments",
      {
        merchantId: MERCHANT_ID,
        amount: amount,
        currency: "RUB",
        returnUrl: "https://your-site.com/success"
      },
      {
        headers: {
          Authorization: `Bearer ${SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json(response.data);
  } catch (err) {
    console.error("Create payment error:", err.response?.data || err.message);
    res.status(500).json({ error: "Payment creation failed" });
  }
});

// === callback от банка ===
app.post("/callback", async (req, res) => {
  try {
    console.log("Callback received:", req.body);

    const { status, amount } = req.body;

    // если оплата успешна
    if (status === "SUCCESS") {
      try {
        await axios.post(
          "https://api.cloudpayments.ru/kkt/receipt",
          {
            Amount: amount,
            Description: "Оплата услуги"
          },
          {
            auth: {
              username: CLOUDKASSIR_PUBLIC_ID,
              password: CLOUDKASSIR_API_PASSWORD
            },
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      } catch (err) {
        console.error("CloudKassir error:", err.response?.data || err.message);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Callback error:", err.message);
    res.sendStatus(500);
  }
});

// === запуск сервера ===
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server is running on port", PORT);
});
