import { expect, test } from '@playwright/test';
import { PHONE, assertNoHorizontalOverflow, hostRoom, joinByLink } from './helpers';
import { finishedLayoutState, installLayoutRoom, layoutState } from './layout-fixture';
import { layoutProblems } from './layout-metrics';
import { TestPlayer, expectOk, makeRoom, readyAll } from '../integration/client';

test('real friends send targeted stickers and phrases, mute reactions and share a room QR', async ({ browser }) => {
  const { seat: host, code } = await hostRoom(browser, '小明');
  const guest = await joinByLink(browser, code, 'Mei Ling', PHONE);
  try {
    await host.page.getByTestId('room-tools').click();
    await host.page.getByTestId('tools-invite').click();
    await expect(host.page.getByTestId('invite-qr')).toBeVisible();
    await expect(host.page.getByTestId('invite-qr')).toHaveJSProperty('naturalWidth', 256);
    await host.page.screenshot({ path: 'test-results/extras-qr-desktop.png' });
    await host.page.getByTestId('tools-social').click();
    const guestOption = host.page.getByTestId('social-target').locator('option').filter({ hasText: 'Mei Ling' });
    await host.page.getByTestId('social-target').selectOption((await guestOption.getAttribute('value'))!);
    await host.page.getByTestId('sticker-cat').click();
    await expect(guest.page.getByTestId('social-event')).toContainText('小明 → Mei Ling');
    await guest.page.screenshot({ path: 'test-results/extras-sticker-phone.png' });
    await guest.page.getByTestId('room-tools').click();
    await guest.page.getByTestId('mute-social').check();
    await guest.page.keyboard.press('Escape');
    await host.page.waitForTimeout(2100);
    await host.page.getByTestId('room-tools').click();
    await host.page.getByTestId('phrase-thanks').click();
    await expect(host.page.getByTestId('social-event').filter({ hasText: 'Thank you!' })).toBeVisible();
    await expect(guest.page.getByTestId('social-event')).toHaveCount(0);
    await assertNoHorizontalOverflow(guest.page);
  } finally { await host.ctx.close(); await guest.ctx.close(); }
});

test('returning to a closed table reports it clearly instead of reconnecting forever', async ({ browser, baseURL }) => {
  const host = await TestPlayer.create(baseURL!, 'Old table');
  expectOk(await host.lobby({ op: 'leave' }));
  const context = await browser.newContext(PHONE);
  try {
    await context.addInitScript(session => {
      localStorage.setItem('nl.prefs.v1', JSON.stringify({ language: 'zh', sound: false }));
      localStorage.setItem('nl.sessions.v1', JSON.stringify({ [session.code]: { ...session, savedAt: Date.now() } }));
    }, { code: host.code, playerId: host.playerId, token: host.token });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByTestId('continue-room').click();
    await expect(page.getByRole('alert')).toContainText('上一桌已结束');
    await expect(page.getByTestId('continue-room')).toBeHidden();
  } finally { host.close(); await context.close(); }
});

