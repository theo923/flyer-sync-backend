import { z } from "zod";
import { router, publicProcedure, protectedProcedure, TRPCError } from "../trpc";
import { supabase, type Discussion } from "../supabase";

export const votingRouter = router({
  getCounts: publicProcedure
    .input(z.object({
      targetType: z.enum(['product', 'price', 'discussion', 'store']),
      targetId: z.string().uuid(),
    }))
    .query(async ({ input }) => {
      const db = supabase;
      if (!db) return { upvotes: 0, downvotes: 0 };
      
      const { data, error } = await db.rpc('get_vote_counts', {
        p_target_type: input.targetType,
        p_target_id: input.targetId,
      });
      
      if (error) {
        // Fallback if RPC fails
        const { data: votes } = await db
          .from('votes')
          .select('vote_type')
          .eq('target_type', input.targetType)
          .eq('target_id', input.targetId);
          
        const upvotes = votes?.filter(v => v.vote_type === 'up').length || 0;
        const downvotes = votes?.filter(v => v.vote_type === 'down').length || 0;
        return { upvotes, downvotes };
      }
      
      return {
        upvotes: Number(data[0]?.upvotes || 0),
        downvotes: Number(data[0]?.downvotes || 0),
      };
    }),

  getUserVote: protectedProcedure
    .input(z.object({
      targetType: z.enum(['product', 'price', 'discussion', 'store']),
      targetId: z.string().uuid(),
    }))
    .query(async ({ input, ctx }) => {
      const db = supabase;
      if (!db) return null;
      
      const { data } = await db
        .from('votes')
        .select('vote_type')
        .eq('user_id', ctx.user.userId)
        .eq('target_type', input.targetType)
        .eq('target_id', input.targetId)
        .maybeSingle();
        
      return data?.vote_type || null;
    }),

  submit: protectedProcedure
    .input(z.object({
      targetType: z.enum(['product', 'price', 'discussion', 'store']),
      targetId: z.string().uuid(),
      voteType: z.enum(['up', 'down']),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      
      const { error } = await supabase
        .from('votes')
        .upsert({
          user_id: ctx.user.userId,
          target_type: input.targetType,
          target_id: input.targetId,
          vote_type: input.voteType,
        }, { 
          onConflict: 'user_id,target_type,target_id' 
        });
        
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  remove: protectedProcedure
    .input(z.object({
      targetType: z.enum(['product', 'price', 'discussion', 'store']),
      targetId: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      
      const { error } = await supabase
        .from('votes')
        .delete()
        .eq('user_id', ctx.user.userId)
        .eq('target_type', input.targetType)
        .eq('target_id', input.targetId);
        
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // Discussions
  discussionList: publicProcedure
    .input(z.object({
      targetType: z.enum(['product', 'price', 'store']),
      targetId: z.string().uuid(),
      page: z.number().default(1),
      pageSize: z.number().default(10),
    }))
    .query(async ({ input }) => {
      if (!supabase) return { discussions: [], totalCount: 0, totalPages: 0, currentPage: 1, hasMore: false };
      
      const from = (input.page - 1) * input.pageSize;
      const to = from + input.pageSize - 1;
      
      const { data, count, error } = await supabase
        .from('discussions')
        .select('*', { count: 'exact' })
        .eq('target_type', input.targetType)
        .eq('target_id', input.targetId)
        .order('created_at', { ascending: false })
        .range(from, to);
        
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      
      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / input.pageSize);
      
      return {
        discussions: data as Discussion[],
        totalCount,
        totalPages,
        currentPage: input.page,
        hasMore: input.page < totalPages,
      };
    }),

  discussionCreate: protectedProcedure
    .input(z.object({
      targetType: z.enum(['product', 'price', 'store']),
      targetId: z.string().uuid(),
      content: z.string().min(1).max(2000),
      parentId: z.string().uuid().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      
      const { data, error } = await supabase
        .from('discussions')
        .insert({
          user_id: ctx.user.userId,
          target_type: input.targetType,
          target_id: input.targetId,
          content: input.content,
          parent_id: input.parentId || null,
        })
        .select()
        .single();
        
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data as Discussion;
    }),
});
