// DOM Elements
const textInput = document.getElementById('textInput');
const imageInput = document.getElementById('imageInput');
const videoInput = document.getElementById('videoInput');
const imageUploadArea = document.getElementById('imageUploadArea');
const videoUploadArea = document.getElementById('videoUploadArea');
const imagePrompt = document.getElementById('imagePrompt');
const videoPrompt = document.getElementById('videoPrompt');
const imagePreview = document.getElementById('imagePreview');
const videoPreview = document.getElementById('videoPreview');
const imagePreviewImg = document.getElementById('imagePreviewImg');
const videoPreviewElement = document.getElementById('videoPreviewElement');
const removeImage = document.getElementById('removeImage');
const removeVideo = document.getElementById('removeVideo');
const searchButton = document.getElementById('searchButton');
const loadingOverlay = document.getElementById('loadingOverlay');
const resultsSection = document.getElementById('resultsSection');
const resultsContainer = document.getElementById('resultsContainer');
const resultsCount = document.getElementById('resultsCount');
const emptyState = document.getElementById('emptyState');
const connectionStatus = document.getElementById('connectionStatus');

// State
let selectedImage = null;
let selectedVideo = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkConnection();
    setupEventListeners();
});

// Check connection to backend
async function checkConnection() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        
        if (data.status === 'healthy') {
            connectionStatus.innerHTML = `
                <span class="status-dot"></span>
                <span>Connected to ${data.dataset}</span>
            `;
        }
    } catch (error) {
        connectionStatus.innerHTML = `
            <span class="status-dot" style="background: var(--danger)"></span>
            <span>Connection Error</span>
        `;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Image upload
    imageUploadArea.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', handleImageSelect);
    removeImage.addEventListener('click', (e) => {
        e.stopPropagation();
        clearImage();
    });
    
    // Video upload
    videoUploadArea.addEventListener('click', () => videoInput.click());
    videoInput.addEventListener('change', handleVideoSelect);
    removeVideo.addEventListener('click', (e) => {
        e.stopPropagation();
        clearVideo();
    });
    
    // Drag and drop for images
    setupDragAndDrop(imageUploadArea, handleImageDrop);
    setupDragAndDrop(videoUploadArea, handleVideoDrop);
    
    // Search button
    searchButton.addEventListener('click', performSearch);
    
    // Enter key in text input
    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            performSearch();
        }
    });
}

// Drag and drop setup
function setupDragAndDrop(element, dropHandler) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        element.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        element.addEventListener(eventName, () => {
            element.classList.add('dragging');
        });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        element.addEventListener(eventName, () => {
            element.classList.remove('dragging');
        });
    });
    
    element.addEventListener('drop', dropHandler);
}

// Handle image selection
function handleImageSelect(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        displayImage(file);
    }
}

// Handle image drop
function handleImageDrop(e) {
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
        displayImage(files[0]);
    }
}

// Display selected image
function displayImage(file) {
    selectedImage = file;
    const reader = new FileReader();
    
    reader.onload = (e) => {
        imagePreviewImg.src = e.target.result;
        imagePrompt.style.display = 'none';
        imagePreview.style.display = 'block';
    };
    
    reader.readAsDataURL(file);
}

// Clear image selection
function clearImage() {
    selectedImage = null;
    imageInput.value = '';
    imagePrompt.style.display = 'block';
    imagePreview.style.display = 'none';
    imagePreviewImg.src = '';
}

// Handle video selection
function handleVideoSelect(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('video/')) {
        displayVideo(file);
    }
}

// Handle video drop
function handleVideoDrop(e) {
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('video/')) {
        displayVideo(files[0]);
    }
}

// Display selected video
function displayVideo(file) {
    selectedVideo = file;
    const url = URL.createObjectURL(file);
    
    videoPreviewElement.src = url;
    videoPrompt.style.display = 'none';
    videoPreview.style.display = 'block';
}

// Clear video selection
function clearVideo() {
    selectedVideo = null;
    videoInput.value = '';
    videoPrompt.style.display = 'block';
    videoPreview.style.display = 'none';
    
    if (videoPreviewElement.src) {
        URL.revokeObjectURL(videoPreviewElement.src);
        videoPreviewElement.src = '';
    }
}

// Perform search
async function performSearch() {
    const text = textInput.value.trim();
    
    // Validate input
    if (!text && !selectedImage && !selectedVideo) {
        alert('Please provide at least one input (text, image, or video)');
        return;
    }
    
    // Prepare form data
    const formData = new FormData();
    if (text) formData.append('text', text);
    if (selectedImage) formData.append('image', selectedImage);
    if (selectedVideo) formData.append('video', selectedVideo);
    
    // Show loading
    loadingOverlay.style.display = 'flex';
    emptyState.style.display = 'none';
    resultsSection.style.display = 'none';
    
    try {
        const response = await fetch('/api/search', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayResults(data.results);
        } else {
            throw new Error(data.error || 'Search failed');
        }
    } catch (error) {
        console.error('Search error:', error);
        alert('Search failed: ' + error.message);
        emptyState.style.display = 'block';
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

// Display search results
function displayResults(results) {
    if (!results || results.length === 0) {
        emptyState.innerHTML = `
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" opacity="0.3">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
            </svg>
            <h3>No Results Found</h3>
            <p>Try adjusting your search query</p>
        `;
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    resultsSection.style.display = 'block';
    resultsCount.textContent = `${results.length} results`;
    
    resultsContainer.innerHTML = results.map((result, index) => {
        const modalityClass = result.modality.replace('_', '-');
        const modalityLabel = result.modality.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        let mediaHtml = '';
        if (result.assetUrl) {
            if (result.modality === 'image') {
                mediaHtml = `
                    <div class="result-media">
                        <img src="${result.assetUrl}" alt="Result image" loading="lazy">
                    </div>
                `;
            } else if (result.modality === 'video_segment') {
                mediaHtml = `
                    <div class="result-media">
                        <video controls src="${result.assetUrl}"></video>
                    </div>
                `;
            }
        }
        
        return `
            <div class="result-card fade-in" style="animation-delay: ${index * 0.05}s">
                <div class="result-header">
                    <div class="result-info">
                        <div class="result-rank">#${index + 1}</div>
                        <div class="result-title">${result.asset_id}</div>
                        <div class="result-badges">
                            <span class="badge ${modalityClass}">${modalityLabel}</span>
                            ${result.product ? `<span class="badge">${result.product}</span>` : ''}
                        </div>
                    </div>
                    <div class="similarity-score">
                        <div class="similarity-value">${result.similarity.toFixed(0)}%</div>
                        <div class="similarity-label">match</div>
                    </div>
                </div>
                <div class="result-content">
                    <div class="result-snippet">${result.snippet || 'No preview available'}</div>
                    <div class="result-uri">${result.gcs_uri}</div>
                    ${result.modality === 'text' && result.assetUrl ? `<div class="result-link"><a href="${result.assetUrl}" target="_blank" rel="noopener">Open document</a></div>` : ''}
                    ${mediaHtml}
                </div>
            </div>
        `;
    }).join('');
    // Initialize video start times once metadata is loaded
    const videos = resultsContainer.querySelectorAll('video[data-src]');
    videos.forEach((vid) => {
        vid.src = vid.getAttribute('data-src');
        const start = parseFloat(vid.getAttribute('data-start') || '0');
        if (!isNaN(start) && start > 0) {
            vid.addEventListener('loadedmetadata', () => {
                try { vid.currentTime = start; } catch (_) {}
            }, { once: true });
        }
    });

}

// Utility function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
