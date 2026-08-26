const DUPLICATE_CONFIG = Object.freeze({
  sourceSheet: 'Editable_view_only_registration',
  outputSheet: 'Possible_duplicates',
  decisionsSheet: '_Duplicate_decisions',

  // Candidates scoring at least 60 appear in the detailed sheet.
  minimumScore: 60,

  // Candidates scoring 90 or more are considered high-confidence.
  highConfidenceScore: 90,
});

const DUPLICATE_HEADERS = [
  'Candidate group',
  'ID A',
  'Name A',
  'Email A',
  'ID B',
  'Name B',
  'Email B',
  'Affiliation match',
  'Country match',
  'Score',
  'Reasons',
  'Status',
  'Candidate group size',
  'Confirmed excess registrations',
  'Confirmed cluster',
  'Confirmed cluster size',
  'Effective status',
  'Review warning',
  'Timestamp A',
  'Timestamp B',
  'Affiliation A',
  'Affiliation B',
  'Country A',
  'Country B',
  'Submission key A',
  'Submission key B',
];

/**
 * Adds a menu to Google Sheets when the spreadsheet is opened.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Duplicate review')
    .addItem(
      'Refresh possible duplicates',
      'refreshPossibleDuplicates'
    )
    .addItem(
      'Recalculate confirmed totals',
      'recalculateConfirmedDuplicates'
    )
    .addToUi();
}

/**
 * Recalculates derived confirmed clusters immediately after
 * a user changes one or more Status cells.
 */
