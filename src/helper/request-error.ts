import axios from 'axios'
import { showNotification } from './notification'

export const getRequestErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data

    if (typeof data === 'string' && data.trim()) {
      return data.trim()
    }

    if (data && typeof data === 'object' && 'message' in data) {
      const message = data.message

      if (typeof message === 'string' && message.trim()) {
        return message.trim()
      }
    }

    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export const notifyRequestError = (error: unknown, key?: string) => {
  const message = getRequestErrorMessage(error)
  const url = axios.isAxiosError(error) ? decodeURIComponent(error.config?.url || '') : ''

  showNotification({
    key: key || message,
    content: url ? `${url} \n${message}` : message,
    type: 'alert-error',
  })
}
