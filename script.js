const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('.site-nav');
const navLinks = document.querySelectorAll('.site-nav a');
const registrationForm = document.getElementById('registrationForm');
const formStatus = document.getElementById('formStatus');
const registrationSuccess = document.getElementById('registrationSuccess');
const successEmail = document.getElementById('successEmail');
const attendanceSelect = document.getElementById('attendance');
const daysSelector = document.getElementById('daysSelector');
const daysError = document.getElementById('daysError');
const attendanceSelectWrap = document.getElementById('attendanceSelectWrap');
const attendanceTrigger = document.getElementById('attendance-trigger');
const attendanceMenu = attendanceSelectWrap?.querySelector('.custom-select-menu');
const attendanceText = attendanceSelectWrap?.querySelector('.custom-select-text');
const attendanceOptions = attendanceSelectWrap?.querySelectorAll('.custom-select-option');

// =========================
// Text limits + counters
// =========================
const MAX_FULL_NAME = 114;
const WARN_FULL_NAME = 95;

const MAX_AFFILIATION = 114;
const WARN_AFFILIATION = 95;

const MAX_COUNTRY = 30;
const WARN_COUNTRY = 24;

const MAX_COMMENTS = 400;
const WARN_COMMENTS = 340;

const fullNameEl = document.getElementById('fullName');
const fullNameCounterEl = document.getElementById('fullNameCounter');

const affiliationEl = document.getElementById('affiliation');
const affiliationCounterEl = document.getElementById('affiliationCounter');

const countryEl = document.getElementById('country');
const countryCounterEl = document.getElementById('countryCounter');

const additionalCommentsEl = document.getElementById('additionalComments');
const additionalCommentsCounterEl = document.getElementById('additionalCommentsCounter');

function attachTextCounter(inputEl, counterEl, maxLength, warnAt) {
  if (!inputEl || !counterEl) return;

  const updateUI = () => {
    const len = inputEl.value.length;

    counterEl.textContent = `${len} / ${maxLength}`;
    counterEl.classList.remove('warn', 'danger');

    if (len >= warnAt && len < maxLength) {
      counterEl.classList.add('warn');
    }

    if (len >= maxLength) {
      counterEl.classList.add('danger');
    }
  };

  inputEl.addEventListener('input', updateUI);
  updateUI();
}

// Attach counters
attachTextCounter(fullNameEl, fullNameCounterEl, MAX_FULL_NAME, WARN_FULL_NAME);

attachTextCounter(affiliationEl, affiliationCounterEl, MAX_AFFILIATION, WARN_AFFILIATION);

attachTextCounter(countryEl, countryCounterEl, MAX_COUNTRY, WARN_COUNTRY);

attachTextCounter(
  additionalCommentsEl,
  additionalCommentsCounterEl,
  MAX_COMMENTS,
  WARN_COMMENTS
);

[fullNameEl, affiliationEl, countryEl, additionalCommentsEl].forEach((el) => {
  el?.addEventListener('input', () => {
    if (formStatus) formStatus.textContent = '';
  });
});

let isSubmittingRegistration = false;
let registrationCompleted = false;

function generateUUID() {
  return crypto.randomUUID();
}

const REGISTRATION_KEY_STORAGE = 'registrationSubmissionId';

function getOrCreateSubmissionId() {
  let submissionId = sessionStorage.getItem(REGISTRATION_KEY_STORAGE);

  if (!submissionId) {
    submissionId = generateUUID();
    sessionStorage.setItem(REGISTRATION_KEY_STORAGE, submissionId);
  }

  return submissionId;
}

function clearStoredSubmissionId() {
  sessionStorage.removeItem(REGISTRATION_KEY_STORAGE);
}

function containsUrl(value) {
  return /(https?:\/\/|www\.)/i.test(String(value || ''));
}

function getSelectedAttendanceDays() {
  if (!daysSelector) return [];

  return Array.from(
    daysSelector.querySelectorAll('input[name="days[]"]:checked')
  ).map((input) => input.value);
}

function clearSelectedAttendanceDays() {
  if (!daysSelector) return;

  daysSelector
    .querySelectorAll('input[name="days[]"]')
    .forEach((input) => {
      input.checked = false;
    });
}

function updateDaysSelectorVisibility() {
  if (!attendanceSelect || !daysSelector) return;

  const shouldShow = attendanceSelect.value === 'selected-days';
  daysSelector.hidden = !shouldShow;

  if (!shouldShow) {
    clearSelectedAttendanceDays();
    if (daysError) {
      daysError.hidden = true;
    }
  }
  
  // ✅ Clear any previous error/status message when user changes selection
  if (formStatus) {
    formStatus.textContent = '';
  }
}

function setAttendanceValue(value, label) {
  if (!attendanceSelect || !attendanceText || !attendanceSelectWrap) return;

  attendanceSelect.value = value;
  attendanceText.textContent = label;
  attendanceText.classList.remove('is-placeholder');
  attendanceSelectWrap.dataset.value = value;

  attendanceOptions?.forEach((option) => {
    const isSelected = option.dataset.value === value;
    option.classList.toggle('is-selected', isSelected);
    option.setAttribute('aria-selected', String(isSelected));
  });

  attendanceSelect.dispatchEvent(new Event('change', { bubbles: true }));
}

