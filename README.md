# Express TypeScript Boilerplate

🚀 A production-ready Express.js boilerplate with TypeScript, featuring robust authentication, logging, monitoring, and best practices for building secure and scalable APIs.

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

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/mzubair481/express-boilerplate.git
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

### Docker Setup

Run the entire stack using Docker Compose:

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api
```

This will start:
- Express API server (http://localhost:4300)
- MySQL database (port 3306)
- Prometheus metrics (http://localhost:9090)
- Grafana dashboards (http://localhost:3000)
- Node Exporter (system metrics)
- Alertmanager (alerts management)

### Accessing Monitoring Tools

1. **Grafana**:
   - URL: http://localhost:3000
   - Default credentials: 
     - Username: `admin`
     - Password: `admin`
   - Pre-configured dashboards:
     - API Metrics Dashboard
     - System Metrics Dashboard

2. **Prometheus**:
   - URL: http://localhost:9090
   - Metrics endpoint: http://localhost:4300/monitoring/metrics

3. **Alertmanager**:
   - URL: http://localhost:9093

### Monitoring Features

- Real-time metrics visualization
- Request rate and latency tracking
- Error rate monitoring
- CPU and memory usage
- Custom alerts configuration
- System metrics via Node Exporter
- Automated alert notifications

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

### Docker Commands

```bash
# Build and start services
docker-compose up -d --build

# Stop services
docker-compose down

# View logs
docker-compose logs -f [service]

# Restart a service
docker-compose restart [service]

# Remove volumes (database data)
docker-compose down -v
```

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

### Authentication Endpoints:

- Registration & Login
  - POST `/api/auth/signup` - Register new user
  - POST `/api/auth/login` - User login
  - POST `/api/auth/refresh` - Refresh access token
  - POST `/api/auth/logout` - User logout

- Email Verification
  - GET `/api/auth/verify-email/:token` - Verify email address
  - POST `/api/auth/send-email-verification` - Resend verification email

- Password Reset
  - POST `/api/auth/forgot-password` - Request password reset email
  - POST `/api/auth/reset-password/:token` - Reset password with token

### User Management:

- Users (Protected Routes)
  - GET `/api/users` - Get all users (Admin only)
  - GET `/api/users/:id` - Get user by ID
  - POST `/api/users` - Create user (Admin only)
  - PATCH `/api/users/:id` - Update user (Admin only)
  - DELETE `/api/users/:id` - Delete user (Admin only)

### Monitoring & Health:

- System
  - GET `/health` - Service health check
  - GET `/monitoring/metrics` - Prometheus metrics

### Request Format Examples:

```bash
# Sign Up
POST /api/auth/signup
{
    "email": "user@example.com",
    "name": "John Doe",
    "password": "Password123!"
}

# Login
POST /api/auth/login
{
    "email": "user@example.com",
    "password": "Password123!"
}

# Resend Verification Email
POST /api/auth/send-email-verification
{
    "email": "user@example.com"
}

# Request Password Reset
POST /api/auth/forgot-password
{
    "email": "user@example.com"
}

# Reset Password
POST /api/auth/reset-password/:token
{
    "password": "NewPassword123!"
}
```

### Authentication Flow:

1. User signs up → Verification email sent
2. User verifies email via link
3. User can now login
4. Login returns access & refresh tokens
5. Use access token in Authorization header: `Bearer <token>`

### Password Reset Flow:

1. User requests password reset → Reset email sent
2. User clicks reset link in email
3. User sets new password using reset token
4. User can login with new password

### WebSocket API:

- Connection
  - URL: `ws://localhost:4300`
  - Secure URL: `wss://your-domain.com` (production)

- Message Format:
```javascript
{
  "type": "message_type",
  "data": {
    // message payload
  }
}
```

- Supported Message Types:
  - `ping` - Health check ping
    ```javascript
    // Client -> Server
    { "type": "ping" }
    
    // Server -> Client
    { 
      "type": "pong",
      "data": { "timestamp": 1234567890 }
    }
    ```
  - `connection` - Initial connection confirmation
    ```javascript
    // Server -> Client
    {
      "type": "connection",
      "data": {
        "clientId": "abc123",
        "message": "Connected to WebSocket server"
      }
    }
    ```

### WebSocket Usage Example:

```javascript
// Connect to WebSocket server
const ws = new WebSocket('ws://localhost:4300');

// Handle connection open
ws.onopen = () => {
  console.log('Connected to WebSocket server');
};

// Handle incoming messages
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
  
  // Handle different message types
  switch (message.type) {
    case 'connection':
      console.log('Connected with ID:', message.data.clientId);
      break;
    case 'pong':
      console.log('Ping response received');
      break;
  }
};

// Handle errors
ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

// Handle connection close
ws.onclose = () => {
  console.log('Disconnected from WebSocket server');
};

// Send a ping message
ws.send(JSON.stringify({ type: 'ping' }));
```

### WebSocket Security:

- Authentication is required for certain message types
- Rate limiting is applied to prevent abuse
- Messages are validated for proper format and content
- Connections are automatically closed after prolonged inactivity
- SSL/TLS encryption is required in production

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
