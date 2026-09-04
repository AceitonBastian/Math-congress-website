const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('.site-nav');
const navLinks = document.querySelectorAll('.site-nav a');
const navDropdowns = document.querySelectorAll('[data-nav-dropdown]');
const navBackdrop = document.querySelector('[data-nav-backdrop]');
const siteHeader = document.querySelector('.site-header');
const supportersHeading = document.querySelector('#supporters-heading');
const supportersMarquee = document.querySelector('.supporters-marquee');
const supportersMarqueeToggle = document.querySelector(
  '.supporters-marquee-toggle'
);
const supportersMarqueeTrack = document.querySelector(
  '.supporters-marquee-track'
);
const supportersMarqueeStepButtons = document.querySelectorAll(
  '[data-supporters-direction]'
);
const speakersGrid = document.querySelector('.speakers-grid');
const supportersPauseIcon = document.querySelector(
  '.supporters-toggle-icon-pause'
);
const supportersPlayIcon = document.querySelector(
  '.supporters-toggle-icon-play'
);
const SUPPORTERS_REDUCED_MOTION_QUERY = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
);
let supportersMarqueeOffsetMs = 0;
const NAV_COMPACT_MEDIA_QUERY =
  window.matchMedia('(max-width: 1120px)');
const DEFAULT_SITE_HEADER_HEIGHT = 79;
const SECTION_ANCHOR_OVERLAP = 1;
const NAV_DROPDOWN_VIEWPORT_GUTTER = 16;
// Keep the current panel open slightly longer than the hover-intent delay.
// This lets the next dropdown take over without the shared surface briefly
// collapsing when the pointer crosses a tiny gap between navigation items.
const NAV_DROPDOWN_CLOSE_DELAY_MS = 220;
const NAV_DROPDOWN_TRANSITION_MS = 200;
const NAV_DROPDOWN_HOVER_DELAY_MS = 160;
const SITE_HEADER_HEADING_CLEARANCE_PX = 12;
const SITE_HEADER_HIDE_SCROLL_MULTIPLIER = 1.35;
const SITE_HEADER_DAMPING_TIME_MS = 95;
const SITE_HEADER_CONTENT_FADE_START_PROGRESS = 0.45;
let siteHeaderVisibilityFrame = null;
let siteHeaderAnimationFrame = null;
let siteHeaderAnimationTimestamp = null;
let siteHeaderTargetProgress = 0;
let siteHeaderRenderedProgress = 0;
let siteHeaderAnimationInitialized = false;

function usesCompactNavLayout() {
  return NAV_COMPACT_MEDIA_QUERY.matches;
}

function isMobileNavOpen() {
  return usesCompactNavLayout() && siteNav?.classList.contains('open');
}

function getSiteHeaderHeight() {
  return (
    siteHeader
      ?.getBoundingClientRect()
      .height || DEFAULT_SITE_HEADER_HEIGHT
  );
}

function getSectionAnchorOffset() {
  return Math.max(
    getSiteHeaderHeight() -
      SECTION_ANCHOR_OVERLAP,
    0
  );
}

function syncSiteHeaderHeight() {
  document.documentElement.style.setProperty(
    '--site-header-height',
    `${getSiteHeaderHeight()}px`
  );
}

function syncNavDropdownAnchor(dropdown) {
  if (usesCompactNavLayout()) {
    dropdown.style.removeProperty(
      '--nav-dropdown-anchor-x'
    );
    return;
  }

  const parentRow = dropdown.querySelector(
    '.nav-parent-row'
  );
  const content = dropdown.querySelector(
    '.nav-dropdown-content'
  );

  if (!parentRow || !content) return;

  const viewportWidth =
    document.documentElement.clientWidth ||
    window.innerWidth;
  const availableWidth = Math.max(
    0,
    viewportWidth -
      NAV_DROPDOWN_VIEWPORT_GUTTER * 2
  );
  const contentWidth = Math.min(
    Math.max(content.scrollWidth, 220),
    availableWidth
  );
  const maximumLeft = Math.max(
    NAV_DROPDOWN_VIEWPORT_GUTTER,
    viewportWidth -
      NAV_DROPDOWN_VIEWPORT_GUTTER -
      contentWidth
  );
  const preferredLeft =
    parentRow.getBoundingClientRect().left;
  const anchoredLeft = Math.min(
    Math.max(
      preferredLeft,
      NAV_DROPDOWN_VIEWPORT_GUTTER
    ),
    maximumLeft
  );

  dropdown.style.setProperty(
    '--nav-dropdown-anchor-x',
    `${Math.round(anchoredLeft)}px`
  );
}

function syncNavDropdownAnchors() {
  navDropdowns.forEach(
    syncNavDropdownAnchor
  );
}

function sortSpeakerCards() {
  if (!speakersGrid) return;

  const speakerNameCollator = new Intl.Collator(
    document.documentElement.lang || 'en',
    { sensitivity: 'base' }
  );
  const speakerCards = Array.from(
    speakersGrid.querySelectorAll('.speaker-card')
  );

  speakerCards.sort((firstCard, secondCard) => {
    const firstName =
      firstCard.querySelector('h3')?.textContent.trim() || '';
    const secondName =
      secondCard.querySelector('h3')?.textContent.trim() || '';

    return speakerNameCollator.compare(
      firstName,
      secondName
    );
  });

  speakersGrid.append(...speakerCards);
}

syncSiteHeaderHeight();
syncNavDropdownAnchors();
sortSpeakerCards();

window.addEventListener(
  'resize',
  syncSiteHeaderHeight
);

window.addEventListener(
  'resize',
  syncNavDropdownAnchors
);

if (siteHeader && 'ResizeObserver' in window) {
  const siteHeaderResizeObserver =
    new ResizeObserver(() => {
      syncSiteHeaderHeight();
      queueSiteHeaderVisibilitySync();
    });

  siteHeaderResizeObserver.observe(siteHeader);
}

