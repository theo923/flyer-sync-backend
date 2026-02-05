import { type Product, type Store, type PriceWithDetails, type ReceiptWithDetails } from "./supabase";
import { type ParsedReceipt } from "./gemini";
declare module "@fastify/jwt" {
    interface FastifyJWT {
        user: {
            userId: string;
            role?: string;
        };
    }
}
declare function createTRPCRouter(server: any): import("@trpc/server").TRPCBuiltRouter<{
    ctx: {
        user: {
            userId: string;
            role?: string;
        } | null;
    };
    meta: object;
    errorShape: import("@trpc/server").TRPCDefaultErrorShape;
    transformer: false;
}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
    getReceipts: import("@trpc/server").TRPCQueryProcedure<{
        input: void;
        output: any[];
        meta: object;
    }>;
    uploadReceipt: import("@trpc/server").TRPCMutationProcedure<{
        input: {
            imageBase64: string;
        };
        output: {
            success: boolean;
            path: string;
        };
        meta: object;
    }>;
    productsList: import("@trpc/server").TRPCQueryProcedure<{
        input: {
            limit?: number | undefined;
        } | undefined;
        output: Product[];
        meta: object;
    }>;
    productsSearch: import("@trpc/server").TRPCQueryProcedure<{
        input: {
            query: string;
        };
        output: Product[];
        meta: object;
    }>;
    productsCreate: import("@trpc/server").TRPCMutationProcedure<{
        input: {
            name: string;
            barcode?: string | undefined;
            category?: string | undefined;
            image_url?: string | undefined;
        };
        output: Product;
        meta: object;
    }>;
    productsGetOrCreate: import("@trpc/server").TRPCMutationProcedure<{
        input: {
            name: string;
            barcode?: string | undefined;
            category?: string | undefined;
        };
        output: Product;
        meta: object;
    }>;
    storesList: import("@trpc/server").TRPCQueryProcedure<{
        input: void;
        output: Store[];
        meta: object;
    }>;
    storesNearby: import("@trpc/server").TRPCQueryProcedure<{
        input: {
            latitude: number;
            longitude: number;
            radiusKm?: number | undefined;
        };
        output: Store[];
        meta: object;
    }>;
    storesCreate: import("@trpc/server").TRPCMutationProcedure<{
        input: {
            name: string;
            latitude: number;
            longitude: number;
            address?: string | undefined;
        };
        output: Store;
        meta: object;
    }>;
    storesGetOrCreate: import("@trpc/server").TRPCMutationProcedure<{
        input: {
            name: string;
            latitude: number;
            longitude: number;
            address?: string | undefined;
        };
        output: Store;
        meta: object;
    }>;
    storesCheckDuplicate: import("@trpc/server").TRPCMutationProcedure<{
        input: {
            name: string;
            latitude: number;
            longitude: number;
            address?: string | undefined;
        };
        output: {
            status: string;
            message?: undefined;
            store?: undefined;
        } | {
            status: string;
            message: string;
            store: any;
        };
        meta: object;
    }>;
    storesVisited: import("@trpc/server").TRPCQueryProcedure<{
        input: void;
        output: Store[];
        meta: object;
    }>;
    storeStats: import("@trpc/server").TRPCQueryProcedure<{
        input: {
            storeId: string;
        };
        output: {
            totalSpent: number;
            avgPerItem: number;
            thisMonthSpent: number;
            itemCount: number;
        };
        meta: object;
    }>;
    pricesAdd: import("@trpc/server").TRPCMutationProcedure<{
        input: {
            productId: string;
            storeId: string;
            price: number;
            receiptImagePath?: string | undefined;
        };
        output: PriceWithDetails;
        meta: object;
    }>;
    pricesHistory: import("@trpc/server").TRPCQueryProcedure<{
        input: {
            productId: string;
            limit?: number | undefined;
        };
        output: any[];
        meta: object;
    }>;
    pricesCheapest: import("@trpc/server").TRPCQueryProcedure<{
        input: {
            productId: string;
            latitude?: number | undefined;
            longitude?: number | undefined;
            radiusKm?: number | undefined;
        };
        output: any[];
        meta: object;
    }>;
    pricesRecent: import("@trpc/server").TRPCQueryProcedure<{
        input: {
            limit?: number | undefined;
        } | undefined;
        output: PriceWithDetails[];
        meta: object;
    }>;
    pricesByStore: import("@trpc/server").TRPCQueryProcedure<{
        input: {
            storeId: string;
            limit?: number | undefined;
        };
        output: PriceWithDetails[];
        meta: object;
    }>;
    receiptsParseWithAI: import("@trpc/server").TRPCMutationProcedure<{
        input: {
            imageBase64: string;
        };
        output: ParsedReceipt;
        meta: object;
    }>;
    receiptsBulkSave: import("@trpc/server").TRPCMutationProcedure<{
        input: {
            storeId: string;
            items: {
                productId: string;
                price: number;
                quantity?: number | undefined;
                weight?: string | undefined;
                unitPrice?: number | undefined;
                tags?: string[] | undefined;
            }[];
            storeLocation?: string | undefined;
            totalPrice?: number | undefined;
            receiptDate?: string | undefined;
            receiptTime?: string | undefined;
            currency?: string | undefined;
            receiptImagePath?: string | undefined;
        };
        output: {
            saved: number;
            receiptId: any;
        };
        meta: object;
    }>;
    receiptsList: import("@trpc/server").TRPCQueryProcedure<{
        input: {
            limit?: number | undefined;
        } | undefined;
        output: ReceiptWithDetails[];
        meta: object;
    }>;
    receiptsGetById: import("@trpc/server").TRPCQueryProcedure<{
        input: {
            receiptId: string;
        };
        output: ReceiptWithDetails | null;
        meta: object;
    }>;
    rankingsGetTop: import("@trpc/server").TRPCQueryProcedure<{
        input: void;
        output: {
            userId: string;
            count: number;
        }[];
        meta: object;
    }>;
    userProfileGet: import("@trpc/server").TRPCQueryProcedure<{
        input: void;
        output: {
            priceCount: number;
            receiptCount: number;
            userId?: undefined;
        } | {
            userId: string;
            priceCount: number;
            receiptCount: number;
        };
        meta: object;
    }>;
    health: import("@trpc/server").TRPCQueryProcedure<{
        input: void;
        output: {
            status: string;
            supabase: boolean;
            timestamp: string;
        };
        meta: object;
    }>;
}>>;
export type AppRouter = ReturnType<typeof createTRPCRouter>;
export {};
