const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('.site-nav');
const navLinks = document.querySelectorAll('.site-nav a');
const registrationForm = document.getElementById('registrationForm');
const formStatus = document.getElementById('formStatus');

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

/* =========================
   Materials
========================= */

const materialsGrid = document.getElementById('materialsGrid');
const materialTabs = document.querySelectorAll('.materials-tab');

const MATERIALS = {
  monday: [
    {
      title: 'Mean curvature flow with free boundary',
      speaker: 'Felix Schulze',
      affiliation: 'University of Warwick',
      pdf: 'pdfs/felix-schulze.pdf'
    },
    {
      title: 'Minimal surfaces and geometric variational problems',
      speaker: 'Francisco Martín',
      affiliation: 'Universidad de Granada',
      pdf: 'pdfs/francisco-martin.pdf'
    },
    {
      title: 'Conformal methods in geometric',
      speaker: 'Speaker3',
      affiliation: 'University3',
      pdf: 'pdfs/speaker3.pdf'
    }
  ],
  tuesday: [
    {
      title: 'Conformal methods in geometric analysis',
      speaker: 'Jie Qing',
      affiliation: 'University of California, Santa Cruz',
      pdf: 'pdfs/jie-qing.pdf'
    }
  ],
  wednesday: [],
  thursday: [],
  friday: []
};

let currentMaterialsDay = 'monday';

function renderMaterials(day) {
  if (!materialsGrid) return;

  const items = MATERIALS[day] || [];
  materialsGrid.innerHTML = '';

  if (items.length === 0) {
    materialsGrid.innerHTML = `
      <div class="materials-empty">
        Presentation files for this day will be uploaded soon.
      </div>
    `;
    return;
  }

  items.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'material-card';

    card.innerHTML = `
      <p class="material-meta">Presentation PDF</p>
      <h3>${item.title}</h3>
      <p class="material-speaker">${item.speaker}</p>
      <p class="material-affiliation">${item.affiliation}</p>
      <a href="${item.pdf}" target="_blank" rel="noopener" class="btn btn-secondary">
        Open PDF
      </a>
    `;

    materialsGrid.appendChild(card);
  });
}

if (materialTabs.length && materialsGrid) {
  materialTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      currentMaterialsDay = tab.dataset.day;

      materialTabs.forEach((btn) => {
        const isActive = btn.dataset.day === currentMaterialsDay;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      renderMaterials(currentMaterialsDay);
    });
  });

  renderMaterials(currentMaterialsDay);
}
