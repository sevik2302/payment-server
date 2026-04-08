require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");
const path = require("path");

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
// PAY (создание платежа)
// ==================
app.get("/pay", async (req, res) => {
  try {
    const amountRub = Number(req.query.amount);
    const email = req.query.email || null;
    const phone = req.query.phone || null;

    const amount = amountRub;

    const orderId = Date.now().toString();

    await Order.create({
      orderId,
      amount,
      status: "pending",
      email,
      phone
    });

    const response = await axios.post(
      `https://pay.raif.ru/api/v1/merchants/${process.env.RAIF_PUBLIC_ID}/orders`,
      {
        id: orderId,
        amount: amount,
        comment: "Оплата доступа к сервису",
        paymentDetails: "Оплата доступа к сервису",
        locale: "RU",
        returnUrls: {
          successUrl: "https://payment-server-flye.onrender.com/success",
          failUrl: "https://payment-server-flye.onrender.com/fail"
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.RAIF_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.redirect(response.data.payformUrl);

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Ошибка оплаты");
  }
});

// ==================
// WEBHOOK
// ==================
app.post("/webhook", async (req, res) => {
  console.log("WEBHOOK HIT");
  if (!req.body) {
    console.log("EMPTY WEBHOOK BODY");
    return res.sendStatus(400);
  }

  console.log("WEBHOOK BODY:", req.body);
  
  try {
    const data = req.body;
    const signature = req.headers["x-api-signature-sha256"];

    const stringToSign = [
      data.amount,
      data.publicId,
      data.order?.id,
      data.status?.value,
      data.status?.date
    ].join("|");

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAIF_SECRET_KEY)
      .update(stringToSign)
      .digest("hex");

    if (signature !== expectedSignature) {
      return res.sendStatus(403);
    }

    const { id } = data.order;
    const { value } = data.status;

    const order = await Order.findOne({ orderId: id });

    if (!order) return res.sendStatus(404);

    if (value === "SUCCESS") {
      console.log("WEBHOOK SUCCESS");
      
      order.status = "paid";

      console.log("TRY SEND CLOUDKASSIR");
      
      

      // ==================
      // CLOUDKASSIR
      // ==================
      try {
        await axios.post(
          "https://api.cloudkassir.ru/api/v1/receipts",
          {
            Inn: process.env.CLOUDKASSIR_INN,
            Type: "Income",
            CustomerReceipt: {
              Items: [
                {
                  label: "Доступ к онлайн-сервису",
                  price: order.amount / 100,
                  quantity: 1,
                  amount: order.amount / 100,
                  vat: 0
                }
              ],
              taxationSystem: 2,
              email: order.email || undefined,
              phone: order.phone || undefined
            }
          },
          {
            auth: {
              username: process.env.CLOUDKASSIR_PUBLIC_ID,
              password: process.env.CLOUDKASSIR_SECRET_KEY
            }
          }
        );

        console.log("CLOUDKASSIR SENT");

      } catch (e) {
        console.error("CLOUDKASSIR ERROR", e.response?.data || e.message);
      }

    } else {
      order.status = "failed";
    }

    await order.save();

    res.sendStatus(200);

  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// ==================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
