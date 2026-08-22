// ReclaimR concierge engine — models the human/agent layer that Rocket Money
// monetizes: bill negotiation and subscription cancellation.
//
// Requests are time-based state machines: each stage becomes due at an epoch
// timestamp, and `advanceAll` (called on every API request) applies any stages
// whose time has passed. This survives server restarts and gives the UI a live
// progress timeline to poll.

const NEGOTIATION_STAGES = [
  { status: 'submitted', afterMs: 0, note: 'Request received. Concierge pulled your account and bill details.' },
  { status: 'in_review', afterMs: 7_000, note: 'A negotiator reviewed your plan and identified retention offers.' },
  { status: 'negotiating', afterMs: 16_000, note: 'Your negotiator is on with the provider, working the best rate.' },
  { status: 'complete', afterMs: 30_000, note: null }, // outcome note filled per result
]

const CANCELLATION_STAGES = [
  { status: 'submitted', afterMs: 0, note: 'Request received. Concierge is preparing the cancellation.' },
  { status: 'in_progress', afterMs: 8_000, note: 'Concierge contacted the provider and submitted the cancellation.' },
  { status: 'complete', afterMs: 18_000, note: null },
]

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

export function createNegotiation({ bill, feePercent, uid, now = Date.now() }) {
  const success = Math.random() < 0.72
  const annualSavings = success
    ? Math.round(bill.amount * 12 * (0.1 + Math.random() * 0.25))
    : 0
  const feeAmount = Math.round((annualSavings * feePercent) / 100)
  const newMonthly = success
    ? Number((bill.amount - annualSavings / 12).toFixed(2))
    : bill.amount

  const req = {
    id: uid('neg'),
    kind: 'negotiation',
    billId: bill.id,
    billName: bill.merchant,
    feePercent,
    status: 'submitted',
    createdAt: new Date(now).toISOString(),
    stageAt: now + NEGOTIATION_STAGES[1].afterMs,
    stageIndex: 0,
    outcome: { success, annualSavings, feeAmount, newMonthly },
    timeline: [{ status: 'submitted', at: new Date(now).toISOString(), note: NEGOTIATION_STAGES[0].note }],
  }
  return req
}

export function createCancellation({ subscription, uid, now = Date.now() }) {
  return {
    id: uid('can'),
    kind: 'cancellation',
    subscriptionId: subscription.id,
    subscriptionName: subscription.merchant,
    monthlyAmount: subscription.monthlyEquivalent,
    status: 'submitted',
    createdAt: new Date(now).toISOString(),
    stageAt: now + CANCELLATION_STAGES[1].afterMs,
    stageIndex: 0,
    timeline: [{ status: 'submitted', at: new Date(now).toISOString(), note: CANCELLATION_STAGES[0].note }],
  }
}

function finalizeNegotiation(data, req) {
  const bill = data.bills.find((b) => b.id === req.billId)
  const o = req.outcome
  if (o.success) {
    if (bill) {
      bill.negotiated = true
      bill.originalAmount = bill.amount
      bill.amount = o.newMonthly
      bill.annualSavings = o.annualSavings
    }
    data.notifications.unshift({
      id: `ntf_${++data.seq}`,
      type: 'negotiation_win',
      title: `We lowered your ${req.billName} bill 🎉`,
      body: `New rate: $${o.newMonthly.toFixed(2)}/mo — saving you $${o.annualSavings}/yr. One-time success fee: $${o.feeAmount} (${req.feePercent}% of savings). You keep 100% of savings after year one.`,
      read: false,
      createdAt: new Date().toISOString(),
    })
    req.timeline.push({
      status: 'complete',
      at: new Date().toISOString(),
      note: `Success! ${req.billName} lowered to $${o.newMonthly.toFixed(2)}/mo ($${o.annualSavings}/yr saved). Success fee: $${o.feeAmount}.`,
    })
  } else {
    if (bill) bill.negotiationAttempted = true
    data.notifications.unshift({
      id: `ntf_${++data.seq}`,
      type: 'negotiation_miss',
      title: `No savings found on ${req.billName}`,
      body: `We couldn't get ${req.billName} any lower this time. Per our promise: no savings, no fee — you were charged nothing.`,
      read: false,
      createdAt: new Date().toISOString(),
    })
    req.timeline.push({
      status: 'complete',
      at: new Date().toISOString(),
      note: `No luck — ${req.billName} wouldn't budge. No fee charged (we only charge on success).`,
    })
  }
  req.status = o.success ? 'success' : 'failed'
  req.stageAt = null
}

function finalizeCancellation(data, req) {
  const sub = data.subscriptions.find((s) => s.id === req.subscriptionId)
  if (sub) sub.status = 'cancelled'
  const monthly = sub ? sub.monthlyEquivalent : req.monthlyAmount
  data.notifications.unshift({
    id: `ntf_${++data.seq}`,
    type: 'cancellation_done',
    title: `Cancelled: ${req.subscriptionName}`,
    body: `Your ${req.subscriptionName} subscription is cancelled. That's $${monthly.toFixed(2)}/mo (≈ $${(monthly * 12).toFixed(0)}/yr) back in your pocket.`,
    read: false,
    createdAt: new Date().toISOString(),
  })
  req.timeline.push({
    status: 'complete',
    at: new Date().toISOString(),
    note: `Done — ${req.subscriptionName} is cancelled. No further charges will occur.`,
  })
  req.status = 'cancelled'
  req.stageAt = null
}

/** Applies any concierge stage transitions that are due. Returns true if data changed. */
export function advanceAll(data) {
  let dirty = false
  const now = Date.now()

  for (const req of data.negotiations) {
    while (req.stageAt && now >= new Date(req.stageAt).getTime()) {
      dirty = true
      req.stageIndex += 1
      if (req.stageIndex === 1) {
        req.status = 'in_review'
        req.timeline.push({ status: 'in_review', at: new Date().toISOString(), note: NEGOTIATION_STAGES[1].note })
        req.stageAt = req.createdAt ? new Date(req.timeline[0].at).getTime() + NEGOTIATION_STAGES[2].afterMs : null
      } else {
        // stageIndex 2 -> negotiating, 3 -> complete
        if (req.stageIndex === 2) {
          req.status = 'negotiating'
          req.timeline.push({ status: 'negotiating', at: new Date().toISOString(), note: NEGOTIATION_STAGES[2].note })
          req.stageAt = new Date(req.timeline[req.timeline.length - 1].at).getTime() + (NEGOTIATION_STAGES[3].afterMs - NEGOTIATION_STAGES[2].afterMs)
        } else {
          finalizeNegotiation(data, req)
          break
        }
      }
    }
  }

  for (const req of data.cancellations) {
    while (req.stageAt && now >= new Date(req.stageAt).getTime()) {
      dirty = true
      req.stageIndex += 1
      if (req.stageIndex === 1) {
        req.status = 'in_progress'
        req.timeline.push({ status: 'in_progress', at: new Date().toISOString(), note: CANCELLATION_STAGES[1].note })
        req.stageAt = new Date(req.timeline[0].at).getTime() + CANCELLATION_STAGES[2].afterMs
      } else {
        finalizeCancellation(data, req)
        break
      }
    }
  }

  return dirty
}
