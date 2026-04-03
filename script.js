const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('.site-nav');
const navLinks = document.querySelectorAll('.site-nav a');
const registrationForm = document.getElementById('registrationForm');
const formStatus = document.getElementById('formStatus');
const registrationSuccess = document.getElementById('registrationSuccess');
const successEmail = document.getElementById('successEmail');

let isSubmittingRegistration = false;
let registrationCompleted = false;

function generateUUID() {
  return crypto.randomUUID();
}

function setFormSubmitting(form, isSubmitting, options = {}) {
  const {
    submittingText = 'Submitting registration...',
    idleText = null,
    completed = false
  } = options;

  const submitBtn = form?.querySelector('button[type="submit"]');
  const controls = form?.querySelectorAll('input, select, textarea, button');

  if (form) {
    form.setAttribute('aria-busy', isSubmitting ? 'true' : 'false');
  }

  if (submitBtn) {
    if (!submitBtn.dataset.originalText) {
      submitBtn.dataset.originalText = submitBtn.textContent;
    }

    if (completed) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Registration submitted';
      submitBtn.setAttribute('aria-disabled', 'true');
    } else if (isSubmitting) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      submitBtn.setAttribute('aria-disabled', 'true');
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = submitBtn.dataset.originalText;
      submitBtn.removeAttribute('aria-disabled');
    }
  }

  if (controls && completed) {
    controls.forEach((el) => {
      el.disabled = true;
    });
  } else if (controls) {
    controls.forEach((el) => {
      if (el !== submitBtn) {
        el.disabled = isSubmitting;
      }
    });
  }

  if (formStatus) {
    if (isSubmitting) {
      formStatus.textContent = submittingText;
    } else if (idleText !== null) {
      formStatus.textContent = idleText;
    }
  }
}

async function submitRegistration(event) {
  event.preventDefault();

  if (!registrationForm || registrationCompleted) return;
  if (isSubmittingRegistration) return;

  const endpoint = window.CONFERENCE_CONFIG?.registrationEndpoint;
  if (!endpoint || endpoint.includes('YOUR-CLOUDFLARE-WORKER')) {
    formStatus.textContent = 'Set your Cloudflare Worker URL first in index.html.';
    return;
  }

  const formData = new FormData(registrationForm);
  const payload = Object.fromEntries(formData.entries());
  payload.turnstileToken = payload['cf-turnstile-response'] || '';

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

  const submissionId = generateUUID();

  payload.id = submissionId;
  payload.submittedAt = new Date().toLocaleString('sv-SE', {
    timeZone: 'America/Santiago'
  });
  payload.page = window.location.href;

  isSubmittingRegistration = true;
  setFormSubmitting(registrationForm, true);

  const controller = new AbortController();
  const timeoutMs = 15000;

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': submissionId
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const contentType = response.headers.get('content-type') || '';
    const result = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : {};

    if (!response.ok) {
      throw new Error(result.error || 'Submission failed.');
    }
    
    registrationCompleted = true;
    
    if (registrationForm) {
      registrationForm.hidden = true;
    }
    
    if (successEmail) {
      successEmail.textContent = payload.email;
    }
    
    if (registrationSuccess) {
      registrationSuccess.hidden = false;
      registrationSuccess.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    if (formStatus) {
      formStatus.textContent = '';
    }
  } catch (error) {
    console.error(error);

    if (error.name === 'AbortError') {
      formStatus.textContent = 'The request took too long. Please try again.';
    } else {
      formStatus.textContent =
        error.message || 'There was an error sending the form.';
    }

    isSubmittingRegistration = false;
    setFormSubmitting(registrationForm, false);
  } finally {
    clearTimeout(timeoutId);
  }
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
  registrationForm.addEventListener('submit', submitRegistration);
}

/* =========================
   Materials
========================= */

const materialsGrid = document.getElementById('materialsGrid');
const materialTabs = document.querySelectorAll('.materials-tab');

const MATERIALS = {
  monday: [
    {
      title: 'Tittle1',
      speaker: 'speaker1',
      affiliation: 'University1',
      pdf: 'pdfs/speaker1.pdf'
    },
    {
      title: 'Tittle2',
      speaker: 'Speaker2',
      affiliation: 'University2',
      pdf: 'pdfs/speaker2.pdf'
    },
    {
      title: 'Tittle3',
      speaker: 'Speaker3',
      affiliation: 'University3',
      pdf: 'pdfs/speaker3.pdf'
    }
  ],
  tuesday: [
    {
      title: 'Tittle4',
      speaker: 'Speaker4',
      affiliation: 'University4',
      pdf: 'pdfs/speaker4.pdf'
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
