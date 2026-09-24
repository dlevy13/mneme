const defaultCards = [
  { word: "bonjour", translation: "hello", sentence: "Bonjour, comment allez-vous ?" },
  { word: "merci", translation: "thank you", sentence: "Merci pour votre aide." },
  { word: "livre", translation: "book", sentence: "Je lis un livre le soir." },
  { word: "maison", translation: "house", sentence: "Cette maison est ancienne." },
  { word: "vite", translation: "quickly", sentence: "Il marche vite." },
];

const flashcard = document.querySelector("#flashcard");
const promptEl = document.querySelector("#card-prompt");
const directionEl = document.querySelector("#card-direction");
const hintEl = document.querySelector("#card-hint");
const answerEl = document.querySelector("#card-answer");
const sentenceEl = document.querySelector("#card-sentence");
const typedAnswer = document.querySelector("#typed-answer");
const typedInput = document.querySelector("#typed-input");
const submitTypedAnswerButton = document.querySelector("#submit-typed-answer");
const showHintButton = document.querySelector("#show-hint");
const typedHint = document.querySelector("#typed-hint");
const deckNameEl = document.querySelector("#current-deck-name");
const cardCountEl = document.querySelector("#card-count");
const syncStatus = document.querySelector("#sync-status");
const reviewActions = document.querySelector("#review-actions");
const revealButton = document.querySelector("#reveal-card");
const shuffleButton = document.querySelector("#shuffle-card");
const nextButton = document.querySelector("#next-card");
const openImportButton = document.querySelector("#open-import-deck");
const openDecksButton = document.querySelector("#open-deck-list");
const importDialog = document.querySelector("#import-deck-dialog");
const deckListDialog = document.querySelector("#deck-list-dialog");
const closeImportButton = document.querySelector("#close-import-dialog");
const closeDeckListButton = document.querySelector("#close-deck-list-dialog");
const csvFileInput = document.querySelector("#csv-file");
const csvDelimiterInput = document.querySelector("#csv-delimiter");
const csvHasHeaderInput = document.querySelector("#csv-has-header");
const deckNameInput = document.querySelector("#deck-name");
const saveImportedDeckButton = document.querySelector("#save-imported-deck");
const importPreview = document.querySelector("#import-preview");
const deckListEl = document.querySelector("#deck-list");
const refreshDecksButton = document.querySelector("#refresh-decks");
const editDeckDialog = document.querySelector("#edit-deck-dialog");
const editDeckTitle = document.querySelector("#edit-deck-title");
const editCardList = document.querySelector("#edit-card-list");
const editDeckStatus = document.querySelector("#edit-deck-status");
const closeEditDeckButton = document.querySelector("#close-edit-deck-dialog");
const saveEditedDeckButton = document.querySelector("#save-edited-deck");

let cards = defaultCards;
let currentDeckName = "Exemple";
let currentDeckId = null;
let currentCard = null;
let importedCards = [];
let baseQueue = [];
let editingDeck = null;
let revealed = false;
let firestoreDb = null;
let answerStartedAt = 0;
let hintsUsed = 0;
let proposedGrade = null;

const settings = {
  learningStepsMin: [1, 10],
  relearningStepMin: 10,
  graduatingInterval: 1,
  easyGraduatingInterval: 3,
  easeStart: { en_fr: 2.5, fr_en: 2.3 },
  easeMin: 1.3,
  easeMax: 3.0,
  hardFactor: 1.2,
  easyBonus: 1.3,
  lapseIntervalFactor: 0.5,
  maxInterval: 365,
  newPerDay: { en_fr: 10, fr_en: 6 },
  maxReviewsPerDay: 200,
  frEnBacklogLimit: 40,
  leechThreshold: 8,
  dayStartsAtHour: 4,
  unlockFrEnAfterReps: 1,
  newEveryNReviews: 4,
  learningLookaheadMin: 10,
  minThinkMs: 1200,
  fastAnswerMs: 4000,
};
const scoreLabels = {
  0: "oublié",
  1: "difficile",
  2: "correct",
  3: "facile",
};
const directions = {
  en_fr: {
    key: "en_fr",
    label: "EN -> FR",
    prompt: (card) => card.translation,
    answer: (card) => card.word,
    mode: "flip",
    flatSuffix: "en_fr",
  },
  fr_en: {
    key: "fr_en",
    label: "FR -> EN",
    prompt: (card) => card.word,
    answer: (card) => card.translation,
    mode: "typed",
    flatSuffix: "fr_en",
  },
};

function setStatus(message, isError = false) {
  syncStatus.textContent = message;
  syncStatus.classList.toggle("error", isError);
}

function setImportPreview(message, isError = false) {
  importPreview.textContent = message;
  importPreview.classList.toggle("error", isError);
}