if (document.fonts?.ready) {
  document.fonts.ready.then(() => {
    syncSiteHeaderHeight();
    syncNavDropdownAnchors();
    syncOpenNavDropdownHeight();
    queueSiteHeaderVisibilitySync();
  });
}

function setSupportersMarqueePaused(isPaused) {
  if (!supportersMarquee || !supportersMarqueeToggle) return;

  supportersMarquee.classList.toggle('is-paused', isPaused);
  supportersMarqueeToggle.setAttribute(
    'aria-pressed',
    String(isPaused)
  );
  supportersMarqueeToggle.setAttribute(
    'aria-label',
    isPaused
      ? 'Play supporter logo animation'
      : 'Pause supporter logo animation'
  );

  if (supportersPauseIcon) {
    supportersPauseIcon.toggleAttribute('hidden', isPaused);
  }

  if (supportersPlayIcon) {
    supportersPlayIcon.toggleAttribute('hidden', !isPaused);
  }
}

function stepSupportersMarquee(direction) {
  if (!supportersMarqueeTrack) return;

  const logoGroup = supportersMarqueeTrack.querySelector(
    '.supported-logos:not(.supported-logos-clone)'
  );
  const firstSupporter = logoGroup?.querySelector('.supporter-item');
  const groupWidth = logoGroup?.getBoundingClientRect().width ?? 0;
  const itemWidth = firstSupporter?.getBoundingClientRect().width ?? 0;
  const groupStyles = logoGroup ? getComputedStyle(logoGroup) : null;
  const itemGap = Number.parseFloat(groupStyles?.columnGap) || 0;
  const trackStyles = getComputedStyle(supportersMarqueeTrack);
  const durationValue = trackStyles.animationDuration.trim();
  const iterationDuration = Number.parseFloat(durationValue) *
    (durationValue.endsWith('ms') ? 1 : 1000);

  if (!groupWidth || !itemWidth || !iterationDuration) return;

  const stepDuration =
    iterationDuration * ((itemWidth + itemGap) / groupWidth);
  supportersMarqueeOffsetMs += direction === 'left'
    ? stepDuration
    : -stepDuration;
  supportersMarqueeOffsetMs =
    ((supportersMarqueeOffsetMs % iterationDuration) + iterationDuration) %
    iterationDuration;
  supportersMarqueeTrack.style.animationDelay =
    `${-supportersMarqueeOffsetMs}ms`;
}

if (supportersMarquee && supportersMarqueeToggle) {
  setSupportersMarqueePaused(
    SUPPORTERS_REDUCED_MOTION_QUERY.matches
  );
  supportersMarqueeToggle.hidden = false;

  supportersMarqueeStepButtons.forEach((button) => {
    button.hidden = false;
    button.addEventListener('click', () => {
      stepSupportersMarquee(button.dataset.supportersDirection);
    });
  });

  supportersMarqueeToggle.addEventListener('click', () => {
    setSupportersMarqueePaused(
      !supportersMarquee.classList.contains('is-paused')
    );
  });

  const handleSupportersReducedMotionChange = (event) => {
    setSupportersMarqueePaused(event.matches);
    queueSiteHeaderVisibilitySync();
  };

  if (
    typeof SUPPORTERS_REDUCED_MOTION_QUERY.addEventListener ===
    'function'
  ) {
    SUPPORTERS_REDUCED_MOTION_QUERY.addEventListener(
      'change',
      handleSupportersReducedMotionChange
    );
  } else if (
    typeof SUPPORTERS_REDUCED_MOTION_QUERY.addListener === 'function'
  ) {
    // Older iOS Safari exposes the legacy MediaQueryList listener API.
    SUPPORTERS_REDUCED_MOTION_QUERY.addListener(
      handleSupportersReducedMotionChange
    );
  }
}

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
const posterPdfButtonEl =
  document.getElementById('posterPdfButton');
const posterPdfRemoveEl =
  document.getElementById('posterPdfRemove');
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

const MAX_POSTER_AUTHOR = 114;
const WARN_POSTER_AUTHOR = 95;

const MAX_POSTER_AFFILIATION = 114;
const WARN_POSTER_AFFILIATION = 95;

const MAX_POSTER_TITLE = 200;
const WARN_POSTER_TITLE = 170;

const MAX_POSTER_COAUTHORS = 500;
const WARN_POSTER_COAUTHORS = 425;

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

const posterAuthorEl =
  document.getElementById('posterAuthor');
const posterAuthorCounterEl =
  document.getElementById('posterAuthorCounter');

const posterAffiliationEl =
  document.getElementById('posterAffiliation');
const posterAffiliationCounterEl =
  document.getElementById('posterAffiliationCounter');

const posterTitleEl =
  document.getElementById('posterTitle');
const posterTitleCounterEl =
  document.getElementById('posterTitleCounter');

const posterCoauthorsEl =
  document.getElementById('posterCoauthors');
const posterCoauthorsCounterEl =
  document.getElementById('posterCoauthorsCounter');

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

attachTextCounter(
  posterAuthorEl,
  posterAuthorCounterEl,
  MAX_POSTER_AUTHOR,
  WARN_POSTER_AUTHOR
);

attachTextCounter(
  posterAffiliationEl,
  posterAffiliationCounterEl,
  MAX_POSTER_AFFILIATION,
  WARN_POSTER_AFFILIATION
);

attachTextCounter(
  posterTitleEl,
  posterTitleCounterEl,
  MAX_POSTER_TITLE,
  WARN_POSTER_TITLE
);

