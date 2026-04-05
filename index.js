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

mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("DB connected"))
  .catch(err => console.log(err));

app.get("/", (req, res) => {
  res.send("API работает");
});


// ОПЛАТА
app.get("/pay", async (req, res) => {
  const { amount } = req.query;

  if (!amount) return res.send("Нет суммы");

  const orderId = Date.now().toString();

  await Order.create({
    orderId,
    amount,
    status: "pending",
    receiptSent: false
  });

  const body = {
    publicId: process.env.RAIF_PUBLIC_ID,
    amount: Number(amount),
    currency: "RUB",
    orderId,
    description: "Оплата",
    successUrl: `${process.env.BASE_URL}/success`,
    failUrl: `${process.env.BASE_URL}/fail`
  };

  const signature = crypto
    .createHmac("sha256", process.env.RAIF_SECRET_KEY)
    .update(JSON.stringify(body))
    .digest("hex");

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

  res.redirect(response.data.paymentUrl);
});


// WEBHOOK
app.post("/callback", async (req, res) => {

  const signature = req.headers["x-api-signature-sha256"];

  const hash = crypto
    .createHmac("sha256", process.env.RAIF_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (hash !== signature) return res.sendStatus(403);

  const { orderId, status, amount } = req.body;

  const order = await Order.findOne({ orderId });

  if (!order) return res.sendStatus(404);

  if (status === "SUCCESS") {
    order.status = "paid";

    if (!order.receiptSent) {

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
    }

  } else {
    order.status = "failed";
  }

  await order.save();

  res.sendStatus(200);
});


// СТРАНИЦЫ
app.get("/success", (req, res) => res.send("Оплата успешна"));
app.get("/fail", (req, res) => res.send("Ошибка оплаты"));


// АДМИНКА
app.get("/admin", async (req, res) => {

  if (req.query.password !== process.env.ADMIN_PASSWORD) {
    return res.send("Нет доступа");
  }

  const orders = await Order.find().sort({ createdAt: -1 });

  let html = "<h1>Заказы</h1><table border='1'><tr><th>ID</th><th>Сумма</th><th>Статус</th></tr>";

  orders.forEach(o => {
    html += `<tr><td>${o.orderId}</td><td>${o.amount}</td><td>${o.status}</td></tr>`;
  });

  html += "</table>";

  res.send(html);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