for (const width of [320, 390, 1440]) {
  for (const language of ['zh', 'en'] as const) {
    test(`new panels stay readable at ${width}px in ${language}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 900 } });
      const page = await context.newPage();
      const snapshot = layoutState();
      snapshot.room.tableScores = snapshot.room.members.map((member, index) => ({ playerId: member.id, name: member.name, avatar: member.avatar, games: 3, wins: index === 1 ? 2 : 0, packs: 15, streak: 1, bestStreak: 2 }));
      const room = await installLayoutRoom(page, snapshot, { language });
      await page.goto('/r/AUD234');
      await expect(page.getByTestId('hand')).toBeVisible();
      await page.getByTestId('hand-sort').selectOption('count');
      await expect(page.getByTestId('hand-sort')).toHaveValue('count');
      await page.getByTestId('room-tools').click();
      await expect(page.locator('.sticker-picker button')).toHaveCount(12);
      await expect(page.locator('.phrase-picker button')).toHaveCount(12);
      expect(await layoutProblems(page)).toEqual([]);
      await page.screenshot({ path: `test-results/extras-social-${language}-${width}.png` });
      await page.getByTestId('tools-scores').click();
      await expect(page.getByTestId('table-record').locator('tbody tr')).toHaveCount(7);
      expect(await layoutProblems(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await page.getByTestId('recent-actions').click();
      await expect(page.getByTestId('recent-actions-modal')).toBeVisible();
      expect(await layoutProblems(page)).toEqual([]);
      await page.keyboard.press('Escape');
      const thief = room.state;
      thief.game!.turn.pending = { type: 'thief', actorId: 'layout-0', targetId: 'layout-1', take: 1, choices: Array.from({ length: 18 }, (_, i) => `blind-${i}`), remaining: ['layout-2', 'layout-3'], completed: [] };
      thief.room.version++;
      room.publish(thief);
      await expect(page.getByTestId('thief-card')).toHaveCount(18);
      await expect(page.getByTestId('thief-take').locator('.game-card[data-face=front]')).toHaveCount(0);
      expect(await layoutProblems(page)).toEqual([]);
      await page.screenshot({ path: `test-results/extras-thief-${language}-${width}.png` });
      const final = finishedLayoutState();
      final.room.tableScores = snapshot.room.tableScores;
      room.publish(final);
      await expect(page.getByTestId('results')).toBeVisible();
      await expect(page.getByTestId('table-record')).toBeAttached();
      expect(await layoutProblems(page)).toEqual([]);
      await context.close();
    });
  }
}

test('a real Thief chooses all opponents through the browser and keeps backs after refresh', async ({ browser, baseURL }) => {
  const players = await makeRoom(baseURL!, 3);
  let context: Awaited<ReturnType<typeof browser.newContext>> | null = null;
  try {
    await readyAll(players);
    expectOk(await players[0]!.lobby({ op: 'start' }));
    for (const p of players) await p.waitFor(() => p.game?.status === 'playing');
    let actor: TestPlayer | undefined;
    for (let i = 0; i < 100; i++) {
      const current = players.find(p => p.playerId === players[0]!.game!.turn.playerId)!;
      if (current.game!.hand.some(card => card.kind === 'thief')) { actor = current; break; }
      const turn = current.game!.turn.number;
      expectOk(await current.act({ type: 'endTurn' }));
      for (const p of players) await p.waitFor(() => p.game!.turn.number > turn);
    }
    expect(actor).toBeDefined();
    context = await browser.newContext(PHONE);
    await context.addInitScript(session => {
      if (!localStorage.getItem('nl.prefs.v1')) localStorage.setItem('nl.prefs.v1', JSON.stringify({ language: 'zh', sound: false, reducedMotion: true }));
      localStorage.setItem('nl.sessions.v1', JSON.stringify({ [session.code]: { ...session, savedAt: Date.now() } }));
    }, { code: actor!.code, token: actor!.token, playerId: actor!.playerId });
    const page = await context.newPage();
    await page.goto(`/r/${actor!.code}`);
    await page.locator('[data-testid=hand-card][data-kind=thief]').click();
    await page.getByTestId('play-this').click();
    await page.getByTestId('confirm-play').click();
    await expect(page.getByTestId('thief-take')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('thief-take')).toBeVisible();
    for (let i = 0; i < 2; i++) {
      await expect(page.getByTestId('thief-card').first()).toBeEnabled();
      await page.getByTestId('thief-card').first().click();
      if (i === 0) await expect(page.getByTestId('thief-take')).toContainText('已完成 1 位');
    }
    await expect(page.getByTestId('thief-take')).toBeHidden();
    expect(actor!.game!.log.filter(entry => entry.key === 'thief-take')).toHaveLength(2);
    await page.getByTestId('hand-sort').selectOption('name');
    await page.reload();
    await expect(page.getByTestId('hand-sort')).toHaveValue('name');
    await assertNoHorizontalOverflow(page);
  } finally { players.forEach(p => p.close()); await context?.close(); }
});
