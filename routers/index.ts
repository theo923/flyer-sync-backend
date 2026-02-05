import { z } from "zod";
import { router, publicProcedure, protectedProcedure, TRPCError } from "../trpc";
import { supabase } from "../supabase";

// Import all domain routers
import { productsRouter } from "./products.router";
import { storesRouter } from "./stores.router";
import { pricesRouter } from "./prices.router";
import { receiptsRouter } from "./receipts.router";
import { rankingsRouter } from "./rankings.router";
import { votingRouter } from "./voting.router";
import { bookmarksRouter } from "./bookmarks.router";

export const appRouter = router({
  // Namespaced routers (new API structure)
  products: productsRouter,
  stores: storesRouter,
  prices: pricesRouter,
  receipts: receiptsRouter,
  rankings: rankingsRouter,
  voting: votingRouter,
  bookmarks: bookmarksRouter,

  // ─────────────────────────────────────────────────────────────
  // FLAT ENDPOINTS (backward compatibility with existing frontend)
  // These map to the new namespaced routers
  // ─────────────────────────────────────────────────────────────
  
  // Legacy receipt endpoints
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
      const path = await import("path");
      const { writeFile, mkdir } = await import("fs/promises");
      
      const uploadsDir = path.join(process.cwd(), "uploads");
      await mkdir(uploadsDir, { recursive: true }).catch(() => {});
      
      const buffer = Buffer.from(input.imageBase64, "base64");
      const filename = `${Date.now()}-${ctx.user.userId}.jpg`;
      const filepath = path.join(uploadsDir, filename);
      await writeFile(filepath, buffer);
      
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

  // Products flat endpoints
  productsList: publicProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      if (!supabase) return [];
      const { data } = await supabase
        .from("products")
        .select("*")
        .order("name")
        .limit(input?.limit || 50);
      return data || [];
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
      return data || [];
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
      const { data, error } = await supabase.from("products").insert(input).select().single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  productsGetOrCreate: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      barcode: z.string().optional(),
      category: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      
      let product = null;
      if (input.barcode) {
        const { data } = await supabase.from("products").select("*").eq("barcode", input.barcode).single();
        product = data;
      }
      if (!product) {
        const { data } = await supabase.from("products").select("*").ilike("name", input.name).single();
        product = data;
      }
      if (product) return product;
      
      const { data, error } = await supabase.from("products").insert({ name: input.name, barcode: input.barcode || null, category: input.category || null }).select().single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  // Stores flat endpoints
  storesList: publicProcedure.query(async () => {
    if (!supabase) return [];
    const { data } = await supabase.from("stores").select("*").eq("is_deleted", false).order("name");
    return data || [];
  }),

  storesNearby: publicProcedure
    .input(z.object({ latitude: z.number(), longitude: z.number(), radiusKm: z.number().default(5) }))
    .query(async ({ input }) => {
      if (!supabase) return [];
      const { data, error } = await supabase.rpc("stores_nearby", { lat: input.latitude, lng: input.longitude, radius_km: input.radiusKm });
      if (error) {
        const { data: allStores } = await supabase.from("stores").select("*").eq("is_deleted", false);
        return allStores || [];
      }
      return data || [];
    }),

  storesGetById: publicProcedure
    .input(z.object({ storeId: z.string().uuid() }))
    .query(async ({ input }) => {
      if (!supabase) return null;
      const { data } = await supabase.from("stores").select("*").eq("id", input.storeId).eq("is_deleted", false).maybeSingle();
      return data;
    }),

  storesCreate: protectedProcedure
    .input(z.object({ name: z.string().min(1), address: z.string().optional(), latitude: z.number(), longitude: z.number() }))
    .mutation(async ({ input }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      const { data, error } = await supabase.from("stores").insert(input).select().single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  storesGetOrCreate: protectedProcedure
    .input(z.object({ name: z.string().min(1), address: z.string().optional(), latitude: z.number(), longitude: z.number() }))
    .mutation(async ({ input }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      const { data: existing } = await supabase.from("stores").select("*").ilike("name", `%${input.name}%`).eq("is_deleted", false).limit(1).single();
      if (existing) return existing;
      const { data, error } = await supabase.from("stores").insert(input).select().single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  storesCheckDuplicate: protectedProcedure
    .input(z.object({ name: z.string(), address: z.string().optional(), latitude: z.number(), longitude: z.number() }))
    .mutation(async ({ input }) => {
      if (!supabase) return { status: "none" };
      const { data: nameMatch } = await supabase.from("stores").select("*").ilike("name", input.name).eq("is_deleted", false).maybeSingle();
      if (nameMatch) return { status: "exact", message: "A store with this exact name already exists.", store: nameMatch };
      const { data: locMatch } = await supabase.from("stores").select("*").eq("is_deleted", false).gte("latitude", input.latitude - 0.001).lte("latitude", input.latitude + 0.001).gte("longitude", input.longitude - 0.001).lte("longitude", input.longitude + 0.001).limit(1).maybeSingle();
      if (locMatch) return { status: "location", message: `A store is already at this location: "${locMatch.name}"`, store: locMatch };
      return { status: "none" };
    }),

  storesRecordVisit: protectedProcedure
    .input(z.object({ storeId: z.string().uuid() }))
    .mutation(async () => ({ success: true })),

  storesSoftDelete: protectedProcedure
    .input(z.object({ storeId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      const { error } = await supabase.from("stores").update({ is_deleted: true }).eq("id", input.storeId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  storesVisited: protectedProcedure.query(async ({ ctx }) => {
    if (!supabase) return [];
    const { data: receipts } = await supabase.from("receipts").select("store_id").eq("user_id", ctx.user.userId).not("store_id", "is", null);
    if (!receipts?.length) return [];
    const storeIds = [...new Set(receipts.map(r => r.store_id))];
    const { data: stores } = await supabase.from("stores").select("*").in("id", storeIds).eq("is_deleted", false);
    return stores || [];
  }),

  storeStats: protectedProcedure
    .input(z.object({ storeId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      if (!supabase) return { totalSpent: 0, avgPerItem: 0, thisMonthSpent: 0, itemCount: 0 };
      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { data: prices } = await supabase.from("prices").select("price").eq("store_id", input.storeId).eq("user_id", ctx.user.userId);
      const { data: monthlyPrices } = await supabase.from("prices").select("price").eq("store_id", input.storeId).eq("user_id", ctx.user.userId).gte("detected_at", firstDayOfMonth);
      const totalSpent = prices?.reduce((sum, p) => sum + Number(p.price), 0) || 0;
      const itemCount = prices?.length || 0;
      return { totalSpent, avgPerItem: itemCount > 0 ? totalSpent / itemCount : 0, thisMonthSpent: monthlyPrices?.reduce((sum, p) => sum + Number(p.price), 0) || 0, itemCount };
    }),

  // Prices flat endpoints
  pricesAdd: protectedProcedure
    .input(z.object({ productId: z.string().uuid(), storeId: z.string().uuid(), price: z.number().positive(), receiptImagePath: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      const { data, error } = await supabase.from("prices").insert({ product_id: input.productId, store_id: input.storeId, user_id: ctx.user.userId, price: input.price, receipt_image_path: input.receiptImagePath || null }).select("*, products(*), stores(*)").single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  pricesHistory: publicProcedure
    .input(z.object({ productId: z.string().uuid(), limit: z.number().default(100) }))
    .query(async ({ input }) => {
      if (!supabase) return [];
      const { data } = await supabase.from("prices").select("*, stores(name)").eq("product_id", input.productId).order("detected_at", { ascending: true }).limit(input.limit);
      return data || [];
    }),

  pricesCheapest: publicProcedure
    .input(z.object({ productId: z.string().uuid(), latitude: z.number().optional(), longitude: z.number().optional(), radiusKm: z.number().default(10) }))
    .query(async ({ input }) => {
      if (!supabase) return [];
      const { data } = await supabase.from("prices").select("*, stores(*)").eq("product_id", input.productId).order("detected_at", { ascending: false });
      if (!data?.length) return [];
      const storeMap = new Map<string, any>();
      for (const price of data) { if (!storeMap.has(price.store_id)) storeMap.set(price.store_id, price); }
      return Array.from(storeMap.values()).sort((a, b) => a.price - b.price);
    }),

  pricesRecent: publicProcedure
    .input(z.object({ limit: z.number().default(20) }).optional())
    .query(async ({ input }) => {
      if (!supabase) return [];
      const { data } = await supabase.from("prices").select("*, products(*), stores(*)").order("detected_at", { ascending: false }).limit(input?.limit || 20);
      return data || [];
    }),

  pricesByStore: protectedProcedure
    .input(z.object({ storeId: z.string().uuid(), limit: z.number().default(50) }))
    .query(async ({ input, ctx }) => {
      if (!supabase) return [];
      const { data } = await supabase.from("prices").select("*, products(*)").eq("store_id", input.storeId).eq("user_id", ctx.user.userId).order("detected_at", { ascending: false }).limit(input.limit);
      return data || [];
    }),

  // Receipts flat endpoints
  receiptsParseWithAI: protectedProcedure
    .input(z.object({ imageBase64: z.string() }))
    .mutation(async ({ input }) => {
      const { parseReceiptImage } = await import("../gemini");
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
      items: z.array(z.object({ productId: z.string().uuid(), price: z.number().positive(), quantity: z.number().optional(), weight: z.string().optional(), unitPrice: z.number().optional(), tags: z.array(z.string()).optional() })),
      receiptImagePath: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      
      const { data: receipt, error: receiptError } = await supabase.from("receipts").insert({ user_id: ctx.user.userId, store_id: input.storeId, total_price: input.totalPrice || null, store_location: input.storeLocation || null, receipt_date: input.receiptDate || null, receipt_time: input.receiptTime || null, currency: input.currency, image_path: input.receiptImagePath || null }).select().single();
      if (receiptError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: receiptError.message });
      
      const priceRecords = input.items.map((item) => ({ product_id: item.productId, store_id: input.storeId, user_id: ctx.user.userId, price: item.price, quantity: Math.round(item.quantity || 1), weight: item.weight || null, unit_price: item.unitPrice || null, tags: item.tags || null, currency: input.currency, receipt_id: receipt.id, receipt_image_path: input.receiptImagePath || null, purchase_time: input.receiptDate ? new Date(`${input.receiptDate}T${input.receiptTime || '12:00'}:00`).toISOString() : new Date().toISOString() }));
      const { data, error } = await supabase.from("prices").insert(priceRecords).select();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { saved: data?.length || 0, receiptId: receipt.id };
    }),

  receiptsList: protectedProcedure
    .input(z.object({ 
      limit: z.number().default(20),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      if (!supabase) return [];
      let query = supabase.from("receipts")
        .select("*, stores(*)")
        .eq("user_id", ctx.user.userId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });
        
      if (input?.startDate) {
        query = query.gte('receipt_date', input.startDate);
      }
      if (input?.endDate) {
        query = query.lte('receipt_date', input.endDate);
      }
      
      const { data } = await query.limit(input?.limit || 20);
      return data || [];
    }),

  receiptsGetById: protectedProcedure
    .input(z.object({ receiptId: z.string().uuid() }))
    .query(async ({ input }) => {
      if (!supabase) return null;
      const { data: receipt } = await supabase.from("receipts").select("*, stores(*)").eq("id", input.receiptId).single();
      if (!receipt) return null;
      const { data: prices } = await supabase.from("prices").select("*, products(*)").eq("receipt_id", input.receiptId).order("detected_at", { ascending: false });
      return { ...receipt, prices: prices || [] };
    }),

  receiptsSoftDelete: protectedProcedure
    .input(z.object({ receiptId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      const { error } = await supabase.from("receipts").update({ is_deleted: true }).eq("id", input.receiptId).eq("user_id", ctx.user.userId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // Rankings flat endpoints
  rankingsGetTop: publicProcedure.query(async () => {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc("get_top_contributors", { lim: 10 });
    if (error) return [];
    return data || [];
  }),

  userProfileGet: protectedProcedure.query(async ({ ctx }) => {
    if (!supabase) return { priceCount: 0, receiptCount: 0 };
    const { count: priceCount } = await supabase.from("prices").select("*", { count: "exact", head: true }).eq("user_id", ctx.user.userId);
    const { count: receiptCount } = await supabase.from("receipts").select("*", { count: "exact", head: true }).eq("user_id", ctx.user.userId);
    return { userId: ctx.user.userId, priceCount: priceCount || 0, receiptCount: receiptCount || 0 };
  }),

  // Voting flat endpoints
  voteGetCounts: publicProcedure
    .input(z.object({ targetType: z.enum(['product', 'price', 'discussion', 'store']), targetId: z.string().uuid() }))
    .query(async ({ input }) => {
      if (!supabase) return { upvotes: 0, downvotes: 0 };
      const { data, error } = await supabase.rpc('get_vote_counts', { p_target_type: input.targetType, p_target_id: input.targetId });
      if (error) {
        const { data: votes } = await supabase.from('votes').select('vote_type').eq('target_type', input.targetType).eq('target_id', input.targetId);
        return { upvotes: votes?.filter(v => v.vote_type === 'up').length || 0, downvotes: votes?.filter(v => v.vote_type === 'down').length || 0 };
      }
      return { upvotes: Number(data[0]?.upvotes || 0), downvotes: Number(data[0]?.downvotes || 0) };
    }),

  voteGetUserVote: protectedProcedure
    .input(z.object({ targetType: z.enum(['product', 'price', 'discussion', 'store']), targetId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      if (!supabase) return null;
      const { data } = await supabase.from('votes').select('vote_type').eq('user_id', ctx.user.userId).eq('target_type', input.targetType).eq('target_id', input.targetId).maybeSingle();
      return data?.vote_type || null;
    }),

  voteSubmit: protectedProcedure
    .input(z.object({ targetType: z.enum(['product', 'price', 'discussion', 'store']), targetId: z.string().uuid(), voteType: z.enum(['up', 'down']) }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      const { error } = await supabase.from('votes').upsert({ user_id: ctx.user.userId, target_type: input.targetType, target_id: input.targetId, vote_type: input.voteType }, { onConflict: 'user_id,target_type,target_id' });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  voteRemove: protectedProcedure
    .input(z.object({ targetType: z.enum(['product', 'price', 'discussion', 'store']), targetId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      const { error } = await supabase.from('votes').delete().eq('user_id', ctx.user.userId).eq('target_type', input.targetType).eq('target_id', input.targetId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // Discussion flat endpoints
  discussionList: publicProcedure
    .input(z.object({ targetType: z.enum(['product', 'price', 'store']), targetId: z.string().uuid(), page: z.number().default(1), pageSize: z.number().default(10) }))
    .query(async ({ input }) => {
      if (!supabase) return { discussions: [], totalCount: 0, totalPages: 0, currentPage: 1, hasMore: false };
      const from = (input.page - 1) * input.pageSize;
      const { data, count, error } = await supabase.from('discussions').select('*', { count: 'exact' }).eq('target_type', input.targetType).eq('target_id', input.targetId).order('created_at', { ascending: false }).range(from, from + input.pageSize - 1);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / input.pageSize);
      return { discussions: data || [], totalCount, totalPages, currentPage: input.page, hasMore: input.page < totalPages };
    }),

  discussionCreate: protectedProcedure
    .input(z.object({ targetType: z.enum(['product', 'price', 'store']), targetId: z.string().uuid(), content: z.string().min(1).max(2000), parentId: z.string().uuid().optional() }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      const { data, error } = await supabase.from('discussions').insert({ user_id: ctx.user.userId, target_type: input.targetType, target_id: input.targetId, content: input.content, parent_id: input.parentId || null }).select().single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  // Bookmarks flat endpoints
  bookmarksList: protectedProcedure
    .input(z.object({ page: z.number().default(1), pageSize: z.number().default(20) }))
    .query(async ({ input, ctx }) => {
      if (!supabase) return { bookmarks: [], totalCount: 0, totalPages: 0, currentPage: 1, hasMore: false };
      const from = (input.page - 1) * input.pageSize;
      const { data, count, error } = await supabase.from('bookmarks').select('*, products(*)', { count: 'exact' }).eq('user_id', ctx.user.userId).order('created_at', { ascending: false }).range(from, from + input.pageSize - 1);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      
      const bookmarksWithStats = await Promise.all((data || []).map(async (bookmark) => {
        if (!supabase) return { ...bookmark, priceStats: { lowest: null, average: null, highest: null, recentPrices: [] } };
        const { data: prices } = await supabase.from('prices').select('price, detected_at, stores(name)').eq('product_id', bookmark.product_id).order('detected_at', { ascending: false });
        const priceValues = (prices || []).map(p => Number(p.price));
        return { ...bookmark, priceStats: { lowest: priceValues.length ? Math.min(...priceValues) : null, average: priceValues.length ? priceValues.reduce((a, b) => a + b, 0) / priceValues.length : null, highest: priceValues.length ? Math.max(...priceValues) : null, recentPrices: prices || [] } };
      }));
      
      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / input.pageSize);
      return { bookmarks: bookmarksWithStats, totalCount, totalPages, currentPage: input.page, hasMore: input.page < totalPages };
    }),

  bookmarkCreate: protectedProcedure
    .input(z.object({ productId: z.string().uuid(), notifyOnPriceDrop: z.boolean().default(true), targetPrice: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      const { data, error } = await supabase.from('bookmarks').upsert({ user_id: ctx.user.userId, product_id: input.productId, notify_on_price_drop: input.notifyOnPriceDrop, target_price: input.targetPrice || null }, { onConflict: 'user_id,product_id' }).select().single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  bookmarkDelete: protectedProcedure
    .input(z.object({ productId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      const { error } = await supabase.from('bookmarks').delete().eq('user_id', ctx.user.userId).eq('product_id', input.productId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  bookmarkCheck: protectedProcedure
    .input(z.object({ productId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      if (!supabase) return null;
      const { data } = await supabase.from('bookmarks').select('*').eq('user_id', ctx.user.userId).eq('product_id', input.productId).maybeSingle();
      return data;
    }),

  priceAlertsList: protectedProcedure
    .input(z.object({ unreadOnly: z.boolean().default(false), limit: z.number().default(50) }))
    .query(async ({ input, ctx }) => {
      if (!supabase) return { alerts: [], totalCount: 0 };
      let query = supabase.from('price_alerts').select('*, products(*)', { count: 'exact' }).eq('user_id', ctx.user.userId).order('created_at', { ascending: false }).limit(input.limit);
      if (input.unreadOnly) query = query.eq('is_read', false);
      const { data, count, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { alerts: data || [], totalCount: count || 0 };
    }),

  priceAlertsMarkAsRead: protectedProcedure
    .input(z.object({ alertId: z.string().uuid().optional() }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      let query = supabase.from('price_alerts').update({ is_read: true }).eq('user_id', ctx.user.userId);
      if (input.alertId) query = query.eq('id', input.alertId);
      else query = query.eq('is_read', false);
      const { error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // Health check
  health: publicProcedure.query(() => ({
    status: "ok",
    supabase: !!supabase,
    timestamp: new Date().toISOString(),
  })),
});

export type AppRouter = typeof appRouter;
