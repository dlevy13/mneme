chaque mot a une next_review_date
chaque révision demande d’abord FR → EN
éventuellement ensuite EN → FR
l’utilisateur note sa réponse :
0 = oublié
1 = difficile
2 = correct
3 = facile
selon la note, tu repousses la prochaine révision
les mots ratés reviennent rapidement dans la même session
Voici un premier script Python fonctionnel :
import json
import os
from datetime import date, timedelta
import random

FILE = "vocab.json"

INTERVALS = {
    0: 0,   # oublié -> revoir aujourd'hui
    1: 1,   # difficile -> demain
    2: 3,   # correct
    3: 7,   # facile
}


def load_words():
    if not os.path.exists(FILE):
        return []

    with open(FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_words(words):
    with open(FILE, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, indent=2)


def add_word(words):
    french = input("Français : ").strip()
    english = input("Anglais : ").strip()
    example = input("Exemple anglais (optionnel) : ").strip()

    words.append({
        "french": french,
        "english": english,
        "example": example,
        "level": 0,
        "next_review": str(date.today()),
        "correct": 0,
        "wrong": 0
    })

    save_words(words)
    print("Mot ajouté.")


def get_due_words(words):
    today = date.today()

    due = [
        word for word in words
        if date.fromisoformat(word["next_review"]) <= today
    ]

    random.shuffle(due)
    return due


def review_word(word):
    print("\n" + "=" * 40)
    print(f"FR : {word['french']}")

    input("\nTrouve le mot anglais puis appuie sur Entrée...")

    print(f"\nEN : {word['english']}")

    if word.get("example"):
        print(f"Exemple : {word['example']}")

    print("""
Évaluation :
0 = oublié
1 = difficile
2 = correct
3 = facile
""")

    while True:
        try:
            score = int(input("Score : "))
            if score in [0, 1, 2, 3]:
                break
        except ValueError:
            pass

        print("Entre 0, 1, 2 ou 3.")

    return score


def update_word(word, score):
    today = date.today()

    if score == 0:
        word["level"] = 0
        word["wrong"] += 1
        interval = 0

    else:
        word["correct"] += 1
        word["level"] += 1

        # progression plus longue à mesure que le mot est maîtrisé
        progression = [1, 3, 7, 14, 30, 60, 120]

        index = min(word["level"] - 1, len(progression) - 1)
        interval = progression[index]

        if score == 1:
            interval = max(1, interval // 2)

        elif score == 3:
            interval = int(interval * 1.5)

    word["next_review"] = str(today + timedelta(days=interval))


def review_session(words):
    due = get_due_words(words)

    if not due:
        print("\nAucun mot à réviser aujourd'hui.")
        return

    print(f"\n{len(due)} mot(s) à réviser.")

    retry = []

    for word in due:
        score = review_word(word)
        update_word(word, score)

        if score == 0:
            retry.append(word)

    # deuxième passage immédiat sur les erreurs
    if retry:
        print("\n--- Deuxième passage sur les mots oubliés ---")

        random.shuffle(retry)

        for word in retry:
            score = review_word(word)
            update_word(word, score)

    save_words(words)

    print("\nSession terminée.")


def stats(words):
    print("\n--- Statistiques ---")

    print(f"Nombre de mots : {len(words)}")

    if not words:
        return

    correct = sum(w["correct"] for w in words)
    wrong = sum(w["wrong"] for w in words)

    print(f"Réponses correctes : {correct}")
    print(f"Réponses incorrectes : {wrong}")

    mastered = sum(1 for w in words if w["level"] >= 5)

    print(f"Mots bien maîtrisés : {mastered}")


def menu():
    words = load_words()

    while True:
        print("""
===============================
VOCAB TRAINER
===============================
1. Réviser
2. Ajouter un mot
3. Statistiques
4. Quitter
""")

        choice = input("> ")

        if choice == "1":
            review_session(words)

        elif choice == "2":
            add_word(words)

        elif choice == "3":
            stats(words)

        elif choice == "4":
            break


if __name__ == "__main__":
    menu()