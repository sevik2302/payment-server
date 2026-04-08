require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

const Order = require("./models/Order");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ==================
// MONGO
// ==================
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("Mongo connected"))
  .catch(err => console.error(err));

// ==================
// RANDOM LABELS
// ==================
const labels = [
  "Доступ к цифровому сервису",
  "Услуги по предоставлению цифрового контента",
  "Оплата доступа к платформе",
  "Доступ к программному обеспечению",
  "Предоставление доступа к сервису"
];

// ==================
// PAY
// ==================
app.get("/pay", async (req, res) => {
  try {
    const amountRub = Number(req.query.amount);
    const email = req.query.email;

    // ✅ EMAIL ОБЯЗАТЕЛЕН
    if (!email) {
      return res.status(400).send("Email обязателен");
    }

    const phone = req.query.phone || null;
    const orderId = Date.now().toString();

    await Order.create({
      orderId,
      amount: amountRub,
      status: "pending",
      email,
      phone
    });

    const response = await axios.post(
      `https://pay.raif.ru/api/v1/merchants/${process.env.RAIF_PUBLIC_ID}/orders`,
      {
        id: orderId,
        amount: amountRub,
        comment: "Оплата доступа к сервису",
        paymentDetails: "Оплата доступа к сервису",
        locale: "RU",
        returnUrls: {
          successUrl: `${process.env.BASE_URL}/success`,
          failUrl: `${process.env.BASE_URL}/fail`
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.RAIF_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.redirect(response.data.payformUrl);

  } catch (err) {
    console.error("PAY ERROR:", err.response?.data || err.message);
    res.status(500).send("Ошибка оплаты");
  }
});

// ==================
// WEBHOOK
// ==================
app.post("/webhook", async (req, res) => {
  console.log("WEBHOOK HIT");

  if (!req.body || Object.keys(req.body).length === 0) {
    return res.sendStatus(400);
  }

  try {
    const data = req.body;

    const orderId = data.order;
    const status = data.paymentStatus;

    const order = await Order.findOne({ orderId });

    if (!order) return res.sendStatus(404);

    if (status === "SUCCESS") {
      console.log("PAYMENT SUCCESS");

      order.status = "paid";

      // ✅ случайное название
      const randomLabel = labels[Math.floor(Math.random() * labels.length)];

     console.log("TRY SEND CLOUDKASSIR");
      console.log("ORDER EMAIL:", order.email);
      
      try {
        const response = await axios.post(
          "https://api.cloudpayments.ru/kkt/receipt",
          {
            Inn: process.env.CLOUDKASSIR_INN,
            AccountId: order.email,
            Type: "Income",
            CustomerReceipt: {
              Items: [
                {
                  label: randomLabel,
                  price: order.amount,
                  quantity: 1,
                  amount: order.amount,
                  vat: "none",
                  method: 4,
                  object: 4,
                  measurementUnit: "услуга"
                }
              ],
              taxationSystem: 7,
              email: order.email,
              phone: order.phone
            }
          },
          {
            auth: {
              username: process.env.CLOUDPAYMENTS_PUBLIC_ID,
              password: process.env.CLOUDPAYMENTS_API_SECRET
            }
          }
        );

        console.log("CLOUDKASSIR RESPONSE:", response.data);

      } catch (e) {
        console.error("CLOUDKASSIR ERROR:", e.response?.data || e.message);
      }

    } else {
      order.status = "failed";
    }

    await order.save();

    res.sendStatus(200);

  } catch (err) {
    console.error("WEBHOOK ERROR:", err);
    res.sendStatus(500);
  }
});

// ==================
// SERVER
// ==================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
