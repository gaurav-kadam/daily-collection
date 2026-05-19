# Firestore ERP Re-Architecture (Free-Tier Safe)

## 1) Current State Audit (from codebase)

- Current core collections are `customers`, `dailyCollections`, `loans`, `emiPayments`, `dailySummaries`, `penalties`, and `financeEntries`.
- `customers` currently mixes identity + Bachat financial state (`dailyAmount`, `totalSavings`, `pendingAmount`, `penaltyAmount`, `activeLoanId`).
- Dashboard logic performs large client-side aggregation across multiple collections with high read limits (`limit(1000)` and `limit(500)` patterns).
- FD/Deposit/Bishi/Investments/Expenses are currently inferred from generic `financeEntries` text categories instead of isolated module schemas.
- Rules are optimized for current coupled model and do not isolate module-account lifecycle.

## 2) Target ERP Principle

Customer is identity only.

Financial products are separate module layers:

1. Customer master (`customers`)
2. Module enrollment (`*Accounts`, `*Groups`, `*Members`)
3. Module transactions (`*Collections`, `*Transactions`, `*Payments`)
4. Precomputed summary docs (`financeSummary`, `*Summary`, `customerFinancials`)

## 3) Target Collection Architecture

### 3.1 Identity Layer

`customers/{customerId}`

