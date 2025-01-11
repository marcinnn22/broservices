import WebSocket from 'ws';
import { Server } from 'http';
import { logger } from '@/config/logger';
import { ErrorMonitoringService } from './errorMonitoring.service';
import { websocketConnections, websocketMessages } from './metrics.service';

export class WebSocketService {
  private static instance: WebSocketService;
  private wss: WebSocket.Server;
  private clients: Map<string, WebSocket>;

  private constructor(server: Server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Map();
    this.initialize();
  }

  public static getInstance(server?: Server): WebSocketService {
    if (!WebSocketService.instance && server) {
      WebSocketService.instance = new WebSocketService(server);
    }
    return WebSocketService.instance;
  }

  private initialize() {
    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();
      this.clients.set(clientId, ws);
      websocketConnections.inc();

      logger.info({
        message: 'New WebSocket connection established',
        context: 'WebSocketService',
        clientId
      });

      ws.on('message', (message: string) => {
        try {
          const parsedMessage = JSON.parse(message.toString());
          websocketMessages.inc({ type: parsedMessage.type });
          this.handleMessage(clientId, parsedMessage);
        } catch (error) {
          if (error instanceof Error) {
            ErrorMonitoringService.getInstance().logError(error);
          }
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        websocketConnections.dec();
        logger.info({
          message: 'WebSocket connection closed',
          context: 'WebSocketService',
          clientId
        });
      });

      // Send initial connection confirmation
      this.sendToClient(clientId, {
        type: 'connection',
        data: { clientId, message: 'Connected to WebSocket server' }
      });
    });
  }

  private generateClientId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private handleMessage(clientId: string, message: any) {
    logger.info({
      message: 'WebSocket message received',
      context: 'WebSocketService',
      clientId,
      messageType: message.type
    });

    // Handle different message types
    switch (message.type) {
      case 'ping':
        this.sendToClient(clientId, { type: 'pong', data: { timestamp: Date.now() } });
        break;
      // Add more message type handlers here
      default:
        this.sendToClient(clientId, { 
          type: 'error', 
          data: { message: 'Unknown message type' } 
        });
    }
  }

  public sendToClient(clientId: string, message: any) {
    const client = this.clients.get(clientId);
    if (client?.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  public broadcast(message: any, excludeClientId?: string) {
    this.clients.forEach((client, clientId) => {
      if (clientId !== excludeClientId && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }

  public getConnectedClients(): number {
    return this.clients.size;
  }
} 