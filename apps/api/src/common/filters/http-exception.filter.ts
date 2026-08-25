import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'InternalServerError';

    const exc = exception as any;

    if (exc && typeof exc.getStatus === 'function') {
      status = exc.getStatus();
      const resResponse = exc.getResponse();

      if (typeof resResponse === 'string') {
        message = resResponse;
      } else if (typeof resResponse === 'object' && resResponse !== null) {
        message = resResponse.message || exc.message;
        error = resResponse.error || exc.name;
      }
    } else if (exception instanceof Error) {
      message = exception.message || 'An unexpected error occurred';
      error = exception.name || 'Error';
    }

    const payload = {
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request?.url,
    };

    if (status >= 500) {
      this.logger.error(
        `${request?.method} ${request?.url} ${status}`,
        exception instanceof Error ? exception.stack : undefined
      );
    } else {
      this.logger.warn(`${request?.method} ${request?.url} ${status} ${JSON.stringify(message)}`);
    }

    response.status(status).json(payload);
  }
}
