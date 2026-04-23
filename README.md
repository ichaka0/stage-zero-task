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
```

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

## Natural Language Parsing

The `/api/profiles/search` endpoint uses a simple rule-based parser in [src/profile/profile.service.ts](/Users/nnubiaobinna/Downloads/stage-zero-task/src/profile/profile.service.ts:182). It is intentionally deterministic: the incoming `q` string is lowercased, matched against known keywords with regex and substring checks, converted into filter fields, and then passed into the same filtering pipeline used by `GET /api/profiles`.

### Supported Keywords And Mapping

- Gender keywords: `male`, `males`, `men`, `boy`, `boys` map to `gender=male`
- Gender keywords: `female`, `females`, `women`, `girl`, `girls` map to `gender=female`
- If both male and female terms appear in the same query, no `gender` filter is added so both can match
- `young` maps to `min_age=13` and `max_age=25`
- `teenager`, `teenagers`, `teens` map to `min_age=13` and `max_age=19`
- `adult`, `adults` map to `min_age=18` and `max_age=59`
- `child`, `children`, `kid`, `kids` map to `max_age=12`
- `senior`, `seniors`, `elderly` map to `min_age=60`
- `above 30`, `over 30`, `older than 30` map to `min_age=31`
- `under 18`, `below 18`, `younger than 18` map to `max_age=17`
- Country phrases like `from nigeria`, `in kenya`, or the bare country name map to ISO country filters such as `country_id=NG` and `country_id=KE`

### How The Logic Works

1. The parser normalizes the query to lowercase.
2. It scans for gender words and applies a gender filter only when one side is clearly requested.
3. It scans for age-band words like `young`, `teenagers`, and `adult`, which become numeric age filters.
4. It scans for comparison phrases like `above X` and `under X`, which override or narrow the age range.
5. It scans for supported country names and converts them to ISO country codes.
6. The parsed filters are forwarded into `getFilteredProfiles()`, so natural-language search reuses the same SQL filtering, sorting, and pagination behavior as the standard query-parameter endpoint.

Examples:

- `young males` becomes `gender=male`, `min_age=13`, `max_age=25`
- `females above 30` becomes `gender=female`, `min_age=31`
- `adult males from kenya` becomes `gender=male`, `min_age=18`, `max_age=59`, `country_id=KE`
- `male and female teenagers above 17` becomes `min_age=18`, `max_age=19`

## Limitations

- The parser is rule-based, not semantic. It does not understand arbitrary phrasing outside the supported patterns.
- It does not do fuzzy matching or typo correction. Queries like `nigeira` will not resolve to `NG`.
- Country support is limited to the hardcoded country names in the service: `nigeria`, `kenya`, `angola`, `tanzania`, `uganda`, and `sudan`.
- It only supports intersection-style filtering. It does not support explicit `OR` logic such as “males or seniors from kenya”.
- It does not support advanced comparative language like “around 30”, “between 20 and 25”, “at least 18”, or “not from nigeria”.
- When both male and female words appear together, the parser intentionally drops the gender filter rather than trying to build a multi-value gender condition.
- If the final age bounds become contradictory, such as a minimum age greater than the maximum age, the request is rejected with `400 Unable to interpret query`.

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
