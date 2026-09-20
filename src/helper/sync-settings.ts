import { setSyncedSettingsToAllBackends } from '@/assembly/storage'
import { LOCAL_IMAGE } from '@/helper/indexeddb'
import { notifyRequestError } from '@/helper/request-error'
import { getDashboardSettingsFromStorage, getLabelFromBackend } from '@/helper/utils'
import { customBackgroundURL } from '@/store/settings'
import { showNotification } from './notification'

export const getSettingsForSync = () => {
  const settings = getDashboardSettingsFromStorage()
  const iconLength = JSON.stringify(settings['config/icon-reflect-list'] || []).length
  const isIconReflectListRemoved = iconLength > 800 * 1024

  if (customBackgroundURL.value.includes(LOCAL_IMAGE)) {
    delete settings['config/custom-background-image']
  }

  if (isIconReflectListRemoved) {
    delete settings['config/icon-reflect-list']
  }

  return { settings, isIconReflectListRemoved }
}

export const syncSettingsToAllBackendsWithNotification = async (notifyKey: string) => {
  const { settings, isIconReflectListRemoved } = getSettingsForSync()
  const results = await setSyncedSettingsToAllBackends(settings)
  const failed = results.filter((result) => !result.ok)
  const successful = results.length - failed.length

  showNotification({
    key: notifyKey,
    content: failed.length
      ? 'syncSettingsToAllBackendsPartial'
      : 'syncSettingsToAllBackendsSuccess',
    params: {
      success: String(successful),
      failed: String(failed.length),
      backends: failed.map(({ backend }) => getLabelFromBackend(backend)).join(', '),
    },
    type: failed.length ? 'alert-warning' : 'alert-success',
  })

  if (isIconReflectListRemoved) {
    showNotification({
      content: 'uploadSettingsIconReflectListRemoved',
      type: 'alert-warning',
    })
  }

  return results
}

export const notifySyncSettingsError = (error: unknown, notifyKey: string) => {
  notifyRequestError(error, notifyKey)
}
