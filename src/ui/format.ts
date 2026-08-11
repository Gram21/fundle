/** Formatting helpers. Intl only, no dependencies. */

export function money(n: number, currency: string): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)
}

/** Always-signed percentage, e.g. '+1.24 %' or '-1.24 %'. */
export function pct(n: number): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  }).format(n)
  return `${formatted} %`
}

export function signClass(n: number): 'up' | 'down' | 'flat' {
  if (n > 0) return 'up'
  if (n < 0) return 'down'
  return 'flat'
}

/** Short German-ish date, e.g. '11.08.26'. */
export function date(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(
    new Date(iso),
  )
}