attachTextCounter(
  posterCoauthorsEl,
  posterCoauthorsCounterEl,
  MAX_POSTER_COAUTHORS,
  WARN_POSTER_COAUTHORS
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
    submittingButtonText = 'Submitting...',
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
      submitButton.textContent =
        submittingButtonText;
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

function getTurnstileSize() {
  return window.matchMedia(
    '(max-width: 380px)'
  ).matches
    ? 'compact'
    : 'normal';
}

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
          language: 'en',
          size: getTurnstileSize(),
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
          language: 'en',
          size: getTurnstileSize(),
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
    wordCount <
      MAX_POSTER_ABSTRACT_WORDS
  ) {
    posterAbstractCounterEl.classList.add(
      'warn'
    );
  }

  if (
    wordCount >=
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

  if (posterPdfEl) {
    posterPdfEl.tabIndex = file ? -1 : 0;
  }

  if (posterPdfButtonEl) {
    posterPdfButtonEl.hidden = Boolean(file);
  }

  if (posterPdfRemoveEl) {
    posterPdfRemoveEl.hidden = !file;
  }

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

    if (
      posterPdfRemoveEl &&
      !posterPdfRemoveEl.hidden
    ) {
      posterPdfRemoveEl.focus();
    } else {
      posterPdfEl?.focus();
    }
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
        ? 'Uploading your PDF and submitting your proposal. Please keep this page open; this can take up to two minutes.'
        : 'Submitting your proposal. Please keep this page open.',

      submittingButtonText: file
        ? 'Uploading PDF...'
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
      const submissionError = new Error(
        result.error ||
          'Poster proposal submission failed.'
      );

      submissionError.status = response.status;
      throw submissionError;
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

    if (posterFormStatus) {
      posterFormStatus.textContent =
        error.name === 'AbortError'
          ? 'We could not confirm the result yet. Please check your connection, wait a moment, and try again. Your retry will use the same submission ID.'
          : error.status === 409
            ? 'Your proposal is still being processed. Please wait a moment and try again; it will not be submitted twice.'
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

posterPdfRemoveEl?.addEventListener(
  'click',
  () => {
    if (!posterPdfEl) return;

    posterPdfEl.value = '';
    updatePosterFileStatus();

    if (posterFormStatus) {
      posterFormStatus.textContent = '';
    }

    posterPdfEl.focus();
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
// Schedule tabs
// =========================

function syncDayTabIndicator(selectedTab) {
  const tabList =
    selectedTab?.closest('.day-tabs');

  if (!tabList) return;

  let indicator =
    tabList.querySelector(
      '.day-tabs-indicator'
    );

  if (!indicator) {
    indicator = document.createElement('span');
    indicator.className =
      'day-tabs-indicator';
    indicator.setAttribute(
      'aria-hidden',
      'true'
    );
    tabList.prepend(indicator);
  }

  indicator.style.width =
    `${selectedTab.offsetWidth}px`;
  indicator.style.height =
    `${selectedTab.offsetHeight}px`;
  indicator.style.transform =
    `translate3d(${selectedTab.offsetLeft}px, ${selectedTab.offsetTop}px, 0)`;

  tabList.classList.add(
    'is-slider-ready'
  );
}

let dayTabIndicatorFrame = null;

function refreshDayTabIndicators() {
  dayTabIndicatorFrame = null;

  document.querySelectorAll(
    '.day-tabs'
  ).forEach((tabList) => {
    syncDayTabIndicator(
      tabList.querySelector(
        '.day-tab.is-active'
      )
    );
  });
}

function queueDayTabIndicatorRefresh() {
  if (dayTabIndicatorFrame !== null) {
    return;
  }

  dayTabIndicatorFrame =
    window.requestAnimationFrame(
      refreshDayTabIndicators
    );
}

window.addEventListener(
  'resize',
  queueDayTabIndicatorRefresh
);

if (document.fonts?.ready) {
  document.fonts.ready.then(
    queueDayTabIndicatorRefresh
  );
}

const scheduleTabs = Array.from(
  document.querySelectorAll('.schedule-tab')
);

const schedulePanels = Array.from(
  document.querySelectorAll('.schedule-panel')
);

function activateScheduleTab(
  selectedTab,
  { moveFocus = false } = {}
) {
  const selectedDay =
    selectedTab?.dataset.scheduleDay;

  if (!selectedDay) return;

  scheduleTabs.forEach((tab) => {
    const isSelected =
      tab === selectedTab;

    tab.classList.toggle(
      'is-active',
      isSelected
    );

    tab.setAttribute(
      'aria-selected',
      isSelected ? 'true' : 'false'
    );

    tab.tabIndex = isSelected ? 0 : -1;
  });

  schedulePanels.forEach((panel) => {
    panel.hidden =
      panel.dataset.schedulePanel !==
      selectedDay;
  });

  syncDayTabIndicator(selectedTab);

  if (moveFocus) {
    selectedTab.focus();
  }
}

if (
  scheduleTabs.length &&
  schedulePanels.length
) {
  document.documentElement.classList.add(
    'schedule-tabs-ready'
  );

  scheduleTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      activateScheduleTab(tab);
    });

    tab.addEventListener(
      'keydown',
      (event) => {
        let nextIndex = null;

        if (event.key === 'ArrowRight') {
          nextIndex =
            (index + 1) %
            scheduleTabs.length;
        }

        if (event.key === 'ArrowLeft') {
          nextIndex =
            (index - 1 +
              scheduleTabs.length) %
            scheduleTabs.length;
        }

        if (event.key === 'Home') {
          nextIndex = 0;
        }

        if (event.key === 'End') {
          nextIndex =
            scheduleTabs.length - 1;
        }

        if (nextIndex === null) return;

        event.preventDefault();

        activateScheduleTab(
          scheduleTabs[nextIndex],
          { moveFocus: true }
        );
      }
    );
  });

  const initialScheduleTab =
    scheduleTabs.find((tab) =>
      tab.classList.contains('is-active')
    ) || scheduleTabs[0];

  activateScheduleTab(initialScheduleTab);
}

const localInfoVenueTabs = Array.from(
  document.querySelectorAll(
    '.local-info-venue-tab[data-local-info-venue]'
  )
);

const localInfoVenuePanels = Array.from(
  document.querySelectorAll(
    '[data-local-info-venue-panel]'
  )
);

