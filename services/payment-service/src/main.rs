use axum::{
    routing::{get, post},
    Router,
};
use sqlx::PgPool;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

mod handlers;
mod models;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load .env when present (local dev); silently ignored in production.
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()))
        .init();

    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    let pool = PgPool::connect(&database_url)
        .await
        .expect("Failed to connect to Postgres");

    // Run pending migrations on startup
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    let state = AppState { db: pool };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/v1/payments/intent",  post(handlers::payment::create_intent))
        .route("/v1/payments/confirm", post(handlers::payment::confirm_payment))
        .route("/v1/payments/refund",  post(handlers::payment::create_refund))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "3002".to_string())
        .parse()
        .expect("PORT must be a valid number");
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("Payment service listening on {}", addr);
    axum::serve(listener, app).await?;

    Ok(())
}
