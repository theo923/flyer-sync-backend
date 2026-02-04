import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import { initTRPC, TRPCError } from "@trpc/server";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import * as ngrok from "ngrok";
import { writeFile, mkdir } from "fs/promises";
import { z } from "zod";
import type { FastifyRequest, FastifyReply } from "fastify";
import * as dotenv from "dotenv";
import path from "path";
import { createHash } from "crypto";

import { supabase, type Product, type Store, type Price, type PriceWithDetails, type Receipt, type ReceiptWithDetails } from "./supabase";
import { parseReceiptImage, type ParsedReceipt } from "./gemini";

dotenv.config();

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: { userId: string; role?: string };
  }
}

// Validate required environment variables
if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET environment variable is required!");
  process.exit(1);
}

const CONFIG = {
  PORT: Number(process.env.PORT || 4000),
  JWT_SECRET: process.env.JWT_SECRET as string,
  NGROK_AUTH_TOKEN: process.env.NGROK_AUTH_TOKEN,
  NGROK_DOMAIN: process.env.NGROK_DOMAIN,
  BODY_LIMIT: 50 * 1024 * 1024, // 50MB
};

console.log("🔧 Server configuration:");
console.log("- PORT:", CONFIG.PORT);
console.log("- Supabase:", supabase ? "✅ Connected" : "⚠️ Not configured");

async function createServer() {
  const server = Fastify({
    bodyLimit: CONFIG.BODY_LIMIT,
    logger: false,
  });

  await server.register(fastifyCors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });

  await server.register(fastifyJwt, {
    secret: CONFIG.JWT_SECRET,
  });

  process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("🌋 Unhandled Rejection:", reason);
});

  server.addHook("preHandler", async (req: FastifyRequest) => {
    console.log(`→ ${req.method} ${req.url} (${req.headers["content-length"] || 0} bytes)`);
  });

  server.setErrorHandler((error, request, reply) => {
    console.error(`❌ Server Error: ${error.message}`);
    console.error(error.stack);
    
    if (error.validation) {
      return reply.status(400).send({ error: "Validation Error", details: error.validation });
    }
    
    if (error.statusCode === 413) {
      return reply.status(413).send({ error: "Payload too large", limit: CONFIG.BODY_LIMIT });
    }

    reply.status(error.statusCode || 500).send({ 
      error: "Internal Server Error", 
      message: error.message 
    });
  });

  return server;
}

