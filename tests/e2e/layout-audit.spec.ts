import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installLayoutRoom, layoutState, finishedLayoutState } from './layout-fixture';
import { layoutProblems } from './layout-metrics';
const sizes = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 640, height: 720 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 390, height: 844, fallback: true }, { width: 320, height: 568, largeText: true }];
const out = process.env.LAYOUT_OUTPUT ?? 'test-results/layout';
const baseline = process.env.LAYOUT_BASELINE === '1';
for (const size of sizes)
  test(`layout ${size.width}x${size.height}${size.fallback ? ' fallback-font' : size.largeText ? ' large-text' : ''}: pages, cards and every game dialog`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: size, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const label = `${size.width}x${size.height}${size.fallback ? '-fallback' : size.largeText ? '-large-text' : ''}`;
    if (size.fallback) {
      await page.route('https://fonts.googleapis.com/**', route => route.abort());
      await page.route('https://fonts.gstatic.com/**', route => route.abort());
    }
    if (size.largeText)
      await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.fontSize = '20px'));
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    const room = await installLayoutRoom(page);
    const checks: {
      screen: string;
      issues: string[];
    }[] = [];
    mkdirSync(out, { recursive: true });
    const scan = async (screen: string, screenshot = false) => {
      await page.waitForTimeout(70);
      const issues = await layoutProblems(page);
      checks.push({ screen, issues });
      if (screenshot || (baseline && issues.length))
        await page.screenshot({ path: join(out, `${label}-${screen}.png`) });
    };
    const close = async () => { await page.getByRole('button', { name: 'Close', exact: true }).last().click(); };
    await page.goto('/');
    await scan('home');
    await page.getByRole('button', { name: 'How to Play', exact: true }).click();
    await scan('home-help');
    await close();
    await page.getByRole('button', { name: 'Card Reference', exact: true }).click();
    await scan('card-reference', true);
    for (const kind of ['nasi', 'telur', 'kacang', 'sambal', 'timun', 'rendang', 'supplier', 'thief', 'wholesaler', 'officer', 'makcik', 'fly', 'swatter', 'fan', 'sioyen', 'crow', 'nasiLemak']) {
      await page.locator(`[data-testid=card-reference] .game-card[data-kind=${kind}]`).click();
      await scan(`reference-${kind}`, kind === 'makcik');
      await close();
    }
    // Keyboard closes only the inner preview, leaving the reference usable.
    await page.locator('[data-testid=card-reference] .game-card[data-kind=officer]').click();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.querySelectorAll('[role=dialog]')[1]!.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await close();
    await page.getByTestId('choose-avatar').click();
    await scan('settings', true);
    await close();
    await page.goto('/r/AUD234');
    await expect(page.getByTestId('hand')).toBeVisible();
    for (const count of [2, 4, 7]) {
      room.publish(layoutState(count));
      await page.locator('.table-board').evaluate(el => el.scrollTop = 0);
      await scan(`table-${count}`, true);
      await page.locator('.table-board').evaluate(el => el.scrollTop = el.scrollHeight);
      await scan(`table-${count}-centre`);
    }
    // A large hand must be reachable at both ends, even when centered on desktop.
    const hand = page.getByTestId('hand');
    await hand.evaluate(el => el.scrollLeft = 0);
    expect(await hand.evaluate(el => el.querySelector('[data-testid=hand-card]')!.getBoundingClientRect().left >= el.getBoundingClientRect().left - 1)).toBe(true);
    await hand.evaluate(el => el.scrollLeft = el.scrollWidth);
    expect(await hand.evaluate(el => Array.from(el.querySelectorAll('[data-testid=hand-card]')).at(-1)!.getBoundingClientRect().right <= el.getBoundingClientRect().right + 1)).toBe(true);
    for (const kind of ['supplier', 'thief', 'wholesaler', 'officer', 'makcik', 'fly', 'swatter', 'fan', 'sioyen']) {
      await page.locator(`[data-testid=hand-card][data-kind=${kind}]`).click();
      await scan(`detail-${kind}`);
      await page.getByTestId('play-this').click();
      await scan(`play-${kind}`);
      if (kind === 'fan') {
        await page.getByTestId('pick-nl').first().click();
        await scan('fan-target');
      }
      await close();
    }
    await page.getByTestId('action-make').click();
    await scan('recipe');
    await close();
    await page.getByTestId('action-trade').click();
    await scan('trade-composer', true);
    await close();
    await page.getByTestId('action-end-turn').click();
    await scan('end-turn');
    await close();
    await page.getByTestId('menu-button').click();
    await scan('game-menu');
    await page.getByRole('button', { name: 'How to Play', exact: true }).click();
    await scan('game-help');
    await close();
    await page.getByTestId('menu-button').click();
    await page.getByRole('button', { name: 'End game now', exact: true }).click();
    await scan('abort-confirm');
    await close();
    await page.getByTestId('menu-button').click();
    await page.getByTestId('leave-game').click();
    await scan('leave-game-confirm');
    await close();
    if (size.width < 1024) {
      await page.getByTestId('log-button').click();
      await scan('game-log');
      await close();
    }
    const pending = layoutState();
    pending.game!.turn.pending = { type: 'officer', actorId: 'layout-0', targetId: 'layout-1', take: 2, targetHand: pending.game!.hand };
    room.publish(pending);
    await expect(page.getByTestId('officer-take')).toBeVisible();
    await scan('officer-take');
    room.publish(layoutState());
    const trade = layoutState();
    trade.game!.turn.trade = { id: 'trade-ui', proposerId: 'layout-1', targetId: 'layout-0', awaitingId: 'layout-0', round: 2, offererId: 'layout-1', offerCards: trade.game!.hand.slice(0, 5), wantKinds: { nasi: 2, sambal: 1 } };
    room.publish(trade);
    await expect(page.getByTestId('trade-response')).toBeVisible();
    await scan('trade-response');
    await page.getByTestId('counter-trade').click();
    await scan('trade-counter');
    await close();
    room.publish(layoutState());
    const crow = layoutState();
    crow.game!.players[0]!.crow = { id: 'crow-ui', stashCount: 3, stashKinds: ['nasi', 'telur', 'sambal'] };
    room.publish(crow);
    await page.getByTestId('action-chase').click();
    await scan('crow-chase');
    await page.getByTestId('chase-card').first().click();
    await scan('crow-target');
    await close();
    const lobby = layoutState();
    lobby.room.status = 'lobby';
    lobby.game = null;
    room.publish(lobby);
    await expect(page.getByTestId('room-code')).toBeVisible();
    await scan('lobby-custom', true);
    const readonly = structuredClone(lobby);
    readonly.room.hostId = 'layout-1';
    readonly.room.members.forEach(m => m.isHost = m.id === 'layout-1');
    room.publish(readonly);
    await scan('lobby-guest');
    const invalid = structuredClone(lobby);
    invalid.room.customProblems = ['deck-too-small', 'need-nasi-lemak-cards', 'sioyen-without-crows'];
    invalid.room.config.turnTimerSec = 600;
    invalid.room.config.handSize = 12;
    room.publish(invalid);
    await scan('lobby-invalid-rules');
    room.publish(lobby);
    await page.getByTestId('leave-room').click();
    await scan('leave-room');
    await close();
    room.publish(finishedLayoutState());
    await expect(page.getByTestId('results')).toBeVisible();
    await scan('results', true);
    await close();
    const absent = layoutState();
    absent.game!.turn.playerId = 'layout-1';
    absent.room.members[1]!.connected = false;
    room.publish(absent);
    await expect(page.getByTestId('absent-banner')).toBeVisible();
    await scan('absent-player');
    room.publish(layoutState());
    room.disconnect();
    await expect(page.getByTestId('reconnecting')).toBeVisible();
    await scan('reconnecting');
    await expect(page.getByTestId('reconnecting')).toHaveCount(0);
    for (const reason of ['kicked', 'left', 'room-closed', 'bad-token'] as const) {
      if (reason === 'bad-token')
        room.send({ t: 'error', error: reason });
      else
        room.send({ t: 'kicked', reason });
      await expect(page.getByTestId('hand')).toHaveCount(0);
      await scan(`room-ended-${reason}`);
      if (reason !== 'bad-token') {
        await page.goto('/r/AUD234');
        await expect(page.getByTestId('hand')).toBeVisible();
      }
    }
    for (const status of ['lobby', 'playing', 'missing', 'full'] as const) {
      await page.route('**/api/rooms/JNY234', route => route.fulfill({ status: status === 'missing' ? 404 : 200, json: status === 'missing' ? { error: 'room-not-found' } : { code: 'JNY234', status: status === 'full' ? 'lobby' : status, mode: 'custom', players: status === 'full' ? 7 : 2, maxPlayers: 7 } }));
      await page.route('**/api/rooms/JNY234/join', route => route.fulfill({ status: 409, json: { error: status === 'full' ? 'room-full' : status === 'playing' ? 'game-in-progress' : 'network' } }));
      await page.goto('/r/JNY234');
      await expect(page.getByTestId('room-join-form')).toBeVisible();
      await scan(`join-${status}`);
      if (status !== 'missing') {
        await page.getByTestId('room-join-submit').click();
        await expect(page.getByRole('alert')).toBeVisible();
        await scan(`join-${status}-error`);
      }
      await page.unroute('**/api/rooms/JNY234');
      await page.unroute('**/api/rooms/JNY234/join');
    }
    writeFileSync(join(out, `${label}.json`), JSON.stringify({ size, checks, errors, fonts: await page.evaluate(() => { const fonts: {
        family: string;
        status: string;
      }[] = []; document.fonts.forEach(f => fonts.push({ family: f.family, status: f.status })); return fonts; }) }, null, 2));
    await ctx.close();
    if (!baseline) {
      expect(errors).toEqual([]);
      expect(checks.filter(c => c.issues.length)).toEqual([]);
    }
  });
