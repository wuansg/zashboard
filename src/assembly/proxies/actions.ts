import { activeConnections, connectionAccessor, disconnectById } from '@/assembly/connections'
import { driver } from '@/assembly/driver'
import { GLOBAL, IPV6_TEST_URL, NOT_CONNECTED, PROXY_TYPE } from '@/constant'
import { notifyRequestError } from '@/helper/request-error'
import { automaticDisconnection, iconReflectList, IPv6test } from '@/store/settings'

import type { Proxy } from '@/types'
import { last } from 'lodash'
import { initSmartWeights } from './smart'
import { IPv6Map, proxyGroupList, proxyMap, proxyProviederList } from './state'

const getIPv6FromExtra = (proxy: Proxy) => {
  const ipv6History = proxy.extra?.[IPV6_TEST_URL]?.history

  return (last(ipv6History)?.delay ?? NOT_CONNECTED) > NOT_CONNECTED
}

let fetchTime = 0

const mergeLatencyHistory = (
  previousHistory: Proxy['history'],
  currentHistory: Proxy['history'],
) => {
  const seen = new Set<string>()

  return [...previousHistory, ...currentHistory].filter((item) => {
    const key = `${item.time}\u0000${item.delay}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const preserveLatencyHistory = (
  previousProxyMap: Record<string, Proxy>,
  nextProxyMap: Record<string, Proxy>,
) => {
  for (const [name, proxy] of Object.entries(nextProxyMap)) {
    const previousProxy = previousProxyMap[name]

    if (previousProxy?.history?.length) {
      proxy.history = mergeLatencyHistory(previousProxy.history, proxy.history ?? [])
    }

    const previousExtra = previousProxy?.extra
    if (!previousExtra) continue

    const extra = { ...(proxy.extra ?? {}) }

    for (const [testUrl, previousResult] of Object.entries(previousExtra)) {
      const currentResult = extra[testUrl]

      if (!currentResult) {
        extra[testUrl] = {
          ...previousResult,
          history: [...previousResult.history],
        }
        continue
      }

      const seen = new Set<string>()
      const history = [...previousResult.history, ...currentResult.history].filter((item) => {
        const key = `${item.time}\u0000${item.delay}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      extra[testUrl] = {
        ...currentResult,
        history,
      }
    }

    proxy.extra = extra
  }
}

export const fetchProxies = async () => {
  const nowTime = Date.now()

  fetchTime = nowTime

  const { proxies, providers } = await driver().proxies.fetch()

  if (fetchTime !== nowTime) {
    return
  }

  const sortIndex = proxies[GLOBAL]?.all ?? []
  const allProviderProxies: Record<string, Proxy> = {}

  for (const provider of providers) {
    for (const proxy of provider.proxies) {
      proxy['provider-name'] ||= provider.name
      allProviderProxies[proxy.name] = proxy
    }
  }

  const nextProxyMap = {
    ...allProviderProxies,
    ...proxies,
  }

  preserveLatencyHistory(proxyMap.value, nextProxyMap)
  proxyMap.value = nextProxyMap
  proxyGroupList.value = Object.values(proxies)
    .filter((proxy) => proxy.all?.length && proxy.name !== GLOBAL)
    .sort((prev, next) => {
      const prevIndex = sortIndex.indexOf(prev.name)
      const nextIndex = sortIndex.indexOf(next.name)

      if (prevIndex === -1 && nextIndex === -1) {
        return 0
      }
      if (prevIndex === -1) {
        return 1
      }
      if (nextIndex === -1) {
        return -1
      }
      return prevIndex - nextIndex
    })
    .map((proxy) => proxy.name)

  proxyProviederList.value = providers

  let includesSmartGroup = false

  Object.entries(proxyMap.value).forEach(([name, proxy]) => {
    const iconReflect = iconReflectList.value.find((icon) => icon.name === name)

    if (iconReflect) {
      proxyMap.value[name].icon = iconReflect.icon
    }
    if (IPv6test.value && getIPv6FromExtra(proxy)) {
      IPv6Map.value[name] = true
    }

    if (proxy.type.toLowerCase() === PROXY_TYPE.Smart) {
      includesSmartGroup = true
    }
  })

  if (includesSmartGroup) {
    initSmartWeights()
  }
}

export const handlerProxySelect = async (proxyGroupName: string, proxyName: string) => {
  try {
    const proxyGroup = proxyMap.value[proxyGroupName]

    if (proxyGroup.type.toLowerCase() === PROXY_TYPE.LoadBalance) return
    if (proxyGroup.now === proxyName) {
      await fetchProxies()
      if (proxyGroup.now === proxyName) return
    }

    await driver().proxies.select(proxyGroupName, proxyName)
    proxyMap.value[proxyGroupName].now = proxyName

    if (automaticDisconnection.value) {
      activeConnections.value
        .filter((c) => connectionAccessor().chains(c).includes(proxyGroupName))
        .forEach((c) => disconnectById(c.id).catch(() => {}))
    }
    fetchProxies()
  } catch (e) {
    notifyRequestError(e)
  }
}

export const updateProxyProvider = (name: string) => driver().proxies.updateProvider(name)

export const updateAllProxyProviders = async () => {
  const providers = proxyProviederList.value.filter(
    (provider) => provider.vehicleType.toLowerCase() !== 'inline',
  )
  const results = await Promise.allSettled(
    providers.map((provider) => updateProxyProvider(provider.name)),
  )

  await fetchProxies()

  const failed = results.find((result) => result.status === 'rejected')
  if (failed?.status === 'rejected') {
    throw failed.reason
  }
}

export const proxyProviderHealthCheck = (name: string) => driver().proxies.healthCheckProvider(name)

export const fetchSmartWeights = () => driver().proxies.fetchSmartWeights()

export const flushSmartGroupWeights = () => driver().proxies.flushSmartWeights()
