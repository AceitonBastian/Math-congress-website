const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('.site-nav');
const navLinks = document.querySelectorAll('.site-nav a');
const NAV_BREAKPOINT = 1120;

const registrationForm = document.getElementById('registrationForm');
const formStatus = document.getElementById('formStatus');
const registrationSuccess = document.getElementById('registrationSuccess');
const successEmail = document.getElementById('successEmail');
const attendanceSelect = document.getElementById('attendance');
const daysSelector = document.getElementById('daysSelector');
const daysError = document.getElementById('daysError');
const attendanceSelectWrap = document.getElementById(
  'attendanceSelectWrap'
);
const attendanceTrigger = document.getElementById(
  'attendance-trigger'
);
const attendanceMenu =
  attendanceSelectWrap?.querySelector('.custom-select-menu');
const attendanceText =
  attendanceSelectWrap?.querySelector('.custom-select-text');
const attendanceOptions =
  attendanceSelectWrap?.querySelectorAll('.custom-select-option');

const posterForm = document.getElementById('posterForm');
const posterFormLauncher =
  document.getElementById('posterFormLauncher');
const posterFormPanel =
  document.getElementById('posterFormPanel');
const posterFormToggle =
  document.getElementById('posterFormToggle');
const posterFormClose =
  document.getElementById('posterFormClose');
const posterFormTitle =
  document.getElementById('posterFormTitle');
const posterFormStatus = document.getElementById('posterFormStatus');
const posterSuccess = document.getElementById('posterSuccess');
const posterSuccessEmail =
  document.getElementById('posterSuccessEmail');
const posterSuccessTitle =
  document.getElementById('posterSuccessTitle');
const posterAbstractEl =
  document.getElementById('posterAbstract');
const posterAbstractCounterEl =
  document.getElementById('posterAbstractCounter');
const posterPdfEl = document.getElementById('posterPdf');
const posterFileStatusEl =
  document.getElementById('posterFileStatus');
const posterAttendanceConfirmationEl =
  document.getElementById('posterAttendanceConfirmation');

let turnstileWidgetId = null;
let turnstileRendered = false;
let currentTurnstileToken = '';

let posterTurnstileWidgetId = null;
let posterTurnstileRendered = false;
let currentPosterTurnstileToken = '';

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
const fullNameCounterEl =
  document.getElementById('fullNameCounter');

const affiliationEl = document.getElementById('affiliation');
const affiliationCounterEl =
  document.getElementById('affiliationCounter');

const countryEl = document.getElementById('country');
const countryCounterEl =
  document.getElementById('countryCounter');

const additionalCommentsEl =
  document.getElementById('additionalComments');
const additionalCommentsCounterEl =
  document.getElementById('additionalCommentsCounter');

function attachTextCounter(
  inputEl,
  counterEl,
  maxLength,
  warnAt
) {
  if (!inputEl || !counterEl) return;

  const updateUI = () => {
    const length = inputEl.value.length;

    counterEl.textContent = `${length} / ${maxLength}`;
    counterEl.classList.remove('warn', 'danger');

    if (length >= warnAt && length < maxLength) {
      counterEl.classList.add('warn');
    }

    if (length >= maxLength) {
      counterEl.classList.add('danger');
    }
  };

  inputEl.addEventListener('input', updateUI);
  updateUI();
}

attachTextCounter(
  fullNameEl,
  fullNameCounterEl,
  MAX_FULL_NAME,
  WARN_FULL_NAME
);

attachTextCounter(
  affiliationEl,
  affiliationCounterEl,
  MAX_AFFILIATION,
  WARN_AFFILIATION
);

attachTextCounter(
  countryEl,
  countryCounterEl,
  MAX_COUNTRY,
  WARN_COUNTRY
);

attachTextCounter(
  additionalCommentsEl,
  additionalCommentsCounterEl,
  MAX_COMMENTS,
  WARN_COMMENTS
);