function createTRPCRouter(server: any) {
  const t = initTRPC
    .context<{ user: { userId: string; role?: string } | null }>()
    .create();

  const publicProcedure = t.procedure;
  const protectedProcedure = t.procedure.use(({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });

  return t.router({
    // ─────────────────────────────────────────────────────────────
    // LEGACY ENDPOINTS (backward compatibility)
    // ─────────────────────────────────────────────────────────────
    getReceipts: protectedProcedure.query(async ({ ctx }) => {
      if (!supabase) return [];
      const { data } = await supabase
        .from("prices")
        .select("*, products(*), stores(*)")
        .eq("user_id", ctx.user.userId)
        .order("detected_at", { ascending: false })
        .limit(50);
      return data || [];
    }),

    uploadReceipt: protectedProcedure
      .input(z.object({ imageBase64: z.string() }))
      .mutation(async ({ input, ctx }) => {
        // Save locally as backup
        const uploadsDir = path.join(process.cwd(), "uploads");
        await mkdir(uploadsDir, { recursive: true }).catch(() => {});
        
        const buffer = Buffer.from(input.imageBase64, "base64");
        const filename = `${Date.now()}-${ctx.user.userId}.jpg`;
        const filepath = path.join(uploadsDir, filename);
        await writeFile(filepath, buffer);
        
        // Also upload to Supabase Storage if configured
        let storagePath = filepath;
        if (supabase) {
          const { data, error } = await supabase.storage
            .from("receipts")
            .upload(`${ctx.user.userId}/${filename}`, buffer, {
              contentType: "image/jpeg",
            });
          if (data) storagePath = data.path;
          if (error) console.warn("Storage upload failed:", error.message);
        }
        
        console.log(`✔ Receipt saved: ${storagePath}`);
        return { success: true, path: storagePath };
      }),

    // ─────────────────────────────────────────────────────────────
    // PRODUCTS
    // ─────────────────────────────────────────────────────────────
    productsList: publicProcedure
      .input(z.object({ limit: z.number().default(50) }).optional())
      .query(async ({ input }) => {
        if (!supabase) return [];
        const { data } = await supabase
          .from("products")
          .select("*")
          .order("name")
          .limit(input?.limit || 50);
        return (data || []) as Product[];
      }),

    productsSearch: publicProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(async ({ input }) => {
        if (!supabase) return [];
        const { data } = await supabase
          .from("products")
          .select("*")
          .or(`name.ilike.%${input.query}%,barcode.eq.${input.query}`)
          .limit(20);
        return (data || []) as Product[];
      }),

    productsCreate: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        barcode: z.string().optional(),
        category: z.string().optional(),
        image_url: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
        
        const { data, error } = await supabase
          .from("products")
          .insert({
            name: input.name,
            barcode: input.barcode || null,
            category: input.category || null,
            image_url: input.image_url || null,
          })
          .select()
          .single();
        
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        return data as Product;
      }),

    productsGetOrCreate: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        barcode: z.string().optional(),
        category: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
        
        // Try to find by barcode first, then by name
        let product: Product | null = null;
        
        if (input.barcode) {
          const { data } = await supabase
            .from("products")
            .select("*")
            .eq("barcode", input.barcode)
            .single();
          product = data;
        }
        
        if (!product) {
          const { data } = await supabase
            .from("products")
            .select("*")
            .ilike("name", input.name)
            .single();
          product = data;
        }
        
        if (product) return product;
        
        // Create new product
        const { data, error } = await supabase
          .from("products")
          .insert({
            name: input.name,
            barcode: input.barcode || null,
            category: input.category || null,
          })
          .select()
          .single();
        
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        return data as Product;
      }),

    // ─────────────────────────────────────────────────────────────
    // STORES
    // ─────────────────────────────────────────────────────────────
    storesList: publicProcedure.query(async () => {
      if (!supabase) return [];
      const { data } = await supabase
        .from("stores")
        .select("*")
        .order("name");
      return (data || []) as Store[];
    }),

    storesNearby: publicProcedure
      .input(z.object({
        latitude: z.number(),
        longitude: z.number(),
        radiusKm: z.number().default(5),
      }))
      .query(async ({ input }) => {
        if (!supabase) return [];
        
        // Using PostGIS ST_DWithin for radius search
        const { data, error } = await supabase.rpc("stores_nearby", {
          lat: input.latitude,
          lng: input.longitude,
          radius_km: input.radiusKm,
        });
        
        if (error) {
          console.warn("PostGIS query failed, falling back to basic query:", error.message);
          // Fallback: return all stores (for development without PostGIS)
          const { data: allStores } = await supabase.from("stores").select("*");
          return (allStores || []) as Store[];
        }
        
        return (data || []) as Store[];
      }),

    storesCreate: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        address: z.string().optional(),
        latitude: z.number(),
        longitude: z.number(),
      }))
      .mutation(async ({ input }) => {
        if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
        
        const { data, error } = await supabase
          .from("stores")
          .insert({
            name: input.name,
            address: input.address || null,
            latitude: input.latitude,
            longitude: input.longitude,
          })
          .select()
          .single();
        
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        return data as Store;
      }),

    storesGetOrCreate: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        address: z.string().optional(),
        latitude: z.number(),
        longitude: z.number(),
      }))
      .mutation(async ({ input }) => {
        if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
        
        // Look for existing store by name (fuzzy match)
        const { data: existing } = await supabase
          .from("stores")
          .select("*")
          .ilike("name", `%${input.name}%`)
          .limit(1)
          .single();
        
        if (existing) return existing as Store;
        
        // Create new store
        const { data, error } = await supabase
          .from("stores")
          .insert({
            name: input.name,
            address: input.address || null,
            latitude: input.latitude,
            longitude: input.longitude,
          })
          .select()
          .single();
        
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        return data as Store;
      }),

    storesVisited: protectedProcedure
      .query(async ({ ctx }) => {
        if (!supabase) return [];
        
        // 1. Get unique store_ids from user receipts
        const { data: receipts } = await supabase
          .from("receipts")
          .select("store_id")
          .eq("user_id", ctx.user.userId)
          .not("store_id", "is", null);
        
        if (!receipts || receipts.length === 0) return [];

        const storeIds = [...new Set(receipts.map(r => r.store_id))];
        
        // 2. Fetch store details
        if (storeIds.length === 0) return [];

        const { data: stores } = await supabase
          .from("stores")
          .select("*")
          .in("id", storeIds);
          
        return (stores || []) as Store[];
      }),

    // ─────────────────────────────────────────────────────────────
    // PRICES
    // ─────────────────────────────────────────────────────────────
    pricesAdd: protectedProcedure
      .input(z.object({
        productId: z.string().uuid(),
        storeId: z.string().uuid(),
        price: z.number().positive(),
        receiptImagePath: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
        
        const { data, error } = await supabase
          .from("prices")
          .insert({
            product_id: input.productId,
            store_id: input.storeId,
            user_id: ctx.user.userId,
            price: input.price,
            receipt_image_path: input.receiptImagePath || null,
          })
          .select("*, products(*), stores(*)")
          .single();
        
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        console.log(`✅ Price added: ${input.price} for product ${input.productId}`);
        return data as PriceWithDetails;
      }),

    pricesHistory: publicProcedure
      .input(z.object({
        productId: z.string().uuid(),
        limit: z.number().default(100),
      }))
      .query(async ({ input }) => {
        if (!supabase) return [];
        
        const { data } = await supabase
          .from("prices")
          .select("*, stores(name)")
          .eq("product_id", input.productId)
          .order("detected_at", { ascending: true })
          .limit(input.limit);
        
        return data || [];
      }),

    pricesCheapest: publicProcedure
      .input(z.object({
        productId: z.string().uuid(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        radiusKm: z.number().default(10),
      }))
      .query(async ({ input }) => {
        if (!supabase) return [];
        
        // Get most recent price for each store
        const { data } = await supabase
          .from("prices")
          .select("*, stores(*)")
          .eq("product_id", input.productId)
          .order("detected_at", { ascending: false });
        
        if (!data || data.length === 0) return [];
        
        // Group by store and get latest price
        const storeMap = new Map<string, any>();
        for (const price of data) {
          if (!storeMap.has(price.store_id)) {
            storeMap.set(price.store_id, price);
          }
        }
        
        // Sort by price
        const sorted = Array.from(storeMap.values()).sort((a, b) => a.price - b.price);
        return sorted;
      }),

    pricesRecent: publicProcedure
      .input(z.object({ limit: z.number().default(20) }).optional())
      .query(async ({ input }) => {
        if (!supabase) return [];
        
        const { data } = await supabase
          .from("prices")
          .select("*, products(*), stores(*)")
          .order("detected_at", { ascending: false })
          .limit(input?.limit || 20);
        
        return (data || []) as PriceWithDetails[];
      }),

    // ─────────────────────────────────────────────────────────────
    // AI RECEIPT PARSING
    // ─────────────────────────────────────────────────────────────
    receiptsParseWithAI: protectedProcedure
      .input(z.object({ imageBase64: z.string() }))
      .mutation(async ({ input }): Promise<ParsedReceipt> => {
        return await parseReceiptImage(input.imageBase64);
      }),

    receiptsBulkSave: protectedProcedure
      .input(z.object({
        storeId: z.string().uuid(),
        storeLocation: z.string().optional(),
        totalPrice: z.number().optional(),
        receiptDate: z.string().optional(),
        receiptTime: z.string().optional(),
        currency: z.string().default('USD'),
        items: z.array(z.object({
          productId: z.string().uuid(),
          price: z.number().positive(),
          quantity: z.number().optional(),
          weight: z.string().optional(),
          unitPrice: z.number().optional(),
          tags: z.array(z.string()).optional(),
        })),
        receiptImagePath: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
        
        // Create receipt record first
        const { data: receipt, error: receiptError } = await supabase
          .from("receipts")
          .insert({
            user_id: ctx.user.userId,
            store_id: input.storeId,
            total_price: input.totalPrice || null,
            store_location: input.storeLocation || null,
            receipt_date: input.receiptDate || null,
            receipt_time: input.receiptTime || null,
            currency: input.currency,
            image_path: input.receiptImagePath || null,
          })
          .select()
          .single();
        
        if (receiptError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: receiptError.message });
        
        // Create price records linked to receipt
        const priceRecords = input.items.map((item) => ({
          product_id: item.productId,
          store_id: input.storeId,
          user_id: ctx.user.userId,
          price: item.price,
          quantity: Math.round(item.quantity || 1),
          weight: item.weight || null,
          unit_price: item.unitPrice || null,
          tags: item.tags || null,
          currency: input.currency,
          receipt_id: receipt.id,
          receipt_image_path: input.receiptImagePath || null,
          purchase_time: input.receiptDate ? new Date(`${input.receiptDate}T${input.receiptTime || '12:00'}:00`).toISOString() : new Date().toISOString(),
        }));
        
        const { data, error } = await supabase
          .from("prices")
          .insert(priceRecords)
          .select();
        
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        
        console.log(`✅ Bulk saved ${input.items.length} prices in receipt ${receipt.id}`);
        return { saved: data?.length || 0, receiptId: receipt.id };
      }),

    receiptsList: protectedProcedure
      .input(z.object({ limit: z.number().default(20) }).optional())
      .query(async ({ ctx, input }) => {
        if (!supabase) return [];
        
        const { data } = await supabase
          .from("receipts")
          .select("*, stores(*)")
          .eq("user_id", ctx.user.userId)
          .order("created_at", { ascending: false })
          .limit(input?.limit || 20);
        
        return (data || []) as ReceiptWithDetails[];
      }),

    receiptsGetById: protectedProcedure
      .input(z.object({ receiptId: z.string().uuid() }))
      .query(async ({ input }) => {
        if (!supabase) return null;
        
        const { data: receipt } = await supabase
          .from("receipts")
          .select("*, stores(*)")
          .eq("id", input.receiptId)
          .single();
        
        if (!receipt) return null;
        
        // Get associated prices
        const { data: prices } = await supabase
          .from("prices")
          .select("*, products(*)")
          .eq("receipt_id", input.receiptId)
          .order("detected_at", { ascending: false });
        
        return { ...receipt, prices: prices || [] } as ReceiptWithDetails;
      }),

    // ─────────────────────────────────────────────────────────────
    // HEALTH CHECK
    // ─────────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────
    // RANKINGS & PROFILE
    // ─────────────────────────────────────────────────────────────
    rankingsGetTop: publicProcedure.query(async () => {
      if (!supabase) return [];
      
      const { data, error } = await supabase.rpc("get_top_contributors", { lim: 10 });
      
      if (error) {
        console.error("Ranking RPC failed:", error.message);
        return [];
      }
      
      return (data || []) as { userId: string; count: number }[];
    }),

    userProfileGet: protectedProcedure.query(async ({ ctx }) => {
      if (!supabase) return { priceCount: 0, receiptCount: 0 };
      
      const { count: priceCount } = await supabase
        .from("prices")
        .select("*", { count: "exact", head: true })
        .eq("user_id", ctx.user.userId);
        
      const { count: receiptCount } = await supabase
        .from("receipts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", ctx.user.userId);
        
      return {
        userId: ctx.user.userId,
        priceCount: priceCount || 0,
        receiptCount: receiptCount || 0,
      };
    }),

    health: publicProcedure.query(() => ({
      status: "ok",
      supabase: !!supabase,
      timestamp: new Date().toISOString(),
    })),
  });
}

