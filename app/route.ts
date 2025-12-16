/**
 * Database Setup and Health Check Route
 *
 * This is the root API endpoint that performs two main functions:
 * 1. Database health check - Verifies PostgreSQL connection is working
 * 2. Table initialization - Creates the users table if it doesn't exist
 *
 * This endpoint is typically called once during application setup or can be
 * used as a health check endpoint to verify database connectivity.
 *
 * @module app/route
 */

import { NextResponse } from "next/server";
import { Client } from "pg";

/**
 * GET handler for root API endpoint (/)
 *
 * Performs database initialization and health check:
 * 1. Connects to PostgreSQL database
 * 2. Creates users table if it doesn't exist (idempotent operation)
 * 3. Returns success message confirming connection
 * 4. Properly closes database connection in finally block
 *
 * This endpoint is safe to call multiple times - it only creates the table
 * if it doesn't already exist (CREATE TABLE IF NOT EXISTS).
 *
 * @returns {Promise<NextResponse>} JSON response with status message
 *
 * @example
 * // Call this endpoint to initialize database
 * fetch('http://localhost:3000/')
 *   .then(res => res.json())
 *   .then(data => console.log(data))
 *
 * // Response on success (200):
 * {
 *   "message": "Table ensured and connected"
 * }
 *
 * @example
 * // Response on error (500):
 * {
 *   "message": "Database error"
 * }
 *
 * @throws {Error} If database connection fails or table creation fails
 *
 * @remarks
 * **Important Notes:**
 * - This uses Client instead of Pool for one-time operations
 * - Connection is properly closed in the finally block
 * - Table schema uses UUID for id (instead of VARCHAR in /users route)
 * - Email field has UNIQUE constraint
 * - All fields are NOT NULL for data integrity
 *
 * @see {@link app/users/route.ts} for the main CRUD operations
 */
export async function GET() {
  // Create a new database client
  // Uses Client for one-off operations instead of Pool
  const client = new Client({
    connectionString: process.env.PGSQL_URL,
  });

  try {
    // Establish connection to PostgreSQL
    await client.connect();

    // Create users table if it doesn't exist
    // This is an idempotent operation - safe to run multiple times
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        age INTEGER NOT NULL
      );
    `);

    // Return success response
    return NextResponse.json({ message: "Table ensured and connected" });
  } catch (error) {
    // Log error details for debugging (server-side only)
    console.error("Database error:", error);

    // Return generic error message to client
    // Don't expose sensitive database details to the client
    return NextResponse.json(
      { message: "Database error" },
      { status: 500 }
    );
  } finally {
    // Always close the connection to prevent connection leaks
    // This runs whether the try block succeeds or fails
    await client.end();
  }
}

/**
 * Database Schema Documentation
 *
 * The users table has the following structure:
 *
 * | Column | Type    | Constraints           | Description                    |
 * |--------|---------|-----------------------|--------------------------------|
 * | id     | UUID    | PRIMARY KEY           | Unique identifier for user     |
 * | name   | TEXT    | NOT NULL              | User's full name               |
 * | email  | TEXT    | UNIQUE, NOT NULL      | User's email (must be unique)  |
 * | age    | INTEGER | NOT NULL              | User's age in years            |
 *
 * **Note:** The /users route uses VARCHAR(255) for id instead of UUID.
 */