function onEdit(event) {
  if (!event || !event.range) {
    return;
  }

  const sheet = event.range.getSheet();

  if (
    sheet.getName() !==
    DUPLICATE_CONFIG.outputSheet
  ) {
    return;
  }

  const statusColumn =
    dupFindOutputColumn_(sheet, [
      'Status',
    ]);

  if (
    statusColumn < 1 ||
    event.range.getColumn() >
      statusColumn ||
    event.range.getLastColumn() <
      statusColumn
  ) {
    return;
  }

  const lock =
    LockService.getDocumentLock();

  if (!lock.tryLock(5000)) {
    return;
  }

  try {
    const spreadsheet =
      event.source ||
      SpreadsheetApp.getActiveSpreadsheet();

    dupPersistOutputStatuses_(
      spreadsheet,
      sheet
    );

    const result =
      dupRecalculateConfirmedReview_(sheet);

    if (result.conflictCount > 0) {
      spreadsheet.toast(
        result.conflictCount +
          ' contradictory pair decision(s); ' +
          'affected excess counts were excluded.',
        'Duplicate review conflict',
        8
      );
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * Main function.
 */
function refreshPossibleDuplicates() {
  return dupWithDocumentLock_(
    dupRefreshPossibleDuplicates_
  );
}

/**
 * Manual fallback for recalculating derived values.
 */
function recalculateConfirmedDuplicates() {
  return dupWithDocumentLock_(function () {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const output = spreadsheet.getSheetByName(
      DUPLICATE_CONFIG.outputSheet
    );

    if (!output) {
      throw new Error(
        'Output sheet not found: ' +
          DUPLICATE_CONFIG.outputSheet
      );
    }

    dupPersistOutputStatuses_(
      spreadsheet,
      output
    );

    const result =
      dupRecalculateConfirmedReview_(output);

    spreadsheet.toast(
      result.confirmedExcess +
        ' confirmed excess registration(s); ' +
        result.conflictCount +
        ' conflict(s).',
      'Duplicate review',
      6
    );
  });
}

/**
 * Main refresh implementation. The public function above
 * runs this while holding a document lock.
 */
function dupRefreshPossibleDuplicates_() {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  const source = spreadsheet.getSheetByName(
    DUPLICATE_CONFIG.sourceSheet
  );

  if (!source) {
    throw new Error(
      'Source sheet not found: ' +
        DUPLICATE_CONFIG.sourceSheet
    );
  }

  let output = spreadsheet.getSheetByName(
    DUPLICATE_CONFIG.outputSheet
  );

  if (!output) {
    output = spreadsheet.insertSheet(
      DUPLICATE_CONFIG.outputSheet
    );
  }

  /*
   * Preserve pair decisions in a hidden ledger. Decisions
   * remain available even when a pair temporarily falls
   * below the candidate threshold and disappears.
   */
  const decisions =
    dupGetOrCreateDecisionsSheet_(
      spreadsheet
    );

  const existingStatuses =
    dupReadDecisionStatuses_(decisions);

  const visibleStatuses =
    dupReadExistingStatuses_(output);

  dupMergeVisibleStatuses_(
    existingStatuses,
    visibleStatuses
  );

  dupWriteDecisionStatuses_(
    decisions,
    existingStatuses
  );

  const records = dupReadRecords_(source);

  dupAssignSubmissionKeys_(records);

  const candidates = [];

  /*
   * Used to combine related candidate pairs into groups.
   */
  const parent = records.map(function (_, index) {
    return index;
  });

  /*
   * Compare every registration with every other registration.
   */
  for (let i = 0; i < records.length; i += 1) {
    for (
      let j = i + 1;
      j < records.length;
      j += 1
    ) {
      const comparison = dupCompare_(
        records[i],
        records[j]
      );

      if (
        comparison.score <
        DUPLICATE_CONFIG.minimumScore
      ) {
        continue;
      }

      candidates.push({
        indexA: i,
        indexB: j,
        a: records[i],
        b: records[j],
        score: comparison.score,
        affiliationLabel:
          comparison.affiliationLabel,
        countryLabel:
          comparison.countryLabel,
        reasons:
          comparison.reasons,
      });

      dupUnion_(parent, i, j);
    }
  }

  /*
   * Sort from greatest score to smallest score.
   */
  candidates.sort(function (left, right) {
    return (
      right.score - left.score ||
      left.a.name.localeCompare(right.a.name) ||
      left.b.name.localeCompare(right.b.name)
    );
  });

  /*
   * Assign group labels such as DUP-001.
   */
  const groupByRoot = new Map();
  let nextGroup = 1;

  candidates.forEach(function (candidate) {
    const root = dupFind_(
      parent,
      candidate.indexA
    );

    if (!groupByRoot.has(root)) {
      groupByRoot.set(
        root,
        'DUP-' +
          String(nextGroup).padStart(3, '0')
      );

      nextGroup += 1;
    }

    candidate.group =
      groupByRoot.get(root);
  });

  /*
   * Count unique source submissions in each score-based
   * candidate group. This is review context only; it is not
   * treated as a confirmed same-person count.
   *
   * For example:
   *
   * 3 submissions create 3 pair rows, but this value is 3.
   * 5 submissions create 10 pair rows, but this value is 5.
   */
  const submissionIndexesByGroup = new Map();

  candidates.forEach(function (candidate) {
    if (
      !submissionIndexesByGroup.has(
        candidate.group
      )
    ) {
      submissionIndexesByGroup.set(
        candidate.group,
        new Set()
      );
    }

    const submissionIndexes =
      submissionIndexesByGroup.get(
        candidate.group
      );

    submissionIndexes.add(
      candidate.indexA
    );

    submissionIndexes.add(
      candidate.indexB
    );
  });

  /*
   * Restore the pair-specific status for each candidate.
   */
  candidates.forEach(function (candidate) {
    const statusKey = dupPairKey_(
      candidate.a.submissionKey,
      candidate.b.submissionKey
    );

    const legacyStatusKey = dupPairKey_(
      candidate.a.id,
      candidate.b.id
    );

    candidate.status =
      existingStatuses.get(statusKey) ||
      existingStatuses.get(legacyStatusKey) ||
      'Pending';
  });

  /*
   * Build a second graph using only confirmed pair edges.
   * Candidate grouping never contributes directly to the
   * participant deduction.
   */
  const confirmedReview =
    dupDeriveConfirmedReview_(
      candidates.map(function (candidate) {
        return {
          keyA: candidate.a.submissionKey,
          keyB: candidate.b.submissionKey,
          status: candidate.status,
        };
      })
    );

  /*
   * Build the pair rows written to Possible_duplicates.
   */
  const rows = candidates.map(function (
    candidate,
    index
  ) {
    const derived =
      confirmedReview.rows[index];

    const candidateGroupSize =
      submissionIndexesByGroup
        .get(candidate.group)
        .size;

    return [
      candidate.group,
      candidate.a.id,
      candidate.a.name,
      candidate.a.email,
      candidate.b.id,
      candidate.b.name,
      candidate.b.email,
      candidate.affiliationLabel,
      candidate.countryLabel,
      candidate.score,
      candidate.reasons.join('; '),
      candidate.status,
      candidateGroupSize,
      derived.excess,
      derived.cluster,
      derived.clusterSize,
      derived.effectiveStatus,
      derived.warning,
      candidate.a.timestamp,
      candidate.b.timestamp,
      candidate.a.affiliation,
      candidate.b.affiliation,
      candidate.a.country,
      candidate.b.country,
      candidate.a.submissionKey,
      candidate.b.submissionKey,
    ];
  });

  /*
   * This function safely handles rows.length === 0.
   */
  dupWriteOutput_(output, rows);

  const highConfidenceGroups = new Set(
    candidates
      .filter(function (candidate) {
        return (
          candidate.score >=
          DUPLICATE_CONFIG.highConfidenceScore
        );
      })
      .map(function (candidate) {
        return candidate.group;
      })
  ).size;

  const submissionsInvolved =
    Array.from(
      submissionIndexesByGroup.values()
    ).reduce(function (total, indexes) {
      return total + indexes.size;
    }, 0);

  spreadsheet.toast(
    rows.length +
      ' candidate pair(s) across ' +
      submissionIndexesByGroup.size +
      ' group(s), involving ' +
      submissionsInvolved +
      ' submission(s); ' +
      highConfidenceGroups +
      ' high-confidence group(s); ' +
      confirmedReview.confirmedExcess +
      ' confirmed excess registration(s); ' +
      confirmedReview.conflictCount +
      ' conflict(s).',
    'Duplicate review',
    6
  );
}

/**
 * Reads registration data from the source sheet.
 *
 * It locates columns by their headers instead of relying
 * permanently on their positions.
 */
function dupReadRecords_(sheet) {
  const values =
    sheet.getDataRange().getValues();

  /*
   * Empty sheet or sheet containing only headers.
   */
  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map(function (value) {
    return String(value);
  });

  const columns = {
    id: dupFindHeader_(headers, [
      'ID',
    ]),

    timestamp: dupFindHeader_(headers, [
      'Timestamp',
      'Marca temporal',
      'Fecha',
    ]),

    name: dupFindHeader_(headers, [
      'Nombre',
      'Name',
      'Full name',
    ]),

    email: dupFindHeader_(headers, [
      'Email',
      'Correo',
      'Correo electronico',
    ]),

    affiliation: dupFindHeader_(headers, [
      'Afiliacion',
      'Affiliation',
      'Institucion',
      'Institution',
    ]),

    country: dupFindHeader_(headers, [
      'Pais',
      'Country',
    ]),
  };

  return values
    .slice(1)
    .map(function (row, offset) {
      return {
        sourceRow: offset + 2,

        id: String(
          row[columns.id] || ''
        ).trim(),

        timestamp:
          row[columns.timestamp],

        name: String(
          row[columns.name] || ''
        ).trim(),

        email: String(
          row[columns.email] || ''
        ).trim(),

        affiliation: String(
          row[columns.affiliation] || ''
        ).trim(),

        country: String(
          row[columns.country] || ''
        ).trim(),
      };
    })
    .filter(function (record) {
      return (
        record.id &&
        (record.name || record.email)
      );
    });
}

/**
 * Assigns an immutable-looking key to every submission.
 * A unique registration ID is used directly. If an ID is
 * duplicated, the source row is appended so distinct source
 * records are not collapsed into one graph node.
 */
function dupAssignSubmissionKeys_(records) {
  const idCounts = new Map();

  records.forEach(function (record) {
    const normalizedId =
      dupNormalizeIdentifier_(record.id);

    idCounts.set(
      normalizedId,
      (idCounts.get(normalizedId) || 0) + 1
    );
  });

  records.forEach(function (record) {
    const normalizedId =
      dupNormalizeIdentifier_(record.id);

    record.submissionKey =
      idCounts.get(normalizedId) === 1
        ? normalizedId
        : (
          normalizedId +
          '::source-row-' +
          record.sourceRow
        );
  });
}

/**
 * Compares two registrations and returns a score.
 *
 * Rules:
 *
 * Same registration ID:
 *     100 points
 *
 * Same normalized email:
 *     100 points
 *
 * Otherwise:
 *     Name similarity:        up to 60 points
 *     Affiliation similarity: up to 25 points
 *     Same country:           10 points
 *     Email similarity:       up to 5 points
 */
function dupCompare_(a, b) {
  const idA = String(a.id || '')
    .trim()
    .toLowerCase();

  const idB = String(b.id || '')
    .trim()
    .toLowerCase();

  const exactId = Boolean(
    idA && idA === idB
  );

  const emailA =
    dupNormalizeEmail_(a.email);

  const emailB =
    dupNormalizeEmail_(b.email);

  const exactEmail = Boolean(
    emailA && emailA === emailB
  );

  const nameSimilarity =
    dupNameSimilarity_(
      a.name,
      b.name
    );

  const affiliationSimilarity =
    dupAffiliationSimilarity_(
      a.affiliation,
      b.affiliation
    );

  const countryA =
    dupNormalizeText_(a.country);

  const countryB =
    dupNormalizeText_(b.country);

  const sameCountry = Boolean(
    countryA && countryA === countryB
  );

  const emailHint = exactEmail
    ? 1
    : dupEmailHint_(emailA, emailB);

  let score;

  /*
   * An identical registration ID or an identical
   * normalized email is a perfect match.
   */
  if (exactId || exactEmail) {
    score = 100;
  } else {
    score =
      60 * nameSimilarity +
      25 * affiliationSimilarity +
      10 * (sameCountry ? 1 : 0) +
      5 * emailHint;

    /*
     * Prevent different people from matching merely
     * because they share an institution and country.
     */
    if (nameSimilarity < 0.65) {
      score = Math.min(score, 59);
    }

    if (
      nameSimilarity < 0.75 &&
      affiliationSimilarity < 0.85
    ) {
      score = Math.min(score, 59);
    }
  }

  score = Math.max(
    0,
    Math.min(100, Math.round(score))
  );

  const reasons = [];

  if (exactId) {
    reasons.push(
      'Exact registration ID'
    );
  }

  if (exactEmail) {
    reasons.push(
      'Exact normalized email'
    );
  }

  if (nameSimilarity >= 0.65) {
    reasons.push(
      'Name similarity ' +
        Math.round(nameSimilarity * 100) +
        '%'
    );
  }

  if (affiliationSimilarity >= 0.9) {
    reasons.push(
      'Same/very similar affiliation'
    );
  } else if (
    affiliationSimilarity >= 0.65
  ) {
    reasons.push(
      'Affiliation similarity ' +
        Math.round(
          affiliationSimilarity * 100
        ) +
        '%'
    );
  }

  if (sameCountry) {
    reasons.push('Same country');
  }

  if (
    !exactEmail &&
    emailHint >= 0.8
  ) {
    reasons.push(
      'Similar email username'
    );
  }

  return {
    score: score,

    affiliationLabel:
      affiliationSimilarity >= 0.9
        ? 'Yes'
        : affiliationSimilarity >= 0.65
          ? (
            'Similar (' +
            Math.round(
              affiliationSimilarity * 100
            ) +
            '%)'
          )
          : 'No',

    countryLabel:
      sameCountry ? 'Yes' : 'No',

    reasons: reasons,
  };
}

/**
 * Compares names while accounting for:
 *
 * - Accents
 * - Capitalization
 * - Name order
 * - Additional middle names
 * - Small spelling differences
 */
function dupNameSimilarity_(left, right) {
  const ignored = new Set([
    'dr',
    'dra',
    'prof',
    'professor',
    'sr',
    'sra',
    'mr',
    'mrs',
    'ms',
  ]);

  const tokensA =
    dupNormalizeText_(left)
      .split(' ')
      .filter(function (token) {
        return (
          token &&
          !ignored.has(token)
        );
      });

  const tokensB =
    dupNormalizeText_(right)
      .split(' ')
      .filter(function (token) {
        return (
          token &&
          !ignored.has(token)
        );
      });

  if (
    !tokensA.length ||
    !tokensB.length
  ) {
    return 0;
  }

  const sortedA = tokensA
    .slice()
    .sort()
    .join(' ');

  const sortedB = tokensB
    .slice()
    .sort()
    .join(' ');

  if (sortedA === sortedB) {
    return 1;
  }

  return Math.max(
    dupDiceSimilarity_(sortedA, sortedB),
    dupTokenCoverage_(tokensA, tokensB)
  );
}

/**
 * Compares affiliation names and abbreviations.
 *
 * For example:
 *
 * UTFSM
 * Universidad Técnica Federico Santa María
 */
function dupAffiliationSimilarity_(
  left,
  right
) {
  const normalizedA =
    dupNormalizeText_(left);

  const normalizedB =
    dupNormalizeText_(right);

  if (!normalizedA || !normalizedB) {
    return 0;
  }

  if (normalizedA === normalizedB) {
    return 1;
  }

  const tokensA =
    normalizedA.split(' ');

  const tokensB =
    normalizedB.split(' ');

  const acronymA =
    dupAcronym_(tokensA);

  const acronymB =
    dupAcronym_(tokensB);

  const compactA =
    normalizedA.replace(/\s/g, '');

  const compactB =
    normalizedB.replace(/\s/g, '');

  if (
    compactA.length >= 3 &&
    acronymB.length >= 3 &&
    (
      compactA === acronymB ||
      acronymB.startsWith(compactA) ||
      compactA.startsWith(acronymB)
    )
  ) {
    return 0.95;
  }

  if (
    compactB.length >= 3 &&
    acronymA.length >= 3 &&
    (
      compactB === acronymA ||
      acronymA.startsWith(compactB) ||
      compactB.startsWith(acronymA)
    )
  ) {
    return 0.95;
  }

  if (
    acronymA.length >= 3 &&
    acronymB.length >= 3 &&
    (
      acronymA.startsWith(acronymB) ||
      acronymB.startsWith(acronymA)
    )
  ) {
    return 0.95;
  }

  return Math.max(
    dupDiceSimilarity_(
      normalizedA,
      normalizedB
    ),

    dupTokenCoverage_(
      tokensA,
      tokensB
    )
  );
}

/**
 * Produces an acronym from an affiliation.
 */
function dupAcronym_(tokens) {
  const ignored = new Set([
    'de',
    'del',
    'la',
    'las',
    'el',
    'los',
    'y',
    'e',
    'of',
    'the',
    'and',
  ]);

  return tokens
    .filter(function (token) {
      return (
        token &&
        !ignored.has(token)
      );
    })
    .map(function (token) {
      return token.charAt(0);
    })
    .join('');
}

/**
 * Matches tokens in the shorter value against the most
 * similar unused tokens in the longer value.
 */
function dupTokenCoverage_(tokensA, tokensB) {
  const shorter =
    tokensA.length <= tokensB.length
      ? tokensA
      : tokensB;

  const longer =
    tokensA.length <= tokensB.length
      ? tokensB
      : tokensA;

  const used = new Set();
  let total = 0;

  shorter.forEach(function (tokenA) {
    let bestScore = 0;
    let bestIndex = -1;

    longer.forEach(function (
      tokenB,
      index
    ) {
      if (used.has(index)) {
        return;
      }

      let tokenScore;

      if (tokenA === tokenB) {
        tokenScore = 1;
      } else if (
        Math.min(
          tokenA.length,
          tokenB.length
        ) <= 2
      ) {
        tokenScore = 0;
      } else {
        tokenScore =
          dupLevenshteinSimilarity_(
            tokenA,
            tokenB
          );
      }

      if (tokenScore > bestScore) {
        bestScore = tokenScore;
        bestIndex = index;
      }
    });

    if (bestIndex >= 0) {
      used.add(bestIndex);
    }

    total += bestScore;
  });

  const coverage =
    total / shorter.length;

  const lengthRatio =
    shorter.length / longer.length;

  return (
    0.85 * coverage +
    0.15 * lengthRatio
  );
}

/**
 * Compares the username portions of different emails.
 */
function dupEmailHint_(emailA, emailB) {
  if (!emailA || !emailB) {
    return 0;
  }

  const partsA = emailA.split('@');
  const partsB = emailB.split('@');

  if (
    partsA.length !== 2 ||
    partsB.length !== 2
  ) {
    return 0;
  }

  const localSimilarity =
    dupLevenshteinSimilarity_(
      partsA[0],
      partsB[0]
    );

  if (localSimilarity < 0.65) {
    return 0;
  }

  const sameDomain =
    partsA[1] === partsB[1]
      ? 1
      : 0;

  return (
    0.8 * localSimilarity +
    0.2 * sameDomain
  );
}

/**
 * Normalizes email addresses.
 *
 * For Gmail:
 *
 * name.surname+conference@gmail.com
 *
 * becomes:
 *
 * namesurname@gmail.com
 */
function dupNormalizeEmail_(value) {
  const email = String(value || '')
    .trim()
    .toLowerCase();

  const parts = email.split('@');

  if (parts.length !== 2) {
    return email;
  }

  let local = parts[0];

  const domain =
    parts[1] === 'googlemail.com'
      ? 'gmail.com'
      : parts[1];

  if (domain === 'gmail.com') {
    local = local
      .split('+')[0]
      .replace(/\./g, '');
  }

  return local + '@' + domain;
}

/**
 * Normalizes general text.
 */
function dupNormalizeText_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Sørensen-Dice string similarity.
 */
function dupDiceSimilarity_(left, right) {
  if (left === right) {
    return 1;
  }

  if (
    left.length < 2 ||
    right.length < 2
  ) {
    return 0;
  }

  const pairs = new Map();

  for (
    let i = 0;
    i < left.length - 1;
    i += 1
  ) {
    const pair =
      left.slice(i, i + 2);

    pairs.set(
      pair,
      (pairs.get(pair) || 0) + 1
    );
  }

  let intersection = 0;

  for (
    let i = 0;
    i < right.length - 1;
    i += 1
  ) {
    const pair =
      right.slice(i, i + 2);

    const count =
      pairs.get(pair) || 0;

    if (count > 0) {
      pairs.set(pair, count - 1);
      intersection += 1;
    }
  }

  return (
    (2 * intersection) /
    (
      left.length - 1 +
      right.length - 1
    )
  );
}

/**
 * Levenshtein string similarity.
 */
function dupLevenshteinSimilarity_(
  left,
  right
) {
  if (left === right) {
    return 1;
  }

  if (!left.length || !right.length) {
    return 0;
  }

  let previous = Array.from(
    {
      length: right.length + 1,
    },
    function (_, index) {
      return index;
    }
  );

  for (
    let i = 1;
    i <= left.length;
    i += 1
  ) {
    const current = [i];

    for (
      let j = 1;
      j <= right.length;
      j += 1
    ) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] +
          (
            left.charAt(i - 1) ===
            right.charAt(j - 1)
              ? 0
              : 1
          )
      );
    }

    previous = current;
  }

  return (
    1 -
    previous[right.length] /
      Math.max(
        left.length,
        right.length
      )
  );
}