export type AppRouter = ReturnType<typeof createTRPCRouter>;

function createAuthContext(server: any) {
  return async ({ req }: { req: FastifyRequest }) => {
    let user: { userId: string; role?: string } | null = null;

    try {
      const auth = (req.headers.authorization as string) ?? "";
      if (auth.startsWith("Bearer ")) {
        const token = auth.slice(7);
        
        try {
          // 1. Try verifiable local JWT first (for testuser)
          user = server.jwt.verify(token) as { userId: string; role?: string };
        } catch (e) {
          // 2. If valid locally, maybe it's a Supabase token?
          if (supabase) {
            const { data: { user: sbUser }, error } = await supabase.auth.getUser(token);
            if (!error && sbUser) {
              user = { 
                userId: sbUser.id,
                role: sbUser.role 
              };
            }
          }
        }
        
        // AUTO-FIX: Legacy tokens might have "user-123" which crashes Postgres UUID columns
        // We invisibly swap it to the valid UUID on the fly
        if (user?.userId && !user.userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          console.log(`⚠️  Legacy ID detected (${user.userId}). Auto-migrating to valid UUID.`);
          user.userId = "11111111-1111-1111-1111-111111111111"; // testuser UUID
        }

        if (user) {
           console.log("✅ Authenticated:", user.userId);
        }
      }
    } catch (error) {
      console.log("⚠️ Auth failed:", error instanceof Error ? error.message : String(error));
    }

    return { user };
  };
}

