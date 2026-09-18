// Deterministic mock dataset: 400 orders over Jan-Jun 2026.
import { writeFileSync } from "node:fs";

let seed = 20260918;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const regions = ["EMEA", "AMER", "APAC", "LATAM"];
const customers = Array.from({ length: 40 }, (_, i) => `C${String(i + 1).padStart(3, "0")}`);
const products = [
  ["Laptop Pro", "hardware", 1450], ["Laptop Air", "hardware", 980], ["Monitor 27", "hardware", 320],
  ["Dock", "accessories", 140], ["Headset", "accessories", 85], ["Keyboard", "accessories", 60],
  ["Cloud Basic", "subscription", 49], ["Cloud Team", "subscription", 199], ["Cloud Enterprise", "subscription", 899],
  ["Onboarding", "services", 1200], ["Training Day", "services", 650],
];
const statuses = ["completed", "completed", "completed", "completed", "completed", "completed", "refunded", "cancelled"];

const orders = [];
for (let i = 0; i < 400; i++) {
  const month = 1 + Math.floor(rand() * 6);
  const day = 1 + Math.floor(rand() * 28);
  const [product, category, base] = pick(products);
  const quantity = 1 + Math.floor(rand() * (category === "accessories" ? 8 : 3));
  const discount = rand() < 0.25 ? Math.round(base * 0.1) : 0;
  orders.push({
    order_id: `O${String(i + 1).padStart(4, "0")}`,
    date: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    region: pick(regions),
    customer_id: pick(customers),
    product,
    category,
    quantity,
    unit_price: base - discount,
    status: pick(statuses),
  });
}
orders.sort((a, b) => a.date.localeCompare(b.date) || a.order_id.localeCompare(b.order_id));
writeFileSync(new URL("../data/orders.json", import.meta.url), JSON.stringify(orders, null, 1) + "\n");
console.log(`wrote ${orders.length} orders`);