/**
 * Finds a source column by any accepted header.
 */
function dupFindHeader_(
  headers,
  acceptedNames
) {
  const normalizedHeaders =
    headers.map(dupNormalizeText_);

  for (
    let i = 0;
    i < acceptedNames.length;
    i += 1
  ) {
    const wanted =
      dupNormalizeText_(
        acceptedNames[i]
      );

    const index =
      normalizedHeaders.indexOf(wanted);

    if (index >= 0) {
      return index;
    }
  }

  throw new Error(
    'Required column not found. ' +
    'Expected one of: ' +
    acceptedNames.join(', ')
  );
}

/**
 * Normalizes submission identifiers used in persistent
 * pair keys.
 */
function dupNormalizeIdentifier_(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

/**
 * Finds a 1-based output column by header, returning -1
 * when the column is not present.
 */
function dupFindOutputColumn_(
  sheet,
  acceptedNames
) {
  const lastColumn =
    sheet.getLastColumn();

  if (lastColumn < 1) {
    return -1;
  }

  const headers = sheet
    .getRange(
      1,
      1,
      1,
      lastColumn
    )
    .getDisplayValues()[0]
    .map(dupNormalizeText_);

  for (
    let i = 0;
    i < acceptedNames.length;
    i += 1
  ) {
    const index = headers.indexOf(
      dupNormalizeText_(acceptedNames[i])
    );

    if (index >= 0) {
      return index + 1;
    }
  }

  return -1;
}

/**
 * Reads decisions currently visible in the pair sheet.
 * Hidden submission keys are preferred, with IDs used as
 * a migration fallback for older versions of the sheet.
 */
function dupReadExistingStatuses_(sheet) {
  const statuses = new Map();

  if (
    sheet.getLastRow() < 2 ||
    sheet.getLastColumn() < 1
  ) {
    return statuses;
  }

  const lastColumn =
    sheet.getLastColumn();

  const headers = sheet
    .getRange(
      1,
      1,
      1,
      lastColumn
    )
    .getDisplayValues()[0]
    .map(dupNormalizeText_);

  const idAColumn = headers.indexOf(
    dupNormalizeText_('ID A')
  );

  const idBColumn = headers.indexOf(
    dupNormalizeText_('ID B')
  );

  const keyAColumn = headers.indexOf(
    dupNormalizeText_('Submission key A')
  );

  const keyBColumn = headers.indexOf(
    dupNormalizeText_('Submission key B')
  );

  const statusColumn = headers.indexOf(
    dupNormalizeText_('Status')
  );

  if (
    idAColumn < 0 ||
    idBColumn < 0 ||
    statusColumn < 0
  ) {
    return statuses;
  }

  const rows = sheet
    .getRange(
      2,
      1,
      sheet.getLastRow() - 1,
      lastColumn
    )
    .getDisplayValues();

  rows.forEach(function (row) {
    const idA = row[idAColumn];
    const idB = row[idBColumn];
    const status = String(
      row[statusColumn] || ''
    ).trim();

    const keyA =
      keyAColumn >= 0 && row[keyAColumn]
        ? row[keyAColumn]
        : idA;

    const keyB =
      keyBColumn >= 0 && row[keyBColumn]
        ? row[keyBColumn]
        : idB;

    if (keyA && keyB && status) {
      statuses.set(
        dupPairKey_(keyA, keyB),
        status
      );
    }
  });

  return statuses;
}

/**
 * Gets or creates the hidden decision ledger.
 */
function dupGetOrCreateDecisionsSheet_(
  spreadsheet
) {
  let sheet = spreadsheet.getSheetByName(
    DUPLICATE_CONFIG.decisionsSheet
  );

  if (!sheet) {
    sheet = spreadsheet.insertSheet(
      DUPLICATE_CONFIG.decisionsSheet
    );
  }

  if (sheet.getMaxColumns() < 2) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      2 - sheet.getMaxColumns()
    );
  }

  sheet
    .getRange(1, 1, 1, 2)
    .setValues([[
      'Pair key',
      'Status',
    ]]);

  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }

  return sheet;
}

