const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { BigQuery } = require('@google-cloud/bigquery');
const { Storage } = require('@google-cloud/storage');
const { GoogleAuth } = require('google-auth-library');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Google Cloud clients
const bigquery = new BigQuery({
  projectId: process.env.PROJECT_ID,
  location: process.env.BQ_LOCATION
});
const storage = new Storage({ projectId: process.env.PROJECT_ID });
const bucket = storage.bucket(process.env.BUCKET_NAME);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Helper function to generate embeddings via REST (robust to response variants)
async function generateEmbedding(content, contentType = 'text') {
  let instance = {};
  let cleanup = null;

  try {
    if (contentType === 'text') {
      instance = { text: content };
    } else if (contentType === 'image') {
      // For images, content should be base64 encoded
      instance = { image: { bytesBase64Encoded: content } };
    } else if (contentType === 'video') {
      // Upload raw bytes to GCS, then reference via gcsUri
      const tempFileName = `temp/${uuidv4()}.mp4`;
      const file = bucket.file(tempFileName);
      await file.save(content);
      const gcsUri = `gs://${process.env.BUCKET_NAME}/${tempFileName}`;
      instance = {
        video: { gcsUri },
        videoSegmentConfig: { startOffsetSec: 0, endOffsetSec: 15, intervalSec: 5 }
      };
      cleanup = async () => { try { await bucket.file(tempFileName).delete(); } catch (_) {} };
    }

    const url = `https://${process.env.VERTEX_REGION}-aiplatform.googleapis.com/v1/projects/${process.env.PROJECT_ID}/locations/${process.env.VERTEX_REGION}/publishers/google/models/multimodalembedding@001:predict`;

    const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    const token = typeof accessToken === 'string' ? accessToken : (accessToken.token ?? accessToken);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        instances: [instance],
        parameters: { outputDimensionality: 1408 }
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Vertex REST ${res.status}: ${text}`);
    }

    const data = await res.json();
    const pred = (data.predictions && data.predictions[0]) || {};

    // Robustly find an embedding vector anywhere in the payload
    const isNum = (x) => typeof x === 'number' && isFinite(x);
    const looksLikeVec = (arr) => Array.isArray(arr) && arr.length >= 32 && arr.length <= 8192 && arr.every(isNum);
    const meanPool = (arrays) => {
      if (!Array.isArray(arrays) || arrays.length === 0) return null;
      const first = arrays[0];
      if (!looksLikeVec(first)) return null;
      const len = first.length;
      const acc = new Array(len).fill(0);
      arrays.forEach(a => a.forEach((v, i) => acc[i] += v));
      return acc.map(x => x / arrays.length);
    };
    const valuesOf = (x) => (x && Array.isArray(x.values)) ? x.values : null;

    function findEmbedding(node, preferKeyMatch = true) {
      if (!node) return null;
      if (looksLikeVec(node)) return node;
      const vals = valuesOf(node);
      if (vals && looksLikeVec(vals)) return vals;
      if (Array.isArray(node)) {
        if (node.length && looksLikeVec(node[0])) return meanPool(node);
        if (node.length && valuesOf(node[0])) {
          const arrs = node.map(e => e.values);
          return meanPool(arrs) || (arrs[0] || null);
        }
      }
      if (typeof node === 'object') {
        if (preferKeyMatch) {
          for (const [k, v] of Object.entries(node)) {
            if (/embedding(s)?$/i.test(k)) {
              const res = findEmbedding(v, false);
              if (res) return res;
            }
          }
        }
        for (const v of Object.values(node)) {
          const res = findEmbedding(v, false);
          if (res) return res;
        }
      }
      return null;
    }

    const embedding = findEmbedding(pred);
    if (!embedding) {
      try { console.error('Vertex response (truncated):', JSON.stringify(data).slice(0, 2000)); } catch (_) {}
      throw new Error('No embedding found in Vertex response');
    }
    return embedding;
  } catch (error) {
    console.error('Error generating embedding (REST):', error);
    throw error;
  } finally {
    if (cleanup) await cleanup();
  }
}

// Helper function to perform vector search across ALL modalities
async function vectorSearch(queryEmbedding, topK = 20) {
  // Normalize embedding to a plain array of numbers for BigQuery param binding
  const normalizeEmbedding = (e) => {
    if (Array.isArray(e)) return e.map(Number);
    if (e && Array.isArray(e.values)) return e.values.map(Number);
    if (e && typeof e.length === 'number' && typeof e !== 'string') return Array.from(e, Number);
    throw new Error('Invalid embedding: expected an array of numbers');
  };
  const embeddingParam = normalizeEmbedding(queryEmbedding);
  const dim = Array.isArray(embeddingParam) ? embeddingParam.length : null;

  const query = `
    WITH query_embedding AS (
      SELECT @embedding AS embedding
    )
    SELECT
      base.asset_id,
      base.modality,
      base.snippet,
      base.gcs_uri,
      base.product,
      ML.DISTANCE(base.embedding, query.embedding, 'COSINE') AS distance
    FROM \`${process.env.PROJECT_ID}.${process.env.DATASET_ID}.kb_corpus\` AS base
    CROSS JOIN query_embedding AS query
    WHERE base.product = 'general-tools' 
      AND base.language = 'en'
      AND base.embedding IS NOT NULL
      AND (@dim IS NULL OR ARRAY_LENGTH(base.embedding) = @dim)
    ORDER BY distance ASC
    LIMIT @topK
  `;
  
  const options = {
    query,
    params: {
      embedding: embeddingParam,
      topK: Number(topK),
      dim: dim
    },
    types: {
      embedding: ['FLOAT64'],
      topK: 'INT64',
      dim: 'INT64'
    }
  };
  
  const [rows] = await bigquery.query(options);
  
  // Absolute cosine similarity mapping (1 - distance) in [0,100]
  return rows.map(row => ({
    ...row,
    startSec: row.segment_start_sec ?? row.start_sec ?? row.segment_start ?? null,
    similarity: Math.max(0, Math.min(100, (1 - (row.distance ?? 1)) * 100))
  }));
}

// Route: Search endpoint
app.post('/api/search', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 }
]), async (req, res) => {
  try {
    const { text } = req.body;
    const imageFile = req.files?.image?.[0];
    const videoFile = req.files?.video?.[0];
    
    const embeddings = [];
    const sources = [];
    
    // Generate embeddings for each input type
    if (text && text.trim()) {
      console.log('Processing text query:', text);
      const textEmbedding = await generateEmbedding(text, 'text');
      embeddings.push(textEmbedding);
      sources.push('text');
    }
    
    if (imageFile) {
      console.log('Processing image query');
      const imageBase64 = imageFile.buffer.toString('base64');
      const imageEmbedding = await generateEmbedding(imageBase64, 'image');
      embeddings.push(imageEmbedding);
      sources.push('image');
    }
    
    if (videoFile) {
      console.log('Processing video query');
      const videoEmbedding = await generateEmbedding(videoFile.buffer, 'video');
      embeddings.push(videoEmbedding);
      sources.push('video');
    }
    
    if (embeddings.length === 0) {
      return res.status(400).json({ error: 'No input provided' });
    }
    
    // Perform searches (each query embedding searches ALL modalities) and merge results
    const allResults = [];
    for (let i = 0; i < embeddings.length; i++) {
      const results = await vectorSearch(embeddings[i], 20);
      results.forEach(r => {
        r.source = sources[i]; // which query modality produced this hit
        allResults.push(r);
      });
    }
    
    // Merge and deduplicate results
    const mergedResults = {};
    allResults.forEach(result => {
      const key = result.gcs_uri;
      if (!mergedResults[key] || mergedResults[key].distance > result.distance) {
        mergedResults[key] = result;
      }
    });
    
    // Sort by similarity and limit
    const finalResults = Object.values(mergedResults)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 20);
    
    // Build local asset URLs (proxied through server) to avoid signed URLs
    for (const result of finalResults) {
      if (result.gcs_uri) {
        const enc = encodeURIComponent(result.gcs_uri);
        result.assetUrl = `/asset?gcsUri=${enc}`;
      } else {
        result.assetUrl = null;
      }
    }
    
    res.json({
      success: true,
      results: finalResults,
      queryTypes: sources
    });
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: 'Search failed: ' + error.message
    });
  }
});

