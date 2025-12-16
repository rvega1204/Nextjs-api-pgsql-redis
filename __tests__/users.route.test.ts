import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock pg module
const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockRelease = jest.fn();
const mockClientQuery = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockQuery,
    connect: mockConnect,
  })),
}));

// Mock ioredis module
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
  }));
});

// Import after mocking
import { GET, POST } from '../app/users/route';

describe('Users API Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockRelease,
    });
  });

  describe('GET /users', () => {
    const mockUsers = [
      { id: '1', name: 'John Doe', email: 'john@example.com', age: 30 },
      { id: '2', name: 'Jane Smith', email: 'jane@example.com', age: 25 },
    ];

    it('should return cached users when cache exists', async () => {
      mockRedisGet.mockResolvedValue(JSON.stringify(mockUsers));

      const response = await GET();
      const data = await response.json();

      expect(mockRedisGet).toHaveBeenCalledWith('users');
      expect(mockQuery).not.toHaveBeenCalled();
      expect(data).toEqual(mockUsers);
      expect(response.status).toBe(200);
    });

    it('should fetch from database and cache when cache is empty', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockQuery.mockResolvedValue({ rows: mockUsers });

      const response = await GET();
      const data = await response.json();

      expect(mockRedisGet).toHaveBeenCalledWith('users');
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT id, name, email, age FROM users'
      );
      expect(mockRedisSet).toHaveBeenCalledWith(
        'users',
        JSON.stringify(mockUsers),
        'EX',
        60
      );
      expect(data).toEqual(mockUsers);
      expect(response.status).toBe(200);
    });

    it('should return empty array when no users exist', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockQuery.mockResolvedValue({ rows: [] });

      const response = await GET();
      const data = await response.json();

      expect(data).toEqual([]);
      expect(response.status).toBe(200);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisGet.mockRejectedValue(new Error('Redis connection failed'));

      const response = await GET();
      const data = await response.json();

      expect(data).toEqual({ error: 'Failed to fetch users' });
      expect(response.status).toBe(500);
    });

    it('should handle database errors gracefully', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      const response = await GET();
      const data = await response.json();

      expect(data).toEqual({ error: 'Failed to fetch users' });
      expect(response.status).toBe(500);
    });
  });

  describe('POST /users', () => {
    const newUser = {
      id: '3',
      name: 'Bob Johnson',
      email: 'bob@example.com',
      age: 35,
    };

    it('should create a single user and invalidate cache', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] });

      const request = new NextRequest('http://localhost:3000/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(mockConnect).toHaveBeenCalled();
      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        [newUser.id, newUser.name, newUser.email, newUser.age]
      );
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockRedisDel).toHaveBeenCalledWith('users');
      expect(mockRelease).toHaveBeenCalled();
      expect(data).toEqual({ success: true, count: 1 });
      expect(response.status).toBe(200);
    });

    it('should create multiple users in a transaction', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] });

      const users = [
        { id: '3', name: 'Bob Johnson', email: 'bob@example.com', age: 35 },
        { id: '4', name: 'Alice Williams', email: 'alice@example.com', age: 28 },
      ];

      const request = new NextRequest('http://localhost:3000/users', {
        method: 'POST',
        body: JSON.stringify(users),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledTimes(4); // BEGIN + 2 inserts + COMMIT
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockRedisDel).toHaveBeenCalledWith('users');
      expect(data).toEqual({ success: true, count: 2 });
      expect(response.status).toBe(200);
    });

    it('should update existing user on conflict', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] });

      const existingUser = {
        id: '1',
        name: 'John Doe Updated',
        email: 'john.updated@example.com',
        age: 31,
      };

      const request = new NextRequest('http://localhost:3000/users', {
        method: 'POST',
        body: JSON.stringify(existingUser),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (id) DO UPDATE SET'),
        [existingUser.id, existingUser.name, existingUser.email, existingUser.age]
      );
      expect(data).toEqual({ success: true, count: 1 });
      expect(response.status).toBe(200);
    });

    it('should rollback transaction on error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Insert failed')); // INSERT

      const request = new NextRequest('http://localhost:3000/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockRelease).toHaveBeenCalled();
      expect(data).toEqual({ error: 'Failed to write users' });
      expect(response.status).toBe(500);
    });

    it('should handle invalid JSON body', async () => {
      const request = new NextRequest('http://localhost:3000/users', {
        method: 'POST',
        body: 'invalid json',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data).toEqual({ error: 'Failed to write users' });
      expect(response.status).toBe(500);
    });

    it('should convert single user object to array', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] });

      const request = new NextRequest('http://localhost:3000/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.count).toBe(1);
      expect(response.status).toBe(200);
    });
  });

  describe('Redis Cache Integration', () => {
    it('should set cache with correct TTL', async () => {
      const mockUsers = [
        { id: '1', name: 'John Doe', email: 'john@example.com', age: 30 },
      ];
      mockRedisGet.mockResolvedValue(null);
      mockQuery.mockResolvedValue({ rows: mockUsers });

      await GET();

      expect(mockRedisSet).toHaveBeenCalledWith(
        'users',
        JSON.stringify(mockUsers),
        'EX',
        60
      );
    });

    it('should invalidate cache after POST', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] });

      const request = new NextRequest('http://localhost:3000/users', {
        method: 'POST',
        body: JSON.stringify({ id: '1', name: 'Test', email: 'test@test.com', age: 20 }),
      });

      await POST(request);

      expect(mockRedisDel).toHaveBeenCalledWith('users');
    });
  });

  describe('Database Transaction Handling', () => {
    it('should properly manage client connection lifecycle', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] });

      const request = new NextRequest('http://localhost:3000/users', {
        method: 'POST',
        body: JSON.stringify({ id: '1', name: 'Test', email: 'test@test.com', age: 20 }),
      });

      await POST(request);

      expect(mockConnect).toHaveBeenCalled();
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should release client even after rollback', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Error')); // INSERT

      const request = new NextRequest('http://localhost:3000/users', {
        method: 'POST',
        body: JSON.stringify({ id: '1', name: 'Test', email: 'test@test.com', age: 20 }),
      });

      await POST(request);

      expect(mockRelease).toHaveBeenCalled();
    });
  });
});
