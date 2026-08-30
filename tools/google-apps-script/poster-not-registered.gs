const POSTER_CHECK_CONFIG = Object.freeze({
  posterSheet: 'Poster_participants',
  registrationSheet: 'Editable_view_only_registration',
  reportSheet: 'Poster_Not_Registered',
  reviewScore: 70,
  likelyScore: 88,
});

const POSTER_CHECK_STATUS = Object.freeze({
  registered: 'YES — REGISTERED',
  likely: 'LIKELY REGISTERED',
  review: 'REVIEW',
  notFound: 'NOT FOUND IN REGISTRATION',
});

const POSTER_CHECK_HEADERS = [
  'Poster row',
  'Poster ID',
  'Title',
  'Author',
  'Poster email',
  'Poster affiliation',
  'Co-author',
  'Status',
  'Score',
  'Match reason',
  'Registration row',
  'Registration ID',
  'Registered name',
  'Registered email',
  'Registered affiliation',
  'Country',
  'Attendance type',
  'Registration timestamp',
];

/**
 * Main function. Run this to refresh Poster_Not_Registered.
 *
 * The report contains both kinds of exceptions:
 * - NOT FOUND IN REGISTRATION: no sufficiently similar registration was found.
 * - REVIEW: a possible match was found and should be checked manually.
 *
 * Confirmed and likely registrations are omitted from the report.
 */
function refreshPosterCheck() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const posterSheet = pcRequireSheet_(
    spreadsheet,
    POSTER_CHECK_CONFIG.posterSheet
  );
  const registrationSheet = pcRequireSheet_(
    spreadsheet,
    POSTER_CHECK_CONFIG.registrationSheet
  );
  const reportSheet = pcGetOrCreateSheet_(
    spreadsheet,
    POSTER_CHECK_CONFIG.reportSheet
  );

  const posters = pcReadPosters_(posterSheet);
  const registrations = pcReadRegistrations_(registrationSheet);

  const results = posters.map(function (poster) {
    return {
      poster: poster,
      result: pcFindBestMatch_(poster, registrations),
    };
  });

  const notFoundCount = pcCountStatus_(
    results,
    POSTER_CHECK_STATUS.notFound
  );
  const reviewCount = pcCountStatus_(
    results,
    POSTER_CHECK_STATUS.review
  );

  const exceptionRows = results
    .filter(function (item) {
      return (
        item.result.status === POSTER_CHECK_STATUS.notFound ||
        item.result.status === POSTER_CHECK_STATUS.review
      );
    })
    .sort(pcCompareExceptionResults_)
    .map(pcBuildOutputRow_);

  pcWriteOutput_(reportSheet, exceptionRows);

  const matchedCount = posters.length - notFoundCount - reviewCount;

  spreadsheet.toast(
    notFoundCount +
      ' not found; ' +
      reviewCount +
      ' need manual review; ' +
      matchedCount +
      ' matched.',
    'Poster registration check',
    8
  );
}

function pcRequireSheet_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }

  return sheet;
}

function pcGetOrCreateSheet_(spreadsheet, sheetName) {
  return (
    spreadsheet.getSheetByName(sheetName) ||
    spreadsheet.insertSheet(sheetName)
  );
}

function pcCountStatus_(results, status) {
  return results.filter(function (item) {
    return item.result.status === status;
  }).length;
}

/**
 * Places definite non-matches first, followed by rows needing review.
 * Within each group, the lowest scores appear first.
 */
function pcCompareExceptionResults_(left, right) {
  const leftRank =
    left.result.status === POSTER_CHECK_STATUS.notFound ? 0 : 1;
  const rightRank =
    right.result.status === POSTER_CHECK_STATUS.notFound ? 0 : 1;

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  if (left.result.score !== right.result.score) {
    return left.result.score - right.result.score;
  }

  return left.poster.sourceRow - right.poster.sourceRow;
}

function pcBuildOutputRow_(item) {
  const poster = item.poster;
  const result = item.result;
  const registration = result.match;

  return [
    poster.sourceRow,
    poster.id,
    poster.title,
    poster.author,
    poster.email,
    poster.affiliation,
    poster.coauthor,
    result.status,
    result.score,
    result.reason,
    registration ? registration.sourceRow : '',
    registration ? registration.id : '',
    registration ? registration.name : '',
    registration ? registration.email : '',
    registration ? registration.affiliation : '',
    registration ? registration.country : '',
    registration ? registration.attendanceType : '',
    registration ? registration.timestamp : '',
  ];
}

/**
 * Reads Poster_participants.
 */