[
  fullNameEl,
  affiliationEl,
  countryEl,
  additionalCommentsEl
].forEach((element) => {
  element?.addEventListener('input', () => {
    if (formStatus) {
      formStatus.textContent = '';
    }
  });
});

// =========================
// Shared helpers
// =========================

function generateUUID() {
  return crypto.randomUUID();
}

function containsUrl(value) {
  return /(https?:\/\/|www\.)/i.test(String(value || ''));
}

function setFormSubmitting(
  form,
  isSubmitting,
  options = {}
) {
  const {
    submittingText = 'Submitting...',
    idleText = null,
    completed = false,
    completedText = 'Submitted',
    statusElement = null
  } = options;

  const submitButton =
    form?.querySelector('button[type="submit"]');

  const controls =
    form?.querySelectorAll(
      'input, select, textarea, button'
    );

  if (form) {
    form.setAttribute(
      'aria-busy',
      isSubmitting ? 'true' : 'false'
    );
  }

  if (submitButton) {
    if (!submitButton.dataset.originalText) {
      submitButton.dataset.originalText =
        submitButton.textContent;
    }

    if (completed) {
      submitButton.disabled = true;
      submitButton.textContent = completedText;
      submitButton.setAttribute('aria-disabled', 'true');
    } else if (isSubmitting) {
      submitButton.disabled = true;
      submitButton.textContent = 'Submitting...';
      submitButton.setAttribute('aria-disabled', 'true');
    } else {
      submitButton.disabled = false;
      submitButton.textContent =
        submitButton.dataset.originalText;
      submitButton.removeAttribute('aria-disabled');
    }
  }

  if (controls && completed) {
    controls.forEach((element) => {
      element.disabled = true;
    });
  } else if (controls) {
    controls.forEach((element) => {
      if (element !== submitButton) {
        element.disabled = isSubmitting;
      }
    });
  }

  if (statusElement) {
    if (isSubmitting) {
      statusElement.textContent = submittingText;
    } else if (idleText !== null) {
      statusElement.textContent = idleText;
    }
  }
}

// =========================
// Registration attendance
// =========================

function getSelectedAttendanceDays() {
  if (!daysSelector) return [];

  return Array.from(
    daysSelector.querySelectorAll(
      'input[name="days[]"]:checked'
    )
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

  const shouldShow =
    attendanceSelect.value === 'selected-days';

  daysSelector.hidden = !shouldShow;

  if (!shouldShow) {
    clearSelectedAttendanceDays();

    if (daysError) {
      daysError.hidden = true;
    }
  }

  if (formStatus) {
    formStatus.textContent = '';
  }
}

function setAttendanceValue(value, label) {
  if (
    !attendanceSelect ||
    !attendanceText ||
    !attendanceSelectWrap
  ) {
    return;
  }

  attendanceSelect.value = value;
  attendanceText.textContent = label;
  attendanceText.classList.remove('is-placeholder');
  attendanceSelectWrap.dataset.value = value;

  attendanceOptions?.forEach((option) => {
    const isSelected =
      option.dataset.value === value;

    option.classList.toggle(
      'is-selected',
      isSelected
    );

    option.setAttribute(
      'aria-selected',
      String(isSelected)
    );
  });

  attendanceSelect.dispatchEvent(
    new Event('change', { bubbles: true })
  );
}

function openAttendanceMenu() {
  if (!attendanceSelectWrap || !attendanceTrigger) {
    return;
  }

  attendanceSelectWrap.classList.add('is-open');

  attendanceTrigger.setAttribute(
    'aria-expanded',
    'true'
  );
}

function closeAttendanceMenu() {
  if (!attendanceSelectWrap || !attendanceTrigger) {
    return;
  }

  attendanceSelectWrap.classList.remove('is-open');

  attendanceTrigger.setAttribute(
    'aria-expanded',
    'false'
  );
}

function toggleAttendanceMenu() {
  if (!attendanceSelectWrap) return;

  if (
    attendanceSelectWrap.classList.contains('is-open')
  ) {
    closeAttendanceMenu();
  } else {
    openAttendanceMenu();
  }
}

function buildAttendancePayload(
  attendanceValue,
  selectedDays = []
) {
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
    attendanceData.monday =
      selectedDays.includes('monday') ? 1 : 0;

    attendanceData.tuesday =
      selectedDays.includes('tuesday') ? 1 : 0;

    attendanceData.wednesday =
      selectedDays.includes('wednesday') ? 1 : 0;

    attendanceData.thursday =
      selectedDays.includes('thursday') ? 1 : 0;

    attendanceData.friday =
      selectedDays.includes('friday') ? 1 : 0;

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
  }

  return attendanceData;
}

