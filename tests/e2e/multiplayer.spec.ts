import { expect, test } from '@playwright/test';
import { PHONE, type Seat, assertInViewport, assertNoHorizontalOverflow, handCount, handSignature, hostRoom, isMyTurn, joinByLink, takeSimpleTurn } from './helpers';

test('3 players on separate browsers play a complete Classic Base game through the UI', async ({ browser }) => {
  const { seat: host, code } = await hostRoom(browser, 'Aisyah');
  const guest1 = await joinByLink(browser, code, 'Wei Ming', PHONE);
  const guest2 = await joinByLink(browser, code, 'Kumar');
  const seats: Seat[] = [host, guest1, guest2];

  // Lobby is live on every screen.
  for (const s of seats) await expect(s.page.getByTestId('member')).toHaveCount(3);
  await expect(host.page.getByTestId('start-game')).toBeDisabled();
  await guest1.page.getByTestId('ready-toggle').click();
  await guest2.page.getByTestId('ready-toggle').click();
  await expect(host.page.getByTestId('start-game')).toBeEnabled();
  await host.page.getByTestId('start-game').click();

  for (const s of seats) await expect(s.page.getByTestId('hand')).toBeVisible();
  // Each player sees their own hand, and the right counts for the others.
  for (const s of seats) {
    const mine = await handCount(s.page);
    expect(mine).toBeGreaterThanOrEqual(7);
    for (const other of seats.filter((o) => o !== s)) {
      const seat = s.page.locator(`[data-testid=opponent-seat][data-player="${other.name}"]`);
      const theirs = await handCount(other.page);
      await expect(seat.getByTestId('hand-count')).toContainText(`${theirs} in hand`);
    }
  }
  await assertNoHorizontalOverflow(guest1.page);

  let refreshed = false;
  let traded = false;
  let made = 0;
  for (let step = 0; step < 1500; step++) {
    if (await host.page.getByTestId('results').isVisible().catch(() => false)) break;
    let current: Seat | undefined;
    for (const s of seats) if (await isMyTurn(s.page)) current = s;
    if (!current) {
      await host.page.waitForTimeout(150);
      continue;
    }
    if (current === guest1) {
      await assertInViewport(current.page, 'action-end-turn');
      await assertInViewport(current.page, 'action-make');
    }
    // Once: a trade offer through the UI that the partner rejects.
    if (!traded && current === host && (await host.page.getByTestId('action-trade').isEnabled())) {
      traded = true;
      await host.page.getByTestId('action-trade').click();
      await host.page.locator('[data-testid=trade-partner][data-player="Kumar"]').click();
      await host.page.getByTestId('offer-card').first().click();
      await host.page.getByTestId('want-nasi-plus').click();
      await host.page.getByTestId('send-trade').click();
      await expect(guest2.page.getByTestId('trade-response')).toBeVisible();
      await expect(guest1.page.getByTestId('trade-banner')).toContainText('negotiating');
      await guest2.page.getByTestId('reject-trade').click();
      await expect(guest2.page.getByTestId('trade-response')).toBeHidden();
      await expect(host.page.getByTestId('trade-banner')).toBeHidden();
    }
    // Once: the phone player refreshes mid-game and keeps their seat + hand.
    if (!refreshed && step > 6 && current !== guest1) {
      refreshed = true;
      const before = await handSignature(guest1.page);
      await guest1.page.reload();
      await expect(guest1.page.getByTestId('hand')).toBeVisible();
      const after = await handSignature(guest1.page);
      expect(after).toBe(before);
    }
    const r = await takeSimpleTurn(current.page);
    if (r === 'made') made++;
    await current.page.waitForTimeout(120);
  }

  for (const s of seats) await expect(s.page.getByTestId('results')).toBeVisible();
  const headline = await host.page.getByTestId('winner-headline').textContent();
  expect(headline).toBeTruthy();
  expect(made).toBeGreaterThanOrEqual(3);
  expect(refreshed).toBe(true);
  await expect(guest1.page.getByTestId('standing')).toHaveCount(3);
  await host.page.screenshot({ path: 'test-results/results-desktop.png' });

  // Rematch: everyone is dealt into a new game.
  await host.page.getByTestId('rematch').click();
  for (const s of seats) {
    await expect(s.page.getByTestId('results')).toBeHidden();
    await expect(s.page.getByTestId('hand')).toBeVisible();
  }
  for (const s of seats) await s.ctx.close();
});
