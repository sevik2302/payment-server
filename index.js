require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");

const Order = require("./models/Order");

const app = express();

app.use(express.json());
app.use(express.static("public"));

// DB
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("DB connected"))
  .catch(err => console.log(err));

// Главная
app.get("/", (req, res) => {
  res.send("API работает");
});


// 💳 ОПЛАТА
app.get("/pay", async (req, res) => {
  try {
    const amountRub = Number(req.query.amount);

    if (!amountRub || amountRub <= 0) {
      return res.send("Неверная сумма");
    }

    const amount = Math.round(amountRub * 100); // рубли → копейки
    const orderId = Date.now().toString();

    // создаем заказ
    await Order.create({
      orderId,
      amount,
      status: "pending"
    });

    const response = await axios.post(
      `https://pay.raif.ru/payments/v1/merchants/${process.env.RAIF_PUBLIC_ID}/orders`,
      {
        id: orderId,
        amount: amount,
        comment: "Оплата",
        paymentDetails: "Оплата услуги",
        returnUrls: {
          successUrl: "https://google.com",
          failUrl: "https://google.com"
        }
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RAIF_SECRET_KEY}`
        }
      }
    );

    res.redirect(response.data.payformUrl);

  } catch (err) {
    console.log("STATUS:", err.response?.status);
console.log("DATA:", err.response?.data);
console.log("ERROR:", err.message);
    res.status(500).send("Ошибка оплаты");
  }
});


// 🔔 WEBHOOK
app.post("/webhook", async (req, res) => {
  try {
    const signature = req.headers["x-api-signature-sha256"];

    const data = req.body.data || req.body;

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
      order.status = "paid";
    } else {
      order.status = "failed";
    }

    await order.save();

    console.log("PAYMENT UPDATED:", id, value);

    res.sendStatus(200);

  } catch (err) {
    console.error("WEBHOOK ERROR:", err.message);
    res.sendStatus(500);
  }
});


// страницы
app.get("/success", (req, res) => {
  res.send("Оплата успешна");
});

app.get("/fail", (req, res) => {
  res.send("Ошибка оплаты");
});


// админка
app.get("/admin", async (req, res) => {
  try {
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

  } catch (err) {
    res.status(500).send("Ошибка");
  }
});


const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on ${PORT}`);
});
