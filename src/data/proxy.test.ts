import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchJson, proxyCandidates } from './proxy'
import { PriceProviderError } from './PriceProvider'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('proxyCandidates', () => {
  it('splits, trims, and drops empty entries', () => {
    expect(proxyCandidates('https://a/?url=, https://b/?url= ,,')).toEqual([
      'https://a/?url=',
      'https://b/?url=',
    ])
  })

  it('returns an empty list for a blank string', () => {
    expect(proxyCandidates('   ')).toEqual([])
  })
})

describe('fetchJson fallback', () => {
  it('falls through to the next candidate when the first fails', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('{"ok":true}') })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchJson('https://example.com/x', 'https://proxy-a/?url=,https://proxy-b/?url=')
    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws one aggregated PriceProviderError naming every failed proxy when all fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 403, text: () => Promise.resolve('blocked') })
        .mockResolvedValueOnce({ ok: false, status: 429, text: () => Promise.resolve('rate limited') }),
    )

    let caught: unknown
    try {
      await fetchJson('https://example.com/x', 'https://proxy-a/?url=,https://proxy-b/?url=')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(PriceProviderError)
    expect((caught as Error).message).toMatch(/proxy-a/)
    expect((caught as Error).message).toMatch(/proxy-b/)
  })

  it('does not try a second candidate once one succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('{"ok":true}') })
    vi.stubGlobal('fetch', fetchMock)

    await fetchJson('https://example.com/x', 'https://proxy-a/?url=,https://proxy-b/?url=')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('forwards an optional RequestInit (method/body/headers) to every candidate, needed for POST APIs like OpenFIGI', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('{}') })
    vi.stubGlobal('fetch', fetchMock)

    await fetchJson('https://example.com/x', '', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '[1,2,3]',
    })
    const [, init] = fetchMock.mock.calls[0]!
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.body).toBe('[1,2,3]')
  })
})
