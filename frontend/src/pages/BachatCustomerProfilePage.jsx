import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiArrowLeft, FiFileText, FiUsers } from 'react-icons/fi'
import { Link, useParams } from 'react-router-dom'
import Loader from '../components/Loader'
import Modal from '../components/Modal'
import StatusBadge from '../components/customers/StatusBadge'
import useAuth from '../hooks/useAuth'
import {
  BACHAT_RULES,
  buildBachatPenaltyAnalysis,
  computeBachatClosurePreview,
  getBachatCollectionsByCustomer,
  getBachatPenaltyRecoveryHistory,
  listenBachatAccount,
  listenBachatClosuresByCustomer,
  listenBachatPenaltiesByCustomer,
  listenRecentBachatCollections,
} from '../services/bachatService'
import { getOptimizedImageUrl } from '../services/cloudinaryService'
import customerService from '../services/customerService'
import { moneyValue, numberValue, todayKey } from '../services/firestoreService'
import { formatDate } from '../utils/date'
import { formatCurrency } from '../utils/format'

const RECENT_HISTORY_LIMIT = 5
const FULL_HISTORY_PAGE_SIZE = 20

function CompactItem({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value || '-'}</p>
    </div>
  )
}

function SummaryCard({ label, value, tone = 'slate', onClick }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-950',
    emerald: 'bg-emerald-50 text-emerald-900',
    amber: 'bg-amber-50 text-amber-900',
    rose: 'bg-rose-50 text-rose-900',
    cyan: 'bg-cyan-50 text-cyan-900',
  }
  const className = `rounded-lg p-4 ${tones[tone] || tones.slate}`
  const content = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-2 font-display text-xl font-bold">{value}</p>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className={`${className} w-full text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400`}
        onClick={onClick}
      >
        {content}
      </button>
    )
  }

  return (
    <article className={className}>
      {content}
    </article>
  )
}

