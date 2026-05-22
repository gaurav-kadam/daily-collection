import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import useAuth from '../hooks/useAuth'
import {
  BACHAT_TESTING_RULES_DEFAULTS,
  listenBachatRulesSettings,
  saveBachatRulesSettings,
} from '../services/bachatService'
import { USER_ROLES } from '../services/firestoreService'

const collections = [
  'users',
  'customers',
  'dailyCollectionAccounts',
  'dailyCollectionSummary',
  'bachatAccounts',
  'bachatCollections',
  'bachatPenalties',
  'bachatClosures',
  'bachatSummary',
  'customerFinancials',
  'dailyCollections',
  'loanAccounts',
  'loanSummary',
  'loans',
  'emiPayments',
  'notifications',
]

function SettingsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === USER_ROLES.admin
  const [bachatRules, setBachatRules] = useState(BACHAT_TESTING_RULES_DEFAULTS)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)

  useEffect(() => {
    if (!isAdmin) {
      setSettingsLoading(false)
      return undefined
    }

    setSettingsLoading(true)
    return listenBachatRulesSettings(
      { currentUser: user },
      (settings) => {
        setBachatRules(settings)
        setSettingsLoading(false)
      },
      (error) => {
        toast.error(error?.message || 'Unable to load Bachat testing settings.')
        setSettingsLoading(false)
      },
    )
  }, [isAdmin, user])

  const updateBachatRule = (field, value) => {
    setBachatRules((previous) => ({
      ...previous,
      [field]: value,
    }))
  }

  const saveBachatTestingSettings = async (nextSettings = bachatRules) => {
    setSettingsSaving(true)
    try {
      await saveBachatRulesSettings({
        currentUser: user,
        payload: nextSettings,
      })
      toast.success('Bachat testing settings saved.')
    } catch (error) {
      toast.error(error?.message || 'Unable to save Bachat testing settings.')
    } finally {
      setSettingsSaving(false)
    }
  }

  const applySevenDayTest = () => {
    const nextSettings = {
      testingMode: true,
      interestEligibilityDays: 7,
      rewardEligibilityDays: 30,
      penaltyCycleDays: 7,
    }
    setBachatRules(nextSettings)
    saveBachatTestingSettings(nextSettings)
  }

  const applyProductionMode = () => {
    const nextSettings = {
      ...BACHAT_TESTING_RULES_DEFAULTS,
      testingMode: false,
    }
    setBachatRules(nextSettings)
    saveBachatTestingSettings(nextSettings)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="page-title">Settings</h2>
        <p className="mt-1 text-sm text-slate-500">Firebase project workspace</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="card p-4">
          <h3 className="section-title">Profile</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
              <dt className="text-slate-500">Name</dt>
              <dd className="font-semibold text-slate-950">{user?.fullName}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
              <dt className="text-slate-500">Email</dt>
              <dd className="font-semibold text-slate-950">{user?.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Role</dt>
              <dd className="font-semibold capitalize text-slate-950">{user?.role}</dd>
            </div>
          </dl>
        </article>

        <article className="card p-4">
          <h3 className="section-title">Firestore Collections</h3>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {collections.map((collectionName) => (
              <div
                key={collectionName}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                {collectionName}
              </div>
            ))}
          </div>
        </article>
      </section>

      {isAdmin && (
        <section className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="section-title">Bachat Testing Settings</h3>
              <p className="mt-1 text-sm text-slate-500">
                Testing-only duration overrides for interest, reward, and penalty cycles.
              </p>
            </div>
            {bachatRules.testingMode && (
              <span className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-amber-800">
                Testing Mode On
              </span>
            )}
          </div>

          {settingsLoading ? (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Loading Bachat testing settings...
            </p>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label
                htmlFor="bachat-testing-mode"
                className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Enable Testing Mode</span>
                  <span className="block text-xs text-slate-500">
                    Production rules are used when this is off.
                  </span>
                </span>
                <input
                  id="bachat-testing-mode"
                  name="bachatTestingMode"
                  type="checkbox"
                  className="h-5 w-5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  checked={bachatRules.testingMode}
                  onChange={(event) => updateBachatRule('testingMode', event.target.checked)}
                />
              </label>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={applySevenDayTest}
                  disabled={settingsSaving}
                >
                  7 Days Test
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={applyProductionMode}
                  disabled={settingsSaving}
                >
                  Production Mode
                </button>
              </div>

              <label htmlFor="bachat-interest-eligibility-days">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Interest Eligibility Days
                </span>
                <input
                  id="bachat-interest-eligibility-days"
                  name="bachatInterestEligibilityDays"
                  className="input-field"
                  type="number"
                  min="1"
                  value={bachatRules.interestEligibilityDays}
                  onChange={(event) => updateBachatRule('interestEligibilityDays', event.target.value)}
                />
              </label>

              <label htmlFor="bachat-reward-eligibility-days">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Reward Eligibility Days
                </span>
                <input
                  id="bachat-reward-eligibility-days"
                  name="bachatRewardEligibilityDays"
                  className="input-field"
                  type="number"
                  min="1"
                  value={bachatRules.rewardEligibilityDays}
                  onChange={(event) => updateBachatRule('rewardEligibilityDays', event.target.value)}
                />
              </label>

              <label htmlFor="bachat-penalty-cycle-days">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Penalty Cycle Days
                </span>
                <input
                  id="bachat-penalty-cycle-days"
                  name="bachatPenaltyCycleDays"
                  className="input-field"
                  type="number"
                  min="1"
                  value={bachatRules.penaltyCycleDays}
                  onChange={(event) => updateBachatRule('penaltyCycleDays', event.target.value)}
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Testing mode treats this many days as one penalty month.
                </span>
              </label>

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 lg:col-span-2">
                This feature is for testing only. With testing mode off, Bachat uses the existing 24 month
                interest rule, 60 month reward rule, and 30 day penalty month.
              </div>

              <div className="flex justify-end lg:col-span-2">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => saveBachatTestingSettings()}
                  disabled={settingsSaving}
                >
                  {settingsSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export default SettingsPage
