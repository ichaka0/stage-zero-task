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
Use code with caution.
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
Use code with caution.
Running the App
bash
# development
npm run start

# watch mode
npm run start:dev

# production mode
npm run start:prod
Use code with caution.
Technologies Used
Framework: NestJS (TypeScript)
HTTP Client: Axios
Deployment: 
Author: Nnubia Obinna
