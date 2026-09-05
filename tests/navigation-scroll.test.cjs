const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
// Run the production navigation listeners, without unrelated forms/carousels.
const navigation = script.slice(
  script.indexOf('let navDropdownCloseTimer = null;'),
  script.indexOf('function getSiteHeaderTargetProgress()')
);
const anchors = script.slice(
  script.indexOf('// Smooth scrolling'),
  script.indexOf('// Registration listeners')
);
const headerHelpers = script.slice(
  script.indexOf('const DEFAULT_SITE_HEADER_HEIGHT'),
  script.indexOf('function sortSpeakerCards()')
);
const headerVisibility = script.slice(
  script.indexOf('function getSiteHeaderTargetProgress()'),
  script.indexOf('// Smooth scrolling')
);
const styles = readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

function element() {
  const classes = new Set();
  const attributes = new Map();
  const listeners = new Map();
  const properties = new Map();
  return {
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle(name, force) {
        const enabled = force ?? !classes.has(name);
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      }
    },
    style: {
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: name => properties.delete(name),
      getPropertyValue: name => properties.get(name) ?? ''
    },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: name => attributes.get(name) ?? null,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, event) {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
    closest: () => null,
    focus() {}
  };
}

function createPage({ compact = true, initialTop = 4000, headingTop = 2000,
  headerHeight = 79, reducedMotion = false } = {}) {
  let scrollY = initialTop;
  let renderedScrollY = initialTop;
  let pendingInstant = null;
  let frameId = 0;
  let frameNumber = 0;
  const frames = new Map();
  const scrolls = [];
  const hashes = [];
  const timers = new Map();
  let timerId = 0;
  const document = element();
  document.body = element();
  document.documentElement = element();
  const siteNav = element();
  const navToggle = element();
  const navBackdrop = element();
  const siteHeader = element();
  siteHeader.getBoundingClientRect = () => ({ height: headerHeight });
  const supportersHeading = {
    getBoundingClientRect: () => ({ top: initialTop + headingTop - scrollY })
  };
  const dropdown = element();
  const trigger = element();
  const menu = element();
  const content = element();
  content.scrollWidth = 220;
  content.getBoundingClientRect = () => ({ height: 150 });
  const parentRow = { getBoundingClientRect: () => ({ left: 800 }) };
  dropdown.querySelector = selector => ({
    '.nav-dropdown-trigger': trigger,
    '.nav-dropdown-menu': menu,
    '.nav-dropdown-content': content,
    '.nav-parent-row': parentRow
  })[selector];
  dropdown.matches = selector => selector === ':hover';
  dropdown.contains = () => false;
  const targets = new Map([
    ['#speakers', 1200], ['#registration', 5000], ['#organizers', 9000]
  ]);
  const makeLink = (href, inNav = true) => {
    const link = element();
    link.setAttribute('href', href);
    link.closest = selector => {
      if (selector === 'a[href^="#"]') return href.startsWith('#') ? link : null;
      if (selector === '.site-nav') return inNav ? siteNav : null;
      return null;
    };
    return link;
  };
  const links = [...targets.keys()].map(href => makeLink(href));
  const brand = makeLink('#top', false);
  const contentLink = makeLink('#registration', false);
  document.querySelector = id => targets.has(id) ? {
    getBoundingClientRect: () => ({ top: targets.get(id) - scrollY })
  } : null;
  const window = element();
  Object.assign(window, {
    scrollX: 0,
    requestAnimationFrame(callback) {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout(callback) {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout: id => timers.delete(id),
    innerWidth: compact ? 412 : 1440,
    getComputedStyle: () => ({ paddingTop: '8px', paddingBottom: '22px' }),
    matchMedia: () => ({ matches: !compact }),
    scrollTo(options) {
      scrolls.push({ ...options, from: renderedScrollY, frame: frameNumber });
      if (options.behavior === 'smooth') {
        // Model an async renderer that merges same-update requests: a smooth
        // scroll starts at its rendered offset, not an uncommitted instant one.
        pendingInstant = null;
      } else {
        scrollY = options.top;
        pendingInstant = options.top;
      }
    }
  });
  Object.defineProperties(window, {
    scrollY: { get: () => scrollY },
    pageYOffset: { get: () => scrollY }
  });
  const bodyAdd = document.body.classList.add;
  document.body.classList.add = (...names) => {
    bodyAdd(...names);
    if (names.includes('has-mobile-nav-open')) {
      scrollY = 0;
      renderedScrollY = 0;
    }
  };
  const context = vm.createContext({
    window, document, siteNav, navToggle, navBackdrop, siteHeader, supportersHeading,
    navLinks: links, navDropdowns: [dropdown],
    NAV_COMPACT_MEDIA_QUERY: { matches: compact, addEventListener() {} },
    SUPPORTERS_REDUCED_MOTION_QUERY: { matches: reducedMotion },
    history: { replaceState: (_state, _title, hash) => hashes.push(hash) }
  });
  vm.runInContext(headerHelpers + '\n' + navigation + '\n' + headerVisibility + '\n' + anchors, context);
  context.syncSiteHeaderHeight();

  return {
    scrolls, hashes, siteNav, targets, siteHeader, dropdown, trigger, document,
    renderHeader: progress => context.renderSiteHeaderVisibility(progress),
    syncHeader: () => context.syncSiteHeaderVisibility(),
    pendingFrameCount: () => frames.size,
    hover() {
      dropdown.dispatch('pointerenter');
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach(callback => callback());
    },
    focusDropdown: () => dropdown.dispatch('focusin', { target: trigger }),
    scrollTo: top => { scrollY = top; },
    resizeHeader(height) {
      headerHeight = height;
      context.syncSiteHeaderHeight();
      context.syncSiteHeaderVisibility();
    },
    open: () => context.openNav(),
    close: () => context.closeNav(),
    click(href) {
      const link = href === '#top' ? brand : links.find(item => item.getAttribute('href') === href);
      const event = { target: link, preventDefault() {} };
      link.dispatch('click', event);
      document.dispatch('click', event);
    },
    clickContent() {
      document.dispatch('click', { target: contentLink, preventDefault() {} });
    },
    input(type) {
      const event = { key: 'ArrowDown', target: document.body };
      document.dispatch(type, event);
      window.dispatch(type, event);
    },
    async frame() {
      frameNumber++;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(frameNumber * 16);
      if (pendingInstant !== null) {
        renderedScrollY = pendingInstant;
        pendingInstant = null;
      }
      // Let async click handlers and restoration cleanup settle.
      await Promise.resolve();
      await Promise.resolve();
    }
  };
}

for (const [target, destination] of [['#speakers', 1122], ['#organizers', 8922], ['#top', 0]]) {
  test(`mobile ${target}: render the saved position before smooth scrolling`, async () => {
    const page = createPage();
    page.open();
    page.click(target);
    assert.equal(page.siteNav.classList.contains('open'), false);
    assert.equal(page.scrolls.filter(scroll => scroll.behavior === 'smooth').length, 0);
    assert.equal(page.scrolls[0].top, 4000);
    await page.frame();
    assert.equal(page.scrolls.filter(scroll => scroll.behavior === 'smooth').length, 0);
    await page.frame();
    const smooth = page.scrolls.filter(scroll => scroll.behavior === 'smooth');
    assert.equal(smooth.length, 1);
    assert.equal(smooth[0].from, 4000);
    assert.equal(smooth[0].top, destination);
    assert.deepEqual(page.hashes, [target]);
  });
}

test('desktop links keep their immediate native smooth-scroll behavior', () => {
  const page = createPage({ compact: false });
  page.click('#speakers');
  assert.deepEqual(page.scrolls, [{ top: 1122, behavior: 'smooth', from: 4000, frame: 0 }]);
});

test('in-page links without an open mobile menu do not wait', () => {
  const page = createPage();
  page.clickContent();
  assert.deepEqual(page.scrolls, [{ top: 4922, behavior: 'smooth', from: 4000, frame: 0 }]);
});

test('closing the menu without navigating only restores its original position', async () => {
  const page = createPage();
  page.open();
  page.close();
  page.close();
  await page.frame();
  await page.frame();
  assert.equal(page.scrolls.length, 1);
  assert.equal(page.scrolls[0].top, 4000);
  assert.deepEqual(page.hashes, []);
});

test('a second link supersedes the first but still waits for restoration', async () => {
  const page = createPage();
  page.open();
  page.click('#speakers');
  page.click('#organizers');
  await page.frame();
  await page.frame();
  const smooth = page.scrolls.filter(scroll => scroll.behavior === 'smooth');
  assert.equal(smooth.length, 1);
  assert.equal(smooth[0].from, 4000);
  assert.equal(smooth[0].top, 8922);
  assert.deepEqual(page.hashes, ['#organizers']);
});

test('reopening the menu cancels delayed navigation', async () => {
  const page = createPage();
  page.open();
  page.click('#speakers');
  page.open();
  await page.frame();
  await page.frame();
  assert.equal(page.siteNav.classList.contains('open'), true);
  assert.equal(page.scrolls.filter(scroll => scroll.behavior === 'smooth').length, 0);
  assert.deepEqual(page.hashes, []);
});

for (const input of ['touchstart', 'wheel', 'keydown']) {
  test(`${input} cancels navigation waiting for a restored frame`, async () => {
    const page = createPage();
    page.open();
    page.click('#speakers');
    page.input(input);
    await page.frame();
    await page.frame();
    assert.equal(page.scrolls.filter(scroll => scroll.behavior === 'smooth').length, 0);
    assert.deepEqual(page.hashes, []);
  });
}

test('destination geometry is measured after the restoration frame', async () => {
  const page = createPage();
  page.open();
  page.click('#speakers');
  page.targets.set('#speakers', 1400);
  await page.frame();
  await page.frame();
  assert.equal(page.scrolls.at(-1).top, 1322);
});

test('later navigation is immediate after restoration has settled', async () => {
  const page = createPage();
  page.open();
  page.close();
  await page.frame();
  await page.frame();
  page.click('#speakers');
  assert.equal(page.scrolls.at(-1).behavior, 'smooth');
  assert.equal(page.scrolls.at(-1).top, 1122);
});

test('an older restoration cannot release a newer navigation too early', async () => {
  const page = createPage();
  page.open();
  page.click('#speakers');
  await page.frame();
  page.open();
  page.click('#organizers');
  await page.frame();
  assert.equal(page.scrolls.filter(scroll => scroll.behavior === 'smooth').length, 0);
  page.click('#registration');
  assert.equal(page.scrolls.filter(scroll => scroll.behavior === 'smooth').length, 0);
  await page.frame();
  const smooth = page.scrolls.filter(scroll => scroll.behavior === 'smooth');
  assert.equal(smooth.length, 1);
  assert.equal(smooth[0].from, 4000);
  assert.equal(smooth[0].top, 4922);
  assert.deepEqual(page.hashes, ['#registration']);
});

test('navigation also works when the menu was opened at the top of the page', async () => {
  const page = createPage({ initialTop: 0 });
  page.open();
  page.click('#speakers');
  await page.frame();
  await page.frame();
  assert.equal(page.scrolls.at(-1).behavior, 'smooth');
  assert.equal(page.scrolls.at(-1).from, 0);
  assert.equal(page.scrolls.at(-1).top, 1122);
});

function sharedHideOffset(page) {
  return parseFloat(page.document.documentElement.style.getPropertyValue('--site-header-hide-offset')) || 0;
}

for (const input of ['hover', 'focusDropdown']) {
  test(`desktop ${input}: overlay siblings share the partially hidden header offset`, () => {
    const page = createPage({ compact: false, headingTop: 53 });
    page.syncHeader();
    const offset = sharedHideOffset(page);
    assert.equal(offset, 38);
    page[input]();
    assert.equal(page.dropdown.classList.contains('is-open'), true);
    assert.equal(page.siteHeader.classList.contains('is-hiding-past-supporters'), true);
    assert.equal(page.siteHeader.inert, false);
    assert.equal(sharedHideOffset(page), offset);
    // No private value may override the offset inherited by the header.
    assert.equal(page.siteHeader.style.getPropertyValue('--site-header-hide-offset'), '');
  });
}

test('overlay offset follows the current progress and heading clearance', () => {
  const page = createPage({ compact: false });
  for (const progress of [0.1, 0.3, 0.5, 0.8, 1, 0.8, 0.4, 0]) {
    page.renderHeader(progress);
    const expected = Number((progress * 80).toFixed(3));
    assert.equal(sharedHideOffset(page), expected);
  }
  page.scrollTo(5980); // Heading is at 20px, with the original 12px clearance.
  page.syncHeader();
  assert.equal(sharedHideOffset(page), 71);
  assert.ok(Number(page.siteHeader.style.getPropertyValue('--site-header-content-opacity')) < 0.4,
    'Content must fade with the actual offset');
});

test('scrolling an open desktop dropdown fully offscreen also dismisses its overlay', () => {
  const page = createPage({ compact: false, headingTop: 53 });
  page.syncHeader();
  page.hover();
  page.renderHeader(1);
  assert.equal(page.siteHeader.inert, true);
  assert.equal(page.document.body.classList.contains('has-nav-dropdown-open'), false);
  assert.equal(page.dropdown.classList.contains('is-open'), false);
  assert.equal(page.trigger.getAttribute('aria-expanded'), 'false');
});

test('mobile opening at the hide threshold restores both header and backdrop positions', async () => {
  const page = createPage({ headingTop: 53 });
  page.syncHeader();
  assert.equal(sharedHideOffset(page), 38);
  page.open();
  assert.equal(sharedHideOffset(page), 0);
  assert.equal(page.siteHeader.classList.contains('is-hiding-past-supporters'), false);
  assert.equal(page.siteHeader.inert, false);
  // A queued frame or browser-toolbar resize must not re-hide the pinned header.
  await page.frame();
  page.resizeHeader(91);
  page.renderHeader(0.8);
  assert.equal(sharedHideOffset(page), 0);
  assert.equal(page.document.documentElement.style.getPropertyValue('--site-header-height'), '91px');
  assert.equal(page.siteNav.classList.contains('open'), true);
  page.close();
  await page.frame();
  await page.frame();
  assert.ok(sharedHideOffset(page) > 0);
  assert.equal(page.scrolls[0].top, 4000);
});

test('reduced motion keeps the shared overlay offset at zero', () => {
  const page = createPage({ reducedMotion: true, headingTop: -20 });
  page.renderHeader(1);
  assert.equal(sharedHideOffset(page), 0);
  assert.equal(page.siteHeader.classList.contains('is-hiding-past-supporters'), false);
  assert.equal(page.siteHeader.inert, false);
});

test('fractional header heights retain subpixel alignment with the overlays', () => {
  const page = createPage({ compact: false, headerHeight: 98.75, headingTop: 65.5 });
  page.syncHeader();
  page.hover();
  assert.equal(sharedHideOffset(page), 45.25);
  assert.equal(page.document.documentElement.style.getPropertyValue('--site-header-height'), '98.75px');
});

test('header hiding retains the original trigger and resting positions', async () => {
  for (const [headingTop, offset] of [[130, 0], [100, 0], [91, 0], [80, 11],
    [60, 31], [40, 51], [20, 71], [11, 80], [-20, 80]]) {
    const page = createPage({ headingTop });
    await page.frame();
    assert.equal(sharedHideOffset(page), offset, `Heading at ${headingTop}px`);
  }
});

test('fallback scrolling stays aligned and does not keep moving after input stops', async () => {
  const page = createPage({ headingTop: 60 });
  await page.frame();
  for (const top of [4001, 4003, 4004.5, 4004, 4002, 4000]) {
    page.scrollTo(top);
    page.input('scroll');
    await page.frame();
    const offset = sharedHideOffset(page);
    assert.equal(offset, 31 + top - 4000);
    assert.equal(page.pendingFrameCount(), 0, 'No catch-up loop after the scroll frame');
    await page.frame();
    assert.equal(sharedHideOffset(page), offset, 'The stationary page must stay stationary');
  }
});

test('queued visibility updates use the newest position when a swipe reverses', async () => {
  const page = createPage({ headingTop: 220 });
  await page.frame();
  page.scrollTo(4200);
  page.input('scroll');
  page.scrollTo(4190);
  page.input('scroll');
  assert.equal(page.pendingFrameCount(), 1, 'Coalesce input into one visibility update');
  await page.frame();
  assert.equal(sharedHideOffset(page), 61, 'Use the current 30px heading position');
  assert.equal(page.pendingFrameCount(), 0);

  page.scrollTo(4000);
  page.input('scroll');
  await page.frame();
  assert.equal(sharedHideOffset(page), 0);
  assert.equal(page.siteHeader.inert, false);
});

test('CSS anchors external layers to the visible edge but leaves nested menus in header coordinates', () => {
  const rule = selector => {
    // Match the complete top-level selector, not the end of a scoped rule.
    const source = '\n' + styles;
    const start = source.indexOf('\n' + selector + ' {');
    assert.notEqual(start, -1, `Missing CSS rule: ${selector}`);
    return source.slice(start, source.indexOf('}', start));
  };
  assert.match(rule(':root'), /--site-header-hide-offset:\s*0px/);
  assert.match(rule(':root'), /--site-header-visible-height:\s*max\(\s*0px,\s*calc\(var\(--site-header-height\)\s*-\s*var\(--site-header-hide-offset\)\)\s*\)/);
  for (const selector of ['.nav-dropdown-surface', '.nav-backdrop']) {
    assert.match(rule(selector), /top:\s*var\(--site-header-visible-height\)/);
  }
  assert.match(rule('body.has-nav-dropdown-closing .nav-dropdown-surface'),
    /top:\s*calc\(var\(--site-header-visible-height\) - 1px\)/);
  // This menu is inside the transformed/filtered header, not a viewport sibling.
  assert.match(rule('.nav-dropdown-menu'), /top:\s*var\(--site-header-height\)/);
});

test('dropdown cleanup removes the overlap without starting a second height animation', () => {
  const idleSurface = styles.match(/^\.nav-dropdown-surface \{([^}]+)\}/m)?.[1];
  assert.ok(idleSurface, 'The idle dropdown surface rule must exist');
  assert.match(idleSurface, /height:\s*var\(--nav-dropdown-height\);/);
  assert.match(idleSurface, /transition:\s*none;/);

  // Opening, switching menus, and rolling up must retain their shared animation
  // and one-pixel overlap. Only the final, inactive cleanup is instantaneous.
  const activeSurface = styles.match(
    /body\.has-nav-dropdown-open \.nav-dropdown-surface,\s*body\.has-nav-dropdown-closing \.nav-dropdown-surface \{([^}]+)\}/
  )?.[1];
  assert.ok(activeSurface, 'Opening and closing must share the animated surface rule');
  assert.match(activeSurface, /height:\s*calc\(var\(--nav-dropdown-height\) \+ 1px\);/);
  assert.match(activeSurface, /transition:\s*height 0\.2s cubic-bezier\(0\.4, 0, 0\.2, 1\);/);
});

test('reduced motion also disables the state-specific dropdown surface animation', () => {
  const reducedMotion = styles.match(
    /@media \(prefers-reduced-motion: reduce\) \{([^{}]*\.nav-dropdown-surface[^{}]*\{[^}]*\})/
  )?.[1];
  assert.ok(reducedMotion, 'The reduced-motion dropdown rule must exist');
  assert.match(reducedMotion, /body\.has-nav-dropdown-open \.nav-dropdown-surface,/);
  assert.match(reducedMotion, /body\.has-nav-dropdown-closing \.nav-dropdown-surface,/);
  assert.match(reducedMotion, /transition:\s*none;/);
});
