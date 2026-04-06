import { FastifyRequest, FastifyReply } from 'fastify'
import { verifyIdToken } from '../firebase-admin'

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const authorization = req.headers.authorization
  if (!authorization?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
  try {
    const decoded = await verifyIdToken(authorization.slice(7))
    req.firebaseUid   = decoded.uid
    req.firebaseEmail = decoded.email ?? ''
  } catch {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
}
