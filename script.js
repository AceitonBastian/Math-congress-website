const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('.site-nav');
const navLinks = document.querySelectorAll('.site-nav a');
const themeToggle = document.getElementById('themeToggle');
const registrationForm = document.getElementById('registrationForm');
const formStatus = document.getElementById('formStatus');

const THEME_KEY = 'conference-theme';
const root = document.documentElement;

function generateUUID() {
  return crypto.randomUUID();
}

/* =========================
   Navigation
========================= */

if (navToggle && siteNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = siteNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      siteNav.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

/* =========================
   Theme
========================= */

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function getSavedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore storage errors
  }
}

function applyTheme(theme) {
  const isLight = theme === 'light';
  root.classList.toggle('light-mode', isLight);

  if (themeToggle) {
    themeToggle.setAttribute(
      'aria-label',
      isLight ? 'Switch to dark theme' : 'Switch to light theme'
    );
    themeToggle.textContent = isLight ? '◑' : '◐';
  }

  updateTurnstileTheme(theme);
}

function getPreferredTheme() {
  const savedTheme = getSavedTheme();
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }
  return getSystemTheme();
}

function toggleTheme() {
  const currentIsLight = root.classList.contains('light-mode');
  const nextTheme = currentIsLight ? 'dark' : 'light';
  applyTheme(nextTheme);
  saveTheme(nextTheme);
}

if (themeToggle) {
  themeToggle.addEventListener('click', toggleTheme);
}

/* =========================
   Turnstile theme sync
========================= */

function updateTurnstileTheme(theme) {
  const turnstileContainer = document.querySelector('.cf-turnstile');
  if (!turnstileContainer) return;

  const currentTheme = turnstileContainer.getAttribute('data-theme');
  if (currentTheme === theme) return;

  turnstileContainer.setAttribute('data-theme', theme);

  if (window.turnstile) {
    try {
      window.turnstile.remove?.(turnstileContainer);
    } catch {}

    try {
      turnstileContainer.innerHTML = '';
    } catch {}

    try {
      window.turnstile.render(turnstileContainer, {
        sitekey: turnstileContainer.dataset.sitekey,
        theme,
        action: turnstileContainer.dataset.action || 'register'
      });
    } catch {
      // If rerender fails, keep going
    }
  }
}

/* =========================
   Apply theme on load
========================= */

applyTheme(getPreferredTheme());

/* Optional:
   If the user has NOT chosen a theme manually yet,
   follow system theme changes automatically.
*/
const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
mediaQuery.addEventListener?.('change', () => {
  const savedTheme = getSavedTheme();
  if (savedTheme !== 'light' && savedTheme !== 'dark') {
    applyTheme(getSystemTheme());
  }
});

/* =========================
   Registration form
========================= */

if (registrationForm) {
  registrationForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const endpoint = window.CONFERENCE_CONFIG?.registrationEndpoint;
    if (!endpoint || endpoint.includes('YOUR-CLOUDFLARE-WORKER')) {
      formStatus.textContent = 'Set your Cloudflare Worker URL first in index.html.';
      return;
    }

    const formData = new FormData(registrationForm);
    const payload = Object.fromEntries(formData.entries());
    payload.turnstileToken = payload['cf-turnstile-response'] || '';

    payload.id = generateUUID();
    payload.submittedAt = new Date().toLocaleString('sv-SE', {
      timeZone: 'America/Santiago'
    });
    payload.page = window.location.href;

    const requiredFields = [
      'fullName',
      'email',
      'affiliation',
      'country',
      'attendance',
      'invitedSpeaker'
    ];

    const missingField = requiredFields.find((field) => !payload[field]?.trim?.());

    if (missingField) {
      formStatus.textContent = 'Please complete all required fields.';
      return;
    }

    if (!payload.turnstileToken) {
      formStatus.textContent = 'Please complete the security check.';
      return;
    }

    try {
      formStatus.textContent = 'Submitting registration...';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || 'Submission failed.');
      }

      formStatus.textContent = 'Registration submitted successfully.';
      registrationForm.reset();

      if (window.turnstile) {
        window.turnstile.reset();
      }
    } catch (error) {
      console.error(error);
      formStatus.textContent = error.message || 'There was an error sending the form.';
    }
  });
}