/**
 * Reads non-pending decisions from the hidden ledger.
 */
function dupReadDecisionStatuses_(sheet) {
  const statuses = new Map();

  if (sheet.getLastRow() < 2) {
    return statuses;
  }

  const rows = sheet
    .getRange(
      2,
      1,
      sheet.getLastRow() - 1,
      2
    )
    .getDisplayValues();

  rows.forEach(function (row) {
    const pairKey = row[0];
    const status = String(
      row[1] || ''
    ).trim();

    if (
      pairKey &&
      status &&
      status !== 'Pending'
    ) {
      statuses.set(pairKey, status);
    }
  });

  return statuses;
}

/**
 * Applies the visible sheet to the decision ledger. Setting
 * a pair back to Pending removes its stored decision.
 */
function dupMergeVisibleStatuses_(
  storedStatuses,
  visibleStatuses
) {
  visibleStatuses.forEach(function (
    status,
    pairKey
  ) {
    if (
      !status ||
      status === 'Pending'
    ) {
      storedStatuses.delete(pairKey);
    } else {
      storedStatuses.set(pairKey, status);
    }
  });
}

/**
 * Rewrites the small hidden decision ledger.
 */
function dupWriteDecisionStatuses_(
  sheet,
  statuses
) {
  const rows = Array.from(
    statuses.entries()
  )
    .filter(function (entry) {
      return (
        entry[1] &&
        entry[1] !== 'Pending'
      );
    })
    .sort(function (left, right) {
      return left[0].localeCompare(right[0]);
    });

  const existingRows = Math.max(
    0,
    sheet.getLastRow() - 1
  );

  if (existingRows > 0) {
    sheet
      .getRange(
        2,
        1,
        existingRows,
        2
      )
      .clearContent();
  }

  if (rows.length === 0) {
    return;
  }

  if (
    sheet.getMaxRows() <
    rows.length + 1
  ) {
    sheet.insertRowsAfter(
      sheet.getMaxRows(),
      rows.length + 1 -
        sheet.getMaxRows()
    );
  }

  sheet
    .getRange(
      2,
      1,
      rows.length,
      2
    )
    .setValues(rows);
}

