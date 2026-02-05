import { z } from "zod";
import { router, publicProcedure, protectedProcedure, TRPCError } from "../trpc";
import { supabase, type Store } from "../supabase";

export const storesRouter = router({
  list: publicProcedure.query(async () => {
    if (!supabase) return [];
    const { data } = await supabase
      .from("stores")
      .select("*")
      .eq("is_deleted", false)
      .order("name");
    return (data || []) as Store[];
  }),

  nearby: publicProcedure
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
        const { data: allStores } = await supabase
          .from("stores")
          .select("*")
          .eq("is_deleted", false);
        return (allStores || []) as Store[];
      }
      
      return (data || []) as Store[];
    }),

  getById: publicProcedure
    .input(z.object({ storeId: z.string().uuid() }))
    .query(async ({ input }) => {
      if (!supabase) return null;
      const { data } = await supabase
        .from("stores")
        .select("*")
        .eq("id", input.storeId)
        .eq("is_deleted", false)
        .maybeSingle();
      return data as Store | null;
    }),

  create: protectedProcedure
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

  getOrCreate: protectedProcedure
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
        .eq("is_deleted", false)
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

  checkDuplicate: protectedProcedure
    .input(z.object({
      name: z.string(),
      address: z.string().optional(),
      latitude: z.number(),
      longitude: z.number(),
    }))
    .mutation(async ({ input }) => {
      if (!supabase) return { status: "none" };

      // 1. Check for exact name match
      const { data: nameMatch } = await supabase
        .from("stores")
        .select("*")
        .ilike("name", input.name) // Case-insensitive full match
        .eq("is_deleted", false)
        .maybeSingle();

      if (nameMatch) {
        return { status: "exact", message: "A store with this exact name already exists.", store: nameMatch };
      }

      // 2. Check for location proximity (approx 100m)
      // Simple bounding box check for speed/simplicity without PostGIS complexity here
      // 0.001 degrees is roughly 111 meters
      const { data: locMatch } = await supabase
        .from("stores")
        .select("*")
        .eq("is_deleted", false)
        .gte("latitude", input.latitude - 0.001)
        .lte("latitude", input.latitude + 0.001)
        .gte("longitude", input.longitude - 0.001)
        .lte("longitude", input.longitude + 0.001)
        .limit(1)
        .maybeSingle();

      if (locMatch) {
        return { status: "location", message: `A store is already at this location: "${locMatch.name}"`, store: locMatch };
      }

      return { status: "none" };
    }),

  recordVisit: protectedProcedure
    .input(z.object({ storeId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      // Just log it or update a last_visited timestamp if it existed. 
      // For now, we'll just return success to satisfy the frontend.
      return { success: true };
    }),

  softDelete: protectedProcedure
    .input(z.object({ storeId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      const { error } = await supabase
        .from("stores")
        .update({ is_deleted: true })
        .eq("id", input.storeId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  visited: protectedProcedure
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
        .in("id", storeIds)
        .eq("is_deleted", false);
        
      return (stores || []) as Store[];
    }),

  stats: protectedProcedure
    .input(z.object({ storeId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      if (!supabase) return { totalSpent: 0, avgPerItem: 0, thisMonthSpent: 0, itemCount: 0 };

      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data: prices } = await supabase
        .from("prices")
        .select("price")
        .eq("store_id", input.storeId)
        .eq("user_id", ctx.user.userId);

      const { data: monthlyPrices } = await supabase
        .from("prices")
        .select("price")
        .eq("store_id", input.storeId)
        .eq("user_id", ctx.user.userId)
        .gte("detected_at", firstDayOfMonth);

      const totalSpent = prices?.reduce((sum, p) => sum + Number(p.price), 0) || 0;
      const itemCount = prices?.length || 0;
      const avgPerItem = itemCount > 0 ? totalSpent / itemCount : 0;
      const thisMonthSpent = monthlyPrices?.reduce((sum, p) => sum + Number(p.price), 0) || 0;

      return { totalSpent, avgPerItem, thisMonthSpent, itemCount };
    }),
});
