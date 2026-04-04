const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  orderId: String,
  amount: Number,
  status: String,
  receiptSent: Boolean,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Order", orderSchema);
