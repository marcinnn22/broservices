# Express TypeScript Boilerplate

A production-ready Express.js boilerplate with TypeScript, featuring robust authentication, logging, monitoring, and best practices for building secure and scalable APIs.

## Features

- **TypeScript** - Strongly typed language for better developer experience
- **Authentication & Authorization** - JWT-based auth with refresh tokens
- **Database Integration** - Prisma ORM with MySQL
- **API Documentation** - REST client files for API testing
- **Security**
  - Helmet for security headers
  - Rate limiting
  - CORS configuration
  - Request validation using Zod
- **Monitoring & Logging**
  - Prometheus metrics
  - Grafana dashboards
  - Winston logger with daily rotate
  - Request ID tracking
- **Performance**
  - Response compression
  - Caching middleware
  - Database connection pooling
- **Testing**
  - Jest for unit and integration tests
  - E2E testing setup
  - Test helpers and utilities
- **Docker Support**
  - Multi-stage builds
  - Docker Compose for local development
  - Health checks
- **CI/CD**
  - GitHub Actions workflow
  - Automated testing
  - Docker image publishing

## Prerequisites

- Node.js (v18 or higher)
- MySQL (v8.0 or higher)
- Docker and Docker Compose (optional)

## Getting Started

1. Clone the repository:
```bash
git clone https://github.com/yourusername/express-boilerplate.git
cd express-boilerplate
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Set up the database:
```bash
npm run migrate:dev
npm run seed:dev
```

5. Start the development server:
```bash
npm run dev
```

## Docker Setup

Run the entire stack using Docker Compose:

```bash
docker-compose up -d
```

This will start:
- Express API server
- MySQL database
- Prometheus for metrics
- Grafana for monitoring

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run test:e2e` - Run E2E tests
- `npm run test:coverage` - Generate test coverage
- `npm run migrate:dev` - Run database migrations
- `npm run seed:dev` - Seed database with test data
- `npm run studio` - Open Prisma Studio

## Project Structure

```
├── src/
│   ├── __tests__/        # Test files
│   ├── @types/          # TypeScript type definitions
│   ├── config/          # Configuration files
│   ├── controllers/     # Route controllers
│   ├── middleware/      # Express middleware
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── utils/           # Utility functions
│   ├── validators/      # Request validation schemas
│   ├── app.ts          # Express app setup
│   └── index.ts        # Application entry point
├── prisma/             # Prisma schema and migrations
├── requests/           # REST client files
└── docker/            # Docker configuration files
```

## API Documentation

API endpoints are documented using REST client files located in the `requests/` directory. These can be used with VS Code's REST Client extension.

### Main Endpoints:

- Auth
  - POST `/api/auth/signup` - Register new user
  - POST `/api/auth/login` - User login
  - POST `/api/auth/refresh` - Refresh access token
  - POST `/api/auth/logout` - User logout

- Users
  - GET `/api/users` - Get all users (Admin only)
  - GET `/api/users/:id` - Get user by ID
  - POST `/api/users` - Create user (Admin only)
  - PATCH `/api/users/:id` - Update user (Admin only)
  - DELETE `/api/users/:id` - Delete user (Admin only)

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
