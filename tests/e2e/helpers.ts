import { type Browser, type BrowserContext, type Page, expect } from '@playwright/test';

export const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
export const DESKTOP = { viewport: { width: 1366, height: 820 } };

export interface Seat {
  ctx: BrowserContext;
  page: Page;
  name: string;
}

export async function hostRoom(browser: Browser, name: string, opts = DESKTOP): Promise<{ seat: Seat; code: string }> {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('create-name').fill(name);
  await page.getByTestId('create-room').click();
  await expect(page.getByTestId('room-code')).toBeVisible();
  const code = (await page.getByTestId('room-code').textContent())!.trim();
  return { seat: { ctx, page, name }, code };
}

/** Join through the invite link, exactly like a friend tapping the WhatsApp link. */
export async function joinByLink(browser: Browser, code: string, name: string, opts = DESKTOP): Promise<Seat> {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(`/r/${code}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('room-join-name').fill(name);
  await page.getByTestId('room-join-submit').click();
  await expect(page.getByTestId('ready-toggle')).toBeVisible();
  return { ctx, page, name };
}

export async function isMyTurn(page: Page): Promise<boolean> {
  const t = await page.getByTestId('turn-banner').textContent({ timeout: 2000 }).catch(() => '');
  return !!t && t.includes('Your turn');
}

export async function handCount(page: Page): Promise<number> {
  const labels = await page.getByTestId('hand-card').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  return labels.reduce((n, l) => n + Number(/×(\d+)$/.exec(l)?.[1] ?? 1), 0);
}

/** Sorted multiset of the kinds in my hand, e.g. "egg,egg,fly". */
export async function handSignature(page: Page): Promise<string> {
  const labels = await page.getByTestId('hand-card').evaluateAll((els) => els.map((e) => [e.getAttribute('data-kind'), e.getAttribute('aria-label') ?? '']));
  return labels.map(([k, l]) => `${k}x${/×(\d+)$/.exec(l!)?.[1] ?? 1}`).sort().join();
}

/** Assert nothing important overflows the viewport horizontally. */
export async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

export async function assertInViewport(page: Page, testId: string, opts: { ifPresent?: boolean } = {}) {
  const box = await page.getByTestId(testId).boundingBox({ timeout: opts.ifPresent ? 1000 : undefined }).catch(() => null);
  const vp = page.viewportSize()!;
  // During live play the turn can move on between two checks; then there is nothing to measure.
  if (!box && opts.ifPresent) return;
  expect(box, testId).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1);
}

async function tryPlay(page: Page, kind: string, finish: () => Promise<void>): Promise<boolean> {
  const card = page.locator(`[data-testid=hand-card][data-kind=${kind}]`).first();
  if (!(await card.count())) return false;
  await card.click();
  const play = page.getByTestId('play-this');
  await expect(page.getByTestId('card-detail')).toBeVisible();
  if (!(await play.isEnabled())) {
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('card-detail')).toBeHidden();
    return false;
  }
  await play.click();
  await finish();
  return true;
}

/**
 * Take one move through the real UI, like a casual player would:
 * make a Nasi Lemak if possible, otherwise use a helpful action card
 * (Mak Cik, Wholesaler, Supplier, Thief) via the card-detail sheet,
 * otherwise end the turn.
 */
export async function takeSimpleTurn(page: Page): Promise<'made' | 'played' | 'ended'> {
  const make = page.getByTestId('action-make');
  if (!(await make.isVisible())) return 'ended'; // turn already moved on
  if (await make.isEnabled()) {
    await make.click();
    await page.getByTestId('confirm-recipe').click();
    await expect(page.getByTestId('recipe-picker')).toBeHidden();
    return 'made';
  }
  if (
    await tryPlay(page, 'makcik', async () => {
      await page.getByTestId('confirm-recipe').click();
      await expect(page.getByTestId('recipe-picker')).toBeHidden();
    })
  )
    return 'made';
  if (
    await tryPlay(page, 'officer', async () => {
      // Inspect the player with the most cards and take two of them.
      const targets = page.getByTestId('pick-player');
      const choices = await targets.evaluateAll((buttons) => buttons.map((button, index) => ({ index, count: Number(button.getAttribute('data-hand-count')) })).sort((a, b) => b.count - a.count));
      const choice = choices[0]!;
      await targets.nth(choice.index).click();
      // An empty hand is a valid target and resolves without a take prompt.
      if (choice.count === 0) {
        await expect(page.getByTestId('flow-officer')).toBeHidden();
        await expect(page.getByTestId('officer-take')).toBeHidden();
        return;
      }
      await expect(page.getByTestId('officer-take')).toBeVisible();
      const cards = page.getByTestId('officer-card');
      const n = Math.min(2, await cards.count());
      for (let i = 0; i < n; i++) await cards.nth(i).click();
      await page.getByTestId('confirm-officer').click();
      await expect(page.getByTestId('officer-take')).toBeHidden();
    })
  )
    return 'played';
  for (const kind of ['wholesaler', 'thief']) {
    if (
      await tryPlay(page, kind, async () => {
        await page.getByTestId('confirm-play').click();
        await expect(page.getByTestId(`flow-${kind}`)).toBeHidden();
      })
    )
      return 'played';
  }
  if (
    await tryPlay(page, 'supplier', async () => {
      // Announce an ingredient we do not hold yet (or the first one).
      const held = await page.getByTestId('hand-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
      const want = ['nasi', 'telur', 'kacang', 'sambal', 'timun'].find((k) => !held.includes(k)) ?? 'nasi';
      await page.getByTestId(`announce-${want}`).click();
      await expect(page.getByTestId('flow-supplier')).toBeHidden();
    })
  )
    return 'played';
  const end = page.getByTestId('action-end-turn');
  // The previous move can finish the turn while the helper inspects the hand.
  // A vanished action bar means the next player is already up.
  if (!(await end.isVisible())) return 'ended';
  try { await end.click({ timeout: 2000 }); }
  catch (error) { if (!(await isMyTurn(page))) return 'ended'; throw error; }
  const confirm = page.getByTestId('confirm-end-turn');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  return 'ended';
}
