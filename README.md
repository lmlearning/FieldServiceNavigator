# Field Service Technician App

A multimodal search application for field service technicians to quickly find solutions using text, images, or video queries.

## Features

- **Multimodal Search**: Search using any combination of text descriptions, photos, or videos
- **AI-Powered**: Uses Google's Vertex AI multimodal embeddings for semantic search
- **Real-time Results**: Fast retrieval from BigQuery knowledge base
- **Rich Media Display**: Preview images and videos directly in search results
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## Prerequisites

1. Google Cloud Project with the following APIs enabled:
   - BigQuery API
   - Vertex AI API
   - Cloud Storage API

2. Completed setup from the Jupyter notebook:
   - BigQuery dataset with embeddings
   - Cloud Storage bucket with assets
   - Vertex AI multimodal embedding model

3. Node.js 18+ installed

## Installation

1. Clone this repository:
```bash
git clone <repository>
cd field-service-app
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Update with your Google Cloud project details

4. Set up authentication:
```bash
# Option 1: Use Application Default Credentials
gcloud auth application-default login

# Option 2: Use Service Account Key
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
```

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The application will be available at `http://localhost:3000`

## Usage

1. **Text Search**: Enter a description of the problem in the text field
2. **Image Search**: Upload or drag-drop a photo of the equipment
3. **Video Search**: Upload a video showing the malfunction
4. **Combined Search**: Use any combination of the above

Click "Search Knowledge Base" to find relevant solutions.

## Architecture

- **Backend**: Node.js with Express
- **Frontend**: Vanilla JavaScript with modern CSS
- **Database**: BigQuery with vector embeddings
- **AI Model**: Vertex AI Multimodal Embeddings
- **Storage**: Google Cloud Storage for assets

## API Endpoints

- `GET /api/health` - Health check endpoint
- `POST /api/search` - Multimodal search endpoint
  - Accepts: text, image file, video file
  - Returns: Ranked results with similarity scores

## Deployment

For production deployment, consider:

1. **Google Cloud Run**: 
```bash
gcloud run deploy field-service-app   --source .   --region us-central1   --set-env-vars-from-file .env
```

2. **App Engine**:
```bash
gcloud app deploy
```

3. **Compute Engine**: Use PM2 or systemd for process management

## Security Considerations

- Enable HTTPS in production
- Implement authentication (e.g., Firebase Auth, Auth0)
- Add rate limiting for API endpoints
- Validate and sanitize all inputs
- Use Cloud IAM for service account permissions

## Performance Optimization

- Implement caching for frequently accessed results
- Use CDN for static assets
- Consider pagination for large result sets
- Optimize image/video processing pipeline

## License

MIT