// =========================
// Cloudflare Turnstile
// =========================

function renderPosterTurnstile() {
  if (
    !window.turnstile ||
    posterTurnstileRendered ||
    posterFormPanel?.hidden
  ) {
    return;
  }

  const posterContainer =
    document.getElementById(
      'poster-turnstile-container'
    );

  if (
    posterContainer &&
    !posterTurnstileRendered
  ) {
    posterTurnstileWidgetId =
      window.turnstile.render(
        posterContainer,
        {
          sitekey:
            '0x4AAAAAACzT8PdZtr0263kY',
          theme: 'light',
          action: 'poster_submission',

          callback: (token) => {
            currentPosterTurnstileToken =
              token;

            if (posterFormStatus) {
              posterFormStatus.textContent = '';
            }
          },

          'expired-callback': () => {
            currentPosterTurnstileToken = '';
          },

          'error-callback': () => {
            currentPosterTurnstileToken = '';

            if (posterFormStatus) {
              posterFormStatus.textContent =
                'Security check failed. Please try again.';
            }
          }
        }
      );

    posterTurnstileRendered = true;
  }
}

window.onloadTurnstileCallback = () => {
  if (!window.turnstile) return;

  const registrationContainer =
    document.getElementById(
      'turnstile-container'
    );

  if (
    registrationContainer &&
    !turnstileRendered
  ) {
    turnstileWidgetId =
      window.turnstile.render(
        registrationContainer,
        {
          sitekey:
            '0x4AAAAAACzT8PdZtr0263kY',
          theme: 'light',
          action: 'register',

          callback: (token) => {
            currentTurnstileToken = token;

            if (formStatus) {
              formStatus.textContent = '';
            }
          },

          'expired-callback': () => {
            currentTurnstileToken = '';
          },

          'error-callback': () => {
            currentTurnstileToken = '';

            if (formStatus) {
              formStatus.textContent =
                'Security check failed. Please try again.';
            }
          }
        }
      );

    turnstileRendered = true;
  }

  renderPosterTurnstile();
};

// =========================
// Registration form
// =========================

let isSubmittingRegistration = false;
let registrationCompleted = false;

const REGISTRATION_KEY_STORAGE =
  'registrationSubmissionId';

function getOrCreateSubmissionId() {
  let submissionId =
    sessionStorage.getItem(
      REGISTRATION_KEY_STORAGE
    );

  if (!submissionId) {
    submissionId = generateUUID();

    sessionStorage.setItem(
      REGISTRATION_KEY_STORAGE,
      submissionId
    );
  }

  return submissionId;
}

function clearStoredSubmissionId() {
  sessionStorage.removeItem(
    REGISTRATION_KEY_STORAGE
  );
}

