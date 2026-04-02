const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('.site-nav');
const navLinks = document.querySelectorAll('.site-nav a');
const themeToggle = document.getElementById('themeToggle');
const registrationForm = document.getElementById('registrationForm');
const formStatus = document.getElementById('formStatus');

function generateUUID() {
  return crypto.randomUUID();
}

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

const savedTheme = localStorage.getItem('conference-theme');
if (savedTheme === 'light') {
  document.body.classList.add('light-mode');
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const theme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
    localStorage.setItem('conference-theme', theme);
  });
}

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

    payload.id = generateUUID();
    payload.submittedAt = new Date().toLocaleString('sv-SE', {
      timeZone: 'America/Santiago'
    });
    payload.page = window.location.href;

    const requiredFields = ['fullName', 'email', 'affiliation', 'country', 'attendance', 'invitedSpeaker'];
    const missingField = requiredFields.find((field) => !payload[field]?.trim?.());

    if (missingField) {
      formStatus.textContent = 'Please complete all required fields.';
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
    } catch (error) {
      console.error(error);
      formStatus.textContent = error.message || 'There was an error sending the form.';
    }
  });
}
