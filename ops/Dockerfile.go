# Multi-stage build of apps/settlement. Build context is the repo root.
#
# The binary embeds tzdata (cmd/settlement imports time/tzdata), so
# Asia/Bahrain loads without OS zoneinfo and a static distroless base works.

FROM golang:1.22-bookworm AS build

WORKDIR /src
COPY apps/settlement/go.mod apps/settlement/go.sum ./
RUN go mod download

COPY apps/settlement/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/settlement ./cmd/settlement

FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app
COPY --from=build /out/settlement /app/settlement

# Internal admin-plane API (SETTLEMENT_INTERNAL_PORT default).
EXPOSE 8091
# compose runs `./settlement daemon`; one-shot subcommands work the same way:
#   docker compose -f ops/docker-compose.yml run --rm settlement ./settlement run-batch --date=YYYY-MM-DD
ENTRYPOINT []
CMD ["./settlement", "daemon"]
