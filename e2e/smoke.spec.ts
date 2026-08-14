import { expect, test } from '@playwright/test'

test('app boots, executes JS, and renders with no console errors', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(err.message))

  await page.goto('/')

  await expect(page).toHaveTitle('Fundle')
  await expect(page.locator('.app-name')).toHaveText('Fundle')
  expect(consoleErrors).toEqual([])
})
