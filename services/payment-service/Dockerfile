FROM rust:1.77-alpine AS builder
RUN apk add --no-cache musl-dev pkgconfig openssl-dev
WORKDIR /app

# Cache dependencies by building a dummy main first
COPY Cargo.toml ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -f target/release/deps/payment_service*

# Build real source
COPY src ./src
COPY migrations ./migrations
RUN cargo build --release

FROM alpine:3.19
RUN apk add --no-cache ca-certificates libssl3
WORKDIR /app
COPY --from=builder /app/target/release/payment-service .
EXPOSE 3002
CMD ["./payment-service"]
