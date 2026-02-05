import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    "⚠️ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set - Supabase features disabled"
  );
}

export const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// Database types
export interface Product {
  id: string;
  barcode: string | null;
  name: string;
  category: string | null;
  image_url: string | null;
  created_at: string;
}

export interface Store {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  created_at: string;
}

export interface Price {
  id: string;
  product_id: string;
  store_id: string;
  user_id: string;
  price: number;
  quantity: number;
  weight: string | null;
  unit_price: number | null;
  tags: string[] | null;
  currency: string;
  receipt_image_path: string | null;
  receipt_id: string | null;
  purchase_time: string | null;
  detected_at: string;
}

export interface PriceWithDetails extends Price {
  products?: Product;
  stores?: Store;
}

export interface Receipt {
  id: string;
  user_id: string;
  store_id: string | null;
  total_price: number | null;
  store_location: string | null;
  receipt_date: string | null;
  receipt_time: string | null;
  currency: string;
  image_path: string | null;
  created_at: string;
}

export interface ReceiptWithDetails extends Receipt {
  stores?: Store;
  prices?: PriceWithDetails[];
}

export interface Vote {
  id: string;
  user_id: string;
  target_type: "product" | "price" | "discussion" | "store";
  target_id: string;
  vote_type: "up" | "down";
  created_at: string;
}

export interface Discussion {
  id: string;
  user_id: string;
  target_type: "product" | "price" | "store";
  target_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Bookmark {
  id: string;
  user_id: string;
  product_id: string;
  notify_on_price_drop: boolean;
  target_price: number | null;
  created_at: string;
}

export interface PriceAlert {
  id: string;
  user_id: string;
  bookmark_id: string;
  product_id: string;
  price_id: string | null;
  alert_type: "price_drop" | "target_reached" | "new_price";
  old_price: number | null;
  new_price: number | null;
  store_name: string | null;
  is_read: boolean;
  created_at: string;
}

