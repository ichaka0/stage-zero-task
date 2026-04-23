Stage 0 Task: Name Classifier API
A NestJS-based REST API that integrates with the Genderize.io API to predict the gender of a name, calculate confidence scores based on sample data, and return a structured JSON response.
Features
External API Integration: Connects with the Genderize.io API.
Data Transformation: Renames fields and adds custom logic (is_confident).
Standardized Errors: Handles missing parameters, invalid types, and empty API results.
CORS Enabled: Configured to allow all origins (*) for grading.
Performance: Built with NestJS for high availability and low latency.
API Specification
1. Classify Name
Endpoint: GET /api/classify?name={name}
Success Response (200 OK):
json
{
  "status": "success",
  "data": {
    "name": "john",
    "gender": "male",
    "probability": 0.99,
    "sample_size": 1234,
    "is_confident": true,
    "processed_at": "2026-04-16T12:00:00Z"
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
- **Extensive Geographic Mapping:** The country resolution relies on a hardcoded mapping dictionary limited to known seed database countries.
Confidence Logic:
is_confident is true only if probability >= 0.7 AND sample_size >= 100.
Error Handling:
400 Bad Request: Missing name parameter.
422 Unprocessable Entity: name is not a string.
404 Not Found: Returned if the API has no data for the name.
500/502: Upstream failure.

Setup Instructions
Prerequisites
Node.js (v18 or higher)
npm or yarn
Installation
bash
# Clone the repository
git clone git@github.com:jalopy01/stage-zero-task.git

# Install dependencies
npm install
Running the App
bash
# development
npm run start

# watch mode
npm run start:dev

# production mode
npm run start:prod

Technologies Used
Framework: NestJS (TypeScript)
HTTP Client: Axios
Deployment: https://stage-zero-task-gamma.vercel.app/api/classify?name=john
Author: Nnubia Obinna
