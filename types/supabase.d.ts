export declare const supabase: import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any> | null;
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
