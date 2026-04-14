import {
  RekognitionClient,
  DetectModerationLabelsCommand,
} from '@aws-sdk/client-rekognition'

const HAS_AWS_CREDS = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)

const rekognition = HAS_AWS_CREDS
  ? new RekognitionClient({ region: process.env.AWS_REGION || 'ap-south-1' })
  : null

// Labels that should block an image upload
const BLOCKED_CATEGORIES = new Set([
  'Explicit Nudity',
  'Nudity',
  'Sexual Activity',
  'Graphic Violence',
  'Drugs & Tobacco',
  'Hate Symbols',
])

interface ModerationResult {
  safe: boolean
  labels: { name: string; confidence: number }[]
}

/**
 * Sends a base64 image to AWS Rekognition DetectModerationLabels.
 * Cost: ~₹0.085 per call (~$1 / 1000 images).
 * When AWS credentials are not configured, allows all images through.
 */
export async function checkImage(base64Data: string): Promise<ModerationResult> {
  if (!rekognition) {
    // No AWS credentials — skip moderation, allow upload
    return { safe: true, labels: [] }
  }

  // Strip the data-URI prefix if present  (e.g. "data:image/jpeg;base64,...")
  const raw = base64Data.replace(/^data:image\/[^;]+;base64,/, '')
  const imageBytes = Buffer.from(raw, 'base64')

  const resp = await rekognition.send(
    new DetectModerationLabelsCommand({
      Image: { Bytes: imageBytes },
      MinConfidence: 60,
    }),
  )

  const labels = (resp.ModerationLabels ?? []).map((l) => ({
    name: l.Name ?? 'Unknown',
    confidence: l.Confidence ?? 0,
  }))

  const isUnsafe = labels.some(
    (l) => BLOCKED_CATEGORIES.has(l.name) && l.confidence >= 75,
  )

  return { safe: !isUnsafe, labels }
}