function pcReadPosters_(sheet) {
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0];
  const columns = {
    id: pcFindHeader_(headers, ['ID', 'Id'], false),
    title: pcFindHeader_(headers, ['Title', 'Título'], false),
    author: pcFindHeader_(headers, ['Author', 'Autor', 'Nombre']),
    email: pcFindHeader_(
      headers,
      ['Email', 'Correo', 'Correo electrónico']
    ),
    affiliation: pcFindHeader_(
      headers,
      ['Affiliation', 'Afiliación', 'Institución'],
      false
    ),
    coauthor: pcFindHeader_(
      headers,
      ['Co-author', 'Coauthor', 'Co-authors', 'Coautores'],
      false
    ),
  };

  return values
    .slice(1)
    .map(function (row, index) {
      return {
        sourceRow: index + 2,
        id: pcOptionalCell_(row, columns.id),
        title: pcOptionalCell_(row, columns.title),
        author: pcCell_(row, columns.author),
        email: pcCell_(row, columns.email),
        affiliation: pcOptionalCell_(row, columns.affiliation),
        coauthor: pcOptionalCell_(row, columns.coauthor),
      };
    })
    .filter(function (poster) {
      return poster.author || poster.email || poster.title;
    });
}

/**
 * Reads Editable_view_only_registration.
 */
function pcReadRegistrations_(sheet) {
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0];
  const columns = {
    id: pcFindHeader_(headers, ['ID', 'Id'], false),
    timestamp: pcFindHeader_(
      headers,
      ['Timestamp', 'Marca temporal', 'Fecha'],
      false
    ),
    name: pcFindHeader_(headers, ['Nombre', 'Name', 'Full name']),
    email: pcFindHeader_(
      headers,
      ['Email', 'Correo', 'Correo electrónico']
    ),
    affiliation: pcFindHeader_(
      headers,
      ['Afiliación', 'Affiliation', 'Institución'],
      false
    ),
    country: pcFindHeader_(
      headers,
      ['País', 'Pais', 'Country'],
      false
    ),
    attendanceType: pcFindHeader_(
      headers,
      ['Tipo de asistencia', 'Attendance type'],
      false
    ),
  };

  return values
    .slice(1)
    .map(function (row, index) {
      return {
        sourceRow: index + 2,
        id: pcOptionalCell_(row, columns.id),
        timestamp:
          columns.timestamp >= 0 ? row[columns.timestamp] : '',
        name: pcCell_(row, columns.name),
        email: pcCell_(row, columns.email),
        affiliation: pcOptionalCell_(row, columns.affiliation),
        country: pcOptionalCell_(row, columns.country),
        attendanceType: pcOptionalCell_(row, columns.attendanceType),
      };
    })
    .filter(function (registration) {
      return registration.name || registration.email;
    });
}

/**
 * Finds the best registration for one poster participant.
 */
function pcFindBestMatch_(poster, registrations) {
  let best = null;

  registrations.forEach(function (registration) {
    const comparison = pcCompare_(poster, registration);

    if (!best || comparison.score > best.score) {
      best = {
        match: registration,
        score: comparison.score,
        reason: comparison.reason,
        exactEmail: comparison.exactEmail,
        exactName: comparison.exactName,
        nameSimilarity: comparison.nameSimilarity,
        affiliationSimilarity: comparison.affiliationSimilarity,
      };
    }
  });

  if (!best) {
    return {
      status: POSTER_CHECK_STATUS.notFound,
      score: 0,
      reason: 'No registrations available',
      match: null,
    };
  }

  if (best.exactEmail) {
    return {
      status: POSTER_CHECK_STATUS.registered,
      score: 100,
      reason: best.reason,
      match: best.match,
    };
  }

  if (best.exactName && best.affiliationSimilarity >= 0.55) {
    return {
      status: POSTER_CHECK_STATUS.likely,
      score: best.score,
      reason: best.reason,
      match: best.match,
    };
  }

  if (
    best.score >= POSTER_CHECK_CONFIG.likelyScore &&
    best.nameSimilarity >= 0.9 &&
    best.affiliationSimilarity >= 0.55
  ) {
    return {
      status: POSTER_CHECK_STATUS.likely,
      score: best.score,
      reason: best.reason,
      match: best.match,
    };
  }

  if (
    best.score >= POSTER_CHECK_CONFIG.reviewScore &&
    best.nameSimilarity >= 0.72
  ) {
    return {
      status: POSTER_CHECK_STATUS.review,
      score: best.score,
      reason: best.reason,
      match: best.match,
    };
  }

  return {
    status: POSTER_CHECK_STATUS.notFound,
    score: best.score,
    reason: 'No sufficiently similar registration',
    match: null,
  };
}

