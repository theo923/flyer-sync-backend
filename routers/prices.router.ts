import { z } from "zod";
import { router, publicProcedure, protectedProcedure, TRPCError } from "../trpc";
import { supabase, type PriceWithDetails } from "../supabase";

export const pricesRouter = router({
  add: protectedProcedure
    .input(z.object({
      productId: z.string().uuid(),
      storeId: z.string().uuid(),
      price: z.number().positive(),
      originalPrice: z.number().optional(),
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
          original_price: input.originalPrice || null,
          receipt_image_path: input.receiptImagePath || null,
        })
        .select("*, products(*), stores(*)")
        .single();
      
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      console.log(`✅ Price added: ${input.price} for product ${input.productId}`);
      return data as PriceWithDetails;
    }),

  history: publicProcedure
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

  cheapest: publicProcedure
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

  recent: publicProcedure
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

  byStore: protectedProcedure
    .input(z.object({ 
      storeId: z.string().uuid(),
      limit: z.number().default(50)
    }))
    .query(async ({ input, ctx }) => {
      if (!supabase) return [];
      
      const { data } = await supabase
        .from("prices")
        .select("*, products(*)")
        .eq("store_id", input.storeId)
        .eq("user_id", ctx.user.userId)
        .order("detected_at", { ascending: false })
        .limit(input.limit);
      
      return (data || []) as PriceWithDetails[];
    }),
});
