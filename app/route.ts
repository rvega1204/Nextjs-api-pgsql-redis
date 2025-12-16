// app/api/your-endpoint/route.ts
import { NextResponse } from "next/server";
import { Client } from "pg";

export async function GET() {
  const client = new Client({
    connectionString: process.env.PGSQL_URL,
  });

  try {
    await client.connect();

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        age INTEGER NOT NULL
      );
    `);

    return NextResponse.json({ message: "Table ensured and connected" });
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json(
      { message: "Database error" },
      { status: 500 }
    );
  } finally {
    await client.end();
  }
}
