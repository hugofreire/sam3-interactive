/**
 * SAM3 HTTP Client - Remote SAM3 service client for Express backend
 *
 * This client mirrors the subprocess interface but uses HTTP requests
 * to communicate with a remote SAM3 HTTP service.
 *
 * Usage:
 *   const SAM3Client = require('./sam3_client');
 *   const client = new SAM3Client('http://10.9.0.14:8000');
 *   const session = await client.createSession('/path/to/image.jpg');
 *   const result = await client.predictClick(session.session_id, [[x, y]], [1]);
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

class SAM3Client {
    /**
     * Create a new SAM3 HTTP client
     * @param {string} baseUrl - Base URL of the SAM3 HTTP service (e.g., 'http://10.9.0.14:8000')
     * @param {object} options - Optional configuration
     * @param {number} options.timeout - Request timeout in ms (default: 120000)
     */
    constructor(baseUrl, options = {}) {
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
        this.timeout = options.timeout || 120000; // 2 min default for large images

        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: this.timeout,
        });

        // Log configuration
        console.log(`[SAM3Client] Initialized with remote URL: ${this.baseUrl}`);
    }

    /**
     * Health check - verify SAM3 service is available
     * @returns {Promise<object>} Health status
     */
    async healthCheck() {
        try {
            const response = await this.client.get('/health');
            return response.data;
        } catch (error) {
            this._handleError(error, 'healthCheck');
        }
    }

    /**
     * Create a new session by uploading an image
     * @param {string} imagePath - Path to the image file
     * @param {string} [sessionId] - Optional session ID (will be generated if not provided)
     * @returns {Promise<object>} Session info with session_id, width, height
     */
    async createSession(imagePath, sessionId = null) {
        try {
            const form = new FormData();
            form.append('image', fs.createReadStream(imagePath));

            const headers = {
                ...form.getHeaders(),
            };

            // Pass session ID if provided
            if (sessionId) {
                headers['X-Session-ID'] = sessionId;
            }

            const response = await this.client.post('/sessions', form, { headers });
            return response.data;
        } catch (error) {
            this._handleError(error, 'createSession');
        }
    }

    /**
     * Get session info
     * @param {string} sessionId - Session ID
     * @returns {Promise<object>} Session info
     */
    async getSession(sessionId) {
        try {
            const response = await this.client.get(`/sessions/${sessionId}`);
            return response.data;
        } catch (error) {
            this._handleError(error, 'getSession');
        }
    }

    /**
     * Click-based segmentation
     * @param {string} sessionId - Session ID
     * @param {Array<Array<number>>} points - List of [x, y] coordinates
     * @param {Array<number>} labels - List of labels (1=foreground, 0=background)
     * @param {object} options - Additional options
     * @param {boolean} options.multimaskOutput - Return 3 candidate masks (default: true)
     * @param {boolean} options.usePreviousLogits - Use previous mask for refinement
     * @returns {Promise<object>} Segmentation result with masks, scores
     */
    async predictClick(sessionId, points, labels, options = {}) {
        try {
            const response = await this.client.post(
                `/sessions/${sessionId}/predict/click`,
                {
                    points,
                    labels,
                    multimask_output: options.multimaskOutput !== false,
                    use_previous_logits: options.usePreviousLogits || false,
                }
            );
            return response.data;
        } catch (error) {
            this._handleError(error, 'predictClick');
        }
    }

    /**
     * Text-based segmentation
     * @param {string} sessionId - Session ID
     * @param {string} prompt - Text prompt (e.g., "car", "person")
     * @returns {Promise<object>} Segmentation result with masks, scores, instances
     */
    async predictText(sessionId, prompt) {
        try {
            const response = await this.client.post(
                `/sessions/${sessionId}/predict/text`,
                { prompt }
            );
            return response.data;
        } catch (error) {
            this._handleError(error, 'predictText');
        }
    }

    /**
     * Extract a crop from the last prediction
     * @param {string} sessionId - Session ID
     * @param {number} maskIndex - Index of mask to use (0, 1, or 2)
     * @param {object} options - Additional options
     * @param {string} options.backgroundMode - 'transparent', 'white', 'black', or 'original'
     * @param {number} options.padding - Pixels to add around bounding box
     * @returns {Promise<object>} Crop result with base64 image, bbox, dimensions
     */
    async createCrop(sessionId, maskIndex, options = {}) {
        try {
            const response = await this.client.post(
                `/sessions/${sessionId}/crop`,
                {
                    mask_index: maskIndex,
                    background_mode: options.backgroundMode || 'transparent',
                    padding: options.padding || 10,
                }
            );
            return response.data;
        } catch (error) {
            this._handleError(error, 'createCrop');
        }
    }

    /**
     * Clear a session and free memory
     * @param {string} sessionId - Session ID
     * @returns {Promise<object>} Success status
     */
    async clearSession(sessionId) {
        try {
            const response = await this.client.delete(`/sessions/${sessionId}`);
            return response.data;
        } catch (error) {
            this._handleError(error, 'clearSession');
        }
    }

    /**
     * Handle and transform errors for better debugging
     * @private
     */
    _handleError(error, operation) {
        if (error.code === 'ECONNREFUSED') {
            throw new Error(`SAM3 service unavailable at ${this.baseUrl} - connection refused`);
        }
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
            throw new Error(`SAM3 service timeout at ${this.baseUrl} - request took too long`);
        }
        if (error.response) {
            // Server responded with error status
            const status = error.response.status;
            const detail = error.response.data?.detail || error.response.data?.error || 'Unknown error';
            throw new Error(`SAM3 ${operation} failed (${status}): ${detail}`);
        }
        // Network or other error
        throw new Error(`SAM3 ${operation} failed: ${error.message}`);
    }
}

module.exports = SAM3Client;
