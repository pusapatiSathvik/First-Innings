import { test, expect } from '@playwright/test'

test('public home links to account registration', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /the game is on/i })).toBeVisible()
  await page.getByRole('link', { name: /get started/i }).click()
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.getByRole('heading', { name: /join the game/i })).toBeVisible()
  const unconfigured = page.getByRole('status').filter({ hasText: /supabase isn’t configured/i })
  if (await unconfigured.count()) await expect(page.getByRole('button', { name: /create account/i })).toBeDisabled()
  else await expect(page.getByRole('button', { name: /create account/i })).toBeEnabled()
})

test('protected dashboard redirects signed-out visitors to login', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByLabel('Email address')).toBeVisible()
})

test('admin tournament pages require a signed-in account', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/admin/tournaments/example-id')
  await expect(page).toHaveURL(/\/login$/)
})

test('public tournament listing route is reachable', async ({ page }) => {
  await page.goto('/tournaments')
  await expect(page.getByRole('heading', { name: 'Tournaments', exact: true })).toBeVisible()
})

test('public bracket route is reachable', async ({ page }) => {
  await page.goto('/tournaments/sample-knockout/fixtures')
  await expect(page.getByRole('heading', { name: 'Tournament bracket', exact: true })).toBeVisible()
})