function createFirebaseClient() {
  const fileConfig = window.MNEME_FIREBASE_CONFIG || {};
  const apiKey = fileConfig.apiKey || localStorage.getItem("mneme.firebaseApiKey") || "";
  const projectId = fileConfig.projectId || localStorage.getItem("mneme.firebaseProjectId") || "";
  const appId = fileConfig.appId || localStorage.getItem("mneme.firebaseAppId") || "";

  if (!apiKey || !projectId || !appId) {
    firestoreDb = null;
    setStatus("Configurez firebase-config.js pour charger et enregistrer des decks.", true);
    return false;
  }

  if (!window.firebase) {
    firestoreDb = null;
    setStatus("Le client Firebase n'a pas pu être chargé.", true);
    return false;
  }

  const appName = `mneme-${projectId}`;
  const existingApp = firebase.apps.find((app) => app.name === appName);
  const app = existingApp || firebase.initializeApp({
    apiKey,
    projectId,
    appId,
    authDomain: `${projectId}.firebaseapp.com`,
  }, appName);

  firestoreDb = firebase.firestore(app);
  setStatus("Firebase connecté.");
  return true;
}

function normalizeDeckId(name) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "deck";
}

function todayIso() {
  return logicalToday(new Date()).toISOString().slice(0, 10);
}

function logicalToday(date) {
  const shifted = new Date(date);
  shifted.setHours(shifted.getHours() - settings.dayStartsAtHour);
  return new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
}

function dayStart(date, days = 0) {
  const start = logicalToday(date);
  start.setDate(start.getDate() + days);
  start.setHours(settings.dayStartsAtHour, 0, 0, 0);
  return start;
}

function nextDayStartIso(days) {
  return dayStart(new Date(), days).toISOString();
}

function endOfLogicalDay() {
  return nextDayStartIso(1);
}

function addMinutesIso(minutes) {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function addDaysIso(days) {
  return nextDayStartIso(days);
}

function isDue(iso, now = new Date()) {
  return new Date(iso).getTime() <= now.getTime();
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s'-]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/^(to|a|an|the)\s+/, "");
}

function levenshtein(a, b) {
  if (a === b) {
    return 0;
  }

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 0; i < a.length; i += 1) {
    const current = [i + 1];

    for (let j = 0; j < b.length; j += 1) {
      current.push(Math.min(
        previous[j + 1] + 1,
        current[j] + 1,
        previous[j] + (a[i] === b[j] ? 0 : 1),
      ));
    }

    previous = current;
  }

  return previous[b.length];
}

