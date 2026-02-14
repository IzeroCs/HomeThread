import { createServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import env from './config/env';
import logger from './config/logger';
import { RequestMessage, ResponseMessage, isRequestMessage } from './types/messages';
import otCtlService from './services/otCtlService';
import otDaemonService from './services/otDaemonService';

// Create HTTP server
const httpServer = createServer();

// Create Socket.IO server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*', // TODO: Configure CORS properly for production
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

// Store connected clients
const connectedClients = new Map<string, Socket>();

// Authentication middleware
io.use((socket: Socket, next) => {
  const token = socket.handshake.auth.token;

  // If AUTH_TOKEN is set, require authentication
  if (env.AUTH_TOKEN) {
    if (token === env.AUTH_TOKEN) {
      logger.debug(`Client authenticated: ${socket.id}`);
      return next();
    } else {
      logger.warn(`Authentication failed for client: ${socket.id}`);
      return next(new Error('Authentication failed'));
    }
  }

  // No authentication required
  next();
});

// Handle client connections
io.on('connection', (socket: Socket) => {
  const clientId = socket.id;
  connectedClients.set(clientId, socket);
  logger.info(`Client connected: ${clientId} (Total: ${connectedClients.size})`);

  // Send connection confirmation
  socket.emit('event', {
    type: 'connection:connected',
    data: {
      clientId,
      serverTime: Date.now(),
    },
    timestamp: Date.now(),
  });

  // Handle incoming messages
  socket.on('message', async (msg: unknown) => {
    try {
      if (!isRequestMessage(msg)) {
        logger.warn(`Invalid message format from ${clientId}:`, msg);
        socket.emit('message', {
          id: (msg as any)?.id || 'unknown',
          success: false,
          error: 'Invalid message format',
        } as ResponseMessage);
        return;
      }

      logger.debug(`Received message from ${clientId}:`, msg.type);

      let response: ResponseMessage;

      switch (msg.type) {
        case 'daemon:start': {
          try {
            const device = (msg.payload as { device?: string })?.device;
            const baudrate = (msg.payload as { baudrate?: number })?.baudrate;
            otDaemonService.start(device, baudrate);
            response = { id: msg.id, success: true };
          } catch (err) {
            response = {
              id: msg.id,
              success: false,
              error: err instanceof Error ? err.message : 'Failed to start daemon',
            };
          }
          break;
        }
        case 'daemon:stop': {
          try {
            otDaemonService.stop();
            response = { id: msg.id, success: true };
          } catch (err) {
            response = {
              id: msg.id,
              success: false,
              error: err instanceof Error ? err.message : 'Failed to stop daemon',
            };
          }
          break;
        }
        case 'daemon:status': {
          const status = otDaemonService.getStatus();
          const config = otDaemonService.getConfig();
          response = { id: msg.id, success: true, data: { status, device: config.device, baudrate: config.baudrate } };
          break;
        }
        default:
          response = {
            id: msg.id,
            success: false,
            error: `Handler for "${msg.type}" not implemented yet`,
          };
      }

      socket.emit('message', response);
    } catch (error) {
      logger.error(`Error handling message from ${clientId}:`, error);
      const response: ResponseMessage = {
        id: (msg as RequestMessage)?.id || 'unknown',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      socket.emit('message', response);
    }
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    connectedClients.delete(clientId);
    logger.info(`Client disconnected: ${clientId} (Reason: ${reason}, Total: ${connectedClients.size})`);
  });

  // Handle errors
  socket.on('error', (error) => {
    logger.error(`Socket error for ${clientId}:`, error);
  });
});

// Handle server errors
io.engine.on('connection_error', (err) => {
  logger.error('Socket.IO connection error:', err);
});

// Start server
const PORT = env.PORT;

httpServer.listen(PORT, async () => {
  logger.info(`WebSocket server started on port ${PORT}`);
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Authentication: ${env.AUTH_TOKEN ? 'Enabled' : 'Disabled'}`);
  logger.info(`Log level: ${env.LOG_LEVEL}`);
  logger.info(`ot-ctl path: ${env.OT_CTL_PATH}`);
  logger.info(`ot-ctl socket: ${env.OT_CTL_SOCKET_PATH || 'default (/var/run/ot-daemon)'}`);
  logger.info(`ot-ctl sudo: ${env.OT_CTL_USE_SUDO ? 'Yes' : 'No'}`);
  logger.info(`ot-daemon path: ${env.OT_DAEMON_PATH}`);
  logger.info(`ot-daemon sudo: ${env.OT_DAEMON_USE_SUDO ? 'Yes' : 'No'}`);
  logger.info(`ot-daemon verbose: ${env.OT_DAEMON_VERBOSE ? 'Yes (-v)' : 'No'}`);
  logger.info(`ot-daemon default: ${env.OT_DAEMON_DEFAULT_DEVICE} @ ${env.OT_DAEMON_DEFAULT_BAUDRATE}`);
  // Test ot-ctl state command
  try {
    logger.info('Testing ot-ctl state command...');
    const state = await otCtlService.getState();
    logger.info(`Device state: ${state}`);
  } catch (error) {
    logger.error('ot-ctl state test failed:', error);
  }
});

function shutdown(): void {
  logger.info('Shutting down gracefully...');
  otDaemonService.stop();
  httpServer.close(() => {
    logger.info('HTTP server closed');
    io.close(() => {
      logger.info('Socket.IO server closed');
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => {
  logger.info('SIGTERM received');
  shutdown();
});

process.on('SIGINT', () => {
  logger.info('SIGINT received');
  shutdown();
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
