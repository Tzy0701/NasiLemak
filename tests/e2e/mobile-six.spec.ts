import { expect, test } from '@playwright/test';
import { PHONE, type Seat, assertInViewport, assertNoHorizontalOverflow, hostRoom, isMyTurn, joinByLink, takeSimpleTurn } from './helpers';

test('6 phones join a Rendang game; the table stays usable on small screens', async ({ browser }) => {
  const { seat: host, code } = await hostRoom(browser, 'Host', PHONE);
  const seats: Seat[] = [host];
  for (const n of ['Ali', 'Mei', 'Raju', 'Siti', 'Tan']) seats.push(await joinByLink(browser, code, n, PHONE));
  await host.page.getByTestId('mode-classic-rendang').click();
  for (const s of seats.slice(1)) await s.page.getByTestId('ready-toggle').click();
  await expect(host.page.getByTestId('start-game')).toBeEnabled();
  await assertNoHorizontalOverflow(host.page);
  await host.page.screenshot({ path: 'test-results/lobby-phone.png', fullPage: true });
  await host.page.getByTestId('start-game').click();

  for (const s of seats) {
    await expect(s.page.getByTestId('hand')).toBeVisible();
    await expect(s.page.getByTestId('opponent-seat')).toHaveCount(5);
    await assertNoHorizontalOverflow(s.page);
    await expect(s.page.getByTestId('crow-pile')).toBeVisible();
  }

  // Play a couple of rounds through the UI.
  let turns = 0;
  for (let i = 0; i < 300 && turns < 14; i++) {
    const current = (await Promise.all(seats.map(async (s) => ((await isMyTurn(s.page)) ? s : null)))).find(Boolean);
    if (!current || !(await current.page.getByTestId('action-bar').isVisible())) {
      await host.page.waitForTimeout(150);
      continue;
    }
    await assertInViewport(current.page, 'action-end-turn', { ifPresent: true });
    if (turns === 0) {
      // Tap a card: the detail sheet opens and fits the screen.
      await current.page.getByTestId('hand-card').first().click();
      await expect(current.page.getByTestId('card-detail')).toBeVisible();
      await current.page.screenshot({ path: 'test-results/card-detail-phone.png' });
      await current.page.keyboard.press('Escape');
      await current.page.screenshot({ path: 'test-results/table-phone.png' });
    }
    await takeSimpleTurn(current.page);
    turns++;
    await current.page.waitForTimeout(150);
  }
  expect(turns).toBeGreaterThanOrEqual(10);

  // Host ends the game early from the menu → everyone sees the results; then rematch.
  await host.page.getByTestId('menu-button').click();
  await host.page.getByText('End game now').click();
  await host.page.getByRole('button', { name: 'Confirm' }).click();
  for (const s of seats) await expect(s.page.getByTestId('results')).toBeVisible();
  await host.page.getByTestId('rematch').click();
  for (const s of seats) await expect(s.page.getByTestId('results')).toBeHidden();
  for (const s of seats) await s.ctx.close();
});

test('custom house rules can be configured in the lobby and are locked into the game', async ({ browser }) => {
  const { seat: host, code } = await hostRoom(browser, 'Host');
  const guest = await joinByLink(browser, code, 'Guest', PHONE);
  await host.page.getByTestId('mode-custom').click();
  await host.page.getByTestId('preset-fast').click();
  await expect(guest.page.getByTestId('custom-editor')).toBeVisible();
  // Bump the target packs to 6 from the host's screen; the guest sees it live.
  await host.page.getByTestId('stepper-target').getByRole('button', { name: /\+1/ }).click();
  await expect(guest.page.getByTestId('stepper-target')).toContainText('6');
  // Guest cannot edit.
  await expect(guest.page.getByTestId('stepper-target').getByRole('button')).toHaveCount(0);
  await guest.page.getByTestId('ready-toggle').click();
  await host.page.getByTestId('start-game').click();
  await expect(guest.page.getByTestId('my-packs')).toContainText('/ 6');
  await host.ctx.close();
  await guest.ctx.close();
});
