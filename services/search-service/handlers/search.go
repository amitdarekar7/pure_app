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

// indexName is the OpenSearch index that holds provider+service documents.
const indexName = "providers"

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

// Search handles GET /v1/search?q=<query>[&city=<name>][&area=<name>][&category=<slug>]
//
// Full-text searches provider_name, service_title, address, city_name, area_name
// with fuzzy/prefix matching so partial words and typos still return results.
// Optional filter params narrow results by city, area, or service category.
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

	// ── Optional filter clauses ───────────────────────────────────────────────
	var filterClauses []interface{}
	if city := c.Query("city"); city != "" {
		filterClauses = append(filterClauses, map[string]interface{}{
			"match": map[string]interface{}{"city_name": map[string]interface{}{"query": city, "fuzziness": "AUTO"}},
		})
	}
	if area := c.Query("area"); area != "" {
		filterClauses = append(filterClauses, map[string]interface{}{
			"match": map[string]interface{}{"area_name": map[string]interface{}{"query": area, "fuzziness": "AUTO"}},
		})
	}
	if cat := c.Query("category"); cat != "" {
		filterClauses = append(filterClauses, map[string]interface{}{
			"term": map[string]interface{}{"category_slug": cat},
		})
	}
	// Always restrict to active providers
	filterClauses = append(filterClauses, map[string]interface{}{
		"term": map[string]interface{}{"status": "active"},
	})

	// Combine: either the fuzzy multi_match OR the wildcard prefix must hit.
	// filter narrows city/area/category without affecting score.
	wildcardQ := query + "*"
	boolQuery := map[string]interface{}{
		"should": []interface{}{
			// Fuzzy full-word match (handles typos like "glmour" → "glamour")
			map[string]interface{}{
				"multi_match": map[string]interface{}{
					"query":         query,
					"fields":        []string{"provider_name^4", "service_title^3", "area_name^2", "city_name^2", "address^1"},
					"type":          "best_fields",
					"fuzziness":     "AUTO",
					"prefix_length": 1,
					"operator":      "or",
					"boost":         2,
				},
			},
			// Wildcard prefix match (handles "brid" → "bridal", "glam" → "glamour")
			map[string]interface{}{
				"wildcard": map[string]interface{}{
					"provider_name.keyword": map[string]interface{}{"value": wildcardQ, "case_insensitive": true, "boost": 1.5},
				},
			},
			map[string]interface{}{
				"wildcard": map[string]interface{}{
					"service_title.keyword": map[string]interface{}{"value": wildcardQ, "case_insensitive": true, "boost": 1},
				},
			},
		},
		"minimum_should_match": 1,
		"filter":               filterClauses,
	}

	osQuery := map[string]interface{}{
		"from": (page - 1) * size,
		"size": size,
		"query": map[string]interface{}{
			"function_score": map[string]interface{}{
				"query": map[string]interface{}{
					"bool": boolQuery,
				},
				"functions": []interface{}{
					// Featured providers get 3× score boost
					map[string]interface{}{
						"filter": map[string]interface{}{
							"term": map[string]interface{}{"is_featured": true},
						},
						"weight": 3.0,
					},
					// Boosted providers get 2× score boost
					map[string]interface{}{
						"filter": map[string]interface{}{
							"term": map[string]interface{}{"is_boosted": true},
						},
						"weight": 2.0,
					},
				},
				"boost_mode":  "multiply",
				"score_mode":  "max",
			},
		},
		"highlight": map[string]interface{}{
			"fields": map[string]interface{}{
				"provider_name": map[string]interface{}{},
				"service_title": map[string]interface{}{},
				"area_name":     map[string]interface{}{},
			},
		},
		"sort": []interface{}{
			map[string]interface{}{"_score": map[string]interface{}{"order": "desc"}},
			map[string]interface{}{"likes_count": map[string]interface{}{"order": "desc"}},
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

