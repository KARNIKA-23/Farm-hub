import tomatoes from "@/assets/heirloom-tomatoes.jpg";
import kale from "@/assets/lacinato-kale.jpg";
import honey from "@/assets/wildflower-honey.jpg";

export type MarketProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  quantity: number;
  category: string;
  image_url: string;
  seller_name: string;
  farmer_id: string | null;
};

export const marketProducts: MarketProduct[] = [
  {
    id: "demo-tomatoes",
    name: "Heirloom Tomatoes",
    description: "Sun-ripened, mixed heirloom varieties, picked this morning.",
    price: 6.5,
    unit: "lb",
    quantity: 42,
    category: "Vegetables",
    image_url: tomatoes,
    seller_name: "Willow Creek Farm",
    farmer_id: null,
  },
  {
    id: "demo-kale",
    name: "Lacinato Kale",
    description: "Tender dark leaves, harvested at first light.",
    price: 3.2,
    unit: "bunch",
    quantity: 8,
    category: "Vegetables",
    image_url: kale,
    seller_name: "Greenfield Acres",
    farmer_id: null,
  },
  {
    id: "demo-honey",
    name: "Raw Wildflower Honey",
    description: "Small-batch, unfiltered honey from meadow blossoms.",
    price: 14,
    unit: "jar",
    quantity: 24,
    category: "Pantry",
    image_url: honey,
    seller_name: "Meadow Apiary",
    farmer_id: null,
  },
];

export const categories = ["All", "Vegetables", "Fruit", "Pantry"];

export const currency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export const orderStages = ["Order placed", "Packed", "Shipped", "Out for delivery", "Delivered"];

export const stageIndex = (status: string) => {
  const stages = ["pending", "accepted", "packed", "shipped", "out_for_delivery", "delivered"];
  const index = stages.indexOf(status);
  return index < 0 ? 0 : Math.min(index, 4);
};