// Route: Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    project: process.env.PROJECT_ID,
    dataset: process.env.DATASET_ID
  });
});

// Stream GCS asset via this server (avoids signed URLs)
app.get('/asset', async (req, res) => {
  try {
    const gcsUri = req.query.gcsUri;
    if (!gcsUri || !gcsUri.startsWith('gs://')) {
      return res.status(400).send('Invalid gcsUri');
    }
    const parts = gcsUri.replace('gs://', '').split('/');
    const bucketName = parts.shift();
    const objectName = parts.join('/');
    const f = storage.bucket(bucketName).file(objectName);

    const [metadata] = await f.getMetadata();
    const mime = metadata.contentType || 'application/octet-stream';
    const size = parseInt(metadata.size || '0', 10);

    const range = req.headers.range;
    if (range) {
      // Support Range requests for video
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      const start = match ? parseInt(match[1], 10) : 0;
      const end = match && match[2] ? parseInt(match[2], 10) : Math.min(start + 1024 * 1024, size - 1);
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mime
      });
      f.createReadStream({ start, end })
        .on('error', (err) => {
          console.error('Asset stream error:', err);
          res.status(500).end();
        })
        .pipe(res);
    } else {
      res.setHeader('Content-Type', mime);
      if (size) res.setHeader('Content-Length', size);
      f.createReadStream()
        .on('error', (err) => {
          console.error('Asset stream error:', err);
          res.status(500).end();
        })
        .pipe(res);
    }
  } catch (err) {
    console.error('Asset route error:', err);
    res.status(500).send('Failed to fetch asset');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Field Service App running on http://localhost:${PORT}`);
  console.log(`📊 Connected to BigQuery dataset: ${process.env.PROJECT_ID}.${process.env.DATASET_ID}`);
});
