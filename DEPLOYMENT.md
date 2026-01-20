# Deployment Architecture & CI/CD Pipeline

## Infrastructure Overview

- **Platform**: Azure Virtual Machine (Ubuntu-based)
- **Container Runtime**: Docker + Docker Compose
- **Registry**: Docker Hub (`thmtthu1/itel-email-tasker`)
- **Network**: External Docker network (`itel-email-tasker-network`)
- **Port Exposure**: `3001:3001` (Host:Container)

## CI/CD Pipeline Architecture

### Continuous Integration (CI)
**Trigger**: Push/PR to `main` branch  
**Runner**: `ubuntu-latest` (GitHub-hosted)  
**Workflow**: `.github/workflows/ci.yaml`

```bash
# Pipeline Steps
1. Checkout source code
2. Setup Node.js 20 with npm cache
3. Install dependencies (npm ci)
4. Run Jest test suite (npm run test)
5. TypeScript compilation (npm run build)
6. Docker image build validation (no push)
```

**Quality Gates**:
- All Jest tests must pass
- TypeScript compilation must succeed
- Docker image must build successfully

### Continuous Deployment (CD)
**Trigger**: Push to `main` branch (post-CI)  
**Pipeline**: Build (GitHub-hosted) → Deploy (self-hosted runner)  
**Workflow**: `.github/workflows/cd.yaml`

#### Build Stage (`ubuntu-latest`)
```bash
1. Generate image metadata (git SHA-based tagging)
2. Setup Docker Buildx for multi-platform builds
3. Authenticate to Docker Hub
4. Build multi-stage Docker image
5. Push with tags: latest + SHA-specific
```

**Image Tagging Strategy**:
```bash
thmtthu1/itel-email-tasker:latest      # Latest stable
thmtthu1/itel-email-tasker:${git_sha}  # Immutable release
```

#### Deploy Stage (`self-hosted`)
**Target**: Azure VM with self-hosted GitHub Actions runner

```bash
1. Generate identical image metadata
2. Update docker-compose.yaml with new image tag
3. Pull updated images from Docker Hub
4. Rolling deployment via docker-compose up -d --no-deps
5. Health check via docker compose ps
```

