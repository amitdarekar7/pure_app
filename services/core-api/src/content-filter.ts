import { Profanity } from '@2toad/profanity'

const profanity = new Profanity({ wholeWord: false })

// Add common Hindi profanity / sexual terms
profanity.addWords([
  'madarchod', 'behenchod', 'chutiya', 'gaand', 'bhosdi',
  'bhosadike', 'bhosdike', 'randi', 'harami', 'kamina',
  'gandu', 'lund', 'chut', 'lauda', 'laudu',
  'saala', 'kutta', 'kutti',
])

/**
 * Returns the first field name that contains profanity, or null if all clean.
 */
export function checkTextFields(
  fields: Record<string, string | undefined | null>,
): string | null {
  for (const [name, value] of Object.entries(fields)) {
    if (value && profanity.exists(value)) {
      return name
    }
  }
  return null
}
