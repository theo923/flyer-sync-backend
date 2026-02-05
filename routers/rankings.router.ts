import { router, publicProcedure, protectedProcedure } from "../trpc";
import { supabase } from "../supabase";

export const rankingsRouter = router({
  getTop: publicProcedure.query(async () => {
    if (!supabase) return [];
    
    const { data, error } = await supabase.rpc("get_top_contributors", { lim: 10 });
    
    if (error) {
      console.error("Ranking RPC failed:", error.message);
      return [];
    }
    
    return (data || []) as { userId: string; count: number }[];
  }),

  userProfile: protectedProcedure.query(async ({ ctx }) => {
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
});
