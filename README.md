# Field Service Navigator: Multimodal Search Hackathon Project

**Multimodal knowledge search for field-service technicians.** Search a maintenance knowledge base using text, images or video, with BigQuery retrieval and Vertex AI multimodal embeddings.

The repository combines a data-preparation notebook, example assets and a Node.js web application.

## Architecture

Browser query → Express API → Vertex AI embeddings → BigQuery knowledge-base search → ranked results and media previews.

Google Cloud Storage holds the media assets. The browser interface lives in [public](public/), and [server.js](server.js) implements search and asset access.

## Start with the notebook

Open [the preparation notebook](field-service-notebook-complete_FINAL.ipynb) to inspect the ingestion, embedding and BigQuery setup. Configure your own Google Cloud project, dataset and storage bucket before starting the web application. The server queries a `kb_corpus` table in the configured dataset.

## Run the web application

Use Node.js 18 or newer and a Google Cloud project with BigQuery, Vertex AI and Cloud Storage configured.

```bash
git clone https://github.com/lmlearning/FieldServiceNavigator.git
cd FieldServiceNavigator
npm install
```

Create a local `.env` file using the variables read by the server:

```dotenv
PROJECT_ID=your-google-cloud-project
BQ_LOCATION=your-bigquery-location
BUCKET_NAME=your-storage-bucket
VERTEX_REGION=your-vertex-region
DATASET_ID=your-bigquery-dataset
PORT=3000
```

Use values matching the resources prepared in the notebook. Authenticate locally and start the app:

```bash
gcloud auth application-default login
npm run dev
```

Open http://localhost:3000. `npm start` runs the server without the development watcher. Cloud queries, storage and model calls can incur charges. Keep credentials and local environment configuration out of commits.

## Explore the repository

| Path | Purpose |
| --- | --- |
| [Notebook](field-service-notebook-complete_FINAL.ipynb) | Data and embedding preparation |
| [data/assets_manifest.csv](data/assets_manifest.csv) | Example asset inventory |
| [data](data/) | Manuals, images and videos |
| [server.js](server.js) | Search, health and media routes |
| [public](public/) | Browser interface |
| [package.json](package.json) | Dependencies and startup commands |

The service exposes `GET /api/health`, `POST /api/search` and `GET /asset`. A health response alone does not validate embeddings, cloud permissions or end-to-end retrieval.

## Project status

This is a demonstration and submission artifact. A deployed service needs authentication, upload controls, rate limiting and cloud access policies appropriate to its users and data.

## License

See [LICENSE](LICENSE). Review source terms for third-party media and manuals separately.