const localInfoVenueContent = Array.from(
  document.querySelectorAll(
    '[data-local-info-venue-content]'
  )
);

function activateLocalInfoVenueTab(
  selectedTab,
  { moveFocus = false } = {}
) {
  const selectedVenue =
    selectedTab?.dataset.localInfoVenue;

  if (!selectedVenue) return;

  localInfoVenueTabs.forEach((tab) => {
    const isSelected = tab === selectedTab;

    tab.classList.toggle(
      'is-active',
      isSelected
    );

    tab.setAttribute(
      'aria-selected',
      isSelected ? 'true' : 'false'
    );

    tab.tabIndex = isSelected ? 0 : -1;
  });

  localInfoVenuePanels.forEach((panel) => {
    panel.hidden =
      panel.dataset.localInfoVenuePanel !==
      selectedVenue;
  });

  localInfoVenueContent.forEach((content) => {
    content.hidden =
      content.dataset.localInfoVenueContent !==
      selectedVenue;
  });

  syncDayTabIndicator(selectedTab);

  if (moveFocus) {
    selectedTab.focus();
  }
}

if (
  localInfoVenueTabs.length &&
  localInfoVenuePanels.length
) {
  localInfoVenueTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      activateLocalInfoVenueTab(tab);
    });

    tab.addEventListener(
      'keydown',
      (event) => {
        let nextIndex = null;

        if (event.key === 'ArrowRight') {
          nextIndex =
            (index + 1) %
            localInfoVenueTabs.length;
        }

        if (event.key === 'ArrowLeft') {
          nextIndex =
            (index - 1 +
              localInfoVenueTabs.length) %
            localInfoVenueTabs.length;
        }

        if (event.key === 'Home') {
          nextIndex = 0;
        }

        if (event.key === 'End') {
          nextIndex =
            localInfoVenueTabs.length - 1;
        }

        if (nextIndex === null) return;

        event.preventDefault();

        activateLocalInfoVenueTab(
          localInfoVenueTabs[nextIndex],
          { moveFocus: true }
        );
      }
    );
  });

  const initialLocalInfoVenueTab =
    localInfoVenueTabs.find((tab) =>
      tab.classList.contains('is-active')
    ) || localInfoVenueTabs[0];

  activateLocalInfoVenueTab(
    initialLocalInfoVenueTab
  );
}

// =========================
// Navigation
// =========================

let navDropdownCloseTimer = null;
let navDropdownCleanupTimer = null;
let navDropdownOpenTimer = null;
let mobileNavScrollPosition = null;
let mobileNavScrollRestoration = null;
let anchorScrollRequestId = 0;

function setNavDropdownHeight(height) {
  const normalizedHeight = Math.max(
    0,
    Math.ceil(height)
  );

  document.documentElement.style.setProperty(
    '--nav-dropdown-height',
    `${normalizedHeight}px`
  );
}

function measureNavDropdownHeight(dropdown) {
  const menu = dropdown.querySelector(
    '.nav-dropdown-menu'
  );
  const content = dropdown.querySelector(
    '.nav-dropdown-content'
  );

  if (!menu || !content) return 0;

  const menuStyles = window.getComputedStyle(menu);

  return (
    content.getBoundingClientRect().height +
    (parseFloat(menuStyles.paddingTop) || 0) +
    (parseFloat(menuStyles.paddingBottom) || 0) +
    (parseFloat(menuStyles.borderTopWidth) || 0) +
    (parseFloat(menuStyles.borderBottomWidth) || 0)
  );
}

function clearNavDropdownCleanup() {
  if (navDropdownCleanupTimer !== null) {
    window.clearTimeout(
      navDropdownCleanupTimer
    );
    navDropdownCleanupTimer = null;
  }

  navDropdowns.forEach((dropdown) => {
    dropdown.classList.remove(
      'is-closing'
    );
  });

  document.body.classList.remove(
    'has-nav-dropdown-closing'
  );
}

function syncOpenNavDropdownHeight() {
  if (usesCompactNavLayout()) return;

  const openDropdown = Array.from(
    navDropdowns
  ).find((dropdown) =>
    dropdown.classList.contains('is-open')
  );

  if (!openDropdown) return;

  setNavDropdownHeight(
    measureNavDropdownHeight(openDropdown)
  );
}

function cancelNavDropdownClose() {
  if (navDropdownCloseTimer === null) {
    return;
  }

  window.clearTimeout(
    navDropdownCloseTimer
  );
  navDropdownCloseTimer = null;
}

function cancelNavDropdownOpen() {
  if (navDropdownOpenTimer === null) {
    return;
  }

  window.clearTimeout(
    navDropdownOpenTimer
  );
  navDropdownOpenTimer = null;
}

function scheduleNavDropdownOpen(dropdown) {
  cancelNavDropdownClose();
  cancelNavDropdownOpen();

  const openDropdown = Array.from(
    navDropdowns
  ).find((item) =>
    item.classList.contains('is-open')
  );

  if (openDropdown === dropdown) {
    return;
  }

  navDropdownOpenTimer =
    window.setTimeout(() => {
      navDropdownOpenTimer = null;

      if (!dropdown.matches(':hover')) {
        return;
      }

      openNavDropdown(dropdown);
    }, NAV_DROPDOWN_HOVER_DELAY_MS);
}

function scheduleNavDropdownClose(dropdown) {
  cancelNavDropdownClose();

  navDropdownCloseTimer =
    window.setTimeout(() => {
      navDropdownCloseTimer = null;

      if (
        dropdown.matches(':hover') ||
        dropdown.contains(
          document.activeElement
        )
      ) {
        return;
      }

      closeNavDropdown(dropdown);
    }, NAV_DROPDOWN_CLOSE_DELAY_MS);
}