async function submitRegistration(event) {
  event.preventDefault();

  if (
    !registrationForm ||
    registrationCompleted ||
    isSubmittingRegistration
  ) {
    return;
  }

  const endpoint =
    window.CONFERENCE_CONFIG
      ?.registrationEndpoint;

  if (
    !endpoint ||
    endpoint.includes(
      'YOUR-CLOUDFLARE-WORKER'
    )
  ) {
    clearStoredSubmissionId();

    if (formStatus) {
      formStatus.textContent =
        'Set your Cloudflare Worker URL first in index.html.';
    }

    return;
  }

  const registrationData =
    new FormData(registrationForm);

  const payload = {};

  registrationData.forEach(
    (value, key) => {
      if (key !== 'days[]') {
        payload[key] = value;
      }
    }
  );

  payload.turnstileToken =
    currentTurnstileToken || '';

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

  if (
    payload.attendance === 'selected-days'
  ) {
    selectedDays =
      getSelectedAttendanceDays();

    if (!selectedDays.length) {
      clearStoredSubmissionId();

      if (daysError) {
        daysError.hidden = false;
      }

      if (formStatus) {
        formStatus.textContent =
          'Please select at least one day.';
      }

      return;
    }
  }

  Object.assign(
    payload,
    buildAttendancePayload(
      payload.attendance,
      selectedDays
    )
  );

  const missingField =
    requiredFields.find((field) => {
      const value = payload[field];

      return (
        typeof value !== 'string' ||
        value.trim() === ''
      );
    });

  if (missingField) {
    clearStoredSubmissionId();

    if (formStatus) {
      formStatus.textContent =
        'Please complete all required fields.';
    }

    return;
  }

  if (!payload.turnstileToken) {
    clearStoredSubmissionId();

    if (formStatus) {
      formStatus.textContent =
        'Please complete the security check.';
    }

    return;
  }

  const urlBlockedFields = [
    {
      key: 'fullName',
      label: 'Full name'
    },
    {
      key: 'affiliation',
      label: 'Affiliation'
    },
    {
      key: 'country',
      label: 'Country'
    },
    {
      key: 'comments',
      label: 'Additional comments'
    }
  ];

  const invalidUrlField =
    urlBlockedFields.find(({ key }) =>
      containsUrl(payload[key])
    );

  if (invalidUrlField) {
    clearStoredSubmissionId();

    if (formStatus) {
      formStatus.textContent =
        `Links are not allowed in "${invalidUrlField.label}".`;
    }

    return;
  }

  const submissionId =
    getOrCreateSubmissionId();

  payload.id = submissionId;

  payload.submittedAt =
    new Date().toLocaleString(
      'sv-SE',
      {
        timeZone: 'America/Santiago'
      }
    );

  payload.page = window.location.href;

  isSubmittingRegistration = true;

  setFormSubmitting(
    registrationForm,
    true,
    {
      submittingText:
        'Submitting registration...',
      statusElement: formStatus
    }
  );

  const controller =
    new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 15000);

  try {
    const response = await fetch(
      endpoint,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',

          'Idempotency-Key':
            submissionId
        },

        body: JSON.stringify(payload),

        signal: controller.signal
      }
    );

    const contentType =
      response.headers.get(
        'content-type'
      ) || '';

    const result =
      contentType.includes(
        'application/json'
      )
        ? await response
            .json()
            .catch(() => ({}))
        : {};

    if (!response.ok) {
      throw new Error(
        result.error ||
          'Submission failed.'
      );
    }

    registrationCompleted = true;
    clearStoredSubmissionId();

    registrationForm.remove();

    if (successEmail) {
      successEmail.textContent =
        payload.email;
    }

    if (registrationSuccess) {
      registrationSuccess.hidden = false;

      registrationSuccess.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  } catch (error) {
    console.error(error);

    clearStoredSubmissionId();

    if (formStatus) {
      formStatus.textContent =
        error.name === 'AbortError'
          ? 'The request took too long. Please try again.'
          : error.message ||
            'There was an error sending the form.';
    }

    if (
      window.turnstile &&
      turnstileWidgetId !== null
    ) {
      window.turnstile.reset(
        turnstileWidgetId
      );

      currentTurnstileToken = '';
    }

    isSubmittingRegistration = false;

    setFormSubmitting(
      registrationForm,
      false,
      {
        statusElement: formStatus
      }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

// =========================
// Poster proposal form
// =========================

const MAX_POSTER_ABSTRACT_WORDS = 250;

const MAX_POSTER_PDF_BYTES =
  9 * 1024 * 1024;

const POSTER_KEY_STORAGE =
  'posterSubmissionId';

let isSubmittingPoster = false;
let posterCompleted = false;

function countWords(value) {
  const normalized =
    String(value || '').trim();

  return normalized
    ? normalized.split(/\s+/).length
    : 0;
}

function updatePosterAbstractCounter() {
  if (
    !posterAbstractEl ||
    !posterAbstractCounterEl
  ) {
    return;
  }

  const wordCount =
    countWords(posterAbstractEl.value);

  posterAbstractCounterEl.textContent =
    `${wordCount} / ${MAX_POSTER_ABSTRACT_WORDS} words`;

  posterAbstractCounterEl.classList.remove(
    'warn',
    'danger'
  );

  if (
    wordCount >= 220 &&
    wordCount <=
      MAX_POSTER_ABSTRACT_WORDS
  ) {
    posterAbstractCounterEl.classList.add(
      'warn'
    );
  }

  if (
    wordCount >
    MAX_POSTER_ABSTRACT_WORDS
  ) {
    posterAbstractCounterEl.classList.add(
      'danger'
    );
  }
}

function formatFileSize(bytes) {
  if (
    !Number.isFinite(bytes) ||
    bytes <= 0
  ) {
    return '0 MB';
  }

  return (
    `${(
      bytes /
      (1024 * 1024)
    ).toFixed(2)} MB`
  );
}

function getSelectedPosterPdf() {
  const file =
    posterPdfEl?.files?.[0];

  return file && file.size > 0
    ? file
    : null;
}

function validatePosterPdf(file) {
  if (!file) return '';

  const hasPdfExtension =
    file.name
      .toLowerCase()
      .endsWith('.pdf');

  const hasAllowedMime =
    !file.type ||
    file.type === 'application/pdf';

  if (
    !hasPdfExtension ||
    !hasAllowedMime
  ) {
    return 'Please select a PDF file.';
  }

  if (
    file.size >
    MAX_POSTER_PDF_BYTES
  ) {
    return 'The PDF must not exceed 9 MB.';
  }

  return '';
}

function updatePosterFileStatus() {
  if (!posterFileStatusEl) return;

  const file =
    getSelectedPosterPdf();

  const error =
    validatePosterPdf(file);

  posterFileStatusEl.classList.remove(
    'is-error',
    'is-valid'
  );

  if (!file) {
    posterFileStatusEl.textContent =
      'No file selected.';

    return;
  }

  if (error) {
    posterFileStatusEl.textContent =
      error;

    posterFileStatusEl.classList.add(
      'is-error'
    );

    return;
  }

  posterFileStatusEl.textContent =
    `${file.name} · ${formatFileSize(file.size)}`;

  posterFileStatusEl.classList.add(
    'is-valid'
  );
}

function getOrCreatePosterSubmissionId() {
  let submissionId =
    sessionStorage.getItem(
      POSTER_KEY_STORAGE
    );

  if (!submissionId) {
    submissionId = generateUUID();

    sessionStorage.setItem(
      POSTER_KEY_STORAGE,
      submissionId
    );
  }

  return submissionId;
}

function clearStoredPosterSubmissionId() {
  sessionStorage.removeItem(
    POSTER_KEY_STORAGE
  );
}

async function submitPosterProposal(event) {
  event.preventDefault();

  if (
    !posterForm ||
    posterCompleted ||
    isSubmittingPoster
  ) {
    return;
  }

  const endpoint =
    window.CONFERENCE_CONFIG
      ?.posterEndpoint;

  if (
    !endpoint ||
    endpoint.includes(
      'YOUR-CLOUDFLARE-WORKER'
    )
  ) {
    clearStoredPosterSubmissionId();

    if (posterFormStatus) {
      posterFormStatus.textContent =
        'The poster form is ready, but its Cloudflare endpoint has not been connected yet.';
    }

    return;
  }

  if (!posterForm.reportValidity()) {
    clearStoredPosterSubmissionId();

    if (posterFormStatus) {
      posterFormStatus.textContent =
        'Please complete all required fields.';
    }

    return;
  }

  const abstractWordCount =
    countWords(
      posterAbstractEl?.value
    );

  if (
    abstractWordCount === 0 ||
    abstractWordCount >
      MAX_POSTER_ABSTRACT_WORDS
  ) {
    clearStoredPosterSubmissionId();

    if (posterFormStatus) {
      posterFormStatus.textContent =
        abstractWordCount === 0
          ? 'Please enter an abstract.'
          : 'The abstract must not exceed 250 words.';
    }

    posterAbstractEl?.focus();
    return;
  }

  if (
    !posterAttendanceConfirmationEl
      ?.checked
  ) {
    clearStoredPosterSubmissionId();

    if (posterFormStatus) {
      posterFormStatus.textContent =
        'Please confirm that you will attend in person if accepted.';
    }

    posterAttendanceConfirmationEl
      ?.focus();

    return;
  }

  const file =
    getSelectedPosterPdf();

  const fileError =
    validatePosterPdf(file);

  if (fileError) {
    clearStoredPosterSubmissionId();

    if (posterFormStatus) {
      posterFormStatus.textContent =
        fileError;
    }

    posterPdfEl?.focus();
    return;
  }

  if (!currentPosterTurnstileToken) {
    clearStoredPosterSubmissionId();

    if (posterFormStatus) {
      posterFormStatus.textContent =
        'Please complete the security check.';
    }

    return;
  }

  const submissionId =
    getOrCreatePosterSubmissionId();

  const formData =
    new FormData(posterForm);

  if (!file) {
    formData.delete('supportingPdf');
  }

  formData.set(
    'turnstileToken',
    currentPosterTurnstileToken
  );

  formData.set(
    'id',
    submissionId
  );

  formData.set(
    'submissionType',
    'poster-proposal'
  );

  formData.set(
    'submittedAt',
    new Date().toLocaleString(
      'sv-SE',
      {
        timeZone: 'America/Santiago'
      }
    )
  );

  formData.set(
    'page',
    window.location.href
  );

  formData.set(
    'abstractWordCount',
    String(abstractWordCount)
  );

  isSubmittingPoster = true;

  setFormSubmitting(
    posterForm,
    true,
    {
      submittingText: file
        ? 'Uploading and submitting proposal...'
        : 'Submitting proposal...',

      statusElement:
        posterFormStatus
    }
  );

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(() => {
      controller.abort();
    }, 120000);

  try {
    const response = await fetch(
      endpoint,
      {
        method: 'POST',

        headers: {
          'Idempotency-Key':
            submissionId
        },

        body: formData,

        signal: controller.signal
      }
    );

    const contentType =
      response.headers.get(
        'content-type'
      ) || '';

    const result =
      contentType.includes(
        'application/json'
      )
        ? await response
            .json()
            .catch(() => ({}))
        : {};

    if (!response.ok) {
      throw new Error(
        result.error ||
          'Poster proposal submission failed.'
      );
    }

    posterCompleted = true;

    clearStoredPosterSubmissionId();

    const email =
      posterForm.elements
        .contactEmail?.value || '';

    const title =
      posterForm.elements
        .posterTitle?.value || '';

    posterForm.remove();

    if (posterSuccessEmail) {
      posterSuccessEmail.textContent =
        email;
    }

    if (posterSuccessTitle) {
      posterSuccessTitle.textContent =
        title;
    }

    if (posterSuccess) {
      posterSuccess.hidden = false;

      posterSuccess.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  } catch (error) {
    console.error(error);

    clearStoredPosterSubmissionId();

    if (posterFormStatus) {
      posterFormStatus.textContent =
        error.name === 'AbortError'
          ? 'The upload took too long. Please check your connection and try again.'
          : error.message ||
            'There was an error sending the poster proposal.';
    }

    if (
      window.turnstile &&
      posterTurnstileWidgetId !== null
    ) {
      window.turnstile.reset(
        posterTurnstileWidgetId
      );

      currentPosterTurnstileToken = '';
    }

    isSubmittingPoster = false;

    setFormSubmitting(
      posterForm,
      false,
      {
        statusElement:
          posterFormStatus
      }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

// =========================
// Poster form listeners
// =========================

function openPosterForm() {
  if (
    !posterFormLauncher ||
    !posterFormPanel ||
    !posterFormToggle
  ) {
    return;
  }

  posterFormLauncher.hidden = true;
  posterFormPanel.hidden = false;
  posterFormToggle.setAttribute(
    'aria-expanded',
    'true'
  );

  renderPosterTurnstile();

  posterFormPanel.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });

  posterFormTitle?.focus({
    preventScroll: true
  });
}

function closePosterForm() {
  if (
    !posterFormLauncher ||
    !posterFormPanel ||
    !posterFormToggle ||
    isSubmittingPoster
  ) {
    return;
  }

  posterFormPanel.hidden = true;
  posterFormLauncher.hidden = false;
  posterFormToggle.setAttribute(
    'aria-expanded',
    'false'
  );

  posterFormToggle.focus({
    preventScroll: true
  });
}

posterFormToggle?.addEventListener(
  'click',
  openPosterForm
);

posterFormClose?.addEventListener(
  'click',
  closePosterForm
);

posterAbstractEl?.addEventListener(
  'input',
  () => {
    updatePosterAbstractCounter();

    if (posterFormStatus) {
      posterFormStatus.textContent = '';
    }
  }
);

posterPdfEl?.addEventListener(
  'change',
  () => {
    updatePosterFileStatus();

    if (posterFormStatus) {
      posterFormStatus.textContent = '';
    }
  }
);

posterForm
  ?.querySelectorAll(
    'input[type="text"], input[type="email"], textarea, input[type="checkbox"]'
  )
  .forEach((element) => {
    element.addEventListener(
      'input',
      () => {
        if (posterFormStatus) {
          posterFormStatus.textContent = '';
        }
      }
    );
  });

updatePosterAbstractCounter();
updatePosterFileStatus();

if (posterForm) {
  posterForm.addEventListener(
    'submit',
    submitPosterProposal
  );
}

// =========================
// Navigation
// =========================

function openNav() {
  if (!siteNav || !navToggle) return;

  siteNav.classList.add('open');
  navToggle.classList.add('is-open');

  navToggle.setAttribute(
    'aria-expanded',
    'true'
  );

  navToggle.setAttribute(
    'aria-label',
    'Close menu'
  );
}

function closeNav() {
  if (!siteNav || !navToggle) return;

  siteNav.classList.remove('open');
  navToggle.classList.remove('is-open');

  navToggle.setAttribute(
    'aria-expanded',
    'false'
  );

  navToggle.setAttribute(
    'aria-label',
    'Open menu'
  );
}

function toggleNav() {
  if (!siteNav) return;

  const isOpen =
    siteNav.classList.contains('open');

  if (isOpen) {
    closeNav();
  } else {
    openNav();
  }
}

if (navToggle && siteNav) {
  navToggle.addEventListener(
    'click',
    toggleNav
  );

  navLinks.forEach((link) => {
    link.addEventListener(
      'click',
      closeNav
    );
  });

  window.addEventListener(
    'resize',
    () => {
      if (
        window.innerWidth >
        NAV_BREAKPOINT
      ) {
        closeNav();
      }
    }
  );
}

// =========================
// Smooth scrolling
// =========================

document.addEventListener(
  'click',
  (event) => {
    const link =
      event.target.closest(
        'a[href^="#"]'
      );

    if (!link) return;

    const targetId =
      link.getAttribute('href');

    if (
      !targetId ||
      targetId === '#'
    ) {
      return;
    }

    event.preventDefault();

    if (
      window.innerWidth <=
      NAV_BREAKPOINT
    ) {
      closeNav();
    }

    if (targetId === '#top') {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });

      history.replaceState(
        null,
        '',
        '#top'
      );

      return;
    }

    const target =
      document.querySelector(
        targetId
      );

    if (!target) return;

    const offset = 70;

    const targetTop =
      target
        .getBoundingClientRect()
        .top +
      window.pageYOffset -
      offset;

    window.scrollTo({
      top: targetTop,
      behavior: 'smooth'
    });

    history.replaceState(
      null,
      '',
      targetId
    );
  }
);

// =========================
// Registration listeners
// =========================

if (
  attendanceSelect &&
  daysSelector
) {
  attendanceSelect.addEventListener(
    'change',
    updateDaysSelectorVisibility
  );

  updateDaysSelectorVisibility();

  daysSelector.addEventListener(
    'change',
    () => {
      if (daysError) {
        daysError.hidden = true;
      }

      if (formStatus) {
        formStatus.textContent = '';
      }
    }
  );
}

if (
  attendanceSelectWrap &&
  attendanceTrigger &&
  attendanceMenu &&
  attendanceOptions?.length
) {
  if (attendanceText) {
    attendanceText.classList.add(
      'is-placeholder'
    );
  }

  attendanceTrigger.addEventListener(
    'click',
    toggleAttendanceMenu
  );

  attendanceOptions.forEach(
    (option) => {
      option.addEventListener(
        'click',
        () => {
          setAttendanceValue(
            option.dataset.value,
            option.textContent.trim()
          );

          closeAttendanceMenu();
          attendanceTrigger.focus();
        }
      );
    }
  );

  document.addEventListener(
    'click',
    (event) => {
      if (
        !attendanceSelectWrap.contains(
          event.target
        )
      ) {
        closeAttendanceMenu();
      }
    }
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        closeAttendanceMenu();
        attendanceTrigger.focus();
      }
    }
  );
}

