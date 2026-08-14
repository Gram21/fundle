import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenFigiProvider } from './openfigi'

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('openfigi search', () => {
  it('returns no results for a non-ISIN query without hitting the network', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const provider = createOpenFigiProvider({ proxyUrl: '' })
    expect(await provider.search('apple')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs a mapping request with the ISIN, maps a US hit to a bare Yahoo ticker', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([{ data: [{ ticker: 'NVDA', exchCode: 'US', name: 'NVIDIA CORP' }] }]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const provider = createOpenFigiProvider({ proxyUrl: '' })
    const results = await provider.search('US67066G1040')

    expect(results).toEqual([{ symbol: 'NVDA', name: 'NVIDIA CORP', isin: 'US67066G1040', exchange: 'US' }])
    const [, init] = fetchMock.mock.calls[0]!
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual([{ idType: 'ID_ISIN', idValue: 'US67066G1040' }])
  })

  it('maps a German exchange hit to the .DE Yahoo suffix', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse([{ data: [{ ticker: 'SAP', exchCode: 'GR', name: 'SAP SE' }] }])),
    )
    const provider = createOpenFigiProvider({ proxyUrl: '' })
    const results = await provider.search('DE0007164600')
    expect(results).toEqual([{ symbol: 'SAP.DE', name: 'SAP SE', isin: 'DE0007164600', exchange: 'GR' }])
  })

  it('sends the API key header when one is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ data: [] }]))
    vi.stubGlobal('fetch', fetchMock)
    const provider = createOpenFigiProvider({ apiKey: 'my-key', proxyUrl: '' })
    await provider.search('US67066G1040')
    const [, init] = fetchMock.mock.calls[0]!
    expect(init.headers['X-OPENFIGI-APIKEY']).toBe('my-key')
  })

  it('drops hits on an unmapped exchange instead of guessing a wrong Yahoo symbol', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse([{ data: [{ ticker: 'XYZ', exchCode: 'SOME_UNKNOWN_EXCHANGE', name: 'Mystery Corp' }] }]),
      ),
    )
    const provider = createOpenFigiProvider({ proxyUrl: '' })
    expect(await provider.search('US67066G1040')).toEqual([])
  })

  it('deduplicates hits that resolve to the same Yahoo symbol', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse([
          {
            data: [
              { ticker: 'NVDA', exchCode: 'US', name: 'NVIDIA CORP' },
              { ticker: 'NVDA', exchCode: 'US', name: 'NVIDIA CORP (dup listing)' },
            ],
          },
        ]),
      ),
    )
    const provider = createOpenFigiProvider({ proxyUrl: '' })
    const results = await provider.search('US67066G1040')
    expect(results).toHaveLength(1)
  })

  it('returns an empty list (not a throw) when the request fails - this is an automatic supplement', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))
    const provider = createOpenFigiProvider({ proxyUrl: '' })
    await expect(provider.search('US67066G1040')).resolves.toEqual([])
  })
})

describe('openfigi quote/history', () => {
  it('delegates to Yahoo since a resolved symbol is a plain Yahoo ticker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          chart: { result: [{ meta: { regularMarketPrice: 1, currency: 'USD', regularMarketTime: 1, previousClose: 1 } }] },
        }),
      ),
    )
    const provider = createOpenFigiProvider({ proxyUrl: '' })
    const quote = await provider.quote('NVDA')
    expect(quote.symbol).toBe('NVDA')
  })
})