/**
 * Saves current visible decisions without discarding stored
 * decisions for candidate pairs that are not currently shown.
 */
function dupPersistOutputStatuses_(
  spreadsheet,
  output
) {
  const decisions =
    dupGetOrCreateDecisionsSheet_(
      spreadsheet
    );

  const statuses =
    dupReadDecisionStatuses_(decisions);

  dupMergeVisibleStatuses_(
    statuses,
    dupReadExistingStatuses_(output)
  );

  dupWriteDecisionStatuses_(
    decisions,
    statuses
  );
}

/**
 * Runs a mutation while preventing concurrent refresh/edit
 * operations from overwriting one another.
 */
function dupWithDocumentLock_(callback) {
  const lock =
    LockService.getDocumentLock();

  lock.waitLock(30000);

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Creates a stable, order-independent key for a pair.
 */
function dupPairKey_(keyA, keyB) {
  return JSON.stringify([
    dupNormalizeIdentifier_(keyA),
    dupNormalizeIdentifier_(keyB),
  ].sort());
}

/**
 * Derives confirmed components strictly from manually
 * confirmed pair edges. Candidate groups are not used.
 */
function dupDeriveConfirmedReview_(pairs) {
  const parent = new Map();

  function ensure(key) {
    if (!parent.has(key)) {
      parent.set(key, key);
    }
  }

  function find(key) {
    const current = parent.get(key);

    if (current !== key) {
      parent.set(key, find(current));
    }

    return parent.get(key);
  }

  function union(left, right) {
    ensure(left);
    ensure(right);

    const rootLeft = find(left);
    const rootRight = find(right);

    if (rootLeft !== rootRight) {
      parent.set(rootRight, rootLeft);
    }
  }

  pairs.forEach(function (pair) {
    if (
      pair.status ===
      'Confirmed duplicate'
    ) {
      union(pair.keyA, pair.keyB);
    }
  });

  const componentSizes = new Map();

  parent.forEach(function (_, key) {
    const root = find(key);

    componentSizes.set(
      root,
      (componentSizes.get(root) || 0) + 1
    );
  });

  const conflictRoots = new Set();
  let conflictCount = 0;

  pairs.forEach(function (pair) {
    if (
      pair.status !== 'Different people' ||
      !parent.has(pair.keyA) ||
      !parent.has(pair.keyB)
    ) {
      return;
    }

    const rootA = find(pair.keyA);
    const rootB = find(pair.keyB);

    if (rootA === rootB) {
      conflictRoots.add(rootA);
      conflictCount += 1;
    }
  });

  const clusterByRoot = new Map();
  let nextCluster = 1;

  pairs.forEach(function (pair) {
    if (
      !parent.has(pair.keyA) ||
      !parent.has(pair.keyB)
    ) {
      return;
    }

    const rootA = find(pair.keyA);
    const rootB = find(pair.keyB);

    if (
      rootA === rootB &&
      !clusterByRoot.has(rootA)
    ) {
      clusterByRoot.set(
        rootA,
        'CONF-' +
          String(nextCluster).padStart(3, '0')
      );

      nextCluster += 1;
    }
  });

  const emittedExcessRoots = new Set();
  let confirmedExcess = 0;

  const rows = pairs.map(function (pair) {
    let sameConfirmedRoot = false;
    let root = '';

    if (
      parent.has(pair.keyA) &&
      parent.has(pair.keyB)
    ) {
      const rootA = find(pair.keyA);
      const rootB = find(pair.keyB);

      if (rootA === rootB) {
        sameConfirmedRoot = true;
        root = rootA;
      }
    }

    const cluster = sameConfirmedRoot
      ? clusterByRoot.get(root)
      : '';

    const clusterSize = sameConfirmedRoot
      ? componentSizes.get(root)
      : '';

    let warning = '';

    let effectiveStatus =
      pair.status || 'Pending';

    if (
      sameConfirmedRoot &&
      conflictRoots.has(root)
    ) {
      effectiveStatus = 'Conflict';

      warning =
        pair.status === 'Different people'
          ? (
            'Conflict: marked Different people but ' +
            'connected by confirmed pairs'
          )
          : (
            'Conflict in confirmed cluster; ' +
            'excess excluded'
          );
    } else if (
      sameConfirmedRoot &&
      (
        pair.status === 'Pending' ||
        pair.status === 'Unsure'
      )
    ) {
      effectiveStatus =
        'Confirmed duplicate';

      warning =
        'Implied duplicate through confirmed pairs';
    } else if (sameConfirmedRoot) {
      effectiveStatus =
        'Confirmed duplicate';
    }

    let excess = '';

    if (
      pair.status === 'Confirmed duplicate' &&
      sameConfirmedRoot &&
      !conflictRoots.has(root) &&
      !emittedExcessRoots.has(root)
    ) {
      excess = clusterSize - 1;
      confirmedExcess += excess;
      emittedExcessRoots.add(root);
    }

    return {
      excess: excess,
      cluster: cluster,
      clusterSize: clusterSize,
      effectiveStatus: effectiveStatus,
      warning: warning,
    };
  });

  return {
    rows: rows,
    confirmedExcess: confirmedExcess,
    conflictCount: conflictCount,
  };
}

/**
 * Recalculates derived columns from the current pair sheet.
 */
function dupRecalculateConfirmedReview_(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return {
      confirmedExcess: 0,
      conflictCount: 0,
    };
  }

  const columns = {
    idA: dupFindOutputColumn_(sheet, ['ID A']),
    idB: dupFindOutputColumn_(sheet, ['ID B']),
    keyA: dupFindOutputColumn_(
      sheet,
      ['Submission key A']
    ),
    keyB: dupFindOutputColumn_(
      sheet,
      ['Submission key B']
    ),
    status: dupFindOutputColumn_(
      sheet,
      ['Status']
    ),
    excess: dupFindOutputColumn_(
      sheet,
      ['Confirmed excess registrations']
    ),
    cluster: dupFindOutputColumn_(
      sheet,
      ['Confirmed cluster']
    ),
    clusterSize: dupFindOutputColumn_(
      sheet,
      ['Confirmed cluster size']
    ),
    effectiveStatus: dupFindOutputColumn_(
      sheet,
      ['Effective status']
    ),
    warning: dupFindOutputColumn_(
      sheet,
      ['Review warning']
    ),
  };

  if (
    columns.idA < 1 ||
    columns.idB < 1 ||
    columns.status < 1 ||
    columns.excess < 1 ||
    columns.cluster < 1 ||
    columns.clusterSize < 1 ||
    columns.effectiveStatus < 1 ||
    columns.warning < 1
  ) {
    return {
      confirmedExcess: 0,
      conflictCount: 0,
    };
  }

  const lastColumn = sheet.getLastColumn();
  const rowCount = lastRow - 1;

  const values = sheet
    .getRange(
      2,
      1,
      rowCount,
      lastColumn
    )
    .getDisplayValues();

  const pairs = values.map(function (row) {
    const keyA =
      columns.keyA > 0 &&
      row[columns.keyA - 1]
        ? row[columns.keyA - 1]
        : row[columns.idA - 1];

    const keyB =
      columns.keyB > 0 &&
      row[columns.keyB - 1]
        ? row[columns.keyB - 1]
        : row[columns.idB - 1];

    return {
      keyA: dupNormalizeIdentifier_(keyA),
      keyB: dupNormalizeIdentifier_(keyB),
      status: String(
        row[columns.status - 1] || ''
      ).trim(),
    };
  });

  const result =
    dupDeriveConfirmedReview_(pairs);

  sheet
    .getRange(
      2,
      columns.excess,
      rowCount,
      1
    )
    .setValues(
      result.rows.map(function (row) {
        return [row.excess];
      })
    )
    .setNumberFormat('0');

  sheet
    .getRange(
      2,
      columns.cluster,
      rowCount,
      1
    )
    .setValues(
      result.rows.map(function (row) {
        return [row.cluster];
      })
    );

  sheet
    .getRange(
      2,
      columns.clusterSize,
      rowCount,
      1
    )
    .setValues(
      result.rows.map(function (row) {
        return [row.clusterSize];
      })
    )
    .setNumberFormat('0');

  sheet
    .getRange(
      2,
      columns.effectiveStatus,
      rowCount,
      1
    )
    .setValues(
      result.rows.map(function (row) {
        return [row.effectiveStatus];
      })
    );

  const warnings = result.rows.map(function (row) {
    return [row.warning];
  });

  sheet
    .getRange(
      2,
      columns.warning,
      rowCount,
      1
    )
    .setValues(warnings)
    .setBackgrounds(
      warnings.map(function (row) {
        return [
          row[0] ? '#f4cccc' : null,
        ];
      })
    );

  return result;
}

