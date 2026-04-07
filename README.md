# Spine

Spine is a mobile application designed to redefine how readers discover their next book. Moving beyond outdated interfaces and generic bestseller lists, Spine focuses on the "vibe" and the emotional soul of a book to provide truly personalized recommendations.

## The Concept

The project was born out of a frustration with traditional book discovery tools that feel stuck in the early 2000s. Spine moves beyond surface-level genres to help users find books based on specific moods, atmospheres, and niche tropes—acting more like a personal librarian than a static database.

## The 3 Recommendation Engines

Spine doesn't rely on a single algorithm. Instead, it uses a tri-engine approach to cover different psychological states of a reader:

### 1. The "Sure Thing" (Precision Matching)
This is the analytical core of the app. It processes the user’s entire library to identify recurring patterns in themes, writing styles, and pacing.
* **Goal:** Minimize "reading slumps" by finding the book you are statistically most likely to enjoy.
* **Logic:** Builds a personalized preference profile based on historical likes and dislikes.

### 2. The "Wildcard" (Cross-Genre Discovery)
This engine focuses on the **emotional core** rather than genre labels. It identifies *why* you love a book (e.g., "a sense of isolation" or "complex moral ambiguity") and finds those same traits in a completely different category.
* **Goal:** Break the "genre bubble" and spark unexpected discoveries.
* **Logic:** Maps the "soul" of your favorites and recommends books from different genres that deliver the same feeling.

### 3. The "Deep Dive" (Contextual Mood)
Designed for the "I don't know what I want" moments. This is an interactive, prompt-based tool that uses a quick 3-question "vibe check" to prescribe a book for the exact moment.
* **Goal:** Instant gratification based on your current state of mind.
* **Logic:** Starts with a user prompt and narrows down the selection through specific atmospheric filters.

## Global Functioning

The system operates as a hybrid recommendation layer:

* **Enrichment:** Metadata is processed to extract "vibes," tropes, and emotional keywords beyond simple categories.
* **Profiling:** User data is transformed into a multi-dimensional preference map.
* **Routing:** Depending on the chosen engine, the system weights different vectors (e.g., "Sure Thing" weights similarity high, while "Wildcard" weights genre-distance high).
* **Feedback Loop:** Every interaction refines the global model, ensuring the recommendations improve over time.

---

*Developed with a focus on modern UI and human-centric discovery.*
