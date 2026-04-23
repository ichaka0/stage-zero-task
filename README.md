# Stage 2 Profile Search API

NestJS API for creating, storing, filtering, sorting, paginating, and searching inferred name profiles.

## Base URL

`https://stage-zero-task-gamma.vercel.app`

## Features

- Creates profiles from `Genderize`, `Agify`, and `Nationalize`
- Stores inferred demographics in Postgres
- Supports filtering by gender, age range, age group, and country
- Supports sorting by `age`, `created_at`, and `gender_probability`
- Supports capped pagination with a structured pagination envelope
- Supports natural-language queries through `/api/profiles/search`

## Endpoints

### `POST /api/profiles`

Creates a profile from a name.

Request body:

```json
{
  "name": "Ada"
}
```

Success response:

```json
{
  "status": "success",
  "data": {
    "id": "018f84d7-3d67-7b42-8e46-6a33e8b98690",
    "name": "ada",
    "gender": "female",
    "gender_probability": 0.98,
    "sample_size": 12345,
    "age": 31,
    "age_group": "adult",
    "country_id": "NG",
    "country_probability": 0.77,
    "created_at": "2026-04-23T12:00:00.000Z"
  }
}
## Natural Language Parsing Approach
The `/api/profiles/search` endpoint utilizes a rule-based Regex parsing engine to translate human-readable string queries into structured SQL `WHERE` clauses without the overhead of an LLM.

**How it works:**
1. **Sanitization:** The input string is normalized to lowercase to ensure case-insensitive matching.
2. **Token Extraction via RegEx:** The engine scans for specific syntax patterns:
   - **Gender:** Matches exact whole words (`\b(male|males|female...)\b`). It includes a cancellation check (if a query says "male and female", it drops the gender filter entirely to match both).
   - **Age Groups:** Matches lifecycle keywords (`teenagers`, `adults`) mapping to their respective `age_group` strings.
   - **Static Modifiers:** The keyword `young` translates into bounding logic: `min_age=16` and `max_age=24`.
   - **Relational Age Modifiers:** Captures numbers following comparative operators (e.g., `above (\d+)`, `under (\d+)`) to dynamically generate `min_age` and `max_age`.
   - **Geographic Data:** Extracts strings matching specific country names mapped to a static dictionary for ISO codes.

**Limitations and Edge Cases Left Out:**
- **Compound Modifiers:** The parser handles intersections (AND logic). Complex union queries (OR logic) are not supported.
- **Typo Tolerance:** As a strict rule-based regex engine, it lacks fuzzy matching. "Nigera" will fail to parse and return an "Unable to interpret query" error.
- **Extensive Geographic Mapping:** The country resolution relies on a hardcoded mapping dictionary limited to known seed database countries.```

### `GET /api/profiles`

Returns stored profiles with filtering, sorting, and pagination.

Supported query params:

- `gender=male|female`
- `age_group=child|teenager|adult|senior`
- `country_id=NG`
- `min_age=18`
- `max_age=35`
- `min_gender_probability=0.7`
- `min_country_probability=0.2`
- `sort_by=age|created_at|gender_probability`
- `order=asc|desc`
- `page=1`
- `limit=10`

Example:

`/api/profiles?gender=female&country_id=NG&sort_by=age&order=desc&page=1&limit=5`

Response shape:

```json
{
  "status": "success",
  "data": [],
  "page": 1,
  "limit": 5,
  "total": 12,
  "count": 5,
  "pagination": {
    "page": 1,
    "limit": 5,
    "total": 12,
    "total_pages": 3,
    "has_next_page": true,
    "has_previous_page": false
  }
}
```

Notes:

- `limit` is capped at `50`
- Invalid `sort_by` or malformed numeric filters return `400`

### `GET /api/profiles/search`

Runs a natural-language search and returns the same response shape as `GET /api/profiles`.

Supported examples:

- `/api/profiles/search?q=young males&limit=50`
- `/api/profiles/search?q=females above 30&limit=50`
- `/api/profiles/search?q=people from nigeria&limit=50`
- `/api/profiles/search?q=adult males from kenya&limit=50`
- `/api/profiles/search?q=male and female teenagers above 17&limit=50`

If the query cannot be interpreted, the API returns:

```json
{
  "status": "error",
  "message": "Unable to interpret query"
}
```

### `GET /api/profiles/:id`

Fetches a single stored profile by id.

### `DELETE /api/profiles/:id`

Deletes a stored profile by id.

## Local Setup

```bash
npm install
npm run build
npm run start:dev
```

Required environment variable:

- `DB_URL`

## Deployment

Production deployment:

`https://stage-zero-task-gamma.vercel.app`
