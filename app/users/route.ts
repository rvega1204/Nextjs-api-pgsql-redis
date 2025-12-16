/**
 * Users API Route
 *
 * This module provides CRUD operations for user management with Redis caching.
 * It implements a cache-aside pattern where data is first checked in Redis cache
 * before querying the PostgreSQL database.
 *
 * @module app/users/route
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Pool } from "pg";
import Redis from "ioredis";

/* =========================
   Types
========================= */

/**
 * User entity interface
 * @interface User
 * @property {string} id - Unique identifier for the user
 * @property {string} name - User's full name
 * @property {string} email - User's email address
 * @property {number} age - User's age
 */
interface User {
  id: string;
  name: string;
  email: string;
  age: number;
}

/* =========================
   Connections (singletons)
========================= */

/**
 * PostgreSQL connection pool
 * Manages database connections using connection string from environment variable
 */
const pool = new Pool({
  connectionString: process.env.PGSQL_URL,
});

/**
 * Redis client instance
 * Used for caching user data to improve read performance
 */
const redis = new Redis(process.env.REDIS_URL!);

/**
 * Redis cache key for storing users list
 */
const USERS_CACHE_KEY = "users";

/**
 * Cache Time-To-Live in seconds
 * Cached data expires after this duration
 */
const USERS_CACHE_TTL = 60; // seconds

/* =========================
   DB helpers
========================= */

/**
 * Reads all users from the PostgreSQL database
 *
 * @returns {Promise<User[]>} Array of user objects
 * @throws {Error} If database query fails
 */
async function readUsers(): Promise<User[]> {
  const { rows } = await pool.query<User>(
    "SELECT id, name, email, age FROM users"
  );
  return rows;
}

/**
 * Writes users to the PostgreSQL database using a transaction
 *
 * Uses INSERT ... ON CONFLICT to handle both create and update operations.
 * If a user with the same ID exists, it will be updated with new values.
 * All operations are wrapped in a transaction to ensure data consistency.
 *
 * @param {User[]} users - Array of users to write/update
 * @returns {Promise<void>}
 * @throws {Error} If transaction fails, all changes are rolled back
 */
async function writeUsers(users: User[]) {
  const insertQuery = `
    INSERT INTO users (id, name, email, age)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      age = EXCLUDED.age;
  `;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const user of users) {
      await client.query(insertQuery, [
        user.id,
        user.name,
        user.email,
        user.age,
      ]);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* =========================
   GET — cache → DB
========================= */

/**
 * GET handler for /api/users endpoint
 *
 * Retrieves all users using a cache-aside pattern:
 * 1. First checks Redis cache for cached data
 * 2. If cache hit, returns cached data immediately
 * 3. If cache miss, queries PostgreSQL database
 * 4. Stores the result in Redis cache for future requests
 * 5. Returns the data to the client
 *
 * @returns {Promise<NextResponse>} JSON response with users array or error message
 *
 * @example
 * Response on success:
 * [
 *   { "id": "1", "name": "John Doe", "email": "john@example.com", "age": 30 },
 *   { "id": "2", "name": "Jane Smith", "email": "jane@example.com", "age": 25 }
 * ]
 *
 * @example
 * Response on error (500):
 * { "error": "Failed to fetch users" }
 */
export async function GET() {
  try {
    // Check cache first
    const cached = await redis.get(USERS_CACHE_KEY);
    if (cached) {
      return NextResponse.json(JSON.parse(cached));
    }

    // Cache miss - query database
    const users = await readUsers();

    // Store in cache for future requests
    await redis.set(
      USERS_CACHE_KEY,
      JSON.stringify(users),
      "EX",
      USERS_CACHE_TTL
    );

    return NextResponse.json(users);
  } catch (err) {
    console.error("GET /users failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

/* =========================
   POST — DB → invalidate cache
========================= */

/**
 * POST handler for /api/users endpoint
 *
 * Creates or updates users in the database:
 * 1. Accepts single user object or array of users
 * 2. Writes/updates users in a database transaction
 * 3. Invalidates Redis cache to ensure consistency
 * 4. Returns success status with count of affected users
 *
 * @param req - Next.js request object containing user data in body
 * @returns {Promise<NextResponse>} JSON response with success status or error
 *
 * @example
 * Request body (single user):
 * { "id": "1", "name": "John Doe", "email": "john@example.com", "age": 30 }
 *
 * @example
 * Request body (multiple users):
 * [
 *   { "id": "1", "name": "John Doe", "email": "john@example.com", "age": 30 },
 *   { "id": "2", "name": "Jane Smith", "email": "jane@example.com", "age": 25 }
 * ]
 *
 * @example
 * Response on success (200):
 * { "success": true, "count": 2 }
 *
 * @example
 * Response on error (500):
 * { "error": "Failed to write users" }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Normalize input to array format
    const users: User[] = Array.isArray(body) ? body : [body];

    // Write to database in a transaction
    await writeUsers(users);

    // Invalidate cache to ensure data consistency
    await redis.del(USERS_CACHE_KEY);

    return NextResponse.json({
      success: true,
      count: users.length,
    });
  } catch (err) {
    console.error("POST /users failed:", err);
    return NextResponse.json(
      { error: "Failed to write users" },
      { status: 500 }
    );
  }
}
