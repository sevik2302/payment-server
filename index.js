require("dotenv").config();
console.log("FILE LOADED");

const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");

const Order = require("./models/Order");

const app = express();

app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// MongoDB
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("DB connected"))
  .catch(err => console.log(err));

// Проверка сервера
app.get("/", (req, res) => {
  res.send("API работает");
});


// =======================
// ОПЛАТА
// =======================
app.get("/pay", async (req, res) => {
  try {
    console.log("PAY HIT");

    const amount = Number(req.query.amount);
    if (!amount) {
      return res.status(400).send("No amount");
    }

    const orderId = Date.now().toString();
    console.log("ORDER ID:", orderId);

    const body = {
      publicId: process.env.RAIF_PUBLIC_ID,
      amount: amount,
      currency: "RUB",
      orderId: orderId,
      description: "Оплата",
      successUrl: `${process.env.BASE_URL}/success`,
      failUrl: `${process.env.BASE_URL}/fail`
    };

    console.log("BODY SENT:", body);

    // ⚠️ ВАЖНО: подпись может быть другой по доке
    const signatureString = [
      body.publicId,
      body.amount,
      body.currency,
      body.orderId,
      process.env.RAIF_SECRET_KEY
    ].join(":");

    const signature = crypto
      .createHash("sha256")
      .update(signatureString)
      .digest("hex");

    console.log("SIGNATURE:", signature);

    const response = await axios.post(
      "https://pay.raif.ru/api/payment/v1/orders",
      body,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Api-Signature-SHA256": signature
        }
      }
    );

    console.log("RAIF RESPONSE:", response.data);

    const paymentUrl = response.data.paymentUrl || response.data.url;

    if (!paymentUrl) {
      console.error("No paymentUrl in response!");
      return res.status(500).send("Ошибка получения ссылки оплаты");
    }

    return res.redirect(paymentUrl);

  } catch (err) {
    console.error("PAY ERROR:", err.response?.data || err.message);
    res.status(500).send("Ошибка оплаты");
  }
});


// =======================
// WEBHOOK
// =======================
app.post("/callback", async (req, res) => {
  try {
    const signature = req.headers["x-api-signature-sha256"];

    const hash = crypto
      .createHmac("sha256", process.env.RAIF_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== signature) {
      console.log("Invalid signature");
      return res.sendStatus(403);
    }

    const { orderId, status, amount } = req.body;

    const order = await Order.findOne({ orderId });

    if (!order) {
      return res.sendStatus(404);
    }

    if (status === "SUCCESS") {
      order.status = "paid";

      // пример отправки чека
      if (!order.receiptSent) {
        try {
          await axios.post(
            "https://api.cloudkassir.ru/api/v1/receipt",
            {
              external_id: orderId,
              receipt: {
                items: [
                  {
                    name: "Оплата",
                    price: amount,
                    quantity: 1,
                    sum: amount,
                    vat: "vat20"
                  }
                ],
                total: amount
              },
              customer: {
                email: "client@test.ru"
              }
            },
            {
              headers: {
                "X-Auth": process.env.CLOUDKASSIR_PUBLIC_ID,
                "X-Password": process.env.CLOUDKASSIR_API_KEY
              }
            }
          );

          order.receiptSent = true;
        } catch (e) {
          console.error("Receipt error:", e.message);
        }
      }

    } else {
      order.status = "failed";
    }

    await order.save();

    res.sendStatus(200);

  } catch (err) {
    console.error("WEBHOOK ERROR:", err.message);
    res.status(500).send("Ошибка");
  }
});


// =======================
// ЗАПУСК СЕРВЕРА
// =======================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on ${PORT}`);
});