function openAttendanceMenu() {
  if (!attendanceSelectWrap || !attendanceTrigger) return;
  attendanceSelectWrap.classList.add('is-open');
  attendanceTrigger.setAttribute('aria-expanded', 'true');
}

function closeAttendanceMenu() {
  if (!attendanceSelectWrap || !attendanceTrigger) return;
  attendanceSelectWrap.classList.remove('is-open');
  attendanceTrigger.setAttribute('aria-expanded', 'false');
}

function toggleAttendanceMenu() {
  if (!attendanceSelectWrap) return;

  if (attendanceSelectWrap.classList.contains('is-open')) {
    closeAttendanceMenu();
  } else {
    openAttendanceMenu();
  }
}

function buildAttendancePayload(attendanceValue, selectedDays = []) {
  const attendanceData = {
    daysSummary: '',
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0
  };

  if (attendanceValue === 'all-days') {
    attendanceData.daysSummary = 'All days';
    attendanceData.monday = 1;
    attendanceData.tuesday = 1;
    attendanceData.wednesday = 1;
    attendanceData.thursday = 1;
    attendanceData.friday = 1;
    return attendanceData;
  }

  if (attendanceValue === 'selected-days') {
    attendanceData.monday = selectedDays.includes('monday') ? 1 : 0;
    attendanceData.tuesday = selectedDays.includes('tuesday') ? 1 : 0;
    attendanceData.wednesday = selectedDays.includes('wednesday') ? 1 : 0;
    attendanceData.thursday = selectedDays.includes('thursday') ? 1 : 0;
    attendanceData.friday = selectedDays.includes('friday') ? 1 : 0;

    const labels = {
      monday: 'Monday',
      tuesday: 'Tuesday',
      wednesday: 'Wednesday',
      thursday: 'Thursday',
      friday: 'Friday'
    };

    attendanceData.daysSummary = selectedDays
      .map((day) => labels[day])
      .join(', ');

    return attendanceData;
  }

  return attendanceData;
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
    clearStoredSubmissionId();
    formStatus.textContent = 'Set your Cloudflare Worker URL first in index.html.';
    return;
  }
  
  const formData = new FormData(registrationForm);
  const payload = {};
  
  formData.forEach((value, key) => {
    if (key !== 'days[]') {
      payload[key] = value;
    }
  });
  
  payload.turnstileToken = payload['cf-turnstile-response'] || '';

  const requiredFields = [
    'fullName',
    'email',
    'affiliation',
    'country',
    'attendance',
    'invitedSpeaker'
  ];
  
  if (daysError) {
    daysError.hidden = true;
  }
  
  let selectedDays = [];
  
  if (payload.attendance === 'selected-days') {
    selectedDays = getSelectedAttendanceDays();
    
    if (!selectedDays.length) {
      clearStoredSubmissionId();
      if (daysError) {
        daysError.hidden = false;
      }
      formStatus.textContent = 'Please select at least one day.';
      return;
    }
  }
  
  Object.assign(payload, buildAttendancePayload(payload.attendance, selectedDays));

  const missingField = requiredFields.find((field) => {
    const value = payload[field];
    return typeof value !== 'string' || value.trim() === '';
  });
  
  if (missingField) {
    clearStoredSubmissionId();
    formStatus.textContent = 'Please complete all required fields.';
    return;
  }
  
  if (!payload.turnstileToken) {
    clearStoredSubmissionId();
    formStatus.textContent = 'Please complete the security check.';
    return;
  }
  
  const urlBlockedFields = [
    { key: 'fullName', label: 'Full name' },
    { key: 'affiliation', label: 'Affiliation' },
    { key: 'country', label: 'Country' },
    { key: 'comments', label: 'Additional comments' }
  ];
  
  const invalidUrlField = urlBlockedFields.find(({ key }) =>
    containsUrl(payload[key])
  );
  
  if (invalidUrlField) {
    clearStoredSubmissionId();
    formStatus.textContent = `Links are not allowed in "${invalidUrlField.label}".`;
    return;
  }

  const submissionId = getOrCreateSubmissionId();

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
    clearStoredSubmissionId();
    
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
      clearStoredSubmissionId();
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

if (attendanceSelect && daysSelector) {
  attendanceSelect.addEventListener('change', updateDaysSelectorVisibility);
  updateDaysSelectorVisibility();
  
  // ✅ Clear error when user selects/deselects a day
  daysSelector.addEventListener('change', () => {
    if (daysError) daysError.hidden = true;
    if (formStatus) formStatus.textContent = '';
  });
}

if (attendanceSelectWrap && attendanceTrigger && attendanceMenu && attendanceOptions?.length) {
  if (attendanceText) {
    attendanceText.classList.add('is-placeholder');
  }

  attendanceTrigger.addEventListener('click', () => {
    toggleAttendanceMenu();
  });

  attendanceOptions.forEach((option) => {
    option.addEventListener('click', () => {
      setAttendanceValue(option.dataset.value, option.textContent.trim());
      closeAttendanceMenu();
      attendanceTrigger.focus();
    });
  });

  document.addEventListener('click', (event) => {
    if (!attendanceSelectWrap.contains(event.target)) {
      closeAttendanceMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAttendanceMenu();
      attendanceTrigger?.focus();
    }
  });
}

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
