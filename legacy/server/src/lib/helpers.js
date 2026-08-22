export const DEMO_TOKEN = 'reclaimr-demo-token'

export function authMiddleware(req, res, next) {
  const h = req.headers.authorization || ''
  if (!h.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED' })
  }
  next()
}

// Mirrors Rocket Money's model: some surfaces are free, some are Premium.
// Routes call this and pass a human-readable feature name for the paywall UI.
export function requirePremium(res, data, feature) {
  const user = data.users[0]
  if (!user.isPremium) {
    res.status(402).json({ error: 'PREMIUM_REQUIRED', feature })
    return false
  }
  return true
}

export const DEFAULT_BUDGET_CATEGORIES = ['Utilities', 'Subscriptions', 'General Spending']
export const FREE_CUSTOM_BUDGET_LIMIT = 2

export function monthKey(isoDate) {
  return isoDate.slice(0, 7)
}

export function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function daysUntil(dateIso) {
  const now = new Date()
  const target = new Date(dateIso + 'T12:00:00')
  return Math.round((target - new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)) / 86400000)
}

export function addDaysISO(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