/**
 * Union-find functions used to create duplicate groups.
 */
function dupFind_(parent, index) {
  if (parent[index] !== index) {
    parent[index] = dupFind_(
      parent,
      parent[index]
    );
  }

  return parent[index];
}

function dupUnion_(parent, left, right) {
  const rootLeft =
    dupFind_(parent, left);

  const rootRight =
    dupFind_(parent, right);

  if (rootLeft !== rootRight) {
    parent[rootRight] = rootLeft;
  }
}

/**
 * Writes and formats the Possible_duplicates sheet.
 */
function dupWriteOutput_(sheet, rows) {
  /*
   * Add columns if the sheet currently has fewer than
   * the number required.
   */
  if (
    sheet.getMaxColumns() <
    DUPLICATE_HEADERS.length
  ) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      DUPLICATE_HEADERS.length -
        sheet.getMaxColumns()
    );
  }

  /*
   * Add rows if necessary.
   */
  const requiredRows =
    rows.length + 1;

  if (
    sheet.getMaxRows() <
    requiredRows
  ) {
    sheet.insertRowsAfter(
      sheet.getMaxRows(),
      requiredRows -
        sheet.getMaxRows()
    );
  }

  /*
   * Write the headers.
   */
  sheet
    .getRange(
      1,
      1,
      1,
      DUPLICATE_HEADERS.length
    )
    .setValues([
      DUPLICATE_HEADERS,
    ]);

  sheet.setFrozenRows(1);

  /*
   * Clear stale results from previous executions.
   */
  const existingDataRows = Math.max(
    0,
    sheet.getLastRow() - 1
  );

  if (existingDataRows > 0) {
    sheet
      .getRange(
        2,
        1,
        existingDataRows,
        DUPLICATE_HEADERS.length
      )
      .clearContent();

    sheet
      .getRange(
        2,
        10,
        existingDataRows,
        1
      )
      .setBackground(null);

    sheet
      .getRange(
        2,
        12,
        existingDataRows,
        1
      )
      .clearDataValidations();

    sheet
      .getRange(
        2,
        18,
        existingDataRows,
        1
      )
      .setBackground(null);
  }

  /*
   * Format the header row.
   */
  sheet
    .getRange(
      1,
      1,
      1,
      DUPLICATE_HEADERS.length
    )
    .setBackground('#2563eb')
    .setFontColor('#ffffff')
    .setFontWeight('bold');

  /*
   * Internal submission keys support reliable graph nodes
   * and status preservation without cluttering the review.
   */
  sheet.hideColumns(25, 2);

  /*
   * Important zero-case protection.
   *
   * If there are no possible duplicates, the sheet remains
   * header-only and no zero-row range is requested.
   */
  if (rows.length === 0) {
    return;
  }

  /*
   * Write candidate rows.
   */
  sheet
    .getRange(
      2,
      1,
      rows.length,
      DUPLICATE_HEADERS.length
    )
    .setValues(rows);

  /*
   * Score formatting.
   */
  sheet
    .getRange(
      2,
      10,
      rows.length,
      1
    )
    .setNumberFormat('0');

  /*
   * Candidate-size and confirmed-excess formatting.
   */
  sheet
    .getRange(
      2,
      13,
      rows.length,
      2
    )
    .setNumberFormat('0');

  /*
   * Confirmed-cluster-size formatting.
   */
  sheet
    .getRange(
      2,
      16,
      rows.length,
      1
    )
    .setNumberFormat('0');

  /*
   * Timestamp formatting.
   */
  sheet
    .getRange(
      2,
      19,
      rows.length,
      2
    )
    .setNumberFormat(
      'yyyy-mm-dd hh:mm:ss'
    );

  /*
   * Review-status dropdown.
   */
  const validation =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        [
          'Pending',
          'Confirmed duplicate',
          'Different people',
          'Unsure',
        ],
        true
      )
      .setAllowInvalid(false)
      .build();

  sheet
    .getRange(
      2,
      12,
      rows.length,
      1
    )
    .setDataValidation(validation);

  /*
   * Score colors.
   */
  const scoreColors =
    rows.map(function (row) {
      const score = row[9];

      if (
        score >=
        DUPLICATE_CONFIG
          .highConfidenceScore
      ) {
        return ['#b7e1cd'];
      }

      if (score >= 75) {
        return ['#fce8b2'];
      }

      return ['#fff2cc'];
    });

  sheet
    .getRange(
      2,
      10,
      rows.length,
      1
    )
    .setBackgrounds(scoreColors);

  /*
   * Conflict and inference warnings.
   */
  sheet
    .getRange(
      2,
      18,
      rows.length,
      1
    )
    .setBackgrounds(
      rows.map(function (row) {
        return [
          row[17] ? '#f4cccc' : null,
        ];
      })
    );

  /*
   * Column widths.
   */
  sheet.setColumnWidth(1, 110);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 190);
  sheet.setColumnWidth(4, 230);
  sheet.setColumnWidth(5, 220);
  sheet.setColumnWidth(6, 190);
  sheet.setColumnWidth(7, 230);
  sheet.setColumnWidth(8, 145);
  sheet.setColumnWidth(9, 120);
  sheet.setColumnWidth(10, 75);
  sheet.setColumnWidth(11, 330);
  sheet.setColumnWidth(12, 145);
  sheet.setColumnWidth(13, 145);
  sheet.setColumnWidth(14, 185);
  sheet.setColumnWidth(15, 105);
  sheet.setColumnWidth(16, 155);
  sheet.setColumnWidth(17, 155);
  sheet.setColumnWidth(18, 330);
  sheet.setColumnWidth(19, 165);
  sheet.setColumnWidth(20, 165);
  sheet.setColumnWidth(21, 230);
  sheet.setColumnWidth(22, 230);
  sheet.setColumnWidth(23, 110);
  sheet.setColumnWidth(24, 110);
}