/**
 * Compares one poster participant with one registration.
 */
function pcCompare_(poster, registration) {
  const posterEmail = pcNormalizeEmail_(poster.email);
  const registeredEmail = pcNormalizeEmail_(registration.email);
  const exactEmail = Boolean(
    posterEmail && posterEmail === registeredEmail
  );

  const posterName = pcNormalizeText_(poster.author);
  const registeredName = pcNormalizeText_(registration.name);
  const exactName = Boolean(
    posterName && posterName === registeredName
  );

  const nameSimilarity = pcNameSimilarity_(
    poster.author,
    registration.name
  );
  const affiliationSimilarity = pcAffiliationSimilarity_(
    poster.affiliation,
    registration.affiliation
  );

  if (exactEmail) {
    return {
      score: 100,
      exactEmail: true,
      exactName: exactName,
      nameSimilarity: nameSimilarity,
      affiliationSimilarity: affiliationSimilarity,
      reason: 'Exact normalized email',
    };
  }

  let score = Math.round(
    80 * nameSimilarity + 20 * affiliationSimilarity
  );

  // Do not match unrelated people merely because they share an institution.
  if (nameSimilarity < 0.6) {
    score = Math.min(score, 49);
  }

  const reasons = [];

  if (exactName) {
    reasons.push('Exact normalized name');
  } else if (nameSimilarity >= 0.65) {
    reasons.push(
      'Name similarity ' + Math.round(nameSimilarity * 100) + '%'
    );
  }

  if (affiliationSimilarity >= 0.9) {
    reasons.push('Same/similar affiliation');
  } else if (affiliationSimilarity >= 0.6) {
    reasons.push(
      'Affiliation similarity ' +
        Math.round(affiliationSimilarity * 100) +
        '%'
    );
  }

  return {
    score: score,
    exactEmail: false,
    exactName: exactName,
    nameSimilarity: nameSimilarity,
    affiliationSimilarity: affiliationSimilarity,
    reason: reasons.join('; ') || 'No strong matching fields',
  };
}

/**
 * Name comparison that ignores accents, capitalization, word order and
 * additional names.
 */
function pcNameSimilarity_(left, right) {
  const tokensA = pcNormalizeText_(left).split(' ').filter(Boolean);
  const tokensB = pcNormalizeText_(right).split(' ').filter(Boolean);

  if (!tokensA.length || !tokensB.length) {
    return 0;
  }

  const sortedA = tokensA.slice().sort().join(' ');
  const sortedB = tokensB.slice().sort().join(' ');

  if (sortedA === sortedB) {
    return 1;
  }

  return Math.max(
    pcDiceSimilarity_(sortedA, sortedB),
    pcTokenCoverage_(tokensA, tokensB)
  );
}

/**
 * Affiliation comparison, including acronyms such as UTFSM and
 * Universidad Técnica Federico Santa María.
 */
function pcAffiliationSimilarity_(left, right) {
  const normalizedA = pcNormalizeText_(left);
  const normalizedB = pcNormalizeText_(right);

  if (!normalizedA || !normalizedB) {
    return 0;
  }

  if (normalizedA === normalizedB) {
    return 1;
  }

  const tokensA = normalizedA.split(' ');
  const tokensB = normalizedB.split(' ');
  const compactA = normalizedA.replace(/\s/g, '');
  const compactB = normalizedB.replace(/\s/g, '');
  const acronymA = pcAcronym_(tokensA);
  const acronymB = pcAcronym_(tokensB);

  if (
    compactA.length >= 3 &&
    acronymB.length >= 3 &&
    (compactA === acronymB ||
      acronymB.startsWith(compactA) ||
      compactA.startsWith(acronymB))
  ) {
    return 0.95;
  }

  if (
    compactB.length >= 3 &&
    acronymA.length >= 3 &&
    (compactB === acronymA ||
      acronymA.startsWith(compactB) ||
      compactB.startsWith(acronymA))
  ) {
    return 0.95;
  }

  return Math.max(
    pcDiceSimilarity_(normalizedA, normalizedB),
    pcTokenCoverage_(tokensA, tokensB)
  );
}

function pcAcronym_(tokens) {
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
      return token && !ignored.has(token);
    })
    .map(function (token) {
      return token.charAt(0);
    })
    .join('');
}

