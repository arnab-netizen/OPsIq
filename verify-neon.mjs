const url = "postgresql://neondb_owner:npg_Ep1Tkt5zIrqw@ep-weathered-scene-an9n80y8-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
console.log("Testing Neon connectivity...");
console.log("URL:", url.substring(0, 80) + "...");

try {
  const { Pool, neonConfig } = await import("@neondatabase/serverless");
  console.log("Creating pool with Neon config...");
  const pool = new Pool({ connectionString: url, ...neonConfig });
  console.log("Pool created. Attempting query with 10 second timeout...");
  
  const timeout = setTimeout(() => {
    console.log("TIMEOUT: Query took > 10 seconds");
    process.exit(1);
  }, 10000);
  
  const result = await pool.query("SELECT 1 as test");
  clearTimeout(timeout);
  console.log("SUCCESS - Query result:", result.rows);
  await pool.end();
} catch (error) {
  console.log("FAILED:", error.message);
  process.exit(1);
}