function letterPattern(text) {
  return String(text || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word[0]}${"_".repeat(Math.max(0, word.length - 1))}`)
    .join(" ");
}

function normalizeCard(card) {
  const reviewCards = {
    en_fr: normalizeReviewCard(card, "en_fr"),
    fr_en: normalizeReviewCard(card, "fr_en"),
  };
  const nextCard = {
    ...card,
    reviewCards,
    enAlternatives: Array.isArray(card.enAlternatives) ? card.enAlternatives : splitList(card.enAlternatives || card.synonyms || ""),
  };

  mirrorReviewCard(nextCard, "en_fr");
  mirrorReviewCard(nextCard, "fr_en");

  return nextCard;
}

function splitList(text) {
  if (Array.isArray(text)) {
    return text;
  }

  return String(text || "")
    .split(/[;,/]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function legacyReview(card, directionKey) {
  if (card.reviewCards && card.reviewCards[directionKey]) {
    return card.reviewCards[directionKey];
  }

  if (card.reviews && card.reviews[directionKey]) {
    return card.reviews[directionKey];
  }

  if (directionKey === "en_fr" && card.reviews && card.reviews.enToFr) {
    return card.reviews.enToFr;
  }

  if (directionKey === "fr_en" && card.reviews && card.reviews.frToEn) {
    return card.reviews.frToEn;
  }

  return {};
}

function normalizeReviewCard(card, directionKey) {
  const existing = legacyReview(card, directionKey);
  const suffix = directions[directionKey].flatSuffix;
  const state = existing.state || card[`state_${suffix}`] || (directionKey === "en_fr" ? "new" : "locked");

  return {
    state,
    ease: Number.isFinite(existing.ease) ? existing.ease : Number.isFinite(card[`ease_${suffix}`]) ? card[`ease_${suffix}`] : settings.easeStart[directionKey],
    interval: Number.isInteger(existing.interval) ? existing.interval : Number.isInteger(card[`interval_${suffix}`]) ? card[`interval_${suffix}`] : 0,
    reps: Number.isInteger(existing.reps) ? existing.reps : Number.isInteger(card[`reps_${suffix}`]) ? card[`reps_${suffix}`] : 0,
    lapses: Number.isInteger(existing.lapses) ? existing.lapses : Number.isInteger(card[`lapses_${suffix}`]) ? card[`lapses_${suffix}`] : 0,
    step: Number.isInteger(existing.step) ? existing.step : Number.isInteger(card[`step_${suffix}`]) ? card[`step_${suffix}`] : 0,
    due: existing.due || card[`due_${suffix}`] || card[`next_review_${suffix}`] || card.next_review || new Date().toISOString(),
    buried_until: existing.buried_until || card[`buried_until_${suffix}`] || null,
    suspended: Boolean(existing.suspended || card[`suspended_${suffix}`]),
    leech: Boolean(existing.leech || card[`leech_${suffix}`]),
    last_review: existing.last_review || card[`last_review_${suffix}`] || null,
    correct: Number.isInteger(existing.correct)
      ? existing.correct
      : Number.isInteger(card[`correct_${suffix}`])
        ? card[`correct_${suffix}`]
        : 0,
    wrong: Number.isInteger(existing.wrong)
      ? existing.wrong
      : Number.isInteger(card[`wrong_${suffix}`])
        ? card[`wrong_${suffix}`]
        : 0,
    note: Number.isInteger(existing.note)
      ? existing.note
      : Number.isInteger(card[`note_${suffix}`])
        ? card[`note_${suffix}`]
        : null,
    noteLabel: existing.noteLabel || card[`noteLabel_${suffix}`] || "",
    reviewedAt: existing.reviewedAt || card[`reviewedAt_${suffix}`] || "",
    nextReviewInDays: Number.isInteger(existing.nextReviewInDays)
      ? existing.nextReviewInDays
      : Number.isInteger(card[`nextReviewInDays_${suffix}`])
        ? card[`nextReviewInDays_${suffix}`]
        : null,
  };
}

function mirrorReviewCard(card, directionKey) {
  const suffix = directions[directionKey].flatSuffix;
  const review = card.reviewCards[directionKey];

  card[`state_${suffix}`] = review.state;
  card[`ease_${suffix}`] = review.ease;
  card[`interval_${suffix}`] = review.interval;
  card[`reps_${suffix}`] = review.reps;
  card[`lapses_${suffix}`] = review.lapses;
  card[`step_${suffix}`] = review.step;
  card[`due_${suffix}`] = review.due;
  card[`buried_until_${suffix}`] = review.buried_until;
  card[`suspended_${suffix}`] = review.suspended;
  card[`leech_${suffix}`] = review.leech;
  card[`last_review_${suffix}`] = review.last_review;
  card[`note_${suffix}`] = review.note;
  card[`noteLabel_${suffix}`] = review.noteLabel;
  card[`level_${suffix}`] = review.reps;
  card[`next_review_${suffix}`] = review.due;
  card[`correct_${suffix}`] = review.correct;
  card[`wrong_${suffix}`] = review.wrong;
  card[`reviewedAt_${suffix}`] = review.reviewedAt;
  card[`nextReviewInDays_${suffix}`] = review.nextReviewInDays;
}

function nameFromFile(fileName) {
  return fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "";
  const candidates = [",", ";", "\t"];

  return candidates
    .map((delimiter) => ({
      delimiter,
      count: firstLine.split(delimiter).length,
    }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === delimiter && !inQuotes) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(field.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }

  return rows;
}

function rowsToCards(rows, hasHeader) {
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows
    .map((row) => ({
      word: row[0] || "",
      translation: row[1] || "",
      sentence: row[2] || "",
      enAlternatives: splitList(row.slice(3).join("; ")),
    }))
    .filter((card) => card.word && card.translation)
    .map(normalizeCard);
}

function updateDeckMeta() {
  deckNameEl.textContent = currentDeckName;
  cardCountEl.textContent = `${cards.length} ${cards.length > 1 ? "cartes" : "carte"}`;
}

function reviewEntries() {
  return cards.flatMap((card, index) =>
    Object.keys(directions).map((directionKey) => ({
      card,
      index,
      directionKey,
      review: card.reviewCards[directionKey],
    })),
  );
}

function isAvailableReview(review, now = new Date()) {
  return !review.suspended
    && review.state !== "locked"
    && (!review.buried_until || isDue(review.buried_until, now));
}

function introducedToday(directionKey) {
  const today = todayIso();
  return reviewEntries()
    .filter(({ directionKey: key, review }) => key === directionKey && review.introduced_on === today)
    .length;
}

function buildBaseQueue(now = new Date()) {
  const end = new Date(endOfLogicalDay());
  const dueReviews = reviewEntries()
    .filter(({ review }) => isAvailableReview(review, now) && review.state === "review" && new Date(review.due) < end)
    .sort((a, b) => new Date(a.review.due) - new Date(b.review.due))
    .slice(0, settings.maxReviewsPerDay);
  const frEnBacklog = dueReviews.filter(({ directionKey }) => directionKey === "fr_en").length;
  const newReviews = [];

  Object.keys(directions).forEach((directionKey) => {
    if (directionKey === "fr_en" && frEnBacklog > settings.frEnBacklogLimit) {
      return;
    }

    const left = Math.max(0, settings.newPerDay[directionKey] - introducedToday(directionKey));
    const pool = reviewEntries()
      .filter(({ review, directionKey: key }) => key === directionKey && isAvailableReview(review, now) && review.state === "new")
      .sort((a, b) => a.index - b.index)
      .slice(0, left);

    newReviews.push(...pool);
  });

  const queue = [];
  let reviewIndex = 0;
  let newIndex = 0;

  while (reviewIndex < dueReviews.length || newIndex < newReviews.length) {
    for (let count = 0; count < settings.newEveryNReviews && reviewIndex < dueReviews.length; count += 1) {
      queue.push(dueReviews[reviewIndex]);
      reviewIndex += 1;
    }

    if (newIndex < newReviews.length) {
      queue.push(newReviews[newIndex]);
      newIndex += 1;
    }
  }

  return queue;
}

function nextReviewEntry(now = new Date()) {
  const learning = reviewEntries()
    .filter(({ review }) =>
      isAvailableReview(review, now)
      && ["learning", "relearning"].includes(review.state),
    )
    .sort((a, b) => new Date(a.review.due) - new Date(b.review.due));

  if (learning[0] && isDue(learning[0].review.due, now)) {
    return learning[0];
  }

  while (baseQueue.length > 0) {
    const entry = baseQueue.shift();

    if (isAvailableReview(entry.review, now) && ["new", "review"].includes(entry.review.state)) {
      return entry;
    }
  }

  const horizon = new Date(now);
  horizon.setMinutes(horizon.getMinutes() + settings.learningLookaheadMin);

  if (learning[0] && new Date(learning[0].review.due) <= horizon) {
    return learning[0];
  }

  return null;
}

function pickCard() {
  if (cards.length === 0) {
    currentCard = null;
    promptEl.textContent = "Aucune carte";
    directionEl.textContent = "Deck vide";
    hintEl.textContent = "Importez ou chargez un deck";
    answerEl.hidden = true;
    sentenceEl.hidden = true;
    typedAnswer.hidden = true;
    reviewActions.hidden = true;
    return;
  }

  if (baseQueue.length === 0) {
    baseQueue = buildBaseQueue();
  }

  const dueReview = nextReviewEntry();

  if (!dueReview) {
    currentCard = null;
    promptEl.textContent = "Aucune carte à réviser";
    directionEl.textContent = "Session terminée";
    hintEl.textContent = "Chargez un autre deck ou revenez plus tard";
    answerEl.hidden = true;
    sentenceEl.hidden = true;
    typedAnswer.hidden = true;
    reviewActions.hidden = true;
    return;
  }

  const cardIndex = dueReview.index;
  const card = cards[cardIndex];
  const directionKey = dueReview.directionKey;
  const direction = directions[directionKey];

  currentCard = {
    index: cardIndex,
    card,
    directionKey,
    review: dueReview.review,
    prompt: direction.prompt(card),
    answer: direction.answer(card),
    sentence: card.sentence,
    direction: direction.label,
    mode: direction.mode,
  };

  proposedGrade = null;
  hintsUsed = 0;
  answerStartedAt = performance.now();
  typedInput.value = "";
  typedHint.textContent = "";
  revealed = false;
  renderCard();
}

function renderCard() {
  if (!currentCard) {
    return;
  }

  promptEl.textContent = currentCard.prompt;
  directionEl.textContent = currentCard.direction;
  typedAnswer.hidden = currentCard.mode !== "typed" || revealed;
  hintEl.hidden = revealed || currentCard.mode === "typed";
  hintEl.textContent = currentCard.mode === "typed" ? "" : "Cliquer pour révéler";
  answerEl.hidden = !revealed;
  sentenceEl.hidden = !revealed || !currentCard.sentence;
  reviewActions.hidden = !revealed;
  answerEl.textContent = currentCard.answer;
  sentenceEl.textContent = currentCard.sentence;

  if (currentCard.mode === "typed" && !revealed) {
    typedInput.focus();
  }
}

function revealCard() {
  if (!currentCard) {
    return;
  }

  if (currentCard.mode === "typed" && !revealed) {
    typedInput.focus();
    return;
  }

  revealed = true;
  renderCard();
}

function submitTypedAnswer() {
  if (!currentCard || currentCard.mode !== "typed") {
    return;
  }

  const responseMs = Math.round(performance.now() - answerStartedAt);
  proposedGrade = autoGradeTyped(typedInput.value, currentCard.card, responseMs, hintsUsed);
  revealed = true;
  renderCard();

  if (proposedGrade === 1 && typedInput.value && hintsUsed === 0) {
    setStatus("Presque : réponse acceptée comme difficile.");
  } else if (proposedGrade === 0) {
    setStatus("Réponse non reconnue. Corrige la note si c'était un synonyme valide.", true);
  } else {
    setStatus(`Note proposée : ${proposedGrade} ${scoreLabels[proposedGrade]}.`);
  }
}

function showProgressiveHint() {
  if (!currentCard || currentCard.mode !== "typed") {
    return;
  }

  hintsUsed += 1;
  typedHint.textContent = hintsUsed === 1
    ? `Indice : ${letterPattern(currentCard.answer)}`
    : `Réponse : ${currentCard.answer}`;
}

function loadDeck(name, nextCards, deckId = null) {
  currentDeckName = name;
  cards = nextCards;
  currentDeckId = deckId;
  cards = cards.map(normalizeCard);
  baseQueue = [];
  updateDeckMeta();
  pickCard();
}

async function saveCurrentDeckProgress() {
  if (!currentDeckId || !firestoreDb) {
    return;
  }

  try {
    await firestoreDb.collection("decks").doc(currentDeckId).set({
      name: currentDeckName,
      cards,
      cardCount: cards.length,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    setStatus(`Erreur Firebase : ${error.message}`, true);
  }
}

function applyFuzz(interval) {
  if (interval <= 7) {
    return interval;
  }

  const spread = Math.max(1, Math.round(interval * 0.05));
  return interval + Math.floor(Math.random() * (spread * 2 + 1)) - spread;
}

function graduate(review, easy = false) {
  review.state = "review";
  review.step = 0;
  review.reps = 1;
  review.interval = easy ? settings.easyGraduatingInterval : settings.graduatingInterval;
  review.due = nextDayStartIso(review.interval);
}

function scheduleReview(review, score, stateBefore) {
  const steps = settings.learningStepsMin;

  if (review.state === "new") {
    review.state = "learning";
    review.step = 0;
  }

  if (review.state === "learning") {
    if (score === 0) {
      review.step = 0;
      review.due = addMinutesIso(steps[0]);
    } else if (score === 3) {
      graduate(review, true);
    } else {
      if (score === 2) {
        review.step += 1;
      }

      if (review.step >= steps.length) {
        graduate(review, false);
      } else {
        review.due = addMinutesIso(steps[review.step]);
      }
    }
  } else if (review.state === "relearning") {
    if (score === 0) {
      review.due = addMinutesIso(settings.relearningStepMin);
    } else {
      review.state = "review";
      review.reps = 1;
      review.due = nextDayStartIso(review.interval);
    }
  } else if (review.state === "review") {
    if (score === 0) {
      review.lapses += 1;
      review.wrong += 1;
      review.reps = 0;
      review.ease = Math.max(settings.easeMin, review.ease - 0.2);
      review.interval = Math.max(1, Math.floor(review.interval * settings.lapseIntervalFactor));
      review.state = "relearning";
      review.step = 0;
      review.due = addMinutesIso(settings.relearningStepMin);

      if (review.lapses >= settings.leechThreshold) {
        review.leech = true;
      }
    } else {
      const elapsed = review.last_review
        ? Math.max(0, Math.floor((logicalToday(new Date()) - logicalToday(new Date(review.last_review))) / 86400000))
        : review.interval;
      const base = score >= 2 ? Math.max(review.interval, elapsed) : review.interval;
      let nextInterval;

      if (review.interval <= 1) {
        nextInterval = { 1: 2, 2: 3, 3: 4 }[score];
      } else {
        const factor = {
          1: settings.hardFactor,
          2: review.ease,
          3: review.ease * settings.easyBonus,
        }[score];
        nextInterval = Math.round(base * factor);
      }

      nextInterval = applyFuzz(nextInterval);
      nextInterval = Math.max(review.interval + 1, nextInterval);
      review.interval = Math.min(nextInterval, settings.maxInterval);
      review.ease = Math.min(settings.easeMax, Math.max(settings.easeMin, review.ease + { 1: -0.15, 2: 0, 3: 0.15 }[score]));
      review.reps += 1;
      review.correct += 1;
      review.due = nextDayStartIso(review.interval);
    }
  }

  if (stateBefore !== "review" && score > 0) {
    review.correct += 1;
  }

  review.last_review = new Date().toISOString();
  return review.interval;
}

function tryUnlock(card) {
  const enFr = card.reviewCards.en_fr;
  const frEn = card.reviewCards.fr_en;

  if (frEn.state === "locked" && enFr.state === "review") {
    frEn.state = "new";
    frEn.due = new Date().toISOString();
    mirrorReviewCard(card, "fr_en");
  }
}

function burySibling(card, directionKey) {
  const siblingKey = directionKey === "en_fr" ? "fr_en" : "en_fr";
  const sibling = card.reviewCards[siblingKey];

  if (["new", "review"].includes(sibling.state)) {
    sibling.buried_until = nextDayStartIso(1);
    mirrorReviewCard(card, siblingKey);
  }
}

function cascadeLapse(card, directionKey, score, stateBefore) {
  if (directionKey !== "en_fr" || score !== 0 || stateBefore !== "review") {
    return;
  }

  const frEn = card.reviewCards.fr_en;

  if (frEn.state === "review") {
    frEn.interval = Math.min(frEn.interval, 1);
    frEn.ease = Math.max(settings.easeMin, frEn.ease - 0.1);
    frEn.due = nextDayStartIso(1);
  } else if (["new", "learning", "relearning"].includes(frEn.state)) {
    frEn.state = "locked";
    frEn.step = 0;
    frEn.buried_until = null;
  }

  mirrorReviewCard(card, "fr_en");
}

function acceptedAnswers(card) {
  return [card.translation, ...(card.enAlternatives || [])].filter(Boolean);
}

function isKnownReview(review) {
  return review
    && ["learning", "relearning", "review"].includes(review.state)
    && !review.leech
    && (
      review.note >= 2
      || review.correct > 0
      || review.reps > 0
    );
}

function isKnownCard(card) {
  const normalizedCard = normalizeCard(card);

  return isKnownReview(normalizedCard.reviewCards.en_fr)
    || isKnownReview(normalizedCard.reviewCards.fr_en)
    || card.note >= 2
    || card.correct > 0;
}

function knownCardCount(deckCards) {
  return deckCards.filter(isKnownCard).length;
}

function removeUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(removeUndefined);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nextValue]) => nextValue !== undefined)
        .map(([key, nextValue]) => [key, removeUndefined(nextValue)]),
    );
  }

  return value;
}

function autoGradeTyped(answer, card, responseMs, hints) {
  const normalized = normalizeText(answer);

  if (!normalized) {
    return 0;
  }

  const accepted = acceptedAnswers(card).map(normalizeText);
  let grade = 0;

  if (accepted.includes(normalized)) {
    grade = responseMs < settings.fastAnswerMs && hints === 0 ? 3 : 2;
  } else if (accepted.some((candidate) => levenshtein(normalized, candidate) <= (candidate.length >= 5 ? 1 : 0))) {
    grade = 1;
  }

  if (hints === 1) {
    grade = Math.min(grade, 1);
  } else if (hints >= 2) {
    grade = 0;
  }

  return grade;
}

async function recordReview(score) {
  if (!currentCard) {
    return;
  }

  const reviewedCard = cards[currentCard.index];
  const reviewState = reviewedCard.reviewCards[currentCard.directionKey];
  const stateBefore = reviewState.state;
  const intervalBefore = reviewState.interval;
  const interval = scheduleReview(reviewState, score, stateBefore);

  reviewState.note = score;
  reviewState.noteLabel = scoreLabels[score];
  reviewState.response = score;
  reviewState.reviewedAt = new Date().toISOString();
  reviewState.reviewDirection = currentCard.direction;
  reviewState.reviewPrompt = currentCard.prompt;
  reviewState.reviewAnswer = currentCard.answer;
  reviewState.nextReviewInDays = interval;
  reviewState.intervalBefore = intervalBefore;
  reviewState.stateBefore = stateBefore;
  reviewState.introduced_on = reviewState.introduced_on || todayIso();
  mirrorReviewCard(reviewedCard, currentCard.directionKey);
  tryUnlock(reviewedCard);
  cascadeLapse(reviewedCard, currentCard.directionKey, score, stateBefore);
  burySibling(reviewedCard, currentCard.directionKey);

  reviewedCard.response = score;
  reviewedCard.reviewedAt = reviewState.reviewedAt;
  reviewedCard.reviewDirection = currentCard.direction;
  reviewedCard.reviewPrompt = currentCard.prompt;
  reviewedCard.reviewAnswer = currentCard.answer;

  await saveCurrentDeckProgress();
  baseQueue = [];
  pickCard();
}

function readSelectedDeckFile() {
  const file = csvFileInput.files[0];

  if (!file) {
    setImportPreview("Choisissez un fichier CSV ou TXT.", true);
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      const text = String(reader.result || "");
      const selectedDelimiter = csvDelimiterInput.value;
      const delimiter = selectedDelimiter === "auto"
        ? detectDelimiter(text)
        : selectedDelimiter === "tab"
          ? "\t"
          : selectedDelimiter;
      const rows = parseCsv(text, delimiter);
      const nextCards = rowsToCards(rows, csvHasHeaderInput.checked);
      resolve(nextCards);
    });

    reader.addEventListener("error", () => {
      setImportPreview("Impossible de lire le fichier.", true);
      resolve([]);
    });

    reader.readAsText(file);
  });
}

async function previewSelectedDeckFile() {
  const file = csvFileInput.files[0];

  if (!file) {
    importedCards = [];
    deckNameInput.value = "";
    setImportPreview("Aucun fichier selectionne.");
    return;
  }

  deckNameInput.value = deckNameInput.value || nameFromFile(file.name);
  importedCards = await readSelectedDeckFile();

  if (importedCards.length === 0) {
    setImportPreview("Aucune carte valide trouvee dans le fichier.", true);
    return;
  }

  setImportPreview(`${importedCards.length} carte(s) detectee(s).`);
}

async function saveImportedDeck() {
  const deckName = deckNameInput.value.trim();

  if (!deckName) {
    setImportPreview("Donnez un nom au deck.", true);
    return;
  }

  if (importedCards.length === 0) {
    importedCards = await readSelectedDeckFile();
  }

  if (importedCards.length === 0) {
    setImportPreview("Aucune carte valide a enregistrer.", true);
    return;
  }

  if (!firestoreDb && !createFirebaseClient()) {
    return;
  }

  setImportPreview("Enregistrement du deck...");

  try {
    const normalizedDeckId = normalizeDeckId(deckName);

    await firestoreDb.collection("decks").doc(normalizedDeckId).set({
      name: deckName,
      cards: importedCards,
      cardCount: importedCards.length,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    loadDeck(deckName, importedCards, normalizedDeckId);
    importDialog.close();
    setStatus(`Deck "${deckName}" enregistre et charge.`);
  } catch (error) {
    setImportPreview(`Erreur Firebase : ${error.message}`, true);
  }
}

function renderEditableDeck() {
  editCardList.innerHTML = "";

  if (!editingDeck || editingDeck.cards.length === 0) {
    editCardList.innerHTML = '<p class="empty-state">Aucune carte dans ce deck.</p>';
    return;
  }

  editingDeck.cards.forEach((card, index) => {
    const row = document.createElement("div");
    const content = document.createElement("div");
    const word = document.createElement("strong");
    const translation = document.createElement("span");
    const sentence = document.createElement("small");
    const removeButton = document.createElement("button");

    row.className = "edit-card-row";
    content.className = "edit-card-content";
    word.textContent = card.word || "(vide)";
    translation.textContent = card.translation || "(vide)";
    sentence.textContent = card.sentence || "";
    removeButton.type = "button";
    removeButton.textContent = "Supprimer";
    removeButton.addEventListener("click", () => {
      editingDeck.cards.splice(index, 1);
      renderEditableDeck();
    });

    content.append(word, translation, sentence);
    row.append(content, removeButton);
    editCardList.append(row);
  });
}

function openEditDeckDialog(deckId, deckName, deckCards) {
  editingDeck = {
    id: deckId,
    name: deckName,
    cards: deckCards.map((card) => normalizeCard(card)),
  };

  editDeckTitle.textContent = `Modifier ${deckName}`;
  editDeckStatus.textContent = "";
  editDeckStatus.classList.remove("error");
  renderEditableDeck();
  editDeckDialog.showModal();
}

async function saveEditedDeck() {
  if (!editingDeck) {
    return;
  }

  if (!firestoreDb && !createFirebaseClient()) {
    editDeckStatus.textContent = "Firebase n'est pas configuré.";
    editDeckStatus.classList.add("error");
    return;
  }

  saveEditedDeckButton.disabled = true;
  editDeckStatus.textContent = "Sauvegarde en cours...";
  editDeckStatus.classList.remove("error");

  try {
    const cleanedCards = removeUndefined(editingDeck.cards.map((card) => normalizeCard(card)));

    await firestoreDb.collection("decks").doc(editingDeck.id).set({
      name: editingDeck.name,
      cards: cleanedCards,
      cardCount: cleanedCards.length,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    if (currentDeckId === editingDeck.id) {
      loadDeck(editingDeck.name, cleanedCards, editingDeck.id);
    }

    editDeckDialog.close();
    await refreshDeckList();
    setStatus(`Deck "${editingDeck.name}" mis à jour.`);
  } catch (error) {
    editDeckStatus.textContent = `Erreur Firebase : ${error.message}`;
    editDeckStatus.classList.add("error");
    setStatus(`Erreur Firebase : ${error.message}`, true);
  } finally {
    saveEditedDeckButton.disabled = false;
  }
}

async function deleteDeck(deckId, deckName) {
  if (!firestoreDb && !createFirebaseClient()) {
    setStatus("Firebase n'est pas configuré.", true);
    return;
  }

  const confirmed = window.confirm(`Supprimer définitivement le deck "${deckName}" ?`);

  if (!confirmed) {
    return;
  }

  try {
    await firestoreDb.collection("decks").doc(deckId).delete();

    if (currentDeckId === deckId) {
      currentDeckId = null;
      loadDeck("Exemple", defaultCards.map(normalizeCard), null);
    }

    await refreshDeckList();
    setStatus(`Deck "${deckName}" supprimé.`);
  } catch (error) {
    setStatus(`Erreur Firebase : ${error.message}`, true);
  }
}

async function refreshDeckList() {
  deckListEl.innerHTML = "";

  if (!firestoreDb && !createFirebaseClient()) {
    deckListEl.innerHTML = '<p class="empty-state">Configurez firebase-config.js pour charger des decks.</p>';
    return;
  }

  deckListEl.innerHTML = '<p class="empty-state">Chargement...</p>';

  try {
    const snapshot = await firestoreDb.collection("decks").orderBy("name", "asc").get();

    if (snapshot.empty) {
      deckListEl.innerHTML = '<p class="empty-state">Aucun deck enregistre.</p>';
      return;
    }

    deckListEl.innerHTML = "";
    snapshot.docs.forEach((deckDoc) => {
      const deck = deckDoc.data();
      const item = document.createElement("div");
      const info = document.createElement("button");
      const name = document.createElement("span");
      const count = document.createElement("small");
      const editButton = document.createElement("button");
      const deleteButton = document.createElement("button");
      const deckName = deck.name || deckDoc.id;
      const deckCards = Array.isArray(deck.cards) ? deck.cards : [];
      const known = knownCardCount(deckCards);
      const total = deckCards.length;

      item.className = "deck-list-item";
      info.type = "button";
      info.className = "deck-load-button";
      name.textContent = deckName;
      count.textContent = `${known}/${total}`;
      editButton.type = "button";
      editButton.className = "deck-edit-button";
      editButton.textContent = "Modifier";
      deleteButton.type = "button";
      deleteButton.className = "deck-delete-button";
      deleteButton.textContent = "Supprimer";
      info.addEventListener("click", () => {
        loadDeck(deckName, deckCards, deckDoc.id);
        deckListDialog.close();
        setStatus(`Deck "${deckName}" charge.`);
      });
      editButton.addEventListener("click", () => {
        openEditDeckDialog(deckDoc.id, deckName, deckCards);
      });
      deleteButton.addEventListener("click", () => {
        deleteDeck(deckDoc.id, deckName);
      });
      info.append(name, count);
      item.append(info, editButton, deleteButton);
      deckListEl.append(item);
    });
  } catch (error) {
    const errorMessage = document.createElement("p");
    errorMessage.className = "empty-state error";
    errorMessage.textContent = `Erreur Firebase : ${error.message}`;
    deckListEl.innerHTML = "";
    deckListEl.append(errorMessage);
  }
}

function openImportDialog() {
  importedCards = [];
  csvFileInput.value = "";
  deckNameInput.value = "";
  setImportPreview("Choisissez un fichier pour creer un deck.");
  importDialog.showModal();
}

function openDeckListDialog() {
  deckListDialog.showModal();
  refreshDeckList();
}

flashcard.addEventListener("click", revealCard);
typedAnswer.addEventListener("click", (event) => {
  event.stopPropagation();
});
flashcard.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    revealCard();
  }
});
reviewActions.addEventListener("click", (event) => {
  const score = Number.parseInt(event.target.dataset.score, 10);

  if ([0, 1, 2, 3].includes(score)) {
    recordReview(score);
  }
});
submitTypedAnswerButton.addEventListener("click", submitTypedAnswer);
showHintButton.addEventListener("click", showProgressiveHint);
typedInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitTypedAnswer();
  }
});
revealButton.addEventListener("click", revealCard);
shuffleButton.addEventListener("click", pickCard);
nextButton.addEventListener("click", pickCard);
openImportButton.addEventListener("click", openImportDialog);
openDecksButton.addEventListener("click", openDeckListDialog);
closeImportButton.addEventListener("click", () => importDialog.close());
closeDeckListButton.addEventListener("click", () => deckListDialog.close());
closeEditDeckButton.addEventListener("click", () => editDeckDialog.close());
saveEditedDeckButton.addEventListener("click", saveEditedDeck);
csvFileInput.addEventListener("change", previewSelectedDeckFile);
csvDelimiterInput.addEventListener("change", previewSelectedDeckFile);
csvHasHeaderInput.addEventListener("change", previewSelectedDeckFile);
saveImportedDeckButton.addEventListener("click", saveImportedDeck);
refreshDecksButton.addEventListener("click", refreshDeckList);

cards = cards.map(normalizeCard);
createFirebaseClient();
updateDeckMeta();
pickCard();
