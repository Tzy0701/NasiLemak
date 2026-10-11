import type { Page } from '@playwright/test';
/** Measure live text and sibling layout regions after fonts and animations settle. */
export async function layoutProblems(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const issues: string[] = [];
    const rect = (el: Element) => el.getBoundingClientRect();
    const intersects = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const visible = (el: Element) => { const r = rect(el); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    for (const card of Array.from(document.querySelectorAll('.game-card:not(.card-hidden)'))) {
      const face = card.querySelector('.card-face')!;
      const texts = Array.from(card.querySelectorAll('.card-ribbon span,.card-ribbon small,.ingredient-name strong,.ingredient-name small,.card-effect,.pack-value')).filter(visible);
      for (const text of texts) {
        const r = rect(text), f = rect(face);
        if (r.left < f.left - 1 || r.right > f.right + 1 || r.top < f.top - 1 || r.bottom > f.bottom + 1)
          issues.push(`${card.getAttribute('data-kind')}: text outside card (${text.textContent})`);
        for (const other of texts)
          if (text !== other && texts.indexOf(text) < texts.indexOf(other) && intersects(r, rect(other)))
            issues.push(`${card.getAttribute('data-kind')}: overlapping text (${text.textContent}/${other.textContent})`);
      }
      const title = card.querySelector('.card-ribbon');
      const art = card.querySelector('.card-picture');
      if (art && (rect(art).height < 8 || rect(art).width < 8))
        issues.push(`${card.getAttribute('data-kind')}: picture has no room`);
      const image = card.querySelector('.card-main-art');
      if (image && (rect(image).height < 8 || rect(image).width < 8))
        issues.push(`${card.getAttribute('data-kind')}: artwork is hidden`);
      if (title && art && intersects(rect(title), rect(art)))
        issues.push(`${card.getAttribute('data-kind')}: title overlaps picture`);
      const name = card.querySelector('.ingredient-name');
      const effect = card.querySelector('.card-effect');
      if (name && effect && intersects(rect(name), rect(effect)))
        issues.push(`${card.getAttribute('data-kind')}: ingredient name overlaps effect`);
    }
    const dialog = Array.from(document.querySelectorAll('[role=dialog]')).at(-1);
    const scope = dialog ?? document;
    if (dialog) {
      for (const control of Array.from(dialog.querySelectorAll('.modal-header button,.modal-footer button'))) {
        const r = rect(control);
        if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1)
          issues.push('dialog action outside viewport');
      }
    }
    const grids = Array.from(scope.querySelectorAll('.grid, .avatar-picker, [data-testid=action-bar]'));
    for (const grid of grids) {
      const children = Array.from(grid.children).filter(visible);
      for (let i = 0; i < children.length; i++)
        for (let j = i + 1; j < children.length; j++)
          if (intersects(rect(children[i]!), rect(children[j]!)))
            issues.push(`overlapping siblings in ${grid.getAttribute('data-testid') ?? grid.className}`);
      const bounds = rect(grid);
      for (const child of children) {
        const boxes = [child, ...Array.from(child.querySelectorAll('button,.game-card,.player-avatar'))].filter(visible);
        if (boxes.some(el => rect(el).left < bounds.left - 1 || rect(el).right > bounds.right + 1))
          issues.push(`content outside ${grid.getAttribute('data-testid') ?? grid.className}`);
      }
    }
    const stage = document.querySelector('.game-stage');
    if (!dialog && stage) {
      const seats = Array.from(stage.querySelectorAll('.opponent-seat'));
      const piles = stage.querySelector('.center-piles');
      const area = stage.querySelector('.player-area');
      // The board scrolls independently above a pinned hand. Exclude the
      // off-screen portion of its content when measuring visible collisions.
      const board = stage.querySelector('.table-board');
      const boardRect = (el: Element) => {
        const r = rect(el);
        if (!board)
          return r;
        const b = rect(board);
        return new DOMRect(Math.max(r.left, b.left), Math.max(r.top, b.top), Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left)), Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top)));
      };
      if (piles && area && intersects(boardRect(piles), rect(area)))
        issues.push('centre overlaps hand area');
      for (const seat of seats)
        if (piles && intersects(boardRect(seat), boardRect(piles)))
          issues.push('opponent overlaps centre');
      const action = stage.querySelector('[data-testid=action-end-turn]');
      if (action && (rect(action).bottom > innerHeight + 1 || rect(action).right > innerWidth + 1))
        issues.push('end turn outside viewport');
    }
    for (const text of Array.from(scope.querySelectorAll<HTMLElement>('.card-ribbon span,.card-ribbon small,.ingredient-name strong,.ingredient-name small,.card-effect,.pack-value,.modal-header h2,.custom-stepper,.trade-want,.standing-row'))) {
      if (visible(text) && (text.scrollWidth > text.clientWidth + 1 || text.scrollHeight > text.clientHeight + 1))
        issues.push(`text clipped in ${text.className}: ${text.textContent}`);
    }
    if (document.documentElement.scrollWidth > innerWidth + 1)
      issues.push('page horizontal overflow');
    return [...new Set(issues)];
  });
}