function PenaltyStatusPill({ status }) {
  const normalized = keyFromValue(status || 'pending')
  const tones = {
    pending: 'bg-amber-50 text-amber-800 ring-amber-100',
    partial: 'bg-cyan-50 text-cyan-800 ring-cyan-100',
    recovered: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
    waived: 'bg-slate-100 text-slate-700 ring-slate-200',
  }

  return (
    <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${tones[normalized] || tones.pending}`}>
      {normalized}
    </span>
  )
}

const keyFromValue = (value) => String(value || '').trim().toLowerCase()

function BachatCustomerProfilePage() {
  const { customerId } = useParams()
  const { user } = useAuth()

  const [customer, setCustomer] = useState(null)
  const [account, setAccount] = useState(null)
  const [recentCollections, setRecentCollections] = useState([])
  const [latestPenalty, setLatestPenalty] = useState(null)
  const [latestClosure, setLatestClosure] = useState(null)

  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [collectionError, setCollectionError] = useState('')
  const [penaltyError, setPenaltyError] = useState('')
  const [closureError, setClosureError] = useState('')

  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyRows, setHistoryRows] = useState([])
  const [historyCursor, setHistoryCursor] = useState(null)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [penaltyAnalysisOpen, setPenaltyAnalysisOpen] = useState(false)
  const [penaltyRecoveryRows, setPenaltyRecoveryRows] = useState([])
  const [penaltyRecoveryLoading, setPenaltyRecoveryLoading] = useState(false)
  const [penaltyRecoveryError, setPenaltyRecoveryError] = useState('')

  useEffect(() => {
    let isMounted = true

    const loadCustomer = async () => {
      setLoading(true)
      setPageError('')
      try {
        const record = await customerService.getById(customerId)
        if (!isMounted) return
        setCustomer(record)
      } catch (error) {
        if (!isMounted) return
        setCustomer(null)
        setPageError(error.message || 'Unable to load customer profile.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadCustomer()
    return () => {
      isMounted = false
    }
  }, [customerId])

  useEffect(() => {
    if (!user || !customerId) return undefined

    const unsubscribeAccount = listenBachatAccount({
      customerId,
      currentUser: user,
      onNext: (nextAccount) => {
        setAccount(nextAccount)
      },
      onError: (error) => {
        setPageError(error.message || 'Unable to load Bachat account details.')
      },
    })

    const unsubscribeCollections = listenRecentBachatCollections({
      customerId,
      currentUser: user,
      pageSize: RECENT_HISTORY_LIMIT,
      onNext: ({ results }) => {
        setRecentCollections(results || [])
        setCollectionError('')
      },
      onError: (error) => {
        setCollectionError(error.message || 'Unable to load recent payment history.')
      },
    })

    const unsubscribePenalties = listenBachatPenaltiesByCustomer({
      customerId,
      currentUser: user,
      onNext: ({ latest }) => {
        setLatestPenalty(latest || null)
        setPenaltyError('')
      },
      onError: (error) => {
        setPenaltyError(error.message || 'Unable to load penalty details.')
      },
    })

    const unsubscribeClosures = listenBachatClosuresByCustomer({
      customerId,
      currentUser: user,
      onNext: ({ latest }) => {
        setLatestClosure(latest || null)
        setClosureError('')
      },
      onError: (error) => {
        setClosureError(error.message || 'Unable to load closure details.')
      },
    })

    return () => {
      unsubscribeAccount?.()
      unsubscribeCollections?.()
      unsubscribePenalties?.()
      unsubscribeClosures?.()
    }
  }, [customerId, user])

  const loadHistory = useCallback(
    async ({ reset = false } = {}) => {
      if (!user || !customerId) return
      if (historyLoading) return

      setHistoryLoading(true)
      setHistoryError('')
      try {
        const result = await getBachatCollectionsByCustomer({
          customerId,
          currentUser: user,
          pageSize: FULL_HISTORY_PAGE_SIZE,
          cursor: reset ? null : historyCursor,
        })
        const rows = result.results || []
        setHistoryRows((previous) => {
          if (reset) return rows
          const merged = [...previous]
          const seen = new Set(previous.map((item) => keyFromValue(item.txId || item.id)))
          rows.forEach((item) => {
            const key = keyFromValue(item.txId || item.id)
            if (!seen.has(key)) {
              seen.add(key)
              merged.push(item)
            }
          })
          return merged
        })
        setHistoryCursor(result.cursor || null)
        setHistoryHasMore(Boolean(result.hasMore))
      } catch (error) {
        setHistoryError(error.message || 'Unable to load payment history.')
      } finally {
        setHistoryLoading(false)
      }
    },
    [customerId, historyCursor, historyLoading, user],
  )

  const openHistoryModal = () => {
    setHistoryOpen(true)
    loadHistory({ reset: true })
  }

  const loadPenaltyRecoveryHistory = useCallback(async () => {
    if (!user || !customerId) return

    setPenaltyRecoveryLoading(true)
    setPenaltyRecoveryError('')
    try {
      const result = await getBachatPenaltyRecoveryHistory({
        customerId,
        currentUser: user,
        pageSize: 50,
      })
      setPenaltyRecoveryRows(result.results || [])
    } catch (error) {
      setPenaltyRecoveryRows([])
      setPenaltyRecoveryError(error.message || 'Unable to load penalty recovery history.')
    } finally {
      setPenaltyRecoveryLoading(false)
    }
  }, [customerId, user])

  const openPenaltyAnalysis = () => {
    setPenaltyAnalysisOpen(true)
    loadPenaltyRecoveryHistory()
  }

  const details = useMemo(() => {
    if (!account) return null
    const dailyAmount = moneyValue(account, 'dailyAmount')
    const monthlyAmount = moneyValue(account, 'monthlyAmount') || dailyAmount * BACHAT_RULES.daysPerMonth
    const durationMonths = numberValue(account.durationMonths, BACHAT_RULES.defaultDurationMonths)
    const maturityReward = moneyValue(account, 'maturityReward')
    const maturityAmount = moneyValue(account, 'maturityAmount')
    const totalCollected = moneyValue(account, 'totalCollected')
    const pendingAmount = moneyValue(account, 'pendingAmount')
    const penaltyAmount = moneyValue(account, 'penaltyAmount')
    const paidMonths = numberValue(account.paidMonths)
    const missedMonths = numberValue(account.missedMonths)
    const startDate = account.startDateKey || account.startDate || todayKey()
    const endDate = account.endDateKey || account.endDate || todayKey()
    const closurePreview = computeBachatClosurePreview(account)

    return {
      dailyAmount,
      monthlyAmount,
      durationMonths,
      maturityReward,
      maturityAmount,
      totalCollected,
      pendingAmount,
      penaltyAmount,
      paidMonths,
      missedMonths,
      startDate,
      endDate,
      closurePreview,
    }
  }, [account])

  const penaltyAnalysis = useMemo(
    () =>
      buildBachatPenaltyAnalysis({
        account: account || {},
        penalty: latestPenalty || {},
        recoveryRows: penaltyRecoveryRows,
      }),
    [account, latestPenalty, penaltyRecoveryRows],
  )
  const hasPenaltyData =
    Boolean(latestPenalty) ||
    numberValue(account?.missedMonths) > 0 ||
    moneyValue(account, 'penaltyAmount') > 0

  const profilePhoto = getOptimizedImageUrl(
    customer?.profilePhoto || customer?.profilePhotoUrl || customer?.photoUrl || customer?.photo,
    { width: 224, height: 224, crop: 'fill' },
  )

  const titleName = customer?.fullName || customer?.ownerName || customer?.shopName || 'Customer'

  if (loading) {
    return <Loader text="Loading Bachat profile..." />
  }

  if (!customer) {
    return (
      <div className="card p-6">
        <p className="text-sm text-slate-700">{pageError || 'Customer not found.'}</p>
        <div className="mt-4">
          <Link to="/dashboard/bachat" className="btn-secondary inline-flex items-center gap-2">
            <FiArrowLeft />
            Back To Bachat Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="page-title">Bachat Customer Profile</h2>
          <p className="mt-1 text-sm text-slate-500">Finance account details, collections, penalties, and closure status.</p>
        </div>
        <Link to="/dashboard/bachat" className="btn-secondary inline-flex items-center gap-2">
          <FiArrowLeft />
          Back To Bachat Dashboard
        </Link>
      </section>

      {pageError && (
        <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{pageError}</div>
      )}

      <section className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <article className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
              {profilePhoto ? (
                <img src={profilePhoto} alt={titleName} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <FiUsers className="text-3xl text-slate-400" />
              )}
            </div>
            <h3 className="mt-4 font-display text-xl font-bold text-slate-950">{titleName}</h3>
            <p className="mt-1 text-sm text-slate-500">{customer.customerId || customer.id}</p>
            <div className="mt-3">
              <StatusBadge status={customer.status} />
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <CompactItem label="Mobile" value={customer.mobile} />
            <CompactItem label="Area" value={customer.area} />
            <CompactItem label="Address" value={customer.address} />
            <CompactItem label="Account Status" value={account?.status || customer.status || 'active'} />
          </div>
        </article>

        <article className="rounded-lg border border-slate-200 p-4">
          <h3 className="section-title mb-4">Bachat Account Details</h3>
          {!details ? (
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              No active Bachat account found for this customer.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Daily Amount" value={formatCurrency(details.dailyAmount)} />
                <SummaryCard label="Monthly Amount" value={formatCurrency(details.monthlyAmount)} tone="cyan" />
                <SummaryCard label="Maturity Reward" value={formatCurrency(details.maturityReward)} tone="emerald" />
                <SummaryCard label="Maturity Amount" value={formatCurrency(details.maturityAmount)} tone="emerald" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <CompactItem label="Duration" value={`${details.durationMonths} months`} />
                <CompactItem label="Start Date" value={formatDate(details.startDate)} />
                <CompactItem label="End Date" value={formatDate(details.endDate)} />
                <CompactItem label="Total Collected" value={formatCurrency(details.totalCollected)} />
                <CompactItem label="Pending Amount" value={formatCurrency(details.pendingAmount)} />
                <CompactItem label="Penalty Amount" value={formatCurrency(details.penaltyAmount)} />
                <CompactItem label="Paid Months" value={details.paidMonths} />
                <CompactItem label="Missed Months" value={details.missedMonths} />
                <CompactItem label="Collector" value={account.collectorName || account.collectorId} />
                <CompactItem label="Account Status" value={account.status || 'active'} />
                <CompactItem
                  label="Closure Eligibility"
                  value={account.closureEligibility ? 'Eligible for closure flow' : 'Not eligible yet'}
                />
                <CompactItem
                  label="Projected Payout"
                  value={formatCurrency(
                    numberValue(account.projectedClosurePayout, details.closurePreview.payoutAmount),
                  )}
                />
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="rounded-lg border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h3 className="section-title">Recent Bachat Payments</h3>
          <button type="button" className="btn-secondary" onClick={openHistoryModal}>
            Show All History
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Payment Date</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Collector</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {recentCollections.map((item) => (
                <tr key={item.txId || item.id}>
                  <td className="px-4 py-3 text-slate-700">{formatDate(item.paymentDate || item.date)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-950">{formatCurrency(moneyValue(item, 'amount'))}</td>
                  <td className="px-4 py-3 text-slate-600">{item.collectorName || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.paymentMethod || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.status || '-'}</td>
                </tr>
              ))}
              {!recentCollections.length && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan="5">
                    {collectionError || 'No payment history available yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border border-slate-200 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="section-title">Penalties</h3>
            <button
              type="button"
              className="btn-secondary !py-1.5"
              onClick={openPenaltyAnalysis}
              disabled={!account}
            >
              Penalty Analysis
            </button>
          </div>
          {penaltyError ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{penaltyError}</p>
          ) : hasPenaltyData ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryCard
                label="Total Penalty Amount"
                value={formatCurrency(penaltyAnalysis.grossPenaltyAmount)}
                tone="rose"
                onClick={openPenaltyAnalysis}
              />
              <SummaryCard
                label="Missed Months"
                value={penaltyAnalysis.missedMonths}
                tone="amber"
                onClick={openPenaltyAnalysis}
              />
              <SummaryCard
                label="Overdue Days"
                value={penaltyAnalysis.overdueDays}
                tone="amber"
                onClick={openPenaltyAnalysis}
              />
              <SummaryCard
                label="Recovery Status"
                value={penaltyAnalysis.recoveryStatus}
                tone="cyan"
                onClick={openPenaltyAnalysis}
              />
            </div>
          ) : (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              No active penalty record for this customer.
            </p>
          )}
        </article>

        <article className="rounded-lg border border-slate-200 p-4">
          <h3 className="section-title mb-4">Closure Status</h3>
          {closureError ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{closureError}</p>
          ) : latestClosure ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryCard label="Closure Type" value={latestClosure.closureType || 'closed'} tone="amber" />
              <SummaryCard
                label="Payout Amount"
                value={formatCurrency(
                  moneyValue(latestClosure, 'payoutAmount') || moneyValue(latestClosure, 'settlementAmount'),
                )}
                tone="emerald"
              />
              <SummaryCard
                label="Closure Date"
                value={formatDate(latestClosure.closureDate || latestClosure.closedOn || latestClosure.createdAt)}
                tone="slate"
              />
              <SummaryCard label="Status" value={latestClosure.status || 'closed'} tone="cyan" />
            </div>
          ) : (
            <p className="rounded-lg bg-cyan-50 px-3 py-2 text-sm text-cyan-900">
              Active Bachat Account
            </p>
          )}
        </article>
      </section>

      <Modal
        isOpen={historyOpen}
        title="Bachat Payment History"
        onClose={() => setHistoryOpen(false)}
        sizeClass="max-w-5xl"
        panelClass="max-h-[90vh] overflow-y-auto"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Showing paginated history to keep Firestore reads lightweight.
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Collector</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {historyRows.map((item) => (
                  <tr key={item.txId || item.id}>
                    <td className="px-4 py-3 text-slate-700">{formatDate(item.paymentDate || item.date)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-950">{formatCurrency(moneyValue(item, 'amount'))}</td>
                    <td className="px-4 py-3 text-slate-600">{item.collectorName || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{item.paymentMethod || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{item.status || '-'}</td>
                  </tr>
                ))}
                {!historyRows.length && !historyLoading && (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan="5">
                      No history available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {historyError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{historyError}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
            <p className="text-xs text-slate-500">
              Page size: {FULL_HISTORY_PAGE_SIZE} records
            </p>
            {historyHasMore ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => loadHistory()}
                disabled={historyLoading}
              >
                {historyLoading ? 'Loading...' : 'Load More'}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                <FiFileText />
                End of history
              </span>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={penaltyAnalysisOpen}
        title="Penalty Analysis"
        onClose={() => setPenaltyAnalysisOpen(false)}
        sizeClass="max-w-6xl"
        panelClass="max-h-[90vh] overflow-y-auto"
      >
        <div className="space-y-5">
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="section-title">Penalty Summary</h3>
              <PenaltyStatusPill status={penaltyAnalysis.recoveryStatus} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <SummaryCard
                label="Total Penalty Amount"
                value={formatCurrency(penaltyAnalysis.grossPenaltyAmount)}
                tone="rose"
              />
              <SummaryCard
                label="Missed Months"
                value={penaltyAnalysis.missedMonths}
                tone="amber"
              />
              <SummaryCard
                label="Overdue Days"
                value={penaltyAnalysis.overdueDays}
                tone="amber"
              />
              <SummaryCard
                label="Recovery Status"
                value={penaltyAnalysis.recoveryStatus}
                tone="cyan"
              />
              <SummaryCard
                label="Pending Recovery"
                value={formatCurrency(penaltyAnalysis.pendingRecovery)}
                tone="rose"
              />
              <SummaryCard
                label="Recovered Amount"
                value={formatCurrency(penaltyAnalysis.recoveredAmount)}
                tone="emerald"
              />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 p-4">
            <h3 className="section-title mb-3">Formula Explanation</h3>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <CompactItem label="Daily Amount" value={formatCurrency(penaltyAnalysis.dailyAmount)} />
              <CompactItem
                label="Monthly Amount"
                value={`${BACHAT_RULES.daysPerMonth} x ${formatCurrency(penaltyAnalysis.dailyAmount)} = ${formatCurrency(penaltyAnalysis.monthlyAmount)}`}
              />
              <CompactItem
                label="Penalty Rate"
                value={`${penaltyAnalysis.penaltyRatePercent}% of monthly amount`}
              />
              <CompactItem
                label="Monthly Penalty Base"
                value={`${formatCurrency(penaltyAnalysis.monthlyAmount)} x ${penaltyAnalysis.penaltyRatePercent}% = ${formatCurrency(penaltyAnalysis.penaltyBase)}`}
              />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="section-title">Month-wise Penalty Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Missed Month</th>
                    <th className="px-4 py-3">Multiplier</th>
                    <th className="px-4 py-3">Formula</th>
                    <th className="px-4 py-3">Penalty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {penaltyAnalysis.breakdown.map((row) => (
                    <tr key={row.missedIndex}>
                      <td className="px-4 py-3 font-semibold text-slate-950">{row.missedMonth}</td>
                      <td className="px-4 py-3 text-slate-700">{row.multiplier}x</td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatCurrency(row.baseAmount)} x {row.multiplier}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-950">
                        {formatCurrency(row.penaltyAmount)}
                      </td>
                    </tr>
                  ))}
                  {!penaltyAnalysis.breakdown.length && (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan="4">
                        No missed months are currently recorded for this account.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <h3 className="section-title">Penalty Recovery History</h3>
              <button
                type="button"
                className="btn-secondary !py-1.5"
                onClick={loadPenaltyRecoveryHistory}
                disabled={penaltyRecoveryLoading}
              >
                {penaltyRecoveryLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Amount Recovered</th>
                    <th className="px-4 py-3">Collector</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {penaltyRecoveryRows.map((row) => (
                    <tr key={row.txId || row.id}>
                      <td className="px-4 py-3 text-slate-700">{formatDate(row.paymentDate || row.date)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-950">
                        {formatCurrency(moneyValue(row, 'penaltyRecovered'))}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.collectorName || '-'}</td>
                    </tr>
                  ))}
                  {!penaltyRecoveryRows.length && !penaltyRecoveryLoading && (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan="3">
                        No penalty recovery payments found in recent Bachat collections.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {penaltyRecoveryError && (
              <p className="m-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {penaltyRecoveryError}
              </p>
            )}
          </section>
        </div>
      </Modal>
    </div>
  )
}

export default BachatCustomerProfilePage