if (registrationForm) {
  registrationForm.addEventListener(
    'submit',
    submitRegistration
  );
}

// =========================
// Materials
// =========================

const materialsGrid =
  document.getElementById(
    'materialsGrid'
  );

const materialTabs =
  document.querySelectorAll(
    '.materials-tab'
  );

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

  const items =
    MATERIALS[day] || [];

  materialsGrid.innerHTML = '';

  if (!items.length) {
    materialsGrid.innerHTML = `
      <div class="materials-empty">
        Presentation files for this day will be uploaded soon.
      </div>
    `;

    return;
  }

  items.forEach((item) => {
    const card =
      document.createElement(
        'article'
      );

    card.className =
      'material-card';

    card.innerHTML = `
      <p class="material-meta">
        Presentation PDF
      </p>

      <h3>${item.title}</h3>

      <p class="material-speaker">
        ${item.speaker}
      </p>

      <p class="material-affiliation">
        ${item.affiliation}
      </p>

      <a
        href="${item.pdf}"
        target="_blank"
        rel="noopener"
        class="btn btn-secondary"
      >
        Open PDF
      </a>
    `;

    materialsGrid.appendChild(card);
  });
}

if (
  materialTabs.length &&
  materialsGrid
) {
  materialTabs.forEach((tab) => {
    tab.addEventListener(
      'click',
      () => {
        currentMaterialsDay =
          tab.dataset.day;

        materialTabs.forEach(
          (button) => {
            const isActive =
              button.dataset.day ===
              currentMaterialsDay;

            button.classList.toggle(
              'is-active',
              isActive
            );

            button.setAttribute(
              'aria-selected',
              isActive
                ? 'true'
                : 'false'
            );
          }
        );

        renderMaterials(
          currentMaterialsDay
        );
      }
    );
  });

  renderMaterials(
    currentMaterialsDay
  );
}
