import { setStorageForBackendAPI } from '@/api/clash'
import { getDashboardSettingsFromStorage } from '@/helper/utils'
import { backendList } from '@/store/setup'
import type { Backend } from '@/types'
import { can } from './backend'
import { driver } from './driver'
import { coreReady } from './version'

export type SyncedSettingsResult = {
  backend: Backend
  ok: boolean
  error?: unknown
}

export const getSyncedSettings = async () => {
  await coreReady()

  if (!can('syncSettings')) return Promise.reject<Record<string, unknown>>('unsupported')

  return driver().system.getStorage()
}

export const setSyncedSettings = async (value: Record<string, string>) => {
  await coreReady()

  return can('syncSettings') ? driver().system.setStorage(value) : undefined
}

export const setSyncedSettingsToAllBackends = async (
  value: Record<string, string>,
): Promise<SyncedSettingsResult[]> => {
  const backends = [...backendList.value]

  return Promise.all(
    backends.map(async (backend) => {
      try {
        await setStorageForBackendAPI(backend, value)
        return { backend, ok: true }
      } catch (error) {
        return { backend, ok: false, error }
      }
    }),
  )
}

export const syncSettingsToAllBackends = () =>
  setSyncedSettingsToAllBackends(getDashboardSettingsFromStorage())

export const deleteSyncedSettings = async () => {
  await coreReady()

  return can('syncSettings') ? driver().system.deleteStorage() : undefined
}