async function setupRoutes(server: any) {
  const appRouter = createTRPCRouter(server);

  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: createAuthContext(server),
    },
  });

  // Login endpoint
  server.post("/login", async (req: FastifyRequest, reply: FastifyReply) => {
    const { username } = req.body as { username: string };
    
    // Use a static UUID for testuser to keep data persistent during dev
    const userId = username === "testuser" 
      ? "11111111-1111-1111-1111-111111111111" 
      : "22222222-2222-2222-2222-222222222222"; 
    
    const token = await reply.jwtSign({ userId, role: "user" });
    
    return reply.send({ token, userId });
  });

  // Google OAuth endpoint
  server.post("/auth/google", async (req: FastifyRequest, reply: FastifyReply) => {
    const { accessToken } = req.body as { accessToken: string };
    
    try {
      // For mobile apps using expo-auth-session, we usually verify via the userinfo endpoint 
      // or using a proper ID token if configured. 
      // For this implementation, we'll fetch user info from Google's API to verify the token.
      const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error("Invalid Google token");
      }

      const userInfo = await response.json() as { sub: string, email: string, name: string };
      
      // Generate a deterministic UUID from the Google 'sub'
      // This ensures the same Google user always gets the same UUID
      const hash = createHash("md5").update(userInfo.sub).digest("hex");
      const userId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;

      const token = await reply.jwtSign({ 
        userId, 
        role: "user",
        email: userInfo.email,
        name: userInfo.name 
      });

      return reply.send({ token, userId });
    } catch (error) {
      console.error("Google Auth failed:", error);
      return reply.status(401).send({ error: "Authentication failed" });
    }
  });

  // Health check
  server.get("/health", async () => ({
    status: "ok",
    supabase: !!supabase,
    timestamp: new Date().toISOString(),
  }));
}

async function setupNgrokTunnel() {
  if (!CONFIG.NGROK_AUTH_TOKEN) {
    console.log("⚠️ NGROK_AUTH_TOKEN not set - skipping tunnel");
    return;
  }

  try {
    console.log("🔗 Starting ngrok tunnel...");
    const url = await ngrok.connect({
      port: CONFIG.PORT,
      authtoken: CONFIG.NGROK_AUTH_TOKEN,
      hostname: CONFIG.NGROK_DOMAIN,
    });
    console.log(`🔗 Public API: ${url}/trpc`);
  } catch (error) {
    console.warn("⚠️ ngrok failed:", error instanceof Error ? error.message : String(error));
  }
}

async function start() {
  try {
    const server = await createServer();
    await setupRoutes(server);
    await server.listen({ port: CONFIG.PORT, host: "0.0.0.0" });
    console.log(`🚀 Server running on http://0.0.0.0:${CONFIG.PORT}`);
    await setupNgrokTunnel();
    console.log("✅ Server ready");
  } catch (error) {
    console.error("❌ Failed to start:", error);
    process.exit(1);
  }
}

start();
