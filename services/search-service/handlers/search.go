package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

const indexName = "products"

func opensearchURL() string {
	return os.Getenv("OPENSEARCH_URL")
}

// doRequest sends an HTTP request to OpenSearch and decodes the JSON response body.
func doRequest(ctx context.Context, method, url string, body []byte) (map[string]interface{}, int, error) {
	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, resp.StatusCode, err
	}
	return result, resp.StatusCode, nil
}

// Search handles GET /v1/search?q=<query>&page=<n>&size=<n>
func Search(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "query parameter 'q' is required"})
		return
	}

	page := 1
	size := 20
	if p := c.GetInt("page"); p > 0 {
		page = p
	}
	if s := c.GetInt("size"); s > 0 && s <= 100 {
		size = s
	}

	osQuery := map[string]interface{}{
		"from": (page - 1) * size,
		"size": size,
		"query": map[string]interface{}{
			"multi_match": map[string]interface{}{
				"query":     query,
				"fields":    []string{"title^3", "description^1", "tags^2"},
				"type":      "best_fields",
				"fuzziness": "AUTO",
			},
		},
		"highlight": map[string]interface{}{
			"fields": map[string]interface{}{
				"title":       map[string]interface{}{},
				"description": map[string]interface{}{},
			},
		},
	}

	body, _ := json.Marshal(osQuery)
	url := fmt.Sprintf("%s/%s/_search", opensearchURL(), indexName)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	result, statusCode, err := doRequest(ctx, http.MethodPost, url, body)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "search unavailable"})
		return
	}

	c.JSON(statusCode, result)
}

// IndexDocument handles POST /v1/index — upserts a document into OpenSearch.
func IndexDocument(c *gin.Context) {
	var req struct {
		ID       string                 `json:"id" binding:"required"`
		Document map[string]interface{} `json:"document" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	body, _ := json.Marshal(req.Document)
	url := fmt.Sprintf("%s/%s/_doc/%s", opensearchURL(), indexName, req.ID)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	result, statusCode, err := doRequest(ctx, http.MethodPut, url, body)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "indexing unavailable"})
		return
	}

	c.JSON(statusCode, result)
}

// DeleteDocument handles DELETE /v1/index/:id — removes a document from the index.
func DeleteDocument(c *gin.Context) {
	id := c.Param("id")
	url := fmt.Sprintf("%s/%s/_doc/%s", opensearchURL(), indexName, id)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	result, statusCode, err := doRequest(ctx, http.MethodDelete, url, nil)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "delete unavailable"})
		return
	}

	c.JSON(statusCode, result)
}
