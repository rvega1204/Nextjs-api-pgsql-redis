# Next.js API with PostgreSQL and Redis

A modern, production-ready REST API built with Next.js 15, PostgreSQL, and Redis caching. This project demonstrates best practices for building scalable APIs with database integration and intelligent caching strategies.

## Features

- **Next.js 15** - Latest version with App Router and Route Handlers
- **PostgreSQL** - Robust relational database for data persistence
- **Redis Caching** - High-performance caching layer with cache-aside pattern
- **TypeScript** - Full type safety throughout the application
- **Transaction Support** - ACID-compliant database operations
- **Comprehensive Testing** - Full test coverage with Jest
- **Error Handling** - Graceful error handling and recovery
- **UPSERT Operations** - Insert or update with conflict resolution
- **Well-Documented** - JSDoc documentation throughout the codebase

## Architecture

This API implements a **cache-aside pattern** for optimal performance:

1. **Read Operations (GET)**
   - Check Redis cache first
   - On cache hit: return cached data immediately
   - On cache miss: query PostgreSQL → cache result → return data
   - Cache TTL: 60 seconds

2. **Write Operations (POST)**
   - Write to PostgreSQL in a transaction
   - Invalidate Redis cache for consistency
   - Support both single and batch operations

## Project Structure

```
.
├── app/
│   └── users/
│       └── route.ts          # User API endpoints (GET, POST)
├── __tests__/
│   ├── setup.ts              # Test configuration
│   └── users.route.test.ts   # Comprehensive test suite
├── jest.config.js            # Jest configuration
├── tsconfig.json             # TypeScript configuration
├── tsconfig.test.json        # TypeScript config for tests
└── package.json              # Project dependencies
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Redis 6+

### Installation

1. Clone the repository:
```bash
git clone https://github.com/rvega1204/Nextjs-api-pgsql-redis.git
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:

Create a `.env.local` file in the root directory:

```env
PGSQL_URL=postgresql://username:password@localhost:5432/dbname
REDIS_URL=redis://localhost:6379
```

4. Set up the PostgreSQL database:

```sql
CREATE TABLE users (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  age INTEGER NOT NULL
);
```

### Running the Application

**Development mode:**
```bash
npm run dev
```

The API will be available at `http://localhost:3000`

**Production build:**
```bash
npm run build
npm start
```

## API Endpoints

### GET /users

Retrieve all users from the database (cached).

**Response:**
```json
[
  {
    "id": "1",
    "name": "John Doe",
    "email": "john@example.com",
    "age": 30
  },
  {
    "id": "2",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "age": 25
  }
]
```

**Status Codes:**
- `200 OK` - Success
- `500 Internal Server Error` - Database or Redis error

### POST /users

Create or update users (upsert operation).

**Request Body (Single User):**
```json
{
  "id": "1",
  "name": "John Doe",
  "email": "john@example.com",
  "age": 30
}
```

**Request Body (Multiple Users):**
```json
[
  {
    "id": "1",
    "name": "John Doe",
    "email": "john@example.com",
    "age": 30
  },
  {
    "id": "2",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "age": 25
  }
]
```

**Response:**
```json
{
  "success": true,
  "count": 2
}
```

**Status Codes:**
- `200 OK` - Success
- `500 Internal Server Error` - Database error or invalid JSON

## Testing

This project includes comprehensive test coverage with Jest.

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Test Coverage

The test suite includes 15 tests covering:

- ✅ Cache hit/miss scenarios
- ✅ Database operations (read/write)
- ✅ Error handling (Redis, PostgreSQL)
- ✅ Transaction management (commit/rollback)
- ✅ Cache invalidation
- ✅ Single and batch operations
- ✅ Connection lifecycle management

## Technology Stack

| Technology | Purpose |
|------------|---------|
| **Next.js 15** | React framework with API routes |
| **TypeScript** | Type-safe development |
| **PostgreSQL** | Relational database |
| **pg** | PostgreSQL client for Node.js |
| **Redis** | In-memory data store for caching |
| **ioredis** | Redis client for Node.js |
| **Jest** | Testing framework |
| **ts-jest** | TypeScript preprocessor for Jest |

## Key Features Explained

### Cache-Aside Pattern

The application implements a cache-aside (lazy loading) pattern:

```typescript
// GET request flow
1. Check cache
2. If found → return cached data
3. If not found → query database
4. Store in cache with TTL
5. Return data

// POST request flow
1. Write to database
2. Invalidate cache
3. Next GET request will refresh cache
```

### Transaction Safety

All write operations use PostgreSQL transactions:

```typescript
BEGIN TRANSACTION
  INSERT/UPDATE user 1
  INSERT/UPDATE user 2
  ...
COMMIT (or ROLLBACK on error)
```

### Upsert Operations

The API uses `INSERT ... ON CONFLICT` for atomic upsert:

```sql
INSERT INTO users (id, name, email, age)
VALUES ($1, $2, $3, $4)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  age = EXCLUDED.age;
```

## Error Handling

The API provides graceful error handling:

- **Redis failures** - Falls back to database, logs error
- **Database failures** - Returns 500 error with message
- **Invalid JSON** - Returns 500 error
- **Transaction failures** - Automatic rollback

## Performance Considerations

- **Connection Pooling** - PostgreSQL connection pool for efficient resource usage
- **Redis Caching** - 60-second TTL reduces database load
- **Batch Operations** - Support for multiple users in single transaction
- **Lazy Loading** - Cache populated only when needed

## Development

### Code Style

- Fully typed with TypeScript
- JSDoc documentation for all public functions
- Clear separation of concerns
- Error boundaries at API level

### Adding New Endpoints

1. Create new route file in `app/` directory
2. Implement GET/POST/PUT/DELETE handlers
3. Add tests in `__tests__/` directory
4. Update this README

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Docker (Alternative)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PGSQL_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |

## Contributing

This project is open for educational use. Feel free to:

- Fork the repository
- Submit pull requests
- Report issues
- Suggest improvements

## Educational Use

This project is specifically designed for students and learners. You are free to:

- Use it in your coursework
- Modify it for your assignments
- Learn from the code structure
- Build upon it for your projects
- Share it with other students

## Security

### Production Dependencies ✅ All Secure

| Package | Version | Vulnerabilities |
|---------|---------|-----------------|
| **Next.js 15** | 15.5.9 | ✅ **0** |
| **PostgreSQL (pg)** | 8.16.3 | ✅ **0** |
| **Redis (ioredis)** | 5.8.2 | ✅ **0** |

**Next.js 15 is fully secure** and includes the latest security patches. All production dependencies have zero vulnerabilities.

### Security Features

- **SQL Injection Protection** - Parameterized queries prevent SQL injection
- **XSS Protection** - Automatic escaping via React/Next.js
- **Transaction Safety** - ACID transactions with rollback
- **Secure Secrets** - Environment variables for credentials
- **Error Handling** - No sensitive data in error messages

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Redis Documentation](https://redis.io/documentation)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)

## License

MIT License - Free for educational use.

See [LICENSE](LICENSE) file for details.

## Author

Ricardo Vega, created for educational purposes to demonstrate modern API development with Next.js, PostgreSQL, and Redis.

---

**Happy Learning!** 🚀

For questions or issues, please open an issue in the repository.