function closeNavDropdowns(
  exceptDropdown = null
) {
  cancelNavDropdownClose();
  cancelNavDropdownOpen();

  const shouldRollUp =
    !exceptDropdown &&
    !usesCompactNavLayout();
  let hasClosingDropdown = false;

  if (!shouldRollUp) {
    clearNavDropdownCleanup();
  }

  navDropdowns.forEach((dropdown) => {
    if (dropdown !== exceptDropdown) {
      const wasOpen =
        dropdown.classList.contains(
          'is-open'
        );
      const trigger = dropdown.querySelector(
        '.nav-dropdown-trigger'
      );

      dropdown.classList.remove('is-open');

      if (shouldRollUp && wasOpen) {
        dropdown.classList.add(
          'is-closing'
        );
        hasClosingDropdown = true;
      } else {
        dropdown.classList.remove(
          'is-closing'
        );
      }

      trigger?.setAttribute(
        'aria-expanded',
        'false'
      );
    }
  });

  if (!exceptDropdown) {
    setNavDropdownHeight(0);
  }

  document.body.classList.toggle(
    'has-nav-dropdown-open',
    Boolean(exceptDropdown) &&
      !usesCompactNavLayout()
  );

  if (hasClosingDropdown) {
    document.body.classList.add(
      'has-nav-dropdown-closing'
    );

    navDropdownCleanupTimer =
      window.setTimeout(() => {
        navDropdowns.forEach((dropdown) => {
          dropdown.classList.remove(
            'is-closing'
          );
        });
        document.body.classList.remove(
          'has-nav-dropdown-closing'
        );
        navDropdownCleanupTimer = null;
      }, NAV_DROPDOWN_TRANSITION_MS);
  }
}

function openNavDropdown(dropdown) {
  cancelNavDropdownClose();
  cancelNavDropdownOpen();
  clearNavDropdownCleanup();
  syncNavDropdownAnchor(dropdown);

  dropdown.classList.add('is-open');
  dropdown
    .querySelector('.nav-dropdown-trigger')
    ?.setAttribute('aria-expanded', 'true');

  setNavDropdownHeight(
    measureNavDropdownHeight(dropdown)
  );

  // Open the destination before closing the previous item so the shared
  // surface can morph between heights without flashing shut.
  closeNavDropdowns(dropdown);
  document.body.classList.add(
    'has-nav-dropdown-open'
  );
  document.body.classList.remove(
    'has-nav-dropdown-closing'
  );
}

function closeNavDropdown(dropdown) {
  if (
    !dropdown.classList.contains(
      'is-open'
    )
  ) {
    return;
  }

  closeNavDropdowns();
}

function openNav() {
  if (!siteNav || !navToggle) return;

  cancelPendingAnchorScroll();
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

  if (usesCompactNavLayout()) {
    // iOS Safari can scroll the page despite overflow: hidden. Pin the body
    // at its current offset and remember where to return when the menu closes.
    if (mobileNavScrollPosition === null) {
      mobileNavScrollPosition = {
        left: window.scrollX,
        top: window.scrollY
      };
      document.body.style.setProperty(
        '--mobile-nav-scroll-top',
        `${-mobileNavScrollPosition.top}px`
      );
    }

    document.body.classList.add(
      'has-mobile-nav-open'
    );

    // The menu owns the header while the page is pinned. Cancel any pending
    // scroll animation before it can move the menu or make it inert.
    stopSiteHeaderAnimation();
    siteHeaderTargetProgress = 0;
    siteHeaderRenderedProgress = 0;
    renderSiteHeaderVisibility(0);

    navDropdowns.forEach((dropdown) => {
      dropdown
        .querySelector('.nav-dropdown-trigger')
        ?.setAttribute('aria-expanded', 'true');
    });
  }
}

function closeNav() {
  if (!siteNav || !navToggle) return;

  closeNavDropdowns();

  siteNav.classList.remove('open');
  navToggle.classList.remove('is-open');
  document.body.classList.remove(
    'has-mobile-nav-open'
  );

  if (mobileNavScrollPosition !== null) {
    const scrollPosition = mobileNavScrollPosition;
    mobileNavScrollPosition = null;
    document.body.style.removeProperty('--mobile-nav-scroll-top');
    // Restore synchronously, before a clicked section link measures its target.
    window.scrollTo({ ...scrollPosition, behavior: 'instant' });

    // iOS can coalesce an instant restore and a smooth scroll in the same
    // rendering update, starting the animation at the pinned page's offset (0).
    // Keep restoration separate and allow a rendered frame before animating.
    const restoration = new Promise((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(resolve);
      });
    });
    mobileNavScrollRestoration = restoration;
    restoration.then(() => {
      if (mobileNavScrollRestoration === restoration) {
        mobileNavScrollRestoration = null;
      }
    });
    queueSiteHeaderVisibilitySync();
  }

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
      () => {
        if (
          link.classList.contains(
            'nav-dropdown-trigger'
          ) &&
          !canHoverNavDropdowns() &&
          !usesCompactNavLayout()
        ) {
          return;
        }

        closeNav();
      }
    );
  });

  // Listen to the breakpoint itself: WebKit can update media queries after
  // firing resize. Browser-toolbar height changes must leave the menu open.
  if (typeof NAV_COMPACT_MEDIA_QUERY.addEventListener === 'function') {
    NAV_COMPACT_MEDIA_QUERY.addEventListener('change', closeNav);
  } else if (typeof NAV_COMPACT_MEDIA_QUERY.addListener === 'function') {
    NAV_COMPACT_MEDIA_QUERY.addListener(closeNav);
  }

  window.addEventListener(
    'resize',
    () => {
      if (!usesCompactNavLayout()) {
        window.requestAnimationFrame(
          syncOpenNavDropdownHeight
        );
      }
    }
  );
}

function canHoverNavDropdowns() {
  return (
    !usesCompactNavLayout() &&
    window.matchMedia(
      '(hover: hover) and (pointer: fine)'
    ).matches
  );
}

