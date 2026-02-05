import { z } from "zod";
import { router, protectedProcedure, TRPCError } from "../trpc";
import { supabase, type Bookmark, type PriceAlert } from "../supabase";

export const bookmarksRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ input, ctx }) => {
      const db = supabase;
      if (!db) return { bookmarks: [], totalCount: 0, totalPages: 0, currentPage: 1, hasMore: false };
      
      const from = (input.page - 1) * input.pageSize;
      const to = from + input.pageSize - 1;
      
      // 1. Get bookmarks
      const { data, count, error } = await db
        .from('bookmarks')
        .select('*, products(*)', { count: 'exact' })
        .eq('user_id', ctx.user.userId)
        .order('created_at', { ascending: false })
        .range(from, to);
        
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      
      // 2. For each bookmark, fetch price stats
      const bookmarksWithStats = await Promise.all((data || []).map(async (bookmark) => {
        const { data: prices } = await db
          .from('prices')
          .select('price, detected_at, stores(name)')
          .eq('product_id', bookmark.product_id)
          .order('detected_at', { ascending: false });
          
        const priceValues = (prices || []).map(p => Number(p.price));
        const stats = {
          lowest: priceValues.length > 0 ? Math.min(...priceValues) : null,
          average: priceValues.length > 0 ? priceValues.reduce((a, b) => a + b, 0) / priceValues.length : null,
          highest: priceValues.length > 0 ? Math.max(...priceValues) : null,
          recentPrices: prices || [],
        };
        
        return {
          ...bookmark,
          priceStats: stats,
        };
      }));
      
      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / input.pageSize);
      
      return {
        bookmarks: bookmarksWithStats,
        totalCount,
        totalPages,
        currentPage: input.page,
        hasMore: input.page < totalPages,
      };
    }),

  create: protectedProcedure
    .input(z.object({
      productId: z.string().uuid(),
      notifyOnPriceDrop: z.boolean().default(true),
      targetPrice: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      
      const { data, error } = await supabase
        .from('bookmarks')
        .upsert({
          user_id: ctx.user.userId,
          product_id: input.productId,
          notify_on_price_drop: input.notifyOnPriceDrop,
          target_price: input.targetPrice || null,
        }, { 
          onConflict: 'user_id,product_id' 
        })
        .select()
        .single();
        
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data as Bookmark;
    }),

  delete: protectedProcedure
    .input(z.object({
      productId: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      
      const { error } = await supabase
        .from('bookmarks')
        .delete()
        .eq('user_id', ctx.user.userId)
        .eq('product_id', input.productId);
        
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  check: protectedProcedure
    .input(z.object({
      productId: z.string().uuid(),
    }))
    .query(async ({ input, ctx }) => {
      if (!supabase) return null;
      
      const { data } = await supabase
        .from('bookmarks')
        .select('*')
        .eq('user_id', ctx.user.userId)
        .eq('product_id', input.productId)
        .maybeSingle();
        
      return data as Bookmark | null;
    }),

  // Price Alerts
  alertsList: protectedProcedure
    .input(z.object({
      unreadOnly: z.boolean().default(false),
      limit: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      const db = supabase;
      if (!db) return { alerts: [], totalCount: 0 };
      
      let query = db
        .from('price_alerts')
        .select('*, products(*)', { count: 'exact' })
        .eq('user_id', ctx.user.userId)
        .order('created_at', { ascending: false })
        .limit(input.limit);
        
      if (input.unreadOnly) {
        query = query.eq('is_read', false);
      }
      
      const { data, count, error } = await query;
        
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      
      return {
        alerts: data as PriceAlert[],
        totalCount: count || 0,
      };
    }),

  alertsMarkAsRead: protectedProcedure
    .input(z.object({
      alertId: z.string().uuid().optional(), // If null, mark all as read
    }))
    .mutation(async ({ input, ctx }) => {
      const db = supabase;
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      
      let query = db
        .from('price_alerts')
        .update({ is_read: true })
        .eq('user_id', ctx.user.userId);
        
      if (input.alertId) {
        query = query.eq('id', input.alertId);
      } else {
        query = query.eq('is_read', false);
      }
      
      const { error } = await query;
        
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),
});
