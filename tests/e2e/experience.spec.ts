import { test, expect } from '@playwright/test';
import { installLayoutRoom, layoutState, finishedLayoutState } from './layout-fixture';
import { layoutProblems } from './layout-metrics';
import { hostRoom, joinByLink, PHONE } from './helpers';

test('language changes immediately, persists after reload and stays local to each real player', async ({ browser }) => {
  const { seat: host, code } = await hostRoom(browser, '小明');
  const guest = await joinByLink(browser, code, 'Mei Ling', PHONE);
  await host.page.getByTestId('language-toggle').click();
  await expect(host.page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(host.page.getByTestId('start-game')).toHaveText('开始游戏');
  await expect(guest.page.getByTestId('ready-toggle')).toHaveText("I'm ready");
  await host.page.reload();
  await expect(host.page.getByTestId('start-game')).toHaveText('开始游戏');
  await guest.page.getByTestId('ready-toggle').click();
  await host.page.getByTestId('start-game').click();
  await expect(host.page.getByTestId('hand')).toBeVisible();
  await expect(guest.page.getByTestId('hand')).toBeVisible();
  await expect(host.page.getByTestId('menu-button')).toHaveAttribute('aria-label', '菜单');
  await host.page.getByTestId('menu-button').click();
  await host.page.getByRole('button', { name: '设置', exact: true }).click();
  await host.page.getByTestId('language-select').selectOption('en');
  await expect(host.page.getByTestId('language-select')).toHaveValue('en');
  await expect(host.page.getByRole('dialog')).toContainText('Sound effects');
  await host.page.keyboard.press('Escape');
  await expect(host.page.getByTestId('menu-button')).toHaveAttribute('aria-label', 'Menu');
  await host.ctx.close(); await guest.ctx.close();
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`inspect blocked parcels and Crow stash without revealing other scores ${viewport.width}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', locale: 'zh-CN' });
    const page = await context.newPage();
    const room = await installLayoutRoom(page, layoutState(), { language: 'zh' });
    await page.goto('/r/AUD234');
    const card = page.getByTestId('my-parcel').first();
    await expect(card.locator('.pack-value')).toHaveText('1');
    const overlap = await card.evaluate(el => {
      const score = el.querySelector('.pack-value')!.getBoundingClientRect();
      const fly = el.querySelector('.card-fly-overlay')!.getBoundingClientRect();
      return Math.min(score.right, fly.right) > Math.max(score.left, fly.left) && Math.min(score.bottom, fly.bottom) > Math.max(score.top, fly.top);
    });
    expect(overlap).toBe(false);
    await card.click();
    await expect(page.getByTestId('inspect-card-value')).toHaveText('卡牌价值：1 包');
    await expect(page.getByTestId('table-details')).toContainText('暂计 0 包');
    expect(await layoutProblems(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.locator('[data-player-id=layout-1]').click();
    await expect(page.getByTestId('hidden-score-hint')).toBeVisible();
    await expect(page.getByTestId('inspect-card-value').first()).toHaveText('背面朝上的椰浆饭');
    await expect(page.getByTestId('table-details').locator('.game-card[data-face=front]')).toHaveCount(0);
    await expect(page.getByTestId('inspect-crow')).toContainText('参巴江鱼仔');
    expect(await layoutProblems(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByTestId('crow-pile').click();
    await expect(page.getByTestId('pile-details')).toContainText('下一位制作椰浆饭');
    await page.keyboard.press('Escape');
    room.publish(finishedLayoutState());
    await expect(page.getByTestId('champion')).toHaveCount(1);
    await expect(page.getByTestId('champion')).toContainText('7 包有效椰浆饭');
    expect(await layoutProblems(page)).toEqual([]);
    const tie = finishedLayoutState();
    tie.game!.result!.winnerIds = ['layout-0', 'layout-1'];
    tie.game!.players[0]!.nasiLemak = tie.game!.players[1]!.nasiLemak.map(nl => ({ ...nl, id: `tie-${nl.id}` }));
    tie.game!.players[0]!.packs = 7;
    tie.game!.result!.standings[0]!.packs = 7;
    tie.game!.result!.standings[0]!.cards = 4;
    tie.game!.result!.revealed['layout-0'] = [...tie.game!.result!.revealed['layout-1']!];
    room.publish(tie);
    await expect(page.getByTestId('champion')).toHaveCount(2);
    expect(await layoutProblems(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.locator('[data-player-id=layout-1]').click();
    await expect(page.getByTestId('hidden-score-hint')).toHaveCount(0);
    await expect(page.getByTestId('inspect-valid-packs')).toHaveText('7');
    await expect(page.getByTestId('table-details').locator('.game-card[data-face=front]')).toHaveCount(5);
    await context.close();
  });
}

test('fresh server events animate, inputs stay usable and historical events do not replay', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const room = await installLayoutRoom(page, layoutState(), { reducedMotion: false });
  await page.goto('/r/AUD234');
  await expect(page.getByTestId('hand')).toBeVisible();
  await expect(page.getByTestId('table-effects')).toHaveCount(0);
  const emit = (key: string, extra: object = {}) => {
    const next = room.state;
    next.game!.log.push({ seq: next.game!.log.at(-1)!.seq + 1, turn: 1, key, actor: 'layout-0', ...extra });
    room.publish(next);
  };
  emit('draw', { n: 2 });
  await expect(page.getByTestId('table-effects')).toHaveAttribute('data-event', 'draw');
  await expect(page.getByTestId('table-effects').locator('[data-face=front]')).toHaveCount(0);
  await expect(page.getByTestId('table-effects')).toHaveCount(0);
  emit('fly', { target: 'layout-1' });
  await expect(page.getByTestId('table-effects')).toHaveAttribute('data-event', 'play');
  await page.getByTestId('my-parcel').first().click();
  await expect(page.getByTestId('table-details')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('table-effects')).toHaveCount(0);
  emit('make');
  await expect(page.getByTestId('table-effects')).toHaveAttribute('data-event', 'make');
  await expect(page.getByTestId('table-effects')).toHaveCount(0);
  emit('crow-pass', { target: 'layout-2' });
  await expect(page.getByTestId('table-effects')).toHaveAttribute('data-event', 'crow');
  await expect(page.getByTestId('table-effects')).toHaveCount(0);
  emit('trade-done', { target: 'layout-1' });
  await expect(page.getByTestId('table-effects')).toHaveAttribute('data-event', 'trade');
  await expect(page.getByTestId('table-effects')).toHaveCount(0);
  emit('reshuffle');
  await expect(page.getByTestId('table-effects')).toHaveAttribute('data-event', 'reshuffle');
  await expect(page.getByTestId('table-effects')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('hand')).toBeVisible();
  await expect(page.getByTestId('table-effects')).toHaveCount(0);
  await context.close();
});

test('OS reduced motion suppresses card flights and victory confetti', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const room = await installLayoutRoom(page, layoutState(), { reducedMotion: false });
  await page.goto('/r/AUD234');
  await expect(page.getByTestId('hand')).toBeVisible();
  const next = room.state;
  next.game!.log.push({ seq: next.game!.log.at(-1)!.seq + 1, turn: 1, key: 'make', actor: 'layout-0' });
  room.publish(next);
  await expect(page.locator('.event-focus')).toBeHidden();
  await expect(page.getByTestId('table-effects')).toHaveCount(0);
  room.publish(finishedLayoutState());
  await expect(page.getByTestId('results')).toBeVisible();
  await expect(page.locator('.victory-confetti')).toBeHidden();
  await context.close();
});

test('navigation labels keep readable contrast over the artwork in both languages', async ({ page }) => {
  await page.goto('/');
  for (const language of ['en', 'zh']) {
    if (language === 'zh') await page.getByTestId('language-toggle').click();
    const ratios = await page.locator('.home-hero .btn-ghost,.avatar-profile').evaluateAll(buttons => buttons.map(button => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      const luminance = (color: string) => {
        ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
        const rgb = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3).map(n => { const value = n / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; });
        return .2126 * rgb[0]! + .7152 * rgb[1]! + .0722 * rgb[2]!;
      };
      const style = getComputedStyle(button);
      const a = luminance(style.color), b = luminance(style.backgroundColor);
      return { label: button.textContent, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    }));
    expect(ratios).toHaveLength(4);
    for (const result of ratios) expect(result.ratio, `${language}: ${result.label}`).toBeGreaterThanOrEqual(4.5);
  }
});