navDropdowns.forEach((dropdown) => {
  const trigger = dropdown.querySelector(
    '.nav-dropdown-trigger'
  );

  if (!trigger) return;

  trigger.addEventListener('click', (event) => {
    if (usesCompactNavLayout()) {
      return;
    }

    if (canHoverNavDropdowns()) return;

    if (
      !dropdown.classList.contains(
        'is-open'
      )
    ) {
      event.preventDefault();
      event.stopPropagation();
      openNavDropdown(dropdown);
      return;
    }

    closeNav();
  });

  dropdown.addEventListener(
    'pointerenter',
    () => {
      if (!canHoverNavDropdowns()) return;

      scheduleNavDropdownOpen(dropdown);
    }
  );

  dropdown.addEventListener(
    'pointerleave',
    () => {
      if (!canHoverNavDropdowns()) {
        return;
      }

      cancelNavDropdownOpen();

      const openDropdown = Array.from(
        navDropdowns
      ).find((item) =>
        item.classList.contains('is-open')
      );

      if (
        !openDropdown ||
        openDropdown.contains(
          document.activeElement
        )
      ) {
        return;
      }

      scheduleNavDropdownClose(openDropdown);
    }
  );

  dropdown.addEventListener(
    'focusin',
    (event) => {
      cancelNavDropdownClose();

      if (
        usesCompactNavLayout() ||
        dropdown.classList.contains(
          'suppress-focus-open'
        ) ||
        (!canHoverNavDropdowns() &&
          !event.target.matches(
            ':focus-visible'
          ))
      ) {
        return;
      }

      openNavDropdown(dropdown);
    }
  );

  dropdown.addEventListener(
    'focusout',
    () => {
      window.requestAnimationFrame(() => {
        if (
          dropdown.contains(
            document.activeElement
          ) ||
          (canHoverNavDropdowns() &&
            dropdown.matches(':hover'))
        ) {
          return;
        }

        closeNavDropdown(dropdown);
      });
    }
  );
});

navBackdrop?.addEventListener('click', () => {
  if (usesCompactNavLayout()) {
    closeNav();
    return;
  }

  closeNavDropdowns();
});

