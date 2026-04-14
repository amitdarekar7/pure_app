/**
 * Redis pub/sub channel helpers.
 * All SSE clients subscribe to either provider:{id} or user:{id}.
 */
export const redisChannel = {
  provider: (providerId: string) => `provider:${providerId}`,
  user:     (userId:     string) => `user:${userId}`,
}
