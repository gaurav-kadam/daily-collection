import { useEffect, useState } from 'react'
import { FiAlertTriangle } from 'react-icons/fi'
import useAuth from '../../hooks/useAuth'
import {
  BACHAT_TESTING_RULES_DEFAULTS,
  listenBachatRulesSettings,
} from '../../services/bachatService'
import { USER_ROLES } from '../../services/firestoreService'

function BachatTestingModeBanner() {
  const { user } = useAuth()
  const [settings, setSettings] = useState(BACHAT_TESTING_RULES_DEFAULTS)

  useEffect(() => {
    if (user?.role !== USER_ROLES.admin) return undefined

    return listenBachatRulesSettings(
      { currentUser: user },
      setSettings,
      () => setSettings(BACHAT_TESTING_RULES_DEFAULTS),
    )
  }, [user])

  if (user?.role !== USER_ROLES.admin || !settings.testingMode) return null

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
      <div className="flex gap-3">
        <FiAlertTriangle className="mt-0.5 shrink-0" size={18} />
        <div>
          <p className="text-sm font-bold uppercase tracking-wide">Testing Mode Enabled</p>
          <p className="mt-1 text-sm">
            Interest, Reward, and penalty month logic are using custom test durations.
          </p>
          <p className="mt-1 text-xs font-semibold">
            Production rules are temporarily overridden for testing.
          </p>
        </div>
      </div>
    </div>
  )
}

export default BachatTestingModeBanner