function pcTokenCoverage_(tokensA, tokensB) {
  const shorter =
    tokensA.length <= tokensB.length ? tokensA : tokensB;
  const longer =
    tokensA.length <= tokensB.length ? tokensB : tokensA;
  const used = new Set();
  let total = 0;

  shorter.forEach(function (tokenA) {
    let bestScore = 0;
    let bestIndex = -1;

    longer.forEach(function (tokenB, index) {
      if (used.has(index)) {
        return;
      }

      const similarity = pcDiceSimilarity_(tokenA, tokenB);

      if (similarity > bestScore) {
        bestScore = similarity;
        bestIndex = index;
      }
    });

    if (bestIndex >= 0) {
      used.add(bestIndex);
      total += bestScore;
    }
  });

  return total / Math.max(tokensA.length, tokensB.length);
}

function pcDiceSimilarity_(left, right) {
  if (left === right) {
    return 1;
  }

  if (left.length < 2 || right.length < 2) {
    return 0;
  }

  const pairs = new Map();

  for (let i = 0; i < left.length - 1; i += 1) {
    const pair = left.substring(i, i + 2);
    pairs.set(pair, (pairs.get(pair) || 0) + 1);
  }

  let matches = 0;

  for (let i = 0; i < right.length - 1; i += 1) {
    const pair = right.substring(i, i + 2);
    const count = pairs.get(pair) || 0;

    if (count > 0) {
      matches += 1;
      pairs.set(pair, count - 1);
    }
  }

  return (
    (2 * matches) /
    (left.length - 1 + (right.length - 1))
  );
}

function pcNormalizeEmail_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function pcNormalizeText_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function pcFindHeader_(headers, alternatives, required) {
  if (required === undefined) {
    required = true;
  }

  const normalizedHeaders = headers.map(function (header) {
    return pcNormalizeText_(header);
  });

  for (let i = 0; i < alternatives.length; i += 1) {
    const index = normalizedHeaders.indexOf(
      pcNormalizeText_(alternatives[i])
    );

    if (index >= 0) {
      return index;
    }
  }

  if (!required) {
    return -1;
  }

  throw new Error(
    'Required column not found: ' + alternatives.join(' / ')
  );
}

function pcCell_(row, column) {
  return String(row[column] || '').trim();
}

function pcOptionalCell_(row, column) {
  return column >= 0 ? pcCell_(row, column) : '';
}

/**
 * Clears, rewrites and formats the consolidated exception report.
 */
function pcWriteOutput_(sheet, rows) {
  const columnCount = POSTER_CHECK_HEADERS.length;

  if (sheet.getMaxColumns() < columnCount) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      columnCount - sheet.getMaxColumns()
    );
  }

  const requiredRows = rows.length + 1;

  if (sheet.getMaxRows() < requiredRows) {
    sheet.insertRowsAfter(
      sheet.getMaxRows(),
      requiredRows - sheet.getMaxRows()
    );
  }

  const existingFilter = sheet.getFilter();

  if (existingFilter) {
    existingFilter.remove();
  }

  const previousRows = Math.max(sheet.getLastRow(), requiredRows);

  sheet
    .getRange(1, 1, previousRows, columnCount)
    .clearContent()
    .clearFormat();

  sheet
    .getRange(1, 1, 1, columnCount)
    .setValues([POSTER_CHECK_HEADERS])
    .setBackground('#2563eb')
    .setFontColor('#ffffff')
    .setFontWeight('bold');

  sheet.setFrozenRows(1);

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, columnCount).setValues(rows);
    sheet.getRange(2, 9, rows.length, 1).setNumberFormat('0');
    sheet
      .getRange(2, 18, rows.length, 1)
      .setNumberFormat('yyyy-mm-dd hh:mm:ss');

    const statusColors = rows.map(function (row) {
      return [
        row[7] === POSTER_CHECK_STATUS.review
          ? '#fce8b2'
          : '#f4cccc',
      ];
    });

    sheet
      .getRange(2, 8, rows.length, 1)
      .setBackgrounds(statusColors)
      .setFontWeight('bold');

    sheet
      .getRange(1, 1, rows.length + 1, columnCount)
      .createFilter();
  }

  sheet.autoResizeColumns(1, columnCount);
  sheet.setColumnWidth(3, 300);
  sheet.setColumnWidth(4, 210);
  sheet.setColumnWidth(5, 230);
  sheet.setColumnWidth(6, 260);
  sheet.setColumnWidth(7, 260);
  sheet.setColumnWidth(10, 260);
  sheet.setColumnWidth(13, 210);
  sheet.setColumnWidth(14, 230);
  sheet.setColumnWidth(15, 260);
}
