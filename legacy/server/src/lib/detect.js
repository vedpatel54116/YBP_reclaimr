// ReclaimR recurring-charge detection engine.
//
// This is the algorithm class that powers Rocket Money's "we find all your
// subscriptions" promise:
//   1. Normalize noisy bank-transaction descriptions into canonical merchants.
//   2. Group charges by merchant and look for interval regularity.
//   3. Score amount stability -> confidence; predict the next charge date.
//   4. Flag price hikes (same merchant, new amount level).
//
// Categories that represent fixed life admin (rent, utilities, insurance,
// loan/card payments) are excluded — Rocket Money models those as "bills",
// not subscriptions.

const EXCLUDED_CATEGORIES = new Set([
  'Income',
  'Transfer',
  'Credit Card Payment',
  'Loan Payment',
  'Mortgage & Rent',
  'Insurance',
  'Utilities',
])

const NOISE_TOKENS = new Set([
  'pos', 'preauth', 'auth', 'authorized', 'purchase', 'debit', 'credit',
  'visa', 'mastercard', 'recurring', 'payment', 'pymt', 'inc', 'llc', 'usa',
  'us', 'com', 'net', 'store', 'the', 'and', 'of',
])

const CADENCE_BANDS = [
  { name: 'Weekly', gap: 7, tol: 1.0 },
  { name: 'Biweekly', gap: 14, tol: 1.5 },
  { name: 'Monthly', gap: 30.4, tol: 2.6 },
  { name: 'Quarterly', gap: 91.3, tol: 8 },
  { name: 'Annual', gap: 365, tol: 14 },
]

export function normalizeMerchant(raw) {
  let m = String(raw).toLowerCase()
  m = m.replace(/#\d+/g, ' ')                    // store numbers  PLANET FITNESS #0242
  m = m.replace(/\b\d{2,}\b/g, ' ')              // standalone numbers (phone fragments, refs)
  m = m.replace(/\*/g, ' ')                      // AMAZON PRIME*ME
  m = m.replace(/[^a-z& ]+/g, ' ')
  const tokens = m.split(/\s+/).filter((t) => t && !NOISE_TOKENS.has(t))
  return tokens.slice(0, 3).join(' ') || 'unknown'
}

const DISPLAY_NAMES = {
  'netflix': 'Netflix',
  'spotify': 'Spotify',
  'hulu': 'Hulu',
  'apple bill itunes': 'Apple Music',
  'apple bill icloud': 'iCloud+',
  'new york times digital': 'The New York Times',
  'adobe creative cloud': 'Adobe Creative Cloud',
  'planet fitness': 'Planet Fitness',
  'siriusxm radio': 'SiriusXM',
  'chewy': 'Chewy',
  'dollarshaveclub': 'Dollar Shave Club',
  'amazon prime me': 'Amazon Prime',
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function stdev(arr) {
  if (arr.length < 2) return 0
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  return Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length)
}

function titleCase(s) {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

function matchesBand(medianGap, stdevGap) {
  for (const band of CADENCE_BANDS) {
    if (Math.abs(medianGap - band.gap) <= band.tol && stdevGap <= band.gap * 0.35) {
      return band
    }
  }
  return null
}

/**
 * Detects subscriptions from a transaction list.
 * Transactions use signed amounts: positive = money out (a charge).
 * Returns array of subscription objects.
 */
export function detectSubscriptions(transactions) {
  const groups = new Map()

  for (const t of transactions) {
    if (t.amount <= 0) continue                     // only charges
    if (EXCLUDED_CATEGORIES.has(t.category)) continue
    const key = normalizeMerchant(t.rawDescription || t.merchant)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(t)
  }

  const found = []

  for (const [key, txns] of groups) {
    if (txns.length < 3) continue
    txns.sort((a, b) => (a.date < b.date ? -1 : 1))

    const dates = txns.map((t) => new Date(t.date + 'T12:00:00').getTime())
    const gaps = dates.slice(1).map((d, i) => (d - dates[i]) / 86400000)
    const medianGap = median(gaps)
    const gapSd = stdev(gaps)

    const band = matchesBand(medianGap, gapSd)
    if (!band) continue

    const amounts = txns.map((t) => t.amount)
    const meanAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length
    const amountSd = stdev(amounts)

    // Price-hike detection: latest charge differs materially from the prior level.
    const latest = txns[txns.length - 1]
    const priorAmounts = amounts.slice(0, -1)
    const priorMean = priorAmounts.length
      ? priorAmounts.reduce((a, b) => a + b, 0) / priorAmounts.length
      : latest.amount
    const priceChanged =
      priorAmounts.length >= 2 && Math.abs(latest.amount - priorMean) / priorMean > 0.08

    const regularity = 1 - Math.min(1, gapSd / (medianGap * 0.35))
    const stability = 1 - Math.min(1, amountSd / (meanAmount * 0.25))
    const confidence = Math.min(
      0.99,
      0.45 + 0.06 * txns.length + 0.25 * regularity + 0.15 * stability
    )

    const lastDate = latest.date
    const nextCharge = new Date(lastDate + 'T12:00:00')
    nextCharge.setDate(nextCharge.getDate() + Math.round(medianGap))
    const nextChargeIso = nextCharge.toISOString().slice(0, 10)

    const perMonth = (latest.amount * 30.4) / medianGap

    found.push({
      id: null, // assigned by caller
      merchantKey: key,
      merchant: DISPLAY_NAMES[key] || titleCase(key),
      amount: Number(latest.amount.toFixed(2)),
      previousAmount: priceChanged ? Number(priorMean.toFixed(2)) : null,
      priceChanged,
      cadence: band.name,
      cadenceDays: Math.round(medianGap),
      lastCharged: lastDate,
      nextCharge: nextChargeIso,
      monthlyEquivalent: Number(perMonth.toFixed(2)),
      confidence: Number(confidence.toFixed(2)),
      occurrences: txns.length,
      category: latest.category === 'Subscriptions' ? 'Subscriptions' : latest.category,
      status: 'active',
    })
  }

  found.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent)
  return found
}
