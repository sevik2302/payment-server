const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, default: "pending" },
  email: { type: String, default: null },
  phone: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model("Order", OrderSchema);
