import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

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

    response.status(status).json({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
    });
  }
}
