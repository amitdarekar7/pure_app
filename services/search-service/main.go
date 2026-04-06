package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"pure-app/search-service/handlers"
)
// net/http used for http.StatusOK in health route

func main() {
	// Load .env when present (local dev); no-op if file is absent (production).
	_ = godotenv.Load()

	// Validate required environment variables.
	if os.Getenv("OPENSEARCH_URL") == "" {
		log.Fatal("[startup] Required environment variable OPENSEARCH_URL is not set")
	}

	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: false,
	}))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Search and indexing endpoints
	r.GET("/v1/search", handlers.Search)
	r.POST("/v1/index", handlers.IndexDocument)
	r.DELETE("/v1/index/:id", handlers.DeleteDocument)

	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}

	log.Printf("Search service starting on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}