document.addEventListener('click', (event) => {
  if (
    !event.target.closest(
      '[data-nav-dropdown], .nav-toggle'
    )
  ) {
    closeNavDropdowns();
  }

  if (
    usesCompactNavLayout() &&
    siteNav?.classList.contains('open') &&
    !event.target.closest('.site-nav') &&
    !event.target.closest('.nav-toggle')
  ) {
    closeNav();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;

  const openDropdown = Array.from(
    navDropdowns
  ).find((dropdown) =>
    dropdown.classList.contains(
      'is-open'
    )
  );

  if (openDropdown) {
    const trigger =
      openDropdown.querySelector(
        '.nav-dropdown-trigger'
      );

    openDropdown.classList.add(
      'suppress-focus-open'
    );
    closeNavDropdowns();
    trigger?.focus({ preventScroll: true });

    window.requestAnimationFrame(() => {
      openDropdown.classList.remove(
        'suppress-focus-open'
      );
    });

    return;
  }

  if (siteNav?.classList.contains('open')) {
    closeNav();
    navToggle?.focus({ preventScroll: true });
  }
});

function getSiteHeaderTargetProgress() {
  const headerHeight = getSiteHeaderHeight();
  const hideStart =
    headerHeight + SITE_HEADER_HEADING_CLEARANCE_PX;
  const scrollPastHideStart =
    hideStart -
    supportersHeading.getBoundingClientRect().top;
  const hideScrollDistance = Math.max(
    headerHeight * SITE_HEADER_HIDE_SCROLL_MULTIPLIER,
    1
  );
  const hideProgress = Math.min(
    Math.max(scrollPastHideStart / hideScrollDistance, 0),
    1
  );

  return hideProgress;
}

function easeSiteHeaderProgress(progress) {
  return progress * progress * (3 - 2 * progress);
}

function renderSiteHeaderVisibility(progress) {
  if (!siteHeader) return;

  const keepHeaderVisible =
    SUPPORTERS_REDUCED_MOTION_QUERY.matches || isMobileNavOpen();
  const clampedProgress = keepHeaderVisible
    ? 0
    : Math.min(Math.max(progress, 0), 1);
  const movementProgress = easeSiteHeaderProgress(
    clampedProgress
  );
  const contentFadeProgress = Math.min(
    Math.max(
      (clampedProgress -
        SITE_HEADER_CONTENT_FADE_START_PROGRESS) /
        (1 - SITE_HEADER_CONTENT_FADE_START_PROGRESS),
      0
    ),
    1
  );
  const easedContentFadeProgress = easeSiteHeaderProgress(
    contentFadeProgress
  );
  const headerHeight = getSiteHeaderHeight();
  const maxHideOffset = headerHeight + SECTION_ANCHOR_OVERLAP;
  // Scrolling moves the heading immediately; the damped animation can lag.
  // Keep this clearance even before the animation has caught up.
  const clearanceOffset = !keepHeaderVisible && supportersHeading
    ? Math.max(
        headerHeight + SITE_HEADER_HEADING_CLEARANCE_PX -
          supportersHeading.getBoundingClientRect().top,
        0
      )
    : 0;
  const hideOffset = Math.min(
    Math.max(movementProgress * maxHideOffset, clearanceOffset),
    maxHideOffset
  );
  const contentOpacity = 1 - easedContentFadeProgress;
  const shouldStartHiding = hideOffset > 0;
  const isFullyHidden = hideOffset >= maxHideOffset - 0.01;

  if (shouldStartHiding) {
    // Share the translation with the viewport-fixed surface and backdrop,
    // which are siblings of the header rather than transformed descendants.
    document.documentElement.style.setProperty(
      '--site-header-hide-offset',
      `${hideOffset.toFixed(3)}px`
    );
    siteHeader.style.setProperty(
      '--site-header-content-opacity',
      contentOpacity.toFixed(4)
    );
  } else {
    document.documentElement.style.removeProperty(
      '--site-header-hide-offset'
    );
    siteHeader.style.removeProperty(
      '--site-header-content-opacity'
    );
  }

  siteHeader.classList.toggle(
    'is-hiding-past-supporters',
    shouldStartHiding
  );
  siteHeader.classList.toggle(
    'is-hidden-past-supporters',
    isFullyHidden
  );
  siteHeader.inert = isFullyHidden;

  // A dropdown can be reopened while the header is only partially hidden.
  // Do not leave its separate background open after its links leave view.
  if (isFullyHidden && document.body.classList.contains('has-nav-dropdown-open')) {
    closeNavDropdowns();
  }
}

function stopSiteHeaderAnimation() {
  if (siteHeaderAnimationFrame !== null) {
    window.cancelAnimationFrame(siteHeaderAnimationFrame);
  }

  siteHeaderAnimationFrame = null;
  siteHeaderAnimationTimestamp = null;
}

function animateSiteHeaderVisibility(timestamp) {
  siteHeaderAnimationFrame = null;

  const elapsed =
    siteHeaderAnimationTimestamp === null
      ? 1000 / 60
      : Math.min(timestamp - siteHeaderAnimationTimestamp, 64);
  siteHeaderAnimationTimestamp = timestamp;
  const damping =
    1 - Math.exp(-elapsed / SITE_HEADER_DAMPING_TIME_MS);

  siteHeaderRenderedProgress +=
    (siteHeaderTargetProgress - siteHeaderRenderedProgress) *
    damping;

  if (
    Math.abs(
      siteHeaderTargetProgress - siteHeaderRenderedProgress
    ) < 0.001
  ) {
    siteHeaderRenderedProgress = siteHeaderTargetProgress;
  }

  renderSiteHeaderVisibility(siteHeaderRenderedProgress);

  if (siteHeaderRenderedProgress !== siteHeaderTargetProgress) {
    siteHeaderAnimationFrame = window.requestAnimationFrame(
      animateSiteHeaderVisibility
    );
  } else {
    siteHeaderAnimationTimestamp = null;
  }
}

function startSiteHeaderAnimation() {
  if (siteHeaderAnimationFrame !== null) return;

  siteHeaderAnimationFrame = window.requestAnimationFrame(
    animateSiteHeaderVisibility
  );
}

// Start hiding while there is still space above "Supported By", so the heading
// does not have to touch the panel before the upward glide begins.
function syncSiteHeaderVisibility() {
  siteHeaderVisibilityFrame = null;

  if (!siteHeader || !supportersHeading) return;

  // Static supporter logos do not need the header/blur workaround.
  // Also restore the header if this preference changes while it is hidden.
  // A pinned page can produce transient geometry during viewport changes.
  // Never let those measurements dismiss or hide an active mobile menu.
  if (SUPPORTERS_REDUCED_MOTION_QUERY.matches || isMobileNavOpen()) {
    stopSiteHeaderAnimation();
    siteHeaderTargetProgress = 0;
    siteHeaderRenderedProgress = 0;
    renderSiteHeaderVisibility(0);
    return;
  }

  const nextTargetProgress = getSiteHeaderTargetProgress();
  const wasAtStart = siteHeaderTargetProgress === 0;
  siteHeaderTargetProgress = nextTargetProgress;

  if (nextTargetProgress > 0 && wasAtStart) {
    closeNavDropdowns();
    closeNav();
  }

  if (!siteHeaderAnimationInitialized) {
    siteHeaderAnimationInitialized = true;
    siteHeaderRenderedProgress = nextTargetProgress;
    renderSiteHeaderVisibility(siteHeaderRenderedProgress);
    return;
  }

  startSiteHeaderAnimation();
}

function queueSiteHeaderVisibilitySync() {
  if (siteHeaderVisibilityFrame !== null) return;

  siteHeaderVisibilityFrame = window.requestAnimationFrame(
    syncSiteHeaderVisibility
  );
}

window.addEventListener(
  'scroll',
  queueSiteHeaderVisibilitySync,
  { passive: true }
);

window.addEventListener(
  'resize',
  queueSiteHeaderVisibilitySync
);

queueSiteHeaderVisibilitySync();

// =========================
// Smooth scrolling
// =========================

function cancelPendingAnchorScroll() {
  anchorScrollRequestId += 1;
}

// A fresh gesture must win over a navigation waiting for scroll restoration.
['touchstart', 'wheel', 'keydown'].forEach((eventType) => {
  document.addEventListener(eventType, cancelPendingAnchorScroll, {
    passive: true
  });
});

document.addEventListener(
  'click',
  async (event) => {
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
    const requestId = ++anchorScrollRequestId;

    if (usesCompactNavLayout()) {
      closeNav();
    }

    if (mobileNavScrollRestoration) {
      await mobileNavScrollRestoration;
      if (requestId !== anchorScrollRequestId) return;
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

    const offset =
      getSectionAnchorOffset();

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
      if (
        event.key === 'Escape' &&
        attendanceSelectWrap.classList.contains(
          'is-open'
        )
      ) {
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

const materialTabs = Array.from(
  document.querySelectorAll(
    '.materials-tab'
  )
);

const MATERIALS = {
  monday: [
    {
      title: 'PIC1 pinched manifolds are flat or compact',
      speaker: 'Felix Schulze',
      affiliation: 'University of Warwick, UK',
      pdf: 'pdfs/felix-schulze.pdf'
    },
    {
      title: 'Inverse mean curvature flow and applications',
      speaker: 'Alessandra Pluda',
      affiliation: 'Università di Pisa, Italy',
      pdf: 'pdfs/alessandra-pluda.pdf'
    },
    {
      title: 'Stable Free-Boundary Minimal Hypersurfaces: Regularity, Compactness, and Existence',
      speaker: 'Davide Parise',
      affiliation: 'Imperial College London, UK',
      pdf: 'pdfs/davide-parise.pdf'
    },
    {
      title: 'Singularity models for the one-phase free boundary problem',
      speaker: 'Zihui Zhao',
      affiliation: 'Johns Hopkins University, USA',
      pdf: 'pdfs/zihui-zhao.pdf'
    },
    {
      title: 'Zoll families of minimal spheres and min-max theory',
      speaker: 'Lucas Ambrozio',
      affiliation: 'IMPA, Brazil',
      pdf: 'pdfs/lucas-ambrozio.pdf'
    }
  ],

  tuesday: [
    {
      title: 'Some recent existence and regularity results of the Brakke flow',
      speaker: 'Yoshihiro Tonegawa',
      affiliation: 'Institute of Science Tokyo, Japan',
      pdf: 'pdfs/yoshihiro-tonegawa.pdf'
    },
    {
      title: 'Stability of extremal domains',
      speaker: 'Marcos Petrucio Cavalcante',
      affiliation: 'Universidade Federal de Alagoas, Brazil',
      pdf: 'pdfs/marcos-petrucio-cavalcante.pdf'
    },
    {
      title: 'A non local PDE model for fire fronts',
      speaker: 'Valentina Wheeler',
      affiliation: 'University of Wollongong, Australia',
      pdf: 'pdfs/valentina-wheeler.pdf'
    },
    {
      title: 'Band Width Estimates and Rigidity of Manifolds with Negative Curvature',
      speaker: 'Tiarlos Cruz',
      affiliation: 'Universidade Federal de Alagoas, Brazil',
      pdf: 'pdfs/tiarlos-cruz.pdf'
    }
  ],

  wednesday: [
    {
      title: 'On a Fully Nonlinear Conformal Flow',
      speaker: 'María Fernanda Espinal',
      affiliation: 'Universidad Técnica Federico Santa María, Chile',
      pdf: 'pdfs/maria-fernanda-espinal.pdf'
    },
    {
      title: 'Quantitative stability for the fractional Yamabe problem',
      speaker: 'Benjamín Bórquez',
      affiliation: 'University of California, Santa Cruz',
      pdf: 'pdfs/benjamin-borquez.pdf'
    }
  ],

  thursday: [
    {
      title: 'Potentials for sub-Laplacians and geometric applications',
      speaker: 'Jie Qing',
      affiliation: 'University of California, Santa Cruz, USA',
      pdf: 'pdfs/jie-qing.pdf'
    },
    {
      title: 'A Nonlinear Operator Approach to Black Hole Solution Classes in the Ernst Equation',
      speaker: 'Jessica Trespalacios',
      affiliation: 'Universidad Austral de Chile, Chile',
      pdf: 'pdfs/jessica-trespalacios.pdf'
    },
    {
      title: 'Isoparametric functions and Hardy-Sobolev type equations on riemannian manifolds',
      speaker: 'Guillermo Henry',
      affiliation: 'Universidad de Buenos Aires, Argentina',
      pdf: 'pdfs/guillermo-henry.pdf'
    },
    {
      title: 'Towards Yau’s Conjecture: a new estimate for the first eigenvalue of the laplacian of minimal hypersurfaces',
      speaker: 'Asun Jimenez',
      affiliation: 'Universidade Federal Fluminense, Brazil',
      pdf: 'pdfs/asun-jimenez.pdf'
    }
  ],

  friday: [
    {
      title: 'Convergence of Timed-Metric Spaces and Causality',
      speaker: 'Raquel Perales',
      affiliation: 'CIMAT, Guanajuato, México',
      pdf: 'pdfs/raquel-perales.pdf?v=20260831-01'
    },
    {
      title: 'Exponential growth of commensurability classes of almost totally geodesic surface subgroups in hyperbolic 3-manifolds',
      speaker: 'Franco Vargas',
      affiliation: 'IMPA, Brazil',
      pdf: 'pdfs/franco-vargas.pdf'
    },
    {
      title: 'Higher Codimensional Isoperimetric Problems',
      speaker: 'Frank Pacard',
      affiliation: 'École Polytechnique, France',
      pdf: 'pdfs/frank-pacard.pdf'
    }
  ]
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
  function activateMaterialsTab(
    selectedTab,
    { moveFocus = false } = {}
  ) {
    currentMaterialsDay =
      selectedTab?.dataset.day;

    if (!currentMaterialsDay) return;

    materialTabs.forEach(
      (button) => {
        const isActive =
          button === selectedTab;

        button.classList.toggle(
          'is-active',
          isActive
        );

        button.setAttribute(
          'aria-selected',
          isActive ? 'true' : 'false'
        );

        button.tabIndex =
          isActive ? 0 : -1;
      }
    );

    materialsGrid.setAttribute(
      'aria-labelledby',
      selectedTab.id
    );

    syncDayTabIndicator(selectedTab);

    renderMaterials(
      currentMaterialsDay
    );

    if (moveFocus) {
      selectedTab.focus();
    }
  }

  materialTabs.forEach((tab, index) => {
    tab.addEventListener(
      'click',
      () => {
        activateMaterialsTab(tab);
      }
    );

    tab.addEventListener(
      'keydown',
      (event) => {
        let nextIndex = null;

        if (event.key === 'ArrowRight') {
          nextIndex =
            (index + 1) %
            materialTabs.length;
        }

        if (event.key === 'ArrowLeft') {
          nextIndex =
            (index - 1 +
              materialTabs.length) %
            materialTabs.length;
        }

        if (event.key === 'Home') {
          nextIndex = 0;
        }

        if (event.key === 'End') {
          nextIndex =
            materialTabs.length - 1;
        }

        if (nextIndex === null) return;

        event.preventDefault();

        activateMaterialsTab(
          materialTabs[nextIndex],
          { moveFocus: true }
        );
      }
    );
  });

  const initialMaterialsTab =
    materialTabs.find((tab) =>
      tab.classList.contains('is-active')
    ) || materialTabs[0];

  activateMaterialsTab(
    initialMaterialsTab
  );
}
