/**
 * One-shot script: reads all providers+services from Postgres and indexes
 * them into the OpenSearch `providers` index.
 *
 * Run from the repo root:
 *   node scripts/sync-providers-to-opensearch.mjs
 */
import pg from 'pg'

const DB_URL   = 'postgres://core:core_secret@localhost:5432/core_db'
const OS_URL   = 'http://localhost:9200'
const OS_AUTH  = 'admin:OpenSearch_2024!'
const INDEX    = 'providers'

const pool = new pg.Pool({ connectionString: DB_URL })

const { rows } = await pool.query(`
  SELECT
    p.id            AS provider_id,
    p.name          AS provider_name,
    ps.id           AS service_id,
    ps.title        AS service_title,
    ps.category_slug,
    p.address,
    c.name          AS city_name,
    a.name          AS area_name,
    ps.price_paise,
    ps.duration_mins,
    p.likes_count,
    p.status
  FROM   providers p
  JOIN   provider_services ps ON ps.provider_id = p.id
  JOIN   cities c             ON c.id = p.city_id
  LEFT   JOIN areas a         ON a.id = p.area_id
  WHERE  ps.is_available = true
`)

console.log(`Indexing ${rows.length} provider-service documents…`)

const now = new Date().toISOString()
let ok = 0, fail = 0

for (const row of rows) {
  const doc = { ...row, updated_at: now }
  const url = `${OS_URL}/${INDEX}/_doc/${row.service_id}`
  const auth = Buffer.from(OS_AUTH).toString('base64')

  try {
    const res = await fetch(url, {
      method:  'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify(doc),
    })
    if (res.ok) {
      ok++
      console.log(`  ✓ ${row.provider_name} – ${row.service_title}`)
    } else {
      fail++
      const body = await res.text()
      console.error(`  ✗ ${row.service_id}: HTTP ${res.status} ${body.slice(0, 120)}`)
    }
  } catch (err) {
    fail++
    console.error(`  ✗ ${row.service_id}: ${err.message}`)
  }
}

await pool.end()
console.log(`\nDone: ${ok} indexed, ${fail} failed`)
