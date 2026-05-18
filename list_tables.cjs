const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient();

(async () => {
  try {
    const tables = await db.$queryRawUnsafe(`
      SELECT table_name, table_schema 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log("=== Database Tables ===");
    tables.forEach(t => {
      console.log(`${t.table_schema}.${t.table_name}`);
    });
    
    console.log("\n=== Required Tables Check ===");
    const required = ["workspace", "user", "decision", "action", "auditEvent", "webhookEvent"];
    const tableNames = tables.map(t => t.table_name);
    
    required.forEach(table => {
      const exists = tableNames.includes(table);
      console.log(`${table}: ${exists ? '✓' : '✗'}`);
    });
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await db.$disconnect();
  }
})();
