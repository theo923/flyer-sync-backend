
import * as dotenv from "dotenv";
dotenv.config(); // Ensure env vars are loaded first thing

import { appRouter } from "../routers";
import { TRPCContext } from "../trpc";
import { supabase } from "../supabase";


import * as fs from 'fs';
import * as path from 'path';

const logFile = path.join(process.cwd(), 'verify_log.txt');
const log = (msg: string) => {
  fs.appendFileSync(logFile, msg + '\n');
  console.log(msg);
};

// Clear log file
fs.writeFileSync(logFile, '');

async function verify() {
  log("🔍 Verifying Backend State...");
  
  if (!supabase) {
    log("❌ Supabase client is NULL. Check environment variables.");
    process.exit(1);
  }
  log("✅ Supabase client initialized");

  const ctx: TRPCContext = {
    user: { userId: "test-user-id", role: "user" }
  };

  const caller = appRouter.createCaller(ctx);

  try {
    log("Testing voteGetCounts...");
    const voteCounts = await caller.voteGetCounts({
      targetType: "product",
      targetId: "00000000-0000-0000-0000-000000000000"
    });
    log("✅ voteGetCounts result: " + JSON.stringify(voteCounts));
  } catch (error: any) {
    log("❌ voteGetCounts failed: " + error.message);
  }

  try {
    log("Testing bookmarksList...");
    const bookmarks = await caller.bookmarksList({ page: 1 });
    log("✅ bookmarksList result count: " + bookmarks.bookmarks.length);
  } catch (error: any) {
    log("❌ bookmarksList failed: " + error.message);
    if (error.stack) log(error.stack);
  }
}

verify().catch(err => log("FATAL: " + err.message));

