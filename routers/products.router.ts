import { z } from "zod";
import { router, publicProcedure, protectedProcedure, TRPCError } from "../trpc";
import { supabase, type Product } from "../supabase";

export const productsRouter = router({
  list: publicProcedure
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

  search: publicProcedure
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

  create: protectedProcedure
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

  getOrCreate: protectedProcedure
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
});
