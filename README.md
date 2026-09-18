# Mneme

Mneme est une petite application web statique pour apprendre des traductions avec des cartes.

## Lancer l'application

Ouvrir `index.html` dans un navigateur.

Les fichiers nécessaires doivent rester dans le même dossier :

- `index.html`
- `styles.css`
- `app.js`
- `firebase-config.js`

## Format des cartes

Les decks s'importent depuis un fichier CSV ou TXT avec ces colonnes :

```txt
mot; traduction; phrase facultative
bonjour; hello; Bonjour, comment allez-vous ?
merci; thank you; Merci pour votre aide.
```

## Import CSV/TXT

Le bouton `Importer un deck` ouvre une fenêtre de sélection de fichier. Le nom du deck est proposé à partir du nom du fichier, puis il peut être modifié avant enregistrement.

```csv
mot,traduction,phrase facultative
bonjour,hello,"Bonjour, comment allez-vous ?"
```

Le séparateur peut être une virgule, un point-virgule ou une tabulation.

Le bouton `Charger un deck` ouvre la liste des decks enregistrés dans Firebase.

## Revision

Une carte se revele au clic. Apres revelation, quatre scores apparaissent :

- `0 Oublié` : remet le niveau a 0, ajoute une erreur, reprogramme aujourd'hui, et force un retour apres 3 ou 4 cartes dans la session.
- `1 Difficile` : ajoute une reponse correcte, reprogramme selon la progression reduite, et force aussi un retour apres 3 ou 4 cartes dans la session.
- `2 Correct` : ajoute une reponse correcte et suit la progression normale.
- `3 Facile` : ajoute une reponse correcte et allonge l'intervalle.

Chaque carte conserve `level`, `next_review`, `correct`, `wrong`, `note`, `noteLabel`, `response`, `reviewedAt`, `reviewPrompt`, `reviewAnswer` et `nextReviewInDays`. Chaque reponse met a jour le deck dans Firestore.

Dans Firestore, ces champs sont dans chaque objet du tableau `cards` du document `decks/{deckId}`.

## Firebase

L'application stocke les decks dans Firebase Firestore, collection `decks`.

Pour ne pas ressaisir ces valeurs, remplir le fichier local `firebase-config.js` :

```js
window.MNEME_FIREBASE_CONFIG = {
  apiKey: "AIza...",
  projectId: "mon-projet",
  appId: "1:123:web:abc",
};
```

Ce fichier est ignoré par Git. Le fichier `firebase-config.example.js` sert de modèle.
