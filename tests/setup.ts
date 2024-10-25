import { createClient, RedisClientType, RedisClientOptions } from 'redis';

let client: RedisClientType | null = null;

export async function createTestClient(): Promise<RedisClientType> {
	try {
		if (client === null) {
			client = createClient({
				url: process.env.REDIS_URL || 'redis://localhost:6379',
			});

			client.on('error', (err) =>
				console.error('Redis Client Error', err)
			);
			await client.connect();
		} else if (!client.isOpen) {
			await client.connect();
		}

		return client;
	} catch (error) {
		console.error('Failed to create Redis client:', error);
		throw error;
	}
}

export async function clearRedis(): Promise<void> {
	const redis = await createTestClient();
	await redis.flushDb();
}

export async function closeRedis(): Promise<void> {
	if (client && client.isOpen) {
		await client.quit();
		client = null;
	}
}

// Optional: Add a function to force a new connection (useful for testing)
export async function resetTestClient(): Promise<void> {
	if (client) {
		await closeRedis();
	}
	client = null;
}
