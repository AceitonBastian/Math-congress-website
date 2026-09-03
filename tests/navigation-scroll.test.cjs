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

function element() {
  const classes = new Set();
  const attributes = new Map();
  const listeners = new Map();
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
    style: { setProperty() {}, removeProperty() {} },
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

function createPage({ compact = true, initialTop = 4000 } = {}) {
  let scrollY = initialTop;
  let renderedScrollY = initialTop;
  let pendingInstant = null;
  let frameId = 0;
  let frameNumber = 0;
  const frames = new Map();
  const scrolls = [];
  const hashes = [];
  const document = element();
  document.body = element();
  document.documentElement = element();
  const siteNav = element();
  const navToggle = element();
  const navBackdrop = element();
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
    setTimeout,
    clearTimeout,
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
    window, document, siteNav, navToggle, navBackdrop,
    navLinks: links, navDropdowns: [],
    NAV_COMPACT_MEDIA_QUERY: { addEventListener() {} },
    usesCompactNavLayout: () => compact,
    isMobileNavOpen: () => compact && siteNav.classList.contains('open'),
    getSectionAnchorOffset: () => 78,
    stopSiteHeaderAnimation() {}, renderSiteHeaderVisibility() {},
    queueSiteHeaderVisibilitySync() {},
    siteHeaderTargetProgress: 0, siteHeaderRenderedProgress: 0,
    history: { replaceState: (_state, _title, hash) => hashes.push(hash) }
  });
  vm.runInContext(navigation + '\n' + anchors, context);

  return {
    scrolls, hashes, siteNav, targets,
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
