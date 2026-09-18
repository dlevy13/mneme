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

let cards = defaultCards;
let currentDeckName = "Exemple";
let currentDeckId = null;
let currentCard = null;
let importedCards = [];
let retryQueue = [];
let cardsSeen = 0;
let revealed = false;
let firestoreDb = null;

const progressionIntervals = [1, 3, 7, 14, 30, 60, 120];

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
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeCard(card) {
  return {
    ...card,
    level: Number.isInteger(card.level) ? card.level : 0,
    next_review: card.next_review || todayIso(),
    correct: Number.isInteger(card.correct) ? card.correct : 0,
    wrong: Number.isInteger(card.wrong) ? card.wrong : 0,
  };
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
      sentence: row.slice(2).join(" ").trim(),
    }))
    .filter((card) => card.word && card.translation)
    .map(normalizeCard);
}

function updateDeckMeta() {
  deckNameEl.textContent = currentDeckName;
  cardCountEl.textContent = `${cards.length} ${cards.length > 1 ? "cartes" : "carte"}`;
}

function getDueRetryIndex() {
  const dueReview = retryQueue
    .filter((review) => review.dueAt <= cardsSeen)
    .sort((a, b) => a.dueAt - b.dueAt)[0];

  return dueReview ? dueReview.cardIndex : null;
}

function getDueCardIndices() {
  const today = todayIso();
  const blockedRetryIndices = retryQueue
    .filter((review) => review.dueAt > cardsSeen)
    .map((review) => review.cardIndex);

  return cards
    .map((card, index) => ({ card, index }))
    .filter(({ card, index }) => (card.next_review || today) <= today && !blockedRetryIndices.includes(index))
    .map(({ index }) => index);
}

function pickCard() {
  if (cards.length === 0) {
    currentCard = null;
    promptEl.textContent = "Aucune carte";
    directionEl.textContent = "Deck vide";
    hintEl.textContent = "Importez ou chargez un deck";
    answerEl.hidden = true;
    sentenceEl.hidden = true;
    reviewActions.hidden = true;
    return;
  }

  const retryIndex = getDueRetryIndex();
  const dueIndices = getDueCardIndices();

  if (retryIndex === null && dueIndices.length === 0) {
    currentCard = null;
    promptEl.textContent = "Aucune carte à réviser";
    directionEl.textContent = "Session terminée";
    hintEl.textContent = "Chargez un autre deck ou revenez plus tard";
    answerEl.hidden = true;
    sentenceEl.hidden = true;
    reviewActions.hidden = true;
    return;
  }

  const cardIndex = retryIndex === null
    ? dueIndices[Math.floor(Math.random() * dueIndices.length)]
    : retryIndex;
  const card = cards[cardIndex];

  currentCard = {
    index: cardIndex,
    card,
    prompt: card.word,
    answer: card.translation,
    sentence: card.sentence,
    direction: "FR -> EN",
  };

  cardsSeen += 1;
  revealed = false;
  renderCard();
}

function renderCard() {
  if (!currentCard) {
    return;
  }

  promptEl.textContent = currentCard.prompt;
  directionEl.textContent = currentCard.direction;
  hintEl.hidden = revealed;
  hintEl.textContent = "Cliquer pour révéler";
  answerEl.hidden = !revealed;
  sentenceEl.hidden = !revealed || !currentCard.sentence;
  reviewActions.hidden = !revealed;
  answerEl.textContent = currentCard.answer;
  sentenceEl.textContent = currentCard.sentence;
}

function revealCard() {
  if (!currentCard) {
    return;
  }

  revealed = true;
  renderCard();
}

function loadDeck(name, nextCards, deckId = null) {
  currentDeckName = name;
  cards = nextCards;
  currentDeckId = deckId;
  cards = cards.map(normalizeCard);
  retryQueue = [];
  cardsSeen = 0;
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

function updateCardReview(card, score) {
  let interval = 0;

  if (score === 0) {
    card.level = 0;
    card.wrong = (card.wrong || 0) + 1;
    interval = 0;
  } else {
    card.correct = (card.correct || 0) + 1;
    card.level = (card.level || 0) + 1;

    const progressionIndex = Math.min(card.level - 1, progressionIntervals.length - 1);
    interval = progressionIntervals[progressionIndex];

    if (score === 1) {
      interval = Math.max(1, Math.floor(interval / 2));
    } else if (score === 3) {
      interval = Math.floor(interval * 1.5);
    }
  }

  card.next_review = addDaysIso(interval);
  return interval;
}

async function recordReview(score) {
  if (!currentCard) {
    return;
  }

  const reviewedCard = cards[currentCard.index];
  const interval = updateCardReview(reviewedCard, score);

  reviewedCard.response = score;
  reviewedCard.reviewedAt = new Date().toISOString();
  reviewedCard.reviewPrompt = currentCard.prompt;
  reviewedCard.reviewAnswer = currentCard.answer;
  reviewedCard.nextReviewInDays = interval;

  retryQueue = retryQueue.filter((review) => review.cardIndex !== currentCard.index);

  if (score <= 1) {
    retryQueue.push({
      cardIndex: currentCard.index,
      dueAt: cardsSeen + 3 + Math.floor(Math.random() * 2),
    });
  }

  await saveCurrentDeckProgress();
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
      const button = document.createElement("button");
      const name = document.createElement("span");
      const count = document.createElement("small");
      const deckName = deck.name || deckDoc.id;
      const deckCards = Array.isArray(deck.cards) ? deck.cards : [];

      button.type = "button";
      button.className = "deck-list-item";
      name.textContent = deckName;
      count.textContent = `${deck.cardCount || deckCards.length} carte(s)`;
      button.addEventListener("click", () => {
        loadDeck(deckName, deckCards, deckDoc.id);
        deckListDialog.close();
        setStatus(`Deck "${deckName}" charge.`);
      });
      button.append(name, count);
      deckListEl.append(button);
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
revealButton.addEventListener("click", revealCard);
shuffleButton.addEventListener("click", pickCard);
nextButton.addEventListener("click", pickCard);
openImportButton.addEventListener("click", openImportDialog);
openDecksButton.addEventListener("click", openDeckListDialog);
closeImportButton.addEventListener("click", () => importDialog.close());
closeDeckListButton.addEventListener("click", () => deckListDialog.close());
csvFileInput.addEventListener("change", previewSelectedDeckFile);
csvDelimiterInput.addEventListener("change", previewSelectedDeckFile);
csvHasHeaderInput.addEventListener("change", previewSelectedDeckFile);
saveImportedDeckButton.addEventListener("click", saveImportedDeck);
refreshDecksButton.addEventListener("click", refreshDeckList);

createFirebaseClient();
updateDeckMeta();
pickCard();