```json
{
  "customerId": "SBG0001",
  "fullName": "string",
  "mobile": "string",
  "alternateMobile": "string",
  "address": "string",
  "area": "string",
  "kyc": {
    "idType": "string",
    "idNumber": "string",
    "verified": true
  },
  "profilePhoto": "string",
  "documentPhoto": "string",
  "status": "active",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

No finance totals in this document.

### 3.2 Module Enrollment Layer

- `bachatAccounts/{customerId}`
- `savingAccounts/{customerId}`
- `fdAccounts/{customerId}`
- `depositAccounts/{customerId}`
- `companyInvestments/{investmentId}`
- `bishiGroups/{groupId}`
- `bishiMembers/{groupId_customerId}` (or `{groupId}/members/{customerId}`)

Enrollment docs store plan/account configuration and lifecycle status.

### 3.3 Module Transaction Layer

- `bachatCollections/{txId}`
- `bachatPenalties/{penaltyId}`
- `bachatClosures/{closureId}`
- `savingTransactions/{txId}`
- `loans/{loanId}`
- `emiPayments/{paymentId}`
- `loanPenalties/{penaltyId}`
- `fdTransactions/{txId}`
- `depositTransactions/{txId}`
- `bishiPayments/{paymentId}`
- `bishiRounds/{roundId}`
- `expenses/{expenseId}`

### 3.4 Aggregation Layer

- `financeSummary/main`
- `bachatSummary/main`
- `savingSummary/main`
- `loanSummary/main`
- `fdSummary/main`
- `depositSummary/main`
- `bishiSummary/main`
- `expensesSummary/main`
- `investmentsSummary/main`
- `customerFinancials/{customerId}`

## 4) Required Module Schemas

### 4.1 Bachat

`bachatAccounts/{customerId}`

- customerId
- dailyAmount
- durationMonths
- maturityReward
- maturityAmount
- startDate
- endDate
- status
- closureEligibility
- assignedCollectorId
- assignedCollectorName
- createdAt, updatedAt

`bachatCollections/{txId}`

- txId, customerId, accountId (same as customerId)
- amount, amountPaise
- expectedAmount, expectedAmountPaise
- pendingRecovered, pendingRecoveredPaise
- date, collectorId, collectorName
- status (`paid`/`partial`/`pending`)
- paymentMethod
- source (`legacy`/`v2`)
- createdAt, updatedAt

`bachatPenalties/{penaltyId}`

- penaltyId, customerId
- missedMonths, overdueDays
- pendingAmount, pendingAmountPaise
- penaltyAmount, penaltyAmountPaise
- recoveryStatus
- lastPenaltyUpdated
- createdAt, updatedAt

`bachatClosures/{closureId}`

- closureId, customerId
- closureType (`premature`/`maturity`)
- principalPaid, rewardPaid, penaltyAdjusted, payoutAmount
- closedOn, approvedBy
- createdAt

### 4.2 Saving

`savingAccounts/{customerId}`

- customerId, status, openDate, currentBalance, currentBalancePaise, createdAt, updatedAt

`savingTransactions/{txId}`

- txId, customerId, type (`deposit`/`withdrawal`)
- amount, amountPaise
- date, collectorId, collectorName
- createdAt

### 4.3 Loan

`loans/{loanId}` and `emiPayments/{paymentId}` remain, but remove customer-doc coupling.

Add `loanPenalties/{loanId}` split from generic `penalties`.

### 4.4 FD

- `fdAccounts/{fdId}`
- `fdTransactions/{txId}`

### 4.5 Deposit

- `depositAccounts/{depositId}`
- `depositTransactions/{txId}`

### 4.6 Bishi

- `bishiGroups/{groupId}`
- `bishiMembers/{memberId}`
- `bishiPayments/{paymentId}`
- `bishiRounds/{roundId}`

### 4.7 Expenses

- `expenses/{expenseId}`

### 4.8 Investments

- `companyInvestments/{investmentId}`

## 5) Transaction-Safe Update Pattern (No Cloud Functions)

For each write action, perform a single Firestore transaction:

1. Validate enrollment/account state.
2. Insert immutable raw transaction record.
3. Update module summary doc (`*Summary/main`) via `increment`.
4. Update `customerFinancials/{customerId}` via `increment` and module flags.
5. Update `financeSummary/main` via `increment`.
6. Record idempotency key to avoid duplicates (`mutationLocks/{opId}` or per-doc `lastOpId`).

Use deterministic operation id (`opId = <module>:<entity>:<date>:<nonce>`) and check existence in transaction to guarantee retry safety.

## 6) Summary Doc Design

### 6.1 `financeSummary/main`

- totalAvailableBalance
- totalLoans
- totalExpenses
- totalInvestments
- totalCollections
- totalDeposits
- totalFdAmount
- totalBishiCollections
- profitLoss
- updatedAt

### 6.2 Module summaries (`*Summary/main`)

- activeAccounts
- totalPrincipal / totalCollected / totalOutstanding
- penalties
- todayCollection
- monthlyCollection
- statusCounts map
- updatedAt

### 6.3 `customerFinancials/{customerId}`

- customerId
- activeModules: string[]
- totalBachat
- totalSavingBalance
- totalLoanOutstanding
- totalFdPrincipal
- totalDepositBalance
- totalBishiExposure
- penalties
- pendingAmount
- updatedAt

## 7) Free-Tier Optimization Rules

- Dashboards read only summary docs and paginated recent transaction lists.
- Never load full month/year raw collections in UI for totals.
- Hard-limit realtime listeners to:
  - `financeSummary/main`
  - active module summary docs
  - small recent feed queries (`limit <= 50`)
- Use paise integer fields for all arithmetic writes.
- Use `increment` for counters; avoid read-modify-write loops when possible.
- Keep one source of truth per metric to prevent drift.
- Use manual “Rebuild Summary” admin tool (client-side batch runner) instead of scheduled functions.

## 8) Compatibility + Migration Strategy (No Data Loss)

### Phase 0: Foundation

- Add new collections and summary docs.
- Keep old collections untouched.
- Add `schemaVersion: 2` markers in new docs.

### Phase 1: Dual-Write (Safe Bridge)

- Existing create flows keep writing old docs.
- In same transaction, also write new module docs + summaries.
- Introduce feature flag `useErpV2` in app config.

### Phase 2: Read Switch

- Dashboards switch from heavy `listenDashboardStats` aggregation to summary-doc reads.
- Module pages query module account first; if not found show “Customer not enrolled in <module>”.
- Customer profile reads `customerFinancials` + module-specific transactions.

### Phase 3: Backfill

- Admin-triggered migration utility:
  - backfill `bachatAccounts` from existing active customers
  - backfill `bachatCollections` from `dailyCollections`
  - backfill `customerFinancials` + summary docs in chunks (e.g., 200 docs per run)
- Track progress in `migrationJobs/{jobId}`.

### Phase 4: Soft Deprecation

- Stop writing deprecated fields in `customers` (`totalSavings`, `pendingAmount`, etc.).
- Keep read fallback for old docs for a defined window.

### Phase 5: Hard Cutover

- Remove old-read fallback in UI only after validation checks pass.
- Archive old collections; do not delete immediately.

## 9) Required Dashboard Redesign

Replace current multi-listener aggregation with:

- One listener: `financeSummary/main`
- Optional listeners: `bachatSummary/main`, `loanSummary/main`, etc.
- Small “recent activity” queries per module with hard caps.

No totals should be computed from `customers`, `dailyCollections`, `loans`, `emiPayments`, or `financeEntries` at render time.

## 10) Security Rule Direction (V2)

- `customers`: identity fields update only (no module balances).
- Module collection writes require:
  - user role checks
  - enrollment existence checks
  - collector ownership checks where relevant
- Summary docs:
  - writable only by admin/authorized collector transaction paths
  - optionally enforce field whitelist per summary doc
- Add rules for all new collections before enabling read switch.

## 11) Index Strategy (V2)

Create only query-driven composite indexes, especially:

- `bachatCollections`: (`collectorId`, `date desc`), (`customerId`, `date desc`), (`status`, `date desc`)
- `savingTransactions`: (`customerId`, `date desc`), (`type`, `date desc`)
- `loans`: existing + (`loanStatus`, `nextDueDate`)
- `emiPayments`: existing
- `loanPenalties`: (`status`, `updatedAt desc`), (`collectorId`, `status`, `updatedAt desc`)
- `customerFinancials`: (`activeModules array-contains`, `updatedAt desc`) if needed

## 12) Immediate Implementation Backlog (Safe Order)

1. Add V2 collection constants + type guards.
2. Add summary service (`summaryServiceV2`) with transaction helpers.
3. Add Bachat enrollment + collection dual-write service.
4. Add `customerFinancials` upsert helper.
5. Add dashboard V2 reader (summary-only).
6. Add feature-flagged route switching.
7. Add admin backfill tool and migration job tracker.
8. Expand rules/indexes for V2.
9. Run staged validation (totals parity checks old vs new).
10. Flip `useErpV2` in production after parity + rollback plan.

## 13) Notes Specific To This Repository

- Existing code paths to decouple first:
  - `frontend/src/services/dashboardService.js`
  - `frontend/src/services/collectionService.js`
  - `frontend/src/services/customerService.js`
  - `frontend/src/services/loanService.js`
  - `frontend/src/services/paymentService.js`
- Existing docs/UI still describe old collection set (`README.md`, `SettingsPage.jsx`).
- Existing module dashboards for FD/Deposit/Bishi/Investments are analytics overlays over `financeEntries`, not isolated modules yet.

