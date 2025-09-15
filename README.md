# AI Music Studio Worker

This is the worker service for the AI Music Studio application. It handles background processing tasks for the video/music generation pipeline.

## Prerequisites

- Docker and Docker Compose
- Node.js (for local development)
- Access to the shared network `ai-studio-shared-network`

## Development Setup

### Environment Configuration

1. Create environment file from example:
   ```bash
   cp .env.example .env.docker-compose
   ```

2. Configure your environment variables in `.env.docker-compose`

### Network Setup

The worker requires a shared Docker network to communicate with other services:

```bash
# Create the shared network
npm run docker:network:create
```

### Running with Docker Compose

1. **Development mode** (with hot reload):
   ```bash
   docker-compose up
   ```
   
   The service will be available on port `3002` and automatically reload when you make changes to the source code.

2. **Background mode**:
   ```bash
   docker-compose up -d
   ```

### Local Development

For local development without Docker:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server with hot reload:
   ```bash
   npm run dev
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Start production server:
   ```bash
   npm start
   ```

## Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run start` - Start the production server
- `npm run dev` - Start development server with hot reload
- `npm run format` - Format code with Prettier
- `npm run lint` - Lint and fix code with ESLint
- `npm run typecheck` - Run TypeScript type checking
- `npm run clean` - Clean up node_modules, dist folder, remove network and stop containers
- `npm run clean:storage` - Remove Docker volumes
- `npm run modules:update` - Update npm modules in Docker container
- `npm run docker:network:create` - Create shared Docker network
- `npm run docker:network:remove` - Remove shared Docker network

## Architecture

The worker service:
- Runs on port `3002`
- Uses TypeScript with Node.js
- Connects to the `ai-studio-shared-network` for inter-service communication
- Supports both Docker and local development environments
- Includes hot reload for development

## Dependencies

### Main Dependencies
- **@aws-sdk/client-s3** - AWS S3 client for file storage
- **express** - Web framework for API endpoints
- **zod** - Runtime type validation
- **dotenv** - Environment variable management

### Development Dependencies
- **TypeScript** - Type-safe JavaScript
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Nodemon** - Hot reload for development
- **Husky** - Git hooks

## Docker Configuration

The service uses a multi-stage Dockerfile with:
- Development target for hot reload
- Shared volumes for `node_modules` and `dist`
- Network connectivity to other services via `ai-studio-shared-network`
- Host gateway access for local development

## Cleanup

To completely clean up the development environment:

```bash
npm run clean
```

This will:
- Remove node_modules and dist folders
- Stop and remove Docker containers
- Remove Docker volumes
- Remove the shared network